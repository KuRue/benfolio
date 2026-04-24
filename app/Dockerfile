# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace

FROM base AS deps
COPY package.json package-lock.json prisma.config.ts tsconfig.base.json ./
COPY app/package.json app/package.json
COPY worker/package.json worker/package.json
COPY prisma prisma
RUN npm ci

FROM deps AS build
COPY app app
RUN npm run build --workspace app

# Separate stage that keeps only production deps. The pruned node_modules is
# copied into the runner image so the one-shot `migrate` compose service
# can run the Prisma CLI without re-installing anything at startup.
FROM deps AS production-deps
RUN npm prune --omit=dev --workspaces --include-workspace-root

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /workspace

# Furtrack matching uses curl_cffi so requests can be made with a browser-like
# TLS fingerprint. It is isolated to a small Python helper invoked by the web
# server only when Furtrack sync is used.
COPY scripts/furtrack-requirements.txt /tmp/furtrack-requirements.txt
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 python3-pip \
  && pip3 install --break-system-packages --no-cache-dir -r /tmp/furtrack-requirements.txt \
  && rm -rf /var/lib/apt/lists/* /tmp/furtrack-requirements.txt

# Next.js standalone output — `node app/server.js` starts the web server.
COPY --from=build --chown=node:node /workspace/app/.next/standalone ./
COPY --from=build --chown=node:node /workspace/app/.next/static ./app/.next/static
COPY --from=build --chown=node:node /workspace/app/public ./app/public
COPY --chown=node:node scripts/furtrack_fetch.py ./scripts/furtrack_fetch.py

# Migration tooling — lives under /migrate so it can't collide with Next's
# standalone tree. The compose `migrate` init service runs
# `prisma migrate deploy` from here before the web/worker services start.
# This image works for both the web runtime and the migration runtime.
COPY --from=production-deps --chown=node:node /workspace/node_modules /migrate/node_modules
COPY --from=build --chown=node:node /workspace/prisma /migrate/prisma
COPY --from=build --chown=node:node /workspace/prisma.config.ts /migrate/prisma.config.ts
COPY --from=build --chown=node:node /workspace/package.json /migrate/package.json

USER node
EXPOSE 3000

CMD ["node", "app/server.js"]
