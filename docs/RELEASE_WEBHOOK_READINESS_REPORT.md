# HENU PLATFORM — RELEASE WEBHOOK READINESS AUDIT REPORT

**Target Service:** `https://henu-platform-api.onrender.com`  
**GitHub Organization:** `https://github.com/henu-os`  
**GitHub App:** `HENU Release Manager` (App ID: `5844474`)  
**Verified GitHub App Installation ID:** `183938025`  
**Audit Date:** `2026-11-20T16:05:00+05:30`  
**Audit Status:** `READY FOR CONTROLLED RELEASE TEST`

---

## Executive Summary

A comprehensive architectural and empirical audit was conducted on the HENU Platform API webhook subsystem, signature guard, release ingestion pipeline, asset classifier, streaming checksum verifier, database persistence layers, and GitHub App credentials. 

All security controls, raw request body preservation mechanisms, cryptographic HMAC-SHA256 signature verifications, idempotency locks, asset pattern matchers, and permission boundaries have been verified against both the local test harness (14 suites, 82 passing tests) and the live production service on Render (`https://henu-platform-api.onrender.com`).

The platform is **fully prepared and secure** to receive, validate, and process GitHub Release webhooks.

---

## 1. Webhook Ingress Architecture & Endpoint Verification

| Component | Verified Production Configuration | Code Reference |
| :--- | :--- | :--- |
| **Exact Webhook Route** | `POST https://henu-platform-api.onrender.com/api/v1/webhooks/github` | [webhooks.controller.ts](file:///H:/HENU-PLATFORM/henu-platform-api/src/modules/webhooks/webhooks.controller.ts#L11) |
| **Global Prefix** | `api/v1` (derived from `process.env.API_PREFIX`) | [main.ts](file:///H:/HENU-PLATFORM/henu-platform-api/src/main.ts#L30) |
| **HTTP Method** | `POST` (Controller decorated with `@Post('github')` & `@HttpCode(200)`) | [webhooks.controller.ts](file:///H:/HENU-PLATFORM/henu-platform-api/src/modules/webhooks/webhooks.controller.ts#L12) |
| **Raw Request Body** | Enabled via `NestFactory.create(AppModule, { rawBody: true })` | [main.ts](file:///H:/HENU-PLATFORM/henu-platform-api/src/main.ts#L25) |
| **Global Middleware** | Zero JWT or admin session guards intercept `/api/v1/webhooks/*` | [app.module.ts](file:///H:/HENU-PLATFORM/henu-platform-api/src/app.module.ts) |

---

## 2. Cryptographic Signature Validation

* **Header:** `X-Hub-Signature-256`
* **Algorithm:** `HMAC-SHA256`
* **Secret Configuration:** `GITHUB_WEBHOOK_SECRET` (injected via environment variable).
* **Implementation Details:**
  1. Compares incoming header with expected `crypto.createHmac('sha256', secret).update(request.rawBody).digest('hex')`.
  2. Enforces constant-time buffer comparison via `crypto.timingSafeEqual` to eliminate timing attacks.
  3. Rejects missing header, malformed prefix (non-`sha256=`), signature buffer length mismatch, and invalid cryptographic signatures with `401 Unauthorized`.
* **Empirical Live Production Test:**
  - Request with missing signature header -> `HTTP 401 Unauthorized` (`Missing signature header.`).
  - Request with invalid signature hex -> `HTTP 401 Unauthorized` (`Invalid signature.`).

---

## 3. Webhook Event & Action Support Matrix

| Event Type (`X-GitHub-Event`) | Supported Actions | Behavior & Ingestion Path |
| :--- | :--- | :--- |
| **`ping`** | N/A | Immediately acknowledged with HTTP 200 `{ status: "received", eventType: "ping" }` without database insertion. |
| **`release`** | `published` | Initiates release ingestion pipeline: SemVer tag validation, asset classification, streaming SHA-256 calculation, and platform compatibility matching. |
| **`release`** | `deleted` | Upstream deletion revokes release in database (`ReleaseStatus.REVOKED`) with audit logging. |
| **`release`** | (draft = true) | Draft releases are safely ignored (`Draft releases are not ingested into the platform`). |
| **`installation`** | `created`, `new_permissions_accepted` | Idempotently links all selected repositories with the GitHub App installation ID (`183938025`). |
| **`installation`** | `deleted` | Deactivates repository connections (`isActive = false`). |
| **`installation_repositories`** | `added` | Idempotently binds newly added repositories with active connection records. |
| **`installation_repositories`** | `removed` | Deactivates unlinked repository connections (`isActive = false`). |

---

## 4. Repository Allowlisting & Ownership Validation

The platform strictly isolates releases to verified, connected repositories:

1. **Repository Ownership:** All six official HENU repositories are verified under the `henu-os` organization:
   - `henu-os/henu-hub`
   - `henu-os/henu-addplo`
   - `henu-os/henu-platform-api`
   - `henu-os/henu-app-catalog`
   - `henu-os/henu-common-actions`
   - `henu-os/henu-hub-docs`
2. **Installation Verification:** All 6 repositories are confirmed accessible to GitHub App ID `5844474` under installation `183938025`.
3. **Allowlist Boundary:**
   - When a release webhook arrives, `ReleasesService.processReleaseWebhook()` queries `repositoryConnection.findUnique({ where: { repoOwner_repoName: { repoOwner, repoName } } })`.
   - Any event from an unlinked or foreign repository is ignored (`status: "ignored", reason: "Repository connection not found or inactive"`).
   - Zero database records are created for unauthorized repositories.

---

## 5. Webhook Delivery Idempotency & Replay Protection

1. **Header-Level Deduplication:**
   Every incoming delivery checks `prisma.webhookEvent.findUnique({ where: { deliveryId } })`.
   - If the delivery ID was previously recorded, processing terminates immediately with HTTP 200 `{ status: "already_processed", message: "Webhook delivery previously recorded." }`.
   - Release ingestion logic is not re-executed, preventing duplicate state transitions or repeated asset streaming.
2. **Release Database Upsertion:**
   The release record is upserted on the unique database constraint `@@unique([githubReleaseId])`. Even if a GitHub redelivery receives a new delivery ID, it cannot generate duplicate release rows.

---

## 6. Asset, Metadata & Checksum Validation

### A. Semantic Versioning Enforcement
- Releases must use valid SemVer tags (e.g. `v1.0.0`, `1.2.3-beta.1`).
- Non-compliant tags are classified as `ReleaseStatus.REJECTED` with explicit failure reasons recorded in the database.

### B. Asset Pattern Matching & Classification
- Raw release assets are evaluated by `AssetClassifier`:
  - **Rejects:** Automatic source code archives (`.zip`, `.tar.gz`), companion checksum files (`.sha256`), and raw signature files (`.sig`, `.asc`, `.minisig`).
  - **Identifies:** Executable binary packages matching target OS (`windows`, `macos`, `linux`), Architecture (`x86_64`, `arm64`, `universal`), and Format (`exe`, `msi`, `dmg`, `pkg`, `appimage`, `deb`, `rpm`).
  - **Pattern Matching:** Matches against application-specific regex patterns (e.g., `^henu-(.+)-(windows|macos|linux)-(x64|arm64|universal)\.(exe|msi|dmg|pkg|deb|rpm|appimage)$`).

### C. Download URL Trust Boundary
- All asset download URLs are evaluated by `isTrustedDownloadUrl()`:
  - **Protocol:** Must be strictly `https:`. Insecure `http:` URLs are rejected.
  - **Origin:** Must belong to trusted GitHub domains: `github.com`, `*.github.com`, `objects.githubusercontent.com`, or `*.githubusercontent.com`.
  - Untrusted URLs cause asset verification to fail (`verificationStatus: REJECTED`, `verificationError: "Untrusted or non-HTTPS asset download URL origin."`).

### D. Streaming SHA-256 Checksum Verification
- The API server **does not download and execute binaries**.
- Uses an authenticated GitHub App installation token to stream release asset bytes directly from GitHub API v3 into a Node.js `crypto.createHash('sha256')` stream.
- The computed SHA-256 hex digest is persisted immutably in `release_assets.sha256`.

---

## 7. Catalogue Publication Guard (Air Gap)

A release webhook **CANNOT** automatically publish a new catalogue revision to end-user HENU Hub clients:

1. **Release Status Transition:**
   - Stable releases are placed in `ReleaseStatus.VALIDATED` (requiring explicit human review).
   - If a release contains zero installable binaries matching configured platform compatibility, it is placed in `ReleaseStatus.REJECTED`.
2. **Catalogue Revision Air Gap:**
   - Catalogue publication requires calling `POST /api/v1/admin/catalogue/publish` with valid administrative JWT authentication and permissions.
   - `publishRevision()` only includes applications where `status = ACTIVE` and releases where `status = PUBLISHED`.
   - The manifest content is canonically serialized, hashed (`contentHash`), and digitally signed using an Ed25519 root private key before broadcasting via SSE.

---

## 8. Database Persistence & Health Verification

* **Database Engine:** Neon Serverless PostgreSQL (`neondb`, role `neondb_owner`).
* **Connection Mode:** Transaction-pooled connection via Neon PgBouncer (`5432`, `sslmode=require`).
* **Automated Startup Migration:** `"start:prod": "prisma migrate deploy && node dist/main"` ensures all schema migrations apply automatically on deployment before the HTTP listener opens.
* **Production Status (`GET https://henu-platform-api.onrender.com/health/ready`):**
  ```json
  {
    "status": "ok",
    "services": {
      "database": "connected"
    },
    "diagnostics": {
      "database": {
        "configured": true,
        "length": 148,
        "startsWithProtocol": true,
        "hasEnclosingQuotes": false,
        "hasWhitespace": false,
        "startsWithPsqlCli": false,
        "containsPlaceholder": false,
        "tablesCount": 15,
        "prismaInitialized": true
      }
    }
  }
  ```

---

## 9. Safe Logging Audit

Inspection of log output across `WebhooksController`, `WebhooksService`, `GitHubSignatureGuard`, and `ReleasesService`:
* **Logged Items:** Delivery ID, event type, action name, repository owner/name, SemVer tag, asset count, and non-sensitive error messages.
* **Redacted / Omitted:** 
  - `GITHUB_WEBHOOK_SECRET`
  - GitHub App private RSA key (`.pem`)
  - GitHub installation access tokens
  - JWT authorization tokens
  - Neon `DATABASE_URL` / passwords
  - Full request bodies containing sensitive metadata

---

## 10. Automated Test Results

Executed full automated test harness across all controllers, guards, services, and classifiers:

```text
 PASS  src/common/auth/guards/permissions.guard.spec.ts
 PASS  src/modules/admin/repositories/repositories.service.spec.ts
 PASS  src/modules/audit/audit.service.spec.ts
 PASS  src/modules/webhooks/guards/github-signature.guard.spec.ts
 PASS  src/modules/hub/hub.service.spec.ts
 PASS  src/modules/health/health.controller.spec.ts
 PASS  src/modules/releases/releases.service.spec.ts
 PASS  src/modules/releases/classifier/classifier.spec.ts
 PASS  src/modules/github/github.service.spec.ts
 PASS  src/modules/webhooks/webhooks.service.spec.ts
 PASS  src/modules/auth/auth.service.spec.ts
 PASS  src/modules/webhooks/webhooks.controller.spec.ts
 PASS  src/modules/admin/apps/apps.service.spec.ts
 PASS  src/common/filters/rfc7807-exception.filter.spec.ts

Test Suites: 14 passed, 14 total
Tests:       82 passed, 82 total
Snapshots:   0 total
Time:        61.42 s
```

---

## 11. Controlled Test Procedure

When ready to perform a controlled release verification on GitHub:

1. **Push latest security commits to GitHub:**
   ```powershell
   git -C "H:\HENU-PLATFORM\henu-platform-api" push origin main
   ```
2. **Trigger a Pre-release / Test Release in GitHub:**
   - Navigate to one of the connected repositories (e.g., `https://github.com/henu-os/henu-addplo`).
   - Create a new tag: `v1.0.0-test.1`.
   - Mark as **Pre-release** (or attach a test binary package matching the repository's asset naming pattern).
   - Click **Publish release**.
3. **Inspect Webhook Deliveries in GitHub App Settings:**
   - Navigate to `https://github.com/settings/apps/henu-release-manager/advanced`.
   - Verify that the `release.published` delivery shows a green checkmark with **`Response 200 OK`**.
4. **Verify Release in Admin Dashboard:**
   - Log into `https://henu-admin.netlify.app`.
   - Navigate to **Releases**.
   - Confirm that release `v1.0.0-test.1` appears in `VALIDATED` status with its SHA-256 checksum populated.

---

## Final Verdict

# READY FOR CONTROLLED RELEASE TEST
