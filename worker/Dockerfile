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

COPY --from=production-deps --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/worker/dist ./worker/dist
# Ship the prisma CLI entry points, schema, and migrations so the worker can
# run `prisma migrate deploy` at startup before BullMQ consumers come up.
COPY --from=build --chown=node:node /workspace/prisma ./prisma
COPY --from=build --chown=node:node /workspace/prisma.config.ts ./prisma.config.ts

USER node

CMD ["node", "worker/dist/worker/src/index.js"]
