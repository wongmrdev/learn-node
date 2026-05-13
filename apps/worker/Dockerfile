FROM node:24-alpine

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Workspace metadata + every package manifest (so pnpm can resolve the lockfile)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/

# Install only the worker's deps
RUN pnpm install --filter @learn-node/worker --frozen-lockfile

# Source + build
COPY apps/worker/tsconfig.json ./apps/worker/
COPY apps/worker/src ./apps/worker/src
RUN pnpm --filter @learn-node/worker build

WORKDIR /app/apps/worker
USER node
CMD ["node", "dist/index.js"]
