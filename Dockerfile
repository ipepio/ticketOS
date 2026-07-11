FROM node:22-slim AS base

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config and all package.json files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/domain/package.json packages/domain/
COPY packages/app/package.json packages/app/
COPY packages/worker/package.json packages/worker/
COPY packages/portal/package.json packages/portal/

# Install all dependencies (includes dev deps needed for build)
RUN pnpm install --frozen-lockfile

# Copy all source
COPY . .

# Build everything
RUN pnpm build

# Production image
FROM node:22-slim AS production

WORKDIR /app

# Create non-root user
RUN groupadd -r ticketos && useradd -r -g ticketos ticketos

# Copy built artifacts AND node_modules from base
COPY --from=base /app/package.json ./
COPY --from=base /app/pnpm-workspace.yaml ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages ./packages
COPY --from=base /app/migrations ./migrations

RUN chown -R ticketos:ticketos /app

USER ticketos

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "packages/app/dist/index.js"]
