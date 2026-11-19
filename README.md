# HENU Platform API

The central backend, release orchestration, and catalog publication engine for the **HENU OS** software ecosystem.

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

## Security Invariants

1. **Private DB Isolation:** HENU HUB Desktop client never communicates directly with PostgreSQL.
2. **Zero Upstream Credential Leakage:** GitHub App private keys and tokens are never exposed to public or client endpoints.
3. **HMAC Signature Verification:** Incoming webhooks require constant-time `crypto.timingSafeEqual` verification against raw request bytes.
4. **No Arbitrary Execution:** The backend never spawns child processes or executes remote binary code.
5. **No False Platform Advertising:** Releases cannot be marked installable on any operating system without verified binary assets.
