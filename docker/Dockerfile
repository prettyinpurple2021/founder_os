# Multi-stage production Dockerfile for Solo Founder Launch OS API
# Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7

# ─── Stage 1: Dependencies ──────────────────────────────────────────────────
# Install production dependencies only, maximizing layer cache reuse.
FROM node:20-alpine AS deps

WORKDIR /app

# Copy workspace root files needed for npm install
COPY package.json package-lock.json .npmrc* ./

# Copy package.json for each workspace package (needed for npm workspace install)
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=packages/api

# ─── Stage 2: Builder ────────────────────────────────────────────────────────
# Compile TypeScript and generate Prisma client.
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json .npmrc* ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/

# Install ALL dependencies (including devDependencies for compilation)
RUN npm ci --workspace=packages/api

# Copy Prisma schema and generate client
COPY packages/api/prisma ./packages/api/prisma/
COPY packages/api/prisma.config.ts ./packages/api/
RUN npm run prisma:generate --workspace=packages/api

# Copy TypeScript source and config
COPY packages/api/tsconfig.json ./packages/api/
COPY tsconfig.json ./
COPY packages/api/src ./packages/api/src/

# Compile TypeScript
RUN npm run build --workspace=packages/api

# ─── Stage 3: Production ─────────────────────────────────────────────────────
# Minimal runtime image with compiled JS and production node_modules only.
FROM node:20-alpine AS production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/packages/api/dist ./packages/api/dist

# Copy generated Prisma client from builder stage
# The compiled JS in dist/ imports from './generated/prisma/...' so we need
# the generated client in BOTH src/generated (for prisma CLI) and dist/generated
# (for runtime imports).
COPY --from=builder /app/packages/api/src/generated ./packages/api/src/generated
COPY --from=builder /app/packages/api/src/generated ./packages/api/dist/generated

# Copy Prisma schema (needed at runtime for migrations)
COPY --from=builder /app/packages/api/prisma ./packages/api/prisma
COPY --from=builder /app/packages/api/prisma.config.ts ./packages/api/

# Copy package.json files (needed for version info and module resolution)
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/api/package.json ./packages/api/

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose configurable port (default 3001)
ENV PORT=3001
EXPOSE ${PORT}

# Health check: verify the Node process is responding (liveness probe).
# The /health/live endpoint returns 200 as long as the server is running,
# regardless of database connectivity — preventing spurious restarts caused
# by transient DB unavailability. The ALB target-group check uses /health
# for readiness (traffic routing) separately.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health/live || exit 1

# Start the API service
WORKDIR /app/packages/api
CMD ["node", "dist/index.js"]
