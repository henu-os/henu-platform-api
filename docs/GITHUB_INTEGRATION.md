# HENU Platform API - GitHub App Integration Guide

**Document Version:** 1.0.0  
**Target:** GitHub REST API v3 / Webhooks  
**Integration Type:** Official GitHub App (`henu-platform-bot`)  
**Author:** Principal Backend Architect, HENU OS PRIVATE LIMITED  

---

## 1. Integration Model & Architectural Rationale

HENU Platform API relies exclusively on a dedicated **GitHub App** for interacting with organization repositories (`henu-os/*`). 

### Why GitHub App over Personal Access Tokens (PAT) or OAuth:
1. **No Human Identity Binding:** PATs are tied to individual employee accounts and break during employee departures. GitHub Apps operate as organization-level service principals.
2. **Short-Lived Ephemeral Tokens:** GitHub Apps authenticate via RS256 JWTs and exchange them for repository-scoped installation tokens expiring in 60 minutes.
3. **Least-Privilege Scoping:** Permissions are strictly confined to `contents:read` and `metadata:read`. The platform possesses zero write or administrative rights over source code.
4. **Higher Rate Limits:** GitHub Apps receive an elevated API quota (5,000 requests/hour minimum, scaling with organization member count) separate from user rate limits.

---

## 2. GitHub App Permissions & Setup

### 2.1 Required GitHub App Permissions
- **Repository Permissions:**
  - `Contents`: Read-only (Read releases, tags, commits, and assets).
  - `Metadata`: Read-only (Mandatory basic repo info).
- **Subscribed Webhook Events:**
  - `Release`: Check (events for published, prereleased, edited, deleted).
  - `Meta`: Check (events for repository renamed, transferred, or deleted).

### 2.2 Configuration Environment Variables
```env
GITHUB_APP_ID=1092834
GITHUB_APP_CLIENT_ID="Iv23li..."
GITHUB_APP_PRIVATE_KEY_BASE64="LS0tLS1CRUdJTiBSU0EgUFJJVkFURS..." # Base64 encoded .pem RSA private key
GITHUB_WEBHOOK_SECRET="f6c8d7e9b0a1...super_secret_entropy_string..."
```

---

## 3. Webhook Ingress Architecture & Cryptographic Signature Verification

```
                      GitHub Webhook POST Request
                                  |
                                  v
                    [ NestJS Raw Body Buffer ]
                                  |
                  +---------------+---------------+
                  |                               |
       Signature Verification             Delivery Check
  (HMAC-SHA256 constant-time)         (X-GitHub-Delivery in DB)
                  |                               |
         +--------+--------+              +-------+-------+
         |                 |              |               |
     Valid              Invalid        New GUID       Duplicate
         |                 |              |               |
         v                 v              v               v
   Parse JSON        401 Unauthorized   Insert      200 OK (Cached)
         |                              (RECEIVED)
         v
   Async Worker Queue
```

### 3.1 Constant-Time HMAC-SHA256 Verification
GitHub transmits the hex digest of the HMAC-SHA256 computed over the raw request payload in the `X-Hub-Signature-256` header:
`X-Hub-Signature-256: sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c30b4ff583bfb49e2`

**Implementation Rule:** The raw HTTP payload buffer must be captured prior to JSON parsing. Signature matching must strictly utilize `crypto.timingSafeEqual` to eliminate timing side-channel attacks:

```typescript
import * as crypto from 'crypto';

export function verifyGitHubSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const signatureHex = signatureHeader.substring(7);
  const expectedHmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const expectedBuffer = Buffer.from(expectedHmac, 'utf8');
  const actualBuffer = Buffer.from(signatureHex, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
```

### 3.2 Idempotency & Duplicate Delivery Protection
GitHub occasionally re-transmits webhooks when network disruptions delay an HTTP 2xx acknowledgement.
- Every incoming webhook carries a unique GUID in the `X-GitHub-Delivery` header.
- Upon signature verification, `henu-platform-api` executes an atomic conditional insert into `WebhookEvent`:
  ```sql
  INSERT INTO webhook_events (id, delivery_id, event_type, status, payload, created_at)
  VALUES (gen_random_uuid(), :deliveryId, :eventType, 'RECEIVED', :payload, NOW())
  ON CONFLICT (delivery_id) DO NOTHING;
  ```
- If the row already exists:
  - If status is `PROCESSED`, immediately return `200 OK` with `{ "status": "already_processed" }`.
  - If status is `PROCESSING`, return `200 OK` with `{ "status": "processing" }`.
  - If status is `FAILED` and `attempt_count < 3`, allow re-processing.

---

## 4. Webhook Event Processing State Machine

### 4.1 Ingestion Flow for `release.published`
When a developer publishes a release on GitHub:

1. **Repository Match:** The repository (`payload.repository.owner.login` / `payload.repository.name`) is resolved against `RepositoryConnection`. If no active connection exists, mark event `IGNORED` and return `200 OK`.
2. **Tag & Semver Parsing:** Tag name (`payload.release.tag_name`) is evaluated against `RepositoryConnection.tagPattern`. Semver components (`major`, `minor`, `patch`, `prerelease`) are parsed.
3. **Channel Mapping:**
   - If `payload.release.prerelease == true` and tag contains `nightly`, assign channel `NIGHTLY`.
   - If `payload.release.prerelease == true` and tag contains `beta` or `rc`, assign channel `BETA`.
   - If `payload.release.prerelease == false`, assign channel `STABLE`.
4. **Asset Discovery & Classification:**
   - Iterate through `payload.release.assets`.
   - Match file names against `RepositoryConnection.assetPattern`.
   - **Never assume an asset is installable without heuristic validation:**
     - Non-installable assets (`.txt`, `.json`, `.sha256`, `.md`, `.tar.gz` source archives) are marked `isInstallable = false`.
     - Valid installers (`.exe`, `.msi`, `.dmg`, `.AppImage`, `.deb`, `.rpm`) are matched against `PlatformCompatibility` records for this application.
5. **SHA-256 Checksum Resolution:**
   - If an asset named `<fileName>.sha256` or `SHA256SUMS.txt` is present in the release assets, the API parses it to extract verified checksums.
   - If missing, a background worker streams the asset header/body to calculate the SHA-256 digest directly via Octokit.
6. **Publication Determination:**
   - If target channel is listed in `RepositoryConnection.autoPublishChannels` AND all required platform compatibility profiles are satisfied, release status becomes `PUBLISHED`.
   - Otherwise, release status becomes `VALIDATED` (waiting for administrator review and manual promotion).

### 4.2 Handling `release.deleted`
When an upstream release is deleted on GitHub:
- Find associated `Release` record in database.
- Mark `Release.status = 'REVOKED'`.
- Set `Release.revocationReason = 'Upstream GitHub release was deleted'`.
- If this release was active in the current `CatalogueRevision`, automatically flag the catalog as requiring re-publication or trigger notification policy.

---

## 5. Octokit Client & Installation Token Factory

```typescript
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

export class GitHubAppService {
  private readonly appOctokit: Octokit;

  constructor(private readonly config: GitHubAppConfig) {
    this.appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.config.appId,
        privateKey: Buffer.from(this.config.privateKeyBase64, 'base64').toString('utf8'),
        clientId: this.config.clientId,
      },
    });
  }

  async getInstallationClient(installationId: number): Promise<Octokit> {
    const auth = createAppAuth({
      appId: this.config.appId,
      privateKey: Buffer.from(this.config.privateKeyBase64, 'base64').toString('utf8'),
      clientId: this.config.clientId,
    });

    const installationAuth = await auth({
      type: 'installation',
      installationId,
    });

    return new Octokit({
      auth: installationAuth.token,
    });
  }
}
```

---

## 6. Rate Limiting, Backoff & Resilience

1. **Octokit Retries:** Configured with `@octokit/plugin-retry` implementing exponential backoff and jitter on HTTP 403 (Rate limit exceeded) and 5xx upstream responses.
2. **Quota Monitoring:** Logs remaining GitHub rate limits from response headers (`x-ratelimit-remaining`, `x-ratelimit-reset`). If remaining quota falls below 10%, non-essential historical sync jobs are paused automatically.
3. **Dead-Letter Handling:** Webhooks that fail repeatedly (max 3 retries) are placed in `FAILED` status with error stack traces preserved in `WebhookEvent.lastError`. Administrators can re-trigger processing via `/api/v1/admin/webhooks/:id/replay`.

