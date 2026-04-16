# Self-Hosted Photography Gallery MVP

This repository contains a production-leaning first pass of a self-hosted event photography gallery with:

- a public, mobile-first editorial gallery built in Next.js App Router
- a built-in admin panel with credential auth
- PostgreSQL via Prisma
- Redis-backed background jobs
- a separate worker service in the same repo
- S3-compatible object storage wired for Cloudflare R2 in production and MinIO locally

## Repo layout

- `app/` - Next.js web application, public gallery, admin UI, direct-upload signing API
- `worker/` - BullMQ worker for EXIF extraction and derivative generation
- `prisma/` - Prisma schema, generated client, seed, and migrations
- `docs/` - architecture notes

## Local development

1. Copy `.env.example` to `.env` if you want local shell commands outside Docker.
2. Start the stack:

```bash
docker compose up --build
```

3. Open the app at [http://localhost:3000](http://localhost:3000).
4. Create the first admin at `/admin/bootstrap` if you did not pre-seed one with env vars.

Local Docker services:

- `web` - Next.js app on port `3000`
- `worker` - background photo processor
- `db` - PostgreSQL on port `5432`
- `redis` - Redis on port `6379`
- `minio` - S3-compatible local object storage on ports `9000` and `9001`

Admin uploads now use short-lived, app-signed direct browser uploads into the originals
bucket instead of a giant multipart POST through the Next.js server. Local MinIO setup
applies a permissive localhost CORS policy for that direct-upload path.

Local development continues to use `docker-compose.yml` and bind-mounted source. The
published-image path below is separate and meant for server testing.

## Docker images and publishing

Two production-oriented Dockerfiles are included:

- `app/Dockerfile` - multi-stage Next.js web image using the existing workspace install and standalone server output
- `worker/Dockerfile` - multi-stage worker image using the existing workspace install plus the compiled TypeScript worker output

GitHub Actions publishes both images to GitHub Container Registry from
`.github/workflows/publish-ghcr.yml`.

Workflow triggers:

- push to `main`
- manual `workflow_dispatch`

Published image names:

- `ghcr.io/kurue/benfolio-web`
- `ghcr.io/kurue/benfolio-worker`

Published tags:

- `latest` on the default branch
- `sha-<short-sha>` on every run
- branch/ref tags such as `main`, and the selected branch when manually dispatched from another ref

The workflow authenticates to `ghcr.io` with the built-in `GITHUB_TOKEN`, so publishing
does not need an extra registry secret as long as the repository has permission to write
packages.

## First deploy

Use `docker-compose.server.yml` for the running stack and
`docker-compose.server.init.yml` for the one-shot initialization path. Local development
still uses `docker-compose.yml`.

### 1. Pull the repo and log in to GHCR

Pull the latest repo on the server so you have:

- `docker-compose.server.yml`
- `docker-compose.server.init.yml`
- `.env.example`

If the package is private, log in to GHCR before pulling:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

If the repo or package stays private, the server needs a token that can read the package.
In practice that usually means either:

- a classic personal access token with `read:packages`
- or a fine-grained token with package read access if your org/package settings allow it

### 2. Create `.env`

Copy `.env.example` to `.env`.

Required for a real deployment:

- `APP_URL`
- `AUTH_COOKIE_SECRET`
- `S3_ENDPOINT`
- `S3_PUBLIC_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET_ORIGINALS`
- `S3_BUCKET_DERIVATIVES`

Usually leave as-is unless you have a reason to change them:

- `S3_REGION`
- `S3_FORCE_PATH_STYLE`
- `IMPORTS_PREFIX`
- `IMPORTS_CLEANUP_MODE`
- `IMPORTS_ARCHIVE_PREFIX`
- `STORAGE_WEBHOOK_SIGNATURE_HEADER`

Optional and safe to leave blank or unset:

- `STORAGE_WEBHOOK_SECRET`
  This disables webhook signature verification and is fine if webhook traffic stays on a trusted network.
- `SEED_ADMIN_NAME`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
  If these are blank, seed still creates the default `SiteProfile` and you can create the first admin later at `/admin/bootstrap`.
- `SERVER_DATABASE_URL`
- `SERVER_REDIS_URL`
  If these are blank or unset, the server compose file uses the bundled Postgres and Redis services.

### 3. Run one-time init

Run migrations, generate the Prisma client, and seed the initial data once:

```bash
docker compose -f docker-compose.server.yml -f docker-compose.server.init.yml run --rm init
```

That command runs `npm run deploy:init`, which currently does:

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
```

The normal `web` and `worker` services do not block on this init path. Run it once for a
fresh deployment and again whenever you intentionally want to apply new migrations and seed changes.

### 4. Start the app and worker

```bash
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d
```

Open the app at `http://<server>:3000`.

### 5. Create or verify the first admin

- If `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` were set during init, sign in with that account.
- If they were left blank, visit `/admin/bootstrap` once to create the first admin.

`docker-compose.server.yml` intentionally maps runtime `DATABASE_URL` and `REDIS_URL`
from `SERVER_DATABASE_URL` and `SERVER_REDIS_URL` so the repository's existing
`.env.example` can keep shell-friendly localhost defaults without breaking container-to-container
networking on a server. If you leave those `SERVER_*` vars unset, the stack uses the bundled
Postgres and Redis services.

`docker-compose.server.init.yml` intentionally uses a separate one-shot Node container so
first-run Prisma setup is explicit and does not get coupled to the long-running `web` or
`worker` startup path.

Use a different image tag by setting `BENFOLIO_IMAGE_TAG`, for example:

```bash
BENFOLIO_IMAGE_TAG=sha-abcdef1 docker compose -f docker-compose.server.yml up -d
```

To manually trigger image publishing, open the repository's **Actions** tab, select
**Publish GHCR Images**, and use **Run workflow** on the branch you want to build.

### Unraid / stack note

If you are using an Unraid stack or another compose UI, the simplest path is:

1. Pull this repo into the stack directory.
2. Copy `.env.example` to `.env`.
3. Run the init command once from a shell in that directory:

```bash
docker compose -f docker-compose.server.yml -f docker-compose.server.init.yml run --rm init
```

4. Then start the normal server stack from the UI or with `docker compose -f docker-compose.server.yml up -d`.

## Environment

Core env vars are documented in `.env.example`.

For local Docker, Compose already injects working defaults. For production, point the S3-compatible settings to Cloudflare R2:

- `S3_ENDPOINT`
- `S3_PUBLIC_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`
- `S3_BUCKET_ORIGINALS`
- `S3_BUCKET_DERIVATIVES`
- `IMPORTS_PREFIX`
- `IMPORTS_CLEANUP_MODE`
- `IMPORTS_ARCHIVE_PREFIX`
- `STORAGE_WEBHOOK_SECRET`
- `STORAGE_WEBHOOK_SIGNATURE_HEADER`

The app intentionally keeps originals private and serves downloads through `/download/[id]`.
`S3_PUBLIC_ENDPOINT` should be a browser-reachable S3/R2 API origin for presigned direct
uploads. In local Docker that is `http://localhost:9000`; in production it should point at
your public R2/S3 API endpoint rather than an internal-only service hostname.
Storage-folder imports are scanned from the originals bucket under `imports/<event-slug>/...` by default.
If `STORAGE_WEBHOOK_SECRET` is set, `/api/webhooks/storage` expects an HMAC-SHA256 signature in the configured header.

### Direct browser uploads (required for admin upload to work)

Uploads go straight from the browser to the originals bucket. Two things must be set on the
storage side before admin uploads will work in production — without these, the admin page
shows "Could not reach storage" errors:

1. **`S3_PUBLIC_ENDPOINT`** must be a browser-reachable HTTPS origin, not an internal
   service name. For Cloudflare R2 that is usually
   `https://<account-id>.r2.cloudflarestorage.com`. If you front R2 with a custom domain,
   use that instead. Mixed-content (http endpoint on an https gallery) will be blocked.

2. **The originals bucket must have a CORS policy** allowing `PUT` from your gallery
   origin. Local MinIO is configured automatically by `docker-compose.yml`. For R2, apply
   a policy like this via `wrangler r2 bucket cors put <bucket>` or the R2 dashboard:

   ```json
   [
     {
       "AllowedOrigins": ["https://your-gallery-domain.example"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   The admin upload flow only signs `Content-Type` on the presigned PUT, so
   `AllowedHeaders` can be that narrow. If you add a custom domain later, include both the
   apex and any subdomains you load the gallery from.

If uploads fail, open devtools → Network, retry, and inspect the failing `PUT` request and
the `OPTIONS` preflight. The console will also log the target URL and any response body
the storage layer returned.

## Database and Prisma

Common commands:

```bash
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
```

Seed behavior:

- always ensures a default `SiteProfile` row exists
- optionally creates the first admin when `SEED_ADMIN_*` env vars are provided

## What this first pass includes

- Docker Compose local stack
- Prisma schema plus initial SQL migration
- built-in admin bootstrap and login flows
- protected admin overview, event CRUD, and upload pages
- protected admin imports page for scanning `imports/<event-slug>/...` storage prefixes
- direct-upload signing API that sends originals straight from the browser to private object storage and then enqueues Redis jobs after registration
- imports scan flow that creates or reuses draft events, records per-file import items, and reuses the existing photo worker pipeline
- targeted storage webhook route for object-create events under the imports prefix
- adapter-based storage webhook parsing with generic S3 payloads plus a Cloudflare R2-oriented relay shape
- worker that extracts EXIF, computes metadata, generates responsive derivatives with Sharp, and updates photo state
- post-success cleanup for imported source objects, with delete-by-default and archive-ready env configuration
- per-file import observability with cleanup outcome, timeline history, duplicate visibility, single-item retry, and filtered bulk actions
- public homepage with profile-style header and reverse-chronological event grid
- public event pages with oldest-to-newest photo tiles
- canonical photo route at `/p/[id]`
- intercepted modal route for in-gallery photo navigation
- keyboard navigation, swipe support, share-link copy, info drawer, and original download in the viewer
- robots, sitemap, Open Graph metadata, and hidden-content noindex handling

## Current tradeoffs

- Derivatives are served through the app from the derivatives bucket for a simpler first-pass delivery path.
- Storage webhooks are supported, but signature verification is optional so local Docker testing stays easy. Leaving `STORAGE_WEBHOOK_SECRET` empty accepts unsigned JSON deliveries from a trusted network.
- Import dedupe is still keyed to the source object key. That keeps webhook and manual scan idempotent, but the model does not attempt content-hash dedupe across renamed files.

## Testing webhook ingestion locally

Manual scan remains the easiest fallback from `/admin/imports`.

The storage webhook route accepts an explicit adapter hint through either:

- query string: `/api/webhooks/storage?adapter=generic-s3` or `/api/webhooks/storage?adapter=cloudflare-r2`
- header: `x-storage-webhook-adapter: generic-s3` or `x-storage-webhook-adapter: cloudflare-r2`

If no hint is provided, the route auto-detects the payload and falls back to the generic S3 parser.

### Generic S3-style payload

To exercise targeted webhook ingestion locally without signing, POST an S3-style object-create payload to `/api/webhooks/storage?adapter=generic-s3`:

```bash
curl -X POST http://localhost:3000/api/webhooks/storage \
  -H "content-type: application/json" \
  -d '{
    "Records": [
      {
        "eventName": "ObjectCreated:Put",
        "eventTime": "2026-04-15T13:30:00Z",
        "s3": {
          "bucket": { "name": "gallery-originals" },
          "object": {
            "key": "imports/sample-event/frame-001.jpg",
            "size": 2450012
          }
        }
      }
    ]
  }'
```

If `STORAGE_WEBHOOK_SECRET` is set, compute an HMAC-SHA256 of the raw request body and send it in `STORAGE_WEBHOOK_SIGNATURE_HEADER`. The route accepts either a bare hex digest or a `sha256=<hex>` value.

### Cloudflare R2-oriented relay payload

The built-in R2 adapter expects a relayed JSON body rather than Cloudflare signing semantics directly. It supports either a top-level event object or an `events` array with the object key and object-create action, for example:

```bash
curl -X POST 'http://localhost:3000/api/webhooks/storage?adapter=cloudflare-r2' \
  -H 'content-type: application/json' \
  -d '{
    "provider": "cloudflare-r2",
    "events": [
      {
        "eventType": "object.create",
        "bucketName": "gallery-originals",
        "requestId": "demo-r2-delivery",
        "object": {
          "key": "imports/sample-event/frame-002.jpg",
          "size": 1984001,
          "etag": "demo-etag"
        },
        "eventTimestamp": "2026-04-15T13:45:00Z"
      }
    ]
  }'
```

This shape is intended for an R2 queue consumer or small relay worker that forwards object-create events to the app while preserving the object key, provider metadata, and any request identifier.

## Verification run

These checks were run locally in this workspace:

- `npm run lint --workspace app`
- `npm run lint --workspace worker`
- `npm run build --workspace app`
- `npm run build --workspace worker`

## Next milestone suggestions

- provider-specific relay hardening for whichever R2 event source you standardize on in production
- content-hash-based duplicate review and optional hash-first ingest blocking
- bulk reprocessing and broader job observability
- finer-grained admin roles and password reset flow
- optional direct CDN delivery for derivatives on R2
