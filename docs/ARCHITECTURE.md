# HENU Platform API - System Architecture Document

**Document Version:** 1.0.0  
**Status:** Architectural Proposal (Phase 1)  
**Author:** Principal Backend Architect, HENU OS PRIVATE LIMITED  
**Target System:** `henu-platform-api`

---

## 1. Executive Summary & Vision

HENU Platform API serves as the central orchestration backbone and system-of-record for the entire HENU OS software ecosystem. It bridges the administrative release lifecycle, GitHub source repositories, and downstream consumer surfaces (HENU HUB Desktop, HENU App Catalog web/manifests, and external ecosystem tools).

The platform is designed around one core architectural tenet: **zero-rebuild dynamic extensibility**. Platform administrators must be able to introduce, configure, version, deprecate, or partition new HENU first-party and partner applications (e.g., HENU PA, HENU AI, HENU IDE, HENU Record Management, HENU SOCIAL) exclusively through administrative configuration and automated GitHub App release pipelines without modifying, re-packaging, or redeploying the HENU HUB Desktop client.

---

## 2. High-Level Ecosystem Topology

The HENU ecosystem comprises five distinct zones interacting with `henu-platform-api`:

```
 +-----------------------------------------------------------------------------+
 |                         HENU GITHUB ORGANIZATION                            |
 |  +--------------------+  +--------------------+  +--------------------+     |
 |  | henup-os/henu-pa   |  | henu-os/henu-ai    |  | henu-os/henu-ide   | ... |
 |  +--------------------+  +--------------------+  +--------------------+     |
 |           |                        |                       |                |
 |           +------------------------+-----------------------+                |
 |                                    | GitHub Releases & Webhooks             |
 +------------------------------------|----------------------------------------+
                                      v (HMAC SHA-256)
 +-----------------------------------------------------------------------------+
 |                         HENU PLATFORM API BACKEND                           |
 |                                                                             |
 |  +-----------------------+  +-----------------------+  +-----------------+  |
 |  | /api/v1/webhooks      |  | /api/v1/admin         |  | /api/v1/hub     |  |
 |  | (GitHub Webhook Ingest|  | (RBAC Auth, App & Rel |  | (Public Cached  |  |
 |  |  Idempotency & Queue) |  |  Management, Audit)   |  |  Catalogue, SSE)|  |
 |  +-----------------------+  +-----------------------+  +-----------------+  |
 |              |                          |                       |           |
 |              v                          v                       v           |
 |  +-----------------------------------------------------------------------+  |
 |  |                       NestJS Core Services Engine                     |  |
 |  | (Catalog Generator | Octokit App Client | Event Bus | Cryptography)   |  |
 |  +-----------------------------------------------------------------------+  |
 |                                    |                                        |
 |                                    v                                        |
 |  +-----------------------------------------------------------------------+  |
 |  |             PostgreSQL Database (Prisma ORM System-of-Record)         |  |
 |  +-----------------------------------------------------------------------+  |
 +-----------------------------------------------------------------------------+
             ^                                              ^
             | TLS 1.3 / JWT                                | Read-only HTTPS / SSE
             |                                              |
 +-----------------------+                      +-----------------------+
 |   HENU Admin Panel    |                      |   HENU HUB Desktop    |
 |      (Admin UI)       |                      | (Client Application)  |
 +-----------------------+                      +-----------------------+
```

### Architectural Boundaries & Trust Zones
1. **Private Administration Boundary (Zone A - Trusted):**
   - Admin Panel communicates over strictly authenticated, role-gated REST endpoints under `/api/v1/admin`.
   - Access requires short-lived JWT access tokens and HttpOnly rotating refresh tokens.
   - Operations produce immutable, sequential audit logs.

2. **Ingress Boundary (Zone B - Semi-Trusted):**
   - Endpoints under `/api/v1/webhooks/github` accept incoming webhooks from GitHub.
   - No requests are processed without constant-time HMAC-SHA256 signature verification (`X-Hub-Signature-256`).
   - Webhook processing is strictly idempotent and rate-governed.

3. **Public Client Boundary (Zone C - Untrusted / High Read Volume):**
   - HENU HUB Desktop client interacts exclusively with `/api/v1/hub` and `/api/v1/catalogue`.
   - Strictly zero database credentials, zero GitHub credentials, and zero write permissions exposed.
   - All catalog data is pre-compiled, sanitized, cached, and signed.
   - Client update streams are delivered via Server-Sent Events (SSE).

---

## 3. Core Architecture Pillars

### 3.1 Application Registration & Lifecycle Management
- **Entity Model:** Applications are identified by an immutable `slug` (e.g., `henu-pa`, `henu-ide`).
- **Metadata:** Localized titles, summaries, descriptions, icon URLs, banner URLs, developer attribution, documentation links, license info, and category taxonomy.
- **Lifecycle States:** `DRAFT` -> `ACTIVE` -> `MAINTENANCE` -> `DEPRECATED` -> `ARCHIVED`.
- Only `ACTIVE` applications are published in public catalog manifests.

### 3.2 Repository Connection Model
- Decouples application metadata from its source control repository.
- Each application links to one or more `RepositoryConnection` records specifying:
  - `provider`: Default `GITHUB`.
  - `owner`: GitHub organization or user (e.g., `henu-os`).
  - `repo`: Repository name (e.g., `henu-ai`).
  - `githubInstallationId`: The specific installation ID granted to the official HENU GitHub App.
  - `assetPattern`: RegEx/glob patterns defining valid binary asset names (e.g., `.*\\.(exe|dmg|AppImage|deb|rpm|zip)$`).
  - `autoPublishChannels`: Configurable flags determining if releases published on GitHub in certain branches or tags automatically publish to `NIGHTLY` or `BETA`.

### 3.3 GitHub App Integration
- Uses GitHub App architecture rather than Personal Access Tokens (PAT) or OAuth machine users.
- **Authentication:** Authenticates to GitHub via RS256-signed JWTs generated from the HENU GitHub App private key, trading them for short-lived (1-hour) installation access tokens scoped specifically to the target repository.
- **Least Privilege:** Scoped only to `contents:read` and `metadata:read`. The platform never requests administrative or push rights to source code.

### 3.4 GitHub Release Ingestion Engine
- Ingests `release` (action: `published`, `edited`, `deleted`, `prereleased`) and `release_asset` events.
- **Idempotency Guard:** `WebhookEvent` table tracks `X-GitHub-Delivery` GUIDs. If an event ID already exists in the terminal state `PROCESSED`, the payload is acknowledged immediately with `200 OK` without re-execution.
- **State Machine:**
  - `RECEIVED` -> `VALIDATING` -> `ASSET_DISCOVERY` -> `COMPATIBILITY_ANALYSIS` -> `READY_FOR_REVIEW` or `PUBLISHED`.
- **Fail-Safe Policy:** Never assumes that an upstream release contains an installable binary. Non-matching assets (e.g., source code tarballs, debug symbols, SBOMs, signatures) are classified appropriately or ignored.

### 3.5 Release and Release Asset Pipeline
- **Semver Normalization:** Tag names (`v1.2.3`, `1.2.3-beta.1`) are validated and parsed using strict Semantic Versioning 2.0.0.
- **Asset Integrity:** Every release asset stores:
  - Original asset name and GitHub download URL.
  - MIME type and byte size.
  - Cryptographic checksum (SHA-256 mandatory; calculated during asset ingestion verification or extracted from companion `.sha256` files).
  - Digital signature verification status (GPG / Cosign / Authenticode where applicable).
- **Platform Association:** Assets are parsed through the Platform Compatibility Matrix to associate them with target operating systems and architectures.

### 3.6 Application Platform Compatibility Matrix
- Target systems:
  - **Windows:** `x86_64`, `arm64` (Installers: `.exe` [NSIS/InnoSetup], `.msi`, `.zip`)
  - **macOS:** `x86_64` (Intel), `arm64` (Apple Silicon), `universal` (Bundles: `.dmg`, `.pkg`, `.zip`)
  - **Linux:** `x86_64`, `arm64` (Packages: `.AppImage`, `.deb`, `.rpm`, `.tar.gz`)
- A release cannot be advertised as installable for an OS/arch combination unless at least one valid, verified `ReleaseAsset` satisfies that target's compatibility criteria.

### 3.7 Release Channels
- Three distinct channels:
  1. `STABLE`: General availability releases for production daily usage.
  2. `BETA`: Feature-complete preview releases intended for testing.
  3. `NIGHTLY`: Automated cutting-edge daily builds.
- Releases can be promoted across channels (e.g., `NIGHTLY` -> `BETA` -> `STABLE`) upon administrative approval and test signoff.

### 3.8 Catalogue Generation & Publication Engine
- **Decoupled Architecture:** Catalogue generation compiles normalized database rows into an immutable JSON document structure conforming to the `HenuCatalogManifestSchema`.
- **Atomic Publication:** Publishing a catalog revision writes a new record to `CatalogueRevision` with a monotonic integer revision number, SHA-256 payload hash, and published timestamp.
- **Distribution:** Served via high-speed, edge-cacheable REST endpoint `/api/v1/catalogue/latest` with standard HTTP cache headers (`ETag`, `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`).
- Rollbacks are instantaneous by pointing the `current_active_revision_id` pointer back to an earlier revision.

### 3.9 Catalogue Revision Management
- Every catalog release creates an immutable snapshot.
- Revision history tracks:
  - Revision sequence number (`rev_001024`).
  - Total application count and release count.
  - Full content SHA-256 checksum.
  - Authorizing admin user ID.
  - Reason for publication / changelog summary.
- The desktop client includes its local revision number in update checks; the backend responds with `304 Not Modified` or a compact JSON delta if supported.

### 3.10 Admin Authentication and RBAC
- Multi-factor authentication (MFA/TOTP) ready.
- Passwords hashed with Argon2id (memory cost: 65536 KiB, time cost: 3 iterations, parallelism: 4).
- JWT architecture:
  - Access Token: Short TTL (15 minutes), payload: `{ sub: userId, email, role, permissions: [] }`.
  - Refresh Token: Long TTL (7 days), single-use sliding expiration, stored in DB as a cryptographic hash.
- **RBAC Matrix:**
  - `SUPER_ADMIN`: Full root system management, role assignment, system settings.
  - `RELEASE_MANAGER`: Repository connections, release ingestion review, channel promotion, catalogue publishing.
  - `CATALOGUE_EDITOR`: Application metadata, categories, branding, documentation links.
  - `AUDITOR`: Read-only access to audit logs, releases, and metrics.

### 3.11 Audit Logging Framework
- Append-only `AuditLog` table.
- Intercepts all administrative mutations via NestJS Interceptor.
- Captures:
  - Timestamp (UTC).
  - Actor ID, actor email, IP address, and User-Agent.
  - Action identifier (`APP_CREATED`, `RELEASE_PROMOTED`, `CATALOGUE_PUBLISHED`, `CONNECTION_UPDATED`).
  - Target entity type and entity ID.
  - Previous state snapshot vs. updated state diff (sanitized of sensitive tokens/passwords).

### 3.12 Live Notification & Event Architecture
- **Server-Sent Events (SSE):** Recommended over WebSockets for this platform because:
  - Unidirectional push is all that is required for client update announcements.
  - Operates natively over HTTP/2 and HTTP/3 without protocol upgrading.
  - Built-in reconnection with `Last-Event-ID`.
  - Significantly lower connection state overhead in cloud reverse proxies.
- Channels:
  - `/api/v1/admin/events/stream`: Real-time administrative feed (webhook arrivals, worker jobs, audit events).
  - `/api/v1/hub/events/stream`: Public client update notifications (new catalog published, emergency security revokes).

### 3.13 Desktop Client API Contract (Zero-Trust)
- Dedicated `/api/v1/hub/...` routes.
- Fully public and anonymous (no user tracking or client authentication required for public catalog reads).
- Strict response serialization stripping all internal metadata (database primary IDs, GitHub installation IDs, webhook history, internal review notes, soft-deleted rows).
- Includes download mirrors, verified SHA-256 hashes, file sizes, and minimum OS version requirements so HUB can verify asset integrity before launch.

### 3.14 Security & Secrets Architecture
- Secrets stored in OS environment or enterprise secret managers (HashiCorp Vault / AWS Secrets Manager).
- GitHub App private RSA key stored as base64 environment variable and never committed to version control.
- HMAC webhook secret verified in constant time (`crypto.timingSafeEqual`) on raw body streams before JSON parsing.
- Rate limiting implemented via `@nestjs/throttler` (tiered: public catalog = high burst, admin login = strict lockouts).
- Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, and CORS strictly configured via `helmet`.

### 3.15 Error Handling & Fault Recovery
- Global NestJS Exception Filter formatting all non-2xx responses according to **RFC 7807 (Problem Details for HTTP APIs)**:
  ```json
  {
    "type": "https://api.henuos.com/errors/release-not-eligible",
    "title": "Release Ineligible for Channel",
    "status": 422,
    "detail": "Release v2.0.0-rc1 does not contain assets for platform 'windows-x64'.",
    "instance": "/api/v1/admin/releases/rel_123/promote",
    "code": "ASSET_PLATFORM_MISMATCH",
    "timestamp": "2026-11-19T10:35:00.000Z"
  }
  ```
- Resilient Webhook Retry: Webhook processing failures are recorded with error stack traces and retry counters. Unhandled events enter `FAILED` state for manual replay via Admin API.

### 3.16 API Versioning Strategy
- Explicit URI versioning: `/api/v1/...`.
- Separation of concerns by URI prefix:
  - `/api/v1/hub`: Desktop client consumable routes.
  - `/api/v1/admin`: Administrative and management routes.
  - `/api/v1/webhooks`: Ingress webhook receivers.
  - `/api/v1/health`: Liveness and readiness probes (`/health/live`, `/health/ready`).
- Deprecation policy: Deprecated fields will be maintained across at least one minor API version cycle with HTTP `Sunset` and `Deprecation` response headers.

