# HENU Platform API - OpenAPI & REST Specification

**Document Version:** 1.0.0  
**Base URL:** `https://api.henuos.com/api/v1`  
**Protocol:** HTTPS (TLS 1.3)  
**Standard Specification:** OpenAPI 3.1.0  
**Error Format:** RFC 7807 (Problem Details for HTTP APIs)  

---

## 1. Global Conventions & Standards

### 1.1 HTTP Headers
- `Content-Type: application/json; charset=utf-8` (All JSON requests/responses)
- `Accept: application/json`
- `X-Request-Id: <uuid>` (Propagated correlation ID across logs and responses)
- `X-Hub-Signature-256: sha256=<hex>` (GitHub webhook signature verification)
- `If-None-Match: "<etag>"` (Catalogue caching validation)

### 1.2 Authentication Headers
- Admin Protected: `Authorization: Bearer <jwt_access_token>`
- Webhook Ingress: Signature header `X-Hub-Signature-256` + Delivery ID `X-GitHub-Delivery`
- Desktop Client Hub: Public / Anonymous (Strict read-only)

### 1.3 Standard Pagination & Sorting Query Parameters
- `page` (integer, default: 1)
- `limit` (integer, default: 20, max: 100)
- `sortBy` (string, e.g., `createdAt`, `displayName`)
- `sortOrder` (enum: `asc`, `desc`, default: `desc`)

---

## 2. API Endpoint Matrix

| Method | Endpoint | Namespace | Auth Required | Description |
|---|---|---|---|---|
| **POST** | `/api/v1/auth/login` | Auth | None | Admin email/password login (returns JWT + Refresh Token) |
| **POST** | `/api/v1/auth/refresh` | Auth | Refresh Token | Exchange refresh token for fresh access token |
| **POST** | `/api/v1/auth/mfa/verify` | Auth | Temp Token | Verify 6-digit TOTP code during 2FA challenge |
| **POST** | `/api/v1/auth/logout` | Auth | Bearer JWT | Revoke current session and refresh token |
| **GET** | `/api/v1/auth/me` | Auth | Bearer JWT | Retrieve authenticated admin profile and permissions |
| **GET** | `/api/v1/admin/apps` | Admin Apps | Bearer (apps:read) | List registered applications (paginated, filtered) |
| **POST** | `/api/v1/admin/apps` | Admin Apps | Bearer (apps:create) | Register a new application |
| **GET** | `/api/v1/admin/apps/:id` | Admin Apps | Bearer (apps:read) | Retrieve complete application configuration |
| **PUT** | `/api/v1/admin/apps/:id` | Admin Apps | Bearer (apps:update) | Update application metadata, category, branding |
| **DELETE**| `/api/v1/admin/apps/:id` | Admin Apps | Bearer (apps:delete) | Soft-delete an application |
| **GET** | `/api/v1/admin/apps/:id/compatibility` | Admin Apps | Bearer (apps:read) | List platform compatibility matrix for app |
| **POST** | `/api/v1/admin/apps/:id/compatibility` | Admin Apps | Bearer (apps:update) | Add or update platform compatibility rule |
| **DELETE**| `/api/v1/admin/apps/:id/compatibility/:compatId` | Admin Apps | Bearer (apps:update) | Remove a platform compatibility rule |
| **GET** | `/api/v1/admin/repositories` | Admin Repos | Bearer (repos:read) | List repository connections |
| **POST** | `/api/v1/admin/repositories` | Admin Repos | Bearer (repos:create) | Connect a GitHub repository to an application |
| **PUT** | `/api/v1/admin/repositories/:id` | Admin Repos | Bearer (repos:update) | Modify repository connection patterns/sync flags |
| **DELETE**| `/api/v1/admin/repositories/:id` | Admin Repos | Bearer (repos:delete) | Soft-delete repository connection |
| **POST** | `/api/v1/admin/repositories/:id/sync` | Admin Repos | Bearer (repos:sync) | Trigger manual historical release synchronization |
| **GET** | `/api/v1/admin/releases` | Admin Releases | Bearer (releases:read) | List releases with asset counts and status |
| **GET** | `/api/v1/admin/releases/:id` | Admin Releases | Bearer (releases:read) | Get release details and asset verification status |
| **POST** | `/api/v1/admin/releases/:id/promote` | Admin Releases | Bearer (releases:publish)| Promote release to channel (e.g. Beta -> Stable) |
| **POST** | `/api/v1/admin/releases/:id/revoke` | Admin Releases | Bearer (releases:revoke) | Emergency revoke release from catalog |
| **POST** | `/api/v1/admin/releases/:id/assets/verify` | Admin Releases | Bearer (releases:update)| Re-run automated asset verification pipeline |
| **GET** | `/api/v1/admin/channels` | Admin Channels | Bearer (channels:read) | List release channels (`STABLE`, `BETA`, `NIGHTLY`)|
| **POST** | `/api/v1/admin/channels` | Admin Channels | Bearer (channels:write)| Create or modify release channel rules |
| **GET** | `/api/v1/admin/catalogue/preview` | Admin Catalogue| Bearer (catalogue:read)| Generate in-memory preview of next manifest |
| **POST** | `/api/v1/admin/catalogue/publish` | Admin Catalogue| Bearer (catalogue:publish)| Publish new immutable catalog revision |
| **GET** | `/api/v1/admin/catalogue/revisions`| Admin Catalogue| Bearer (catalogue:read)| List catalog revision history |
| **POST** | `/api/v1/admin/catalogue/rollback` | Admin Catalogue| Bearer (catalogue:publish)| Revert active catalog to a previous revision |
| **GET** | `/api/v1/admin/audit` | Admin Audit | Bearer (audit:read) | Query append-only audit trail |
| **GET** | `/api/v1/admin/webhooks` | Admin Webhooks | Bearer (webhooks:read) | List received webhook deliveries and statuses |
| **POST** | `/api/v1/admin/webhooks/:id/replay`| Admin Webhooks | Bearer (webhooks:write)| Re-queue a failed webhook for processing |
| **GET** | `/api/v1/admin/events/stream` | Admin Stream | Bearer (events:listen) | SSE live stream of platform events |
| **POST** | `/api/v1/webhooks/github` | Ingress | Signature | Ingress endpoint for GitHub App webhook events |
| **GET** | `/api/v1/hub/catalogue` | Hub Public | Public (ETag cache) | Fetch active public application catalog |
| **GET** | `/api/v1/hub/apps/:slug` | Hub Public | Public | Fetch specific public app details & latest assets|
| **GET** | `/api/v1/hub/updates/check` | Hub Public | Public | Targeted update check by app, channel, OS & arch |
| **GET** | `/api/v1/hub/events/stream` | Hub Public | Public SSE | SSE stream notifying HUB clients of updates |
| **GET** | `/health/live` | Ops | Public | Kubernetes liveness probe |
| **GET** | `/health/ready` | Ops | Public | Readiness probe (checks DB, Redis, GitHub API) |

---

## 3. Core Endpoint Payloads

### 3.1 POST `/api/v1/admin/apps` (Register Application)
**Request:**
```json
{
  "slug": "henu-ide",
  "displayName": "HENU IDE",
  "summary": "Next-generation cloud-native developer environment for HENU OS",
  "description": "Comprehensive IDE with native AI assistance, container integration, and collaborative editing.",
  "category": "DEVELOPMENT",
  "developer": "HENU OS PRIVATE LIMITED",
  "iconUrl": "https://assets.henuos.com/icons/henu-ide.svg",
  "bannerUrl": "https://assets.henuos.com/banners/henu-ide.webp",
  "homepageUrl": "https://henuos.com/apps/ide",
  "docsUrl": "https://docs.henuos.com/ide",
  "license": "HENU Enterprise License",
  "featured": true,
  "sortOrder": 10
}
```
**Response (201 Created):**
```json
{
  "id": "e4b52bfa-6d12-4eb2-a7f4-8e4cb310a27e",
  "slug": "henu-ide",
  "displayName": "HENU IDE",
  "status": "DRAFT",
  "featured": true,
  "createdAt": "2026-11-19T10:30:00.000Z",
  "updatedAt": "2026-11-19T10:30:00.000Z"
}
```

---

### 3.2 POST `/api/v1/admin/apps/:id/compatibility` (Set Platform Compatibility)
**Request:**
```json
{
  "os": "WINDOWS",
  "arch": "X86_64",
  "packageFormat": "EXE",
  "minOsVersion": "Windows 10 21H2",
  "launchExecutableName": "henu-ide.exe",
  "installInstructions": "Run installer with user privileges; silent installation supported via /S flag.",
  "isSupported": true
}
```
**Response (201 Created):**
```json
{
  "id": "b188c9cf-0d94-4d1a-a53d-f2eb01ec9cf1",
  "applicationId": "e4b52bfa-6d12-4eb2-a7f4-8e4cb310a27e",
  "os": "WINDOWS",
  "arch": "X86_64",
  "packageFormat": "EXE",
  "minOsVersion": "Windows 10 21H2",
  "isSupported": true
}
```

---

### 3.3 POST `/api/v1/admin/repositories` (Connect GitHub Repository)
**Request:**
```json
{
  "applicationId": "e4b52bfa-6d12-4eb2-a7f4-8e4cb310a27e",
  "repoOwner": "henu-os",
  "repoName": "henu-ide",
  "githubInstallationId": 54910284,
  "targetBranch": "main",
  "assetPattern": ".*\\.(exe|msi|dmg|AppImage|deb|rpm|zip)$",
  "tagPattern": "^v?[0-9]+\\.[0-9]+\\.[0-9]+",
  "autoIngestReleases": true,
  "autoPublishChannels": ["NIGHTLY"]
}
```
**Response (201 Created):**
```json
{
  "id": "fa1c94d0-4bfb-47e2-87ad-d5e054cf44b6",
  "applicationId": "e4b52bfa-6d12-4eb2-a7f4-8e4cb310a27e",
  "repoOwner": "henu-os",
  "repoName": "henu-ide",
  "githubInstallationId": "54910284",
  "isActive": true,
  "createdAt": "2026-11-19T10:35:00.000Z"
}
```

---

### 3.4 POST `/api/v1/admin/releases/:id/promote` (Promote Release)
**Request:**
```json
{
  "targetChannel": "STABLE",
  "notes": "Passed all automated QA and security regression tests."
}
```
**Response (200 OK):**
```json
{
  "releaseId": "d04ec95b-01a2-4752-9854-48667520e7df",
  "version": "1.0.0",
  "previousChannel": "BETA",
  "currentChannel": "STABLE",
  "status": "VALIDATED",
  "message": "Release ready for catalogue inclusion. Trigger catalogue publish to make live."
}
```

---

### 3.5 POST `/api/v1/admin/catalogue/publish` (Publish Catalog Revision)
**Request:**
```json
{
  "summary": "Added HENU IDE v1.0.0 (Stable) and updated HENU AI to v1.2.4 (Stable)."
}
```
**Response (201 Created):**
```json
{
  "revisionNumber": 42,
  "contentHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "applicationCount": 5,
  "releaseCount": 14,
  "publishedAt": "2026-11-19T10:45:00.000Z",
  "summary": "Added HENU IDE v1.0.0 (Stable) and updated HENU AI to v1.2.4 (Stable)."
}
```

---

### 3.6 GET `/api/v1/hub/catalogue` (Desktop Client Catalog Contract)
**Request Headers:**
`If-None-Match: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"`

**Response (304 Not Modified)** if ETag matches client's cache.  
**Response (200 OK)** if updated:
**Response Headers:**
```
ETag: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600
```
**Response Body:**
```json
{
  "schemaVersion": "1.0.0",
  "revision": 42,
  "generatedAt": "2026-11-19T10:45:00.000Z",
  "contentHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "channels": ["STABLE", "BETA", "NIGHTLY"],
  "applications": [
    {
      "slug": "henu-ide",
      "displayName": "HENU IDE",
      "summary": "Next-generation cloud-native developer environment for HENU OS",
      "description": "Comprehensive IDE with native AI assistance, container integration, and collaborative editing.",
      "category": "DEVELOPMENT",
      "developer": "HENU OS PRIVATE LIMITED",
      "iconUrl": "https://assets.henuos.com/icons/henu-ide.svg",
      "bannerUrl": "https://assets.henuos.com/banners/henu-ide.webp",
      "featured": true,
      "supportedPlatforms": [
        {
          "os": "WINDOWS",
          "arch": "X86_64",
          "minOsVersion": "Windows 10 21H2",
          "packageFormat": "EXE"
        },
        {
          "os": "MACOS",
          "arch": "ARM64",
          "minOsVersion": "macOS 12.0",
          "packageFormat": "DMG"
        },
        {
          "os": "LINUX",
          "arch": "X86_64",
          "minOsVersion": "glibc 2.31+",
          "packageFormat": "APPIMAGE"
        }
      ],
      "channels": {
        "STABLE": {
          "version": "1.0.0",
          "tagName": "v1.0.0",
          "publishedAt": "2026-11-19T10:30:00.000Z",
          "changelog": "### Features\n- Initial general availability release of HENU IDE.\n- Full TypeScript and Python LSP integration.\n- Built-in Git version control.",
          "assets": [
            {
              "fileName": "HENU-IDE-Setup-1.0.0.exe",
              "downloadUrl": "https://github.com/henu-os/henu-ide/releases/download/v1.0.0/HENU-IDE-Setup-1.0.0.exe",
              "sizeBytes": 98450124,
              "sha256": "8f48e3e41416e7921a976be0fa8c826cf9c7b949b29fd135e6c518cfcfd89552",
              "os": "WINDOWS",
              "arch": "X86_64",
              "packageFormat": "EXE"
            },
            {
              "fileName": "HENU-IDE-1.0.0-arm64.dmg",
              "downloadUrl": "https://github.com/henu-os/henu-ide/releases/download/v1.0.0/HENU-IDE-1.0.0-arm64.dmg",
              "sizeBytes": 104239840,
              "sha256": "4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865",
              "os": "MACOS",
              "arch": "ARM64",
              "packageFormat": "DMG"
            },
            {
              "fileName": "HENU-IDE-1.0.0.AppImage",
              "downloadUrl": "https://github.com/henu-os/henu-ide/releases/download/v1.0.0/HENU-IDE-1.0.0.AppImage",
              "sizeBytes": 95112000,
              "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
              "os": "LINUX",
              "arch": "X86_64",
              "packageFormat": "APPIMAGE"
            }
          ]
        }
      }
    }
  ]
}
```

---

### 3.7 GET `/api/v1/hub/updates/check` (Targeted Update Check)
**Query Parameters:**
- `app`: `henu-ide`
- `channel`: `STABLE`
- `currentVersion`: `0.9.8`
- `os`: `WINDOWS`
- `arch`: `X86_64`

**Response (200 OK - Update Available):**
```json
{
  "updateAvailable": true,
  "appSlug": "henu-ide",
  "channel": "STABLE",
  "currentVersion": "0.9.8",
  "latestVersion": "1.0.0",
  "publishedAt": "2026-11-19T10:30:00.000Z",
  "changelog": "### Features\n- Initial GA release.",
  "asset": {
    "fileName": "HENU-IDE-Setup-1.0.0.exe",
    "downloadUrl": "https://github.com/henu-os/henu-ide/releases/download/v1.0.0/HENU-IDE-Setup-1.0.0.exe",
    "sizeBytes": 98450124,
    "sha256": "8f48e3e41416e7921a976be0fa8c826cf9c7b949b29fd135e6c518cfcfd89552",
    "packageFormat": "EXE",
    "minOsVersion": "Windows 10 21H2"
  }
}
```
**Response (200 OK - Up to Date):**
```json
{
  "updateAvailable": false,
  "appSlug": "henu-ide",
  "currentVersion": "1.0.0",
  "latestVersion": "1.0.0"
}
```

