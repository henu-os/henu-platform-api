# HENU Platform API - Milestone 3 Implementation Report

**Milestone:** PROMPT 3/10 — Identity, Access Control and Application Management  
**Date:** 2026-11-19  
**Repository:** [`henu-platform-api`](file:///h:/HENU-PLATFORM/henu-platform-api)  
**Author:** Principal Backend Architect, HENU OS PRIVATE LIMITED  

---

## 1. Domain Implementations Delivered

### 1.1 Authentication & Session Management
- **Argon2id Password Hashing:** Implemented with 64 MB memory cost, 3 iterations, 4 threads, cryptographically random salt via [`CryptoUtil.hashPassword`](file:///h:/HENU-PLATFORM/henu-platform-api/src/common/auth/crypto.util.ts).
- **Session Tokens:**
  - Access Token: Short-lived (15 minutes), signed via `@nestjs/jwt`, carrying user UUID, email, role, and fine-grained permissions.
  - Refresh Token: High-entropy 256-bit cryptographically secure token.
- **Single-Use Refresh Token Rotation:** The server hashes the refresh token with SHA-256 before persisting in `AdminUser.refreshTokenHash`. Every refresh request invalidates the old token and issues a new pair.
- **Session Revocation & Logout:** `POST /api/v1/auth/logout` clears `refreshTokenHash` from the database.
- **TOTP-Based Multi-Factor Authentication (MFA):**
  - Standard RFC 6238 TOTP powered by `otplib`.
  - Secret provisioning via `POST /api/v1/auth/mfa/setup` with `otpauth://` key URI for Google Authenticator / 1Password.
  - 6-digit confirmation to enable via `POST /api/v1/auth/mfa/enable`.
  - Single-use backup recovery codes: 8 cryptographically generated 8-character codes, stored as SHA-256 digests. Used recovery codes are permanently consumed.
- **Brute-Force Protection & Account Lockout:** 5 consecutive failed attempts trigger a 15-minute account lockout (`lockedUntil`).
- **Initial-Admin Provisioning CLI:** Dedicated command `npm run seed:admin` (`src/scripts/seed-initial-admin.ts`) requiring explicit environment variables (`INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`). No public registration endpoint exists.

### 1.2 Roles and Backend Permissions (RBAC)
- **Roles Defined:**
  - `SUPER_ADMIN`: Root bypass across all endpoints.
  - `ADMINISTRATOR`: Application, repository, user, and release management.
  - `RELEASE_MANAGER`: Release promotion, catalogue publishing, repository sync.
  - `OPERATOR`: Application edits, webhook replay, operational sync.
  - `AUDITOR`: Read-only access to audit logs and catalog state.
- **Enforcement:** Enforced at the controller and route level using `@RequirePermissions(PermissionCode.*)` and [`PermissionsGuard`](file:///h:/HENU-PLATFORM/henu-platform-api/src/common/auth/guards/permissions.guard.ts).

### 1.3 Application Management API (`/api/v1/admin/apps`)
- **Dynamic Application Registration:** Registered with lowercase kebab-case slug (e.g., `henu-pa`, `henu-ai`, `henu-ide`).
- **Rich Configuration Schema:**
  - Application type: `DESKTOP`, `WEB`, `HYBRID`, `CLI`.
  - Category taxonomy, display title, summary, full description, icon URL, banner URL.
  - Web application URLs: `webAppUrl`, `homepageUrl`, `docsUrl`.
  - Minimum HENU HUB version (`minHubVersion`).
  - System and runtime dependencies (`dependencies` JSON schema).
  - Status management: `DRAFT`, `ACTIVE`, `MAINTENANCE`, `DEPRECATED`, `ARCHIVED`.
- **Platform Compatibility Matrix:**
  - Target OS: `WINDOWS`, `MACOS`, `LINUX`.
  - Target Architectures: `X86_64`, `ARM64`, `UNIVERSAL`.
  - Package Formats: `EXE`, `MSI`, `DMG`, `PKG`, `APPIMAGE`, `DEB`, `RPM`, `TAR_GZ`, `ZIP`.
  - Minimum/Maximum OS version constraints, launch binary name, and install instructions.

### 1.4 Repository Management API (`/api/v1/admin/repositories`)
- **Connection Records:**
  - GitHub Organization/Owner (`repoOwner`)
  - Repository name (`repoName`)
  - Application ID linkage (`applicationId`)
  - GitHub App installation ID (`githubInstallationId`)
  - Asset matching rules (`assetPattern`, `tagPattern`)
  - Synchronization timestamps (`lastSyncAt`)
  - Status toggle (`isActive`)
- **Uniqueness Guarantee:** Enforces unique constraint on `(repoOwner, repoName)` across the platform.

### 1.5 Append-Only Audit Logging (`/api/v1/admin/audit`)
- **System of Record:** Every administrative mutation (login, failed login, lockout, MFA enablement, app registration, app update, status change, archive, repository connection) is recorded in `AuditLog`.
- **Automatic Payload Sanitization:** Passwords, password hashes, secrets, and refresh tokens are automatically replaced with `[REDACTED]` before insertion into PostgreSQL.

---

## 2. Test Execution & Verification

All automated verification suites executed with zero errors:

| Test Suite | File | Tests | Result |
|---|---|---|---|
| **Authentication Service** | `src/modules/auth/auth.service.spec.ts` | 6 | **Passed** |
| **RBAC Permissions Guard** | `src/common/auth/guards/permissions.guard.spec.ts` | 5 | **Passed** |
| **Application Management** | `src/modules/admin/apps/apps.service.spec.ts` | 4 | **Passed** |
| **Repository Management** | `src/modules/admin/repositories/repositories.service.spec.ts` | 3 | **Passed** |
| **Audit Service** | `src/modules/audit/audit.service.spec.ts` | 2 | **Passed** |
| **Health Probes** | `src/modules/health/health.controller.spec.ts` | 3 | **Passed** |
| **Hub Client Service** | `src/modules/hub/hub.service.spec.ts` | 4 | **Passed** |
| **Webhook Signature Guard**| `src/modules/webhooks/guards/github-signature.guard.spec.ts`| 4 | **Passed** |
| **RFC 7807 Error Filter** | `src/common/filters/rfc7807-exception.filter.spec.ts` | 2 | **Passed** |
| **E2E Integration Tests** | `test/app.e2e-spec.ts` | 7 | **Passed** |
| **Total** | | **45** | **100% Passed** |

- **Linting:** `npm run lint` (`--max-warnings=0`) — 0 errors, 0 warnings.
- **Formatting:** `npm run format` — Clean.
- **Build:** `npm run build` — Clean compilation into `dist/`.


---

# HENU Platform API - Milestone 4 Implementation Report

**Milestone:** PROMPT 4/10 — GitHub App, Webhooks and Release Ingestion  
**Date:** 2026-11-19  
**Repository:** [`henu-platform-api`](file:///h:/HENU-PLATFORM/henu-platform-api)  
**Author:** Principal Backend Architect, HENU OS PRIVATE LIMITED  

---

## 1. Domain Implementations Delivered

### 1.1 GitHub App Service (`src/modules/github/github.service.ts`)
- **App Authentication:** Generates RS256 JWTs using GitHub App ID and RSA private key (`GITHUB_APP_PRIVATE_KEY_BASE64`).
- **Installation Token Caching:** Automatically requests scoped installation tokens for target installations, caching in memory and refreshing whenever fewer than 5 minutes remain before token expiration.
- **Rate-Limit Awareness:** Queries `/rate_limit` endpoint and surfaces remaining request quota and reset deadlines.
- **Repository Access Verification:** Validates that the GitHub App installation has push/pull access to target repositories and inspects default branch metadata.
- **Binary Streaming & Cryptographic Checksums:** Downloads binary release assets directly via streaming HTTP pipeline (`accept: application/octet-stream`) and computes SHA-256 cryptographic digests in flight. **Binaries are never written to disk or executed on the API server.**

### 1.2 Webhooks Ingress & Failed Event Replay (`src/modules/webhooks/`)
- **Raw Request Preservation:** Express `rawBody: true` middleware preserves exact unparsed bytes for cryptographic verification.
- **HMAC-SHA256 Verification:** [`GitHubSignatureGuard`](file:///h:/HENU-PLATFORM/henu-platform-api/src/modules/webhooks/guards/github-signature.guard.ts) verifies `X-Hub-Signature-256` against `GITHUB_WEBHOOK_SECRET` using `crypto.timingSafeEqual` constant-time comparison to eliminate timing attacks.
- **Delivery Idempotency:** Validates `X-GitHub-Delivery` GUID; duplicate deliveries are detected via PostgreSQL unique constraint and acknowledged with `already_processed` without duplicate processing.
- **Delivery History & Error Tracking:** All deliveries are persisted in `WebhookEvent` with payload, attempt count, timestamp, and status (`RECEIVED`, `PROCESSING`, `PROCESSED`, `IGNORED`, `FAILED`).
- **Admin Event Replay API:**
  - `POST /api/v1/admin/webhooks/:id/replay`: Authorized administrators (`SUPER_ADMIN`, `ADMINISTRATOR`, `OPERATOR`) can replay failed or historical webhook events. The event's attempt count is incremented, and the ingestion pipeline is re-executed with full audit logging (`WEBHOOK_REPLAYED`).
  - `GET /api/v1/admin/webhooks`: Paginated list of received webhook events with status and event-type filters.
  - `GET /api/v1/admin/webhooks/:id`: Detailed view of delivery payload and processing errors.

### 1.3 Release Ingestion Pipeline & Classifier (`src/modules/releases/`)
- **Semantic Version Parsing:** [`SemverParser`](file:///h:/HENU-PLATFORM/henu-platform-api/src/modules/releases/classifier/semver.parser.ts) enforces strict SemVer 2.0.0 compliance (`major.minor.patch[-prerelease][+build]`). Non-compliant tags are immediately placed in the `REJECTED` state with detailed rejection reasons.
- **Asset Classifier:** [`AssetClassifier`](file:///h:/HENU-PLATFORM/henu-platform-api/src/modules/releases/classifier/asset.classifier.ts):
  - Strictly rejects source code archives (`.tar.gz`, `.zip` source tarballs) from ever being advertised as installable packages.
  - Identifies cryptographic signatures (`.sig`, `.asc`, `.minisig`) and checksum sidecars (`.sha256`).
  - Classifies Operating System (`WINDOWS`, `MACOS`, `LINUX`), Architecture (`X86_64`, `ARM64`, `UNIVERSAL`), and Package Format (`EXE`, `MSI`, `DMG`, `PKG`, `APPIMAGE`, `DEB`, `RPM`).
  - Matches filenames against application-configured regex patterns.
- **Compatibility Verification:** Compares classified binary assets against the application's active `PlatformCompatibility` records. If zero installable binary packages match supported platforms, the release is automatically marked `REJECTED`.
- **Channel Routing & Safe Promotion:**
  - Standard releases route to `STABLE`.
  - Prereleases route to `BETA` or `NIGHTLY`.
  - **Stable channel gatekeeper:** STABLE releases **always** stay in `VALIDATED` status pending manual administrator review/approval. Auto-publish is restricted to non-stable channels when explicitly configured on the repository connection.

### 1.4 Release Lifecycle State Machine & Admin Management (`src/modules/admin/releases/`)
- **State Machine Transitions:**
  - `DISCOVERED` -> `VALIDATING` -> `VALIDATED` -> `APPROVED` -> `PUBLISHED`
  - Any validation failure transitions to `REJECTED` with recorded reason.
  - Any published or approved release can be recalled to `REVOKED`.
- **Admin Release Management API:**
  - `GET /api/v1/admin/releases`: Paginated list of releases filtered by application, channel, and lifecycle status.
  - `GET /api/v1/admin/releases/:id`: Complete release view including all assets and matched platform profiles.
  - `POST /api/v1/admin/releases/:id/approve`: Release manager approval gatekeeper.
  - `POST /api/v1/admin/releases/:id/promote`: Channel promotion (e.g., promoting BETA to STABLE).
  - `POST /api/v1/admin/releases/:id/revoke`: Emergency revocation of compromised or defective releases.

---

## 2. Test Execution & Verification

| Test Suite | File | Tests | Result |
|---|---|---|---|
| **Release Classifiers (SemVer & Asset)** | `src/modules/releases/classifier/classifier.spec.ts` | 10 | **Passed** |
| **Release Ingestion & Lifecycle Service** | `src/modules/releases/releases.service.spec.ts` | 9 | **Passed** |
| **Webhooks Ingress & Replay Service** | `src/modules/webhooks/webhooks.service.spec.ts` | 6 | **Passed** |
| **GitHub App Service** | `src/modules/github/github.service.spec.ts` | 7 | **Passed** |
| **Webhook Signature Guard** | `src/modules/webhooks/guards/github-signature.guard.spec.ts` | 4 | **Passed** |
| **Authentication Service** | `src/modules/auth/auth.service.spec.ts` | 6 | **Passed** |
| **RBAC Permissions Guard** | `src/common/auth/guards/permissions.guard.spec.ts` | 5 | **Passed** |
| **Application Management** | `src/modules/admin/apps/apps.service.spec.ts` | 4 | **Passed** |
| **Repository Management** | `src/modules/admin/repositories/repositories.service.spec.ts` | 3 | **Passed** |
| **Audit Service** | `src/modules/audit/audit.service.spec.ts` | 2 | **Passed** |
| **Health Probes** | `src/modules/health/health.controller.spec.ts` | 3 | **Passed** |
| **Hub Client Service** | `src/modules/hub/hub.service.spec.ts` | 4 | **Passed** |
| **RFC 7807 Error Filter** | `src/common/filters/rfc7807-exception.filter.spec.ts` | 2 | **Passed** |
| **E2E Integration Tests** | `test/app.e2e-spec.ts` | 10 | **Passed** |
| **Total Automated Tests** | | **80** | **100% Passed** |

- **Linting:** `npm run lint` (`--max-warnings=0`) — 0 errors, 0 warnings.
- **Formatting:** `npm run format` — Clean.
- **Build:** `npm run build` — Clean compilation into `dist/`.
