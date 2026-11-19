# HENU Platform API - Security Architecture & Threat Model

**Document Version:** 1.0.0  
**Compliance Standards:** OWASP Top 10 (2025/2026), CIS Benchmarks, Zero-Trust Architecture  
**Author:** Principal Backend Architect, HENU OS PRIVATE LIMITED  

---

## 1. Core Security Invariants (Enforced Rules)

Every architectural decision and line of code in `henu-platform-api` must adhere to these inviolable security principles:

1. **Complete Database Isolation:** HENU HUB Desktop client runs on end-user machines and must **never** connect directly to the PostgreSQL database, read connection strings, or query internal tables.
2. **Zero Upstream Credential Exposure:** Neither HENU HUB nor public API endpoints shall ever receive or store GitHub App private keys, installation tokens, or administrative secrets.
3. **Strict Network & Payload Boundary:** Public catalogue responses are completely isolated, sanitized, and serialized into read-only DTOs. Internal notes, raw webhook logs, and administrative IDs are stripped at the serialization barrier.
4. **Mandatory Cryptographic Verification:** All incoming webhooks must be validated using constant-time HMAC-SHA256 (`crypto.timingSafeEqual`) against `GITHUB_WEBHOOK_SECRET`. Unsigned or mismatched requests are rejected immediately.
5. **Idempotent Ingress Guard:** Webhook deliveries are de-duplicated by `X-GitHub-Delivery` GUID using database-level unique constraints to eliminate replay attacks and race conditions.
6. **Integrity Validation Pre-Publication:** Releases cannot be published unless they pass Semantic Versioning parsing, contain at least one verified binary asset with a calculated SHA-256 checksum, and match an approved `PlatformCompatibility` record.
7. **No Assumptions on Upstream Assets:** The platform treats all GitHub release files as untrusted raw files. No asset is flagged `isInstallable` without filename, extension, and pattern validation.
8. **Zero Remote Execution Policy:** The backend **never** executes binary assets, invokes shell commands (`child_process.exec`, `execFile`, `spawn`), or runs untrusted scripts. Ingestion is purely metadata extraction and cryptographic stream hashing.
9. **Zero False Platform Advertising:** An application cannot be advertised to HENU HUB as installable on a specific operating system or architecture unless an active, verified binary asset exists for that exact OS/arch combination.

---

## 2. Threat Modeling (STRIDE Analysis)

| Threat Category | Potential Attack Vector | Architectural Mitigation |
|---|---|---|
| **Spoofing** | Adversary sends fake GitHub webhook pretending a release was published. | Mandatory constant-time HMAC-SHA256 verification using the shared `GITHUB_WEBHOOK_SECRET`. Requests lacking valid signatures are aborted with 401 Unauthorized. |
| **Spoofing** | Attacker impersonates an administrator via stolen JWT. | Short-lived JWTs (15 min) + rotating refresh tokens + IP/User-Agent fingerprinting + MFA enforcement. |
| **Tampering** | Man-in-the-middle modifies the catalogue JSON manifest in transit to HENU HUB. | Strict TLS 1.3 encryption + catalogue content SHA-256 hash embedded in the manifest + signed release assets. |
| **Tampering** | Upstream attacker replaces a binary asset on GitHub after release publication. | Release assets store immutable SHA-256 digests. HENU HUB verifies the downloaded file hash against the catalog manifest before launching installers. |
| **Repudiation** | An admin maliciously revokes or publishes a release and denies having done so. | Append-only `AuditLog` records actor ID, email, IP address, user agent, timestamp, action, and full entity delta. Cannot be modified or truncated via API. |
| **Information Disclosure** | Desktop client probes API to discover unreleased applications or private repos. | Public endpoints query only `status = 'ACTIVE'` applications and `status = 'PUBLISHED'` releases within compiled `CatalogueRevision`. Internal metadata is filtered via NestJS `ClassSerializerInterceptor`. |
| **Denial of Service** | Bot floods `/api/v1/hub/catalogue` or webhook endpoint. | Tiered rate limiting via `@nestjs/throttler` (in-memory or Redis-backed) + HTTP caching with ETags (`304 Not Modified`) + Cloudflare/Reverse-Proxy CDN caching. |
| **Elevation of Privilege** | Catalog editor attempts to create super admins or modify repository bindings. | Fine-grained Role-Based Access Control (RBAC) enforced via `@RequirePermissions(...)` decorators and NestJS Guards inspecting JWT claims. |

---

## 3. Cryptographic Standards & Credential Management

### 3.1 Password & Secret Hashing
- **Algorithm:** Argon2id (RFC 9106)
- **Parameters:**
  - Memory cost: 65,536 KiB (64 MB)
  - Time cost (iterations): 3
  - Parallelism: 4 threads
  - Salt length: 16 bytes (cryptographically secure random)
  - Hash length: 32 bytes

### 3.2 Token Architecture
- **Access Tokens:** Signed via RS256 or HS512 with a dedicated `JWT_SECRET`. Lifetime: 15 minutes. Contains user UUID, role, and authorized permission array.
- **Refresh Tokens:** High-entropy random 256-bit strings generated via `crypto.randomBytes(32)`. The database stores only the SHA-256 hash of the refresh token. Single-use rotation: every refresh invalidates the prior token and generates a new pair.
- **Revocation:** Changing passwords, updating roles, or logging out immediately clears `refreshTokenHash` from the database.

### 3.3 GitHub App Secret Storage
- The GitHub App private key (`.pem`) is base64-encoded and injected exclusively via environment variable (`GITHUB_APP_PRIVATE_KEY_BASE64`).
- It is never stored in source code, committed to Git, or persisted to the PostgreSQL database.
- Private key instances are held strictly in process memory inside `GitHubAppService`.

---

## 4. Ingress Hardening & Webhook Defense

### 4.1 Raw Body Preservation & Streaming
NestJS is configured with `{ rawBody: true }` in `NestFactory.create` so that the cryptographic HMAC check operates on the byte-for-byte stream received from GitHub before any JSON body parser mutates whitespace or key ordering.

### 4.2 Constant-Time Comparison
```typescript
crypto.timingSafeEqual(expectedHmacBuffer, actualSignatureBuffer);
```
Standard string equality (`===`) leaks timing information through early-exit string comparisons. `timingSafeEqual` guarantees identical execution time regardless of signature match position.

---

## 5. Input Validation & Serialization Security

1. **Global Validation Pipe:**
   ```typescript
   app.useGlobalPipes(
     new ValidationPipe({
       whitelist: true,              // Strips non-whitelisted payload properties
       forbidNonWhitelisted: true,  // Rejects requests with unexpected fields
       transform: true,              // Automatically coerces types based on DTO
       stopAtFirstError: false,
     }),
   );
   ```
2. **Output Sanitization:**
   ```typescript
   app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
   ```
   All domain entities utilize `@Exclude()` on sensitive columns (`passwordHash`, `mfaSecret`, `refreshTokenHash`, `githubInstallationId`).

---

## 6. HTTP Security Headers & Infrastructure

Configured via `helmet`:
- `Content-Security-Policy`: Default `'self'`; blocks arbitrary script evaluation.
- `Strict-Transport-Security`: `max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options`: `nosniff`
- `X-Frame-Options`: `DENY`
- `Referrer-Policy`: `strict-origin-when-cross-origin`
- `CORS`: Restrictive origin policies:
  - Admin endpoints: Configured strictly to the trusted Admin Panel domain (`https://admin.henuos.com`).
  - Hub endpoints: Permissive GET for desktop client and public app catalog web surfaces.

