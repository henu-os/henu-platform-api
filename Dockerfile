# ==============================================================================
# HENU PLATFORM API - PRODUCTION MULTI-STAGE DOCKERFILE
# HENU OS PRIVATE LIMITED — https://www.henuos.in/
# ==============================================================================

# STAGE 1: Build & Compile
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install build dependencies & OpenSSL for Prisma
RUN apk add --no-cache openssl libc6-compat

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (including devDependencies required for NestJS build)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source and TypeScript configurations
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src/

# Compile application
RUN npm run build

# Remove development dependencies to minimize runtime image footprint
RUN npm prune --omit=dev


# STAGE 2: Lightweight Production Runtime
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Runtime security & OpenSSL for Prisma query engine
RUN apk add --no-cache openssl ca-certificates dumb-init tzdata \
    && addgroup -g 1001 -S henu \
    && adduser -u 1001 -S henu -G henu

ENV NODE_ENV=production
ENV PORT=3000
ENV API_PREFIX=api/v1

# Copy compiled code, production dependencies and Prisma artifacts from builder
COPY --chown=henu:henu package.json ./
COPY --chown=henu:henu --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=henu:henu --from=builder /usr/src/app/dist ./dist
COPY --chown=henu:henu --from=builder /usr/src/app/prisma ./prisma

# Drop root privileges
USER henu

EXPOSE 3000

# Docker healthcheck querying the unauthenticated liveness probe
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health/live || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
