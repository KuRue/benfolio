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

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /workspace

COPY --from=build --chown=node:node /workspace/app/.next/standalone ./
COPY --from=build --chown=node:node /workspace/app/.next/static ./app/.next/static
COPY --from=build --chown=node:node /workspace/app/public ./app/public

USER node
EXPOSE 3000

CMD ["node", "app/server.js"]
