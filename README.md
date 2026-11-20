# HENU Platform API

The central backend, release orchestration, and catalogue publication engine for **HENU OS PRIVATE LIMITED**.

Official Website: [https://www.henuos.in/](https://www.henuos.in/)

`henu-platform-api` provides a zero-rebuild dynamic application registry that connects the HENU Admin Panel, independent GitHub repositories, and HENU HUB Desktop client.

---

## Architecture & Technology Stack

- **Runtime:** Node.js LTS (v20+ / v22+ / v24+)
- **Framework:** NestJS 10.x (TypeScript strict mode)
- **Database:** PostgreSQL 16+
- **ORM:** Prisma ORM 5.x
- **API Standard:** OpenAPI 3.1 (Swagger UI at `/api/docs`)
- **Error Model:** RFC 7807 (Problem Details for HTTP APIs)
- **Real-Time Updates:** Server-Sent Events (SSE)
- **Security:** Helmet, Argon2id, Tiered Rate Limiting, Raw Body HMAC-SHA256 Webhook Verification

---

## Project Structure

```
henu-platform-api/
├── .env.example                  # Environment configuration template (placeholders only)
├── .gitignore                    # Secrets, builds, dependencies, and DB exclusions
├── docker-compose.yml            # Local PostgreSQL 16 container definition
├── nest-cli.json                 # NestJS CLI configuration
├── package.json                  # Dependencies, scripts, and engine specifications
├── tsconfig.json                 # TypeScript strict mode compiler options
├── tsconfig.build.json           # Production build exclusion rules
├── jest.config.ts                # Unit and integration test configuration
├── docs/
│   ├── ARCHITECTURE.md           # System architecture specification
│   ├── DATABASE_DESIGN.md        # PostgreSQL database design and Prisma models
│   ├── API_SPECIFICATION.md      # OpenAPI 3.1 & REST contract specification
│   ├── GITHUB_INTEGRATION.md     # GitHub App authentication & webhook guide
│   ├── SECURITY_DESIGN.md        # STRIDE threat model & zero-trust rules
│   ├── IMPLEMENTATION_PLAN.md    # 9-Phase technical implementation roadmap
│   └── BUILD_REPORT.md           # Core implementation build and verification report
├── prisma/
│   ├── schema.prisma             # Complete PostgreSQL schema (12 domain models)
│   └── migrations/
│       └── 20261119000000_init/  # Initial database migration DDL
│           └── migration.sql
├── src/
│   ├── main.ts                   # Application entrypoint with security headers, CORS & Swagger
│   ├── app.module.ts             # Root application module with DI and throttler wiring
│   ├── common/
│   │   ├── config/               # Configuration loader and Class-Validator schema
│   │   ├── filters/              # Global RFC 7807 ExceptionFilter
│   │   ├── interceptors/         # Structured JSON logging interceptor
│   │   └── middleware/           # Request ID (X-Request-Id) tracing middleware
│   ├── prisma/                   # Global Prisma Client service and lifecycle hooks
│   └── modules/
│       ├── health/               # /health/live and /health/ready probes
│       ├── hub/                  # /api/v1/hub public desktop client endpoints
│       ├── admin/                # /api/v1/admin administrative application management
│       └── webhooks/             # /api/v1/webhooks/github HMAC-verified ingress
└── test/
    ├── jest-e2e.json             # End-to-end Jest configuration
    └── app.e2e-spec.ts           # End-to-end integration test suite
```

---

## Local Setup & Quickstart

### Prerequisites
- Node.js LTS (v20+ recommended)
- npm (v10+)
- Docker & Docker Compose (optional for local database container)
- PostgreSQL 16 (if running without Docker)

### 1. Clone & Navigate
```bash
cd H:\HENU-PLATFORM\henu-platform-api
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update `.env` with your local database URL and secrets. (Note: Never commit `.env` to Git).

### 3. Start Local PostgreSQL (Docker)
```bash
docker-compose up -d
```

### 4. Install Dependencies
```bash
npm install
```

### 5. Generate Prisma Client & Run Migrations
```bash
npm run prisma:generate
npm run prisma:migrate:dev -- --name init
```

### 6. Build the Application
```bash
npm run build
```

### 7. Run Unit and E2E Tests
```bash
npm run test
npm run test:e2e
```

### 8. Start the Development Server
```bash
npm run start:dev
```

- **API Base URL:** `http://localhost:3000/api/v1`
- **Swagger Documentation:** `http://localhost:3000/api/docs`
- **Liveness Probe:** `http://localhost:3000/health/live`
- **Readiness Probe:** `http://localhost:3000/health/ready`

---

## Available Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run build` | `nest build` | Compile TypeScript into `dist/` |
| `npm run start` | `nest start` | Start production server |
| `npm run start:dev` | `nest start --watch` | Start hot-reloading dev server |
| `npm run test` | `jest` | Run unit tests |
| `npm run test:e2e` | `jest --config ./test/jest-e2e.json` | Run end-to-end integration tests |
| `npm run test:cov` | `jest --coverage` | Generate test coverage report |
| `npm run lint` | `eslint` | Run static code analysis |
| `npm run format` | `prettier --write` | Format code with Prettier |
| `npm run prisma:generate`| `prisma generate` | Generate Prisma TypeScript Client |
| `npm run prisma:studio` | `prisma studio` | Open visual database manager |

---

## Production Deployment & Docker Containerization

### 1. Multi-Stage Docker Build
Build the production Docker image with OpenSSL, non-root user execution, and dumb-init process supervision:
```bash
docker build -t henu-os/henu-platform-api:1.1.0 .
```

### 2. Production Docker Compose
Deploy the complete production stack (PostgreSQL 16 + NestJS API):
```bash
docker compose -f docker-compose.prod.yml up -d
```

### 3. Database Migration Deployment
In production, run forward-only migrations without generating drift:
```bash
npx prisma migrate deploy
```

### 4. Production Host Startup
If hosting natively on Node.js:
```bash
npm run build
npm run start:prod
```
The verified production entry point is `dist/main.js`.

---

## Environment Variable Reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | Optional | `development` | Runtime environment (`production`, `development`, `test`) |
| `PORT` | Optional | `3000` | HTTP service listening port |
| `API_PREFIX` | Optional | `api/v1` | Global API route prefix |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (`postgresql://user:pass@host:5432/db`) |
| `JWT_SECRET` | **Yes** | — | Cryptographically random secret (minimum 32-64 chars entropy) |
| `JWT_EXPIRES_IN` | Optional | `15m` | Access token lifespan |
| `REFRESH_TOKEN_EXPIRES_IN` | Optional | `7d` | Rotating refresh token lifespan |
| `GITHUB_APP_ID` | Optional | — | GitHub App numeric Application ID |
| `GITHUB_APP_CLIENT_ID` | Optional | — | GitHub App Client ID |
| `GITHUB_APP_PRIVATE_KEY_BASE64` | Optional | — | Base64-encoded RSA private key (.pem) |
| `GITHUB_WEBHOOK_SECRET` | Optional | — | Webhook HMAC-SHA256 secret for ingress validation |
| `ADMIN_CORS_ORIGIN` | Optional | `http://localhost:5173,http://localhost:3001` | Comma-delimited list of trusted Admin origins |
| `HUB_CORS_ORIGIN` | Optional | `tauri://localhost,http://tauri.localhost` | Comma-delimited list of trusted HUB origins |
| `THROTTLE_TTL` | Optional | `60` | Rate limiter window in seconds |
| `THROTTLE_LIMIT` | Optional | `120` | Max requests per rate limiter window |

---

## Operations, Health Checks & Rollback

### Health Probes (Kubernetes / Docker)
- **Liveness Probe:** `GET http://localhost:3000/health/live` (Returns `200 OK` if the process is responsive)
- **Readiness Probe:** `GET http://localhost:3000/health/ready` (Returns `200 OK` when PostgreSQL connection is healthy)

### Catalogue Rollback Procedure
If an erroneous catalogue revision is published:
1. Log in to **HENU Platform Administration** (`http://localhost:3001`) with Super Admin credentials.
2. Navigate to **Catalogue Management**.
3. Select the target healthy revision (e.g., Revision #1) and click **Rollback to this Revision**.
4. Alternatively, use the authenticated API endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/v1/admin/catalogue/rollback/1 \
     -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
   ```
5. Connected HUB desktop clients immediately receive the updated state via the Server-Sent Events (SSE) broadcast stream.

### Emergency Release Revocation
To revoke an individual faulty release:
```bash
curl -X POST http://localhost:3000/api/v1/admin/releases/<RELEASE_ID>/revoke \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Critical vulnerability remediation"}'
```

---

## Security Invariants

1. **Private DB Isolation:** HENU HUB Desktop client never communicates directly with PostgreSQL.
2. **Zero Upstream Credential Leakage:** GitHub App private keys and tokens are never exposed to public or client endpoints.
3. **HMAC Signature Verification:** Incoming webhooks require constant-time `crypto.timingSafeEqual` verification against raw request bytes.
4. **No Arbitrary Execution:** The backend never spawns child processes or executes remote binary code.
5. **No False Platform Advertising:** Releases cannot be marked installable on any operating system without verified binary assets.

---

## Official Company & Support Information

**HENU OS PRIVATE LIMITED**  
Official Website: [https://www.henuos.in/](https://www.henuos.in/)

- **Contact Form:** [https://www.henuos.in/contact](https://www.henuos.in/contact)
- **Support Email:** [info@henuos.in](mailto:info@henuos.in)
- **Alternative Email:** [support.henuos@gmail.com](mailto:support.henuos@gmail.com)
- **Support Hotline:** +91 8094100513
- **WhatsApp Support:** [https://wa.me/918094100513](https://wa.me/918094100513)
- **Consultation Scheduling:** [https://calendly.com/henuos/30min](https://calendly.com/henuos/30min)

