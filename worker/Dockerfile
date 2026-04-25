# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
WORKDIR /workspace

FROM base AS deps
COPY package.json package-lock.json prisma.config.ts tsconfig.base.json ./
COPY app/package.json app/package.json
COPY worker/package.json worker/package.json
COPY prisma prisma
RUN npm ci

FROM deps AS build
COPY worker worker
RUN npm run build --workspace worker

FROM deps AS production-deps
RUN npm prune --omit=dev --workspaces --include-workspace-root

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /workspace

COPY scripts/furtrack-requirements.txt /tmp/furtrack-requirements.txt
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 python3-pip \
  && pip3 install --break-system-packages --no-cache-dir -r /tmp/furtrack-requirements.txt \
  && rm -rf /var/lib/apt/lists/* /tmp/furtrack-requirements.txt

COPY --from=production-deps --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/worker/dist ./worker/dist
COPY --chown=node:node scripts/furtrack_fetch.py ./scripts/furtrack_fetch.py

USER node

CMD ["node", "worker/dist/worker/src/index.js"]
