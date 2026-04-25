# Self-Hosted Photography Gallery MVP

This repository contains a production-leaning first pass of a self-hosted event photography gallery with:

- a public, mobile-first editorial gallery built in Next.js App Router
- a built-in admin panel with credential auth
- PostgreSQL via Prisma
- Redis-backed background jobs
- a separate worker service in the same repo
- S3-compatible object storage wired for Cloudflare R2 in production and MinIO locally
- a setup-first admin control center for storage behavior, imports, public toggles, and diagnostics

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

Bootstrap env you must set:

- `APP_URL`
- `AUTH_COOKIE_SECRET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

Usually set here for the first deploy, but editable later in `/admin/settings`:

- `S3_ENDPOINT`
- `S3_PUBLIC_ENDPOINT`
- `S3_REGION`
- `S3_FORCE_PATH_STYLE`
- `S3_BUCKET_ORIGINALS`
- `S3_BUCKET_DERIVATIVES`
- `IMPORTS_PREFIX`
- `IMPORTS_CLEANUP_MODE`
- `IMPORTS_ARCHIVE_PREFIX`

Safe to leave at the example defaults until you reach the admin checklist:

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

### 6. Finish setup from admin

After the first login, `/admin` now surfaces a compact setup checklist and system status.
Use `/admin/settings` to:

- set the public site identity
- verify storage and bucket access with **Test storage**
- adjust storage endpoints, bucket names, imports behavior, and gallery toggles
- confirm worker heartbeat and queue health

The worker and app still depend on env-managed credentials in this phase. The admin
settings layer controls non-secret storage behavior and product toggles on top of that.

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

### Bootstrap env

Keep these in env:

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_COOKIE_SECRET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

### Admin-managed after bootstrap

These still have env fallbacks, but benfolio now lets you manage them from
`/admin/settings` after the first deploy:

- storage endpoint / public endpoint / region / path-style mode
- originals and derivatives bucket names
- imports prefix / cleanup mode / archive prefix
- public search enabled
- original downloads enabled
- public indexing enabled
- default event visibility
- direct admin uploads enabled
- public logo mark enabled

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
- `FURTRACK_AUTH_TOKEN`
- `FURTRACK_BASE_URL`
- `FURTRACK_FETCH_MODE`
- `FURTRACK_CURL_CFFI_COMMAND`
- `FURTRACK_CURL_CFFI_SCRIPT`
- `FURTRACK_CURL_CFFI_IMPERSONATE`

The app intentionally keeps originals private and serves downloads through `/download/[id]`.
`S3_PUBLIC_ENDPOINT` should be a browser-reachable S3/R2 API origin for presigned direct
uploads. In local Docker that is `http://localhost:9000`; in production it should point at
your public R2/S3 API endpoint rather than an internal-only service hostname.
Storage-folder imports are scanned from the originals bucket under `imports/<event-slug>/...` by default.
If `STORAGE_WEBHOOK_SECRET` is set, `/api/webhooks/storage` expects an HMAC-SHA256 signature in the configured header.

### Furtrack tag import

Admin photo cards include a Furtrack import control inside **Edit details**. Paste a
Furtrack post URL, post ID, or raw Furtrack tag list and the app will:

- map Furtrack tag prefixes into typed tags (`character`, `event`, `species`, `maker`, `general`)
- create missing canonical tags
- add Furtrack raw names and underscore variants as aliases
- attach the tags to the selected photo
- link the photo to the Furtrack post when a post ID is provided

Furtrack post lookups use `GET /view/post/{postId}` against `FURTRACK_BASE_URL`, which
defaults to `https://solar.furtrack.com`. If configured, `FURTRACK_AUTH_TOKEN` is sent as
`Authorization: Bearer <token>`. Admins can also save a Furtrack bearer token from
`/admin/furtrack-match-test`; the saved token is encrypted with `AUTH_COOKIE_SECRET` and
takes precedence over the env token. The same admin panel can save the `curl_cffi`
TLS impersonation profile, such as `chrome`.

The parser understands Furtrack numeric prefixes:

- `1:` -> character
- `2:` -> maker
- `3:` -> general, stored as `Photographer: ...` because the local taxonomy does not have a photographer category yet
- `5:` -> event
- `6:` -> species

Furtrack requests default to `FURTRACK_FETCH_MODE=auto`, which tries the bundled
`curl_cffi` helper first and falls back to Node fetch if the helper is unavailable.
The published web and worker Docker images include Python and `curl_cffi`, so server
deployments can use browser TLS impersonation without adding another service. For local
non-Docker development, install the helper dependency with:

```bash
python -m pip install -r scripts/furtrack-requirements.txt
```

Set `FURTRACK_FETCH_MODE=curl_cffi` if you want failures to be explicit instead of
falling back to Node fetch. `FURTRACK_CURL_CFFI_IMPERSONATE` defaults to `chrome`.

### Furtrack event matching

The Furtrack sync surface is available in admin navigation at `/admin/furtrack-match-test`.

Use it to choose a local event and find likely matching Furtrack posts. If no candidate
tags are entered, the matcher derives Furtrack event tags from the local event title,
slug, kicker, and year. You can still override discovery with:

- Furtrack tags such as `5:FWA_2025` or `1:character_name`
- explicit Furtrack post IDs

The matcher:

- loads local processed derivatives from private storage
- uses cached Furtrack post metadata/fingerprints first when available
- falls back to live Furtrack candidate metadata/images when the cache is empty
- computes a simple perceptual difference hash for each image
- ranks candidates by visual similarity and aspect-ratio fit
- shows local and Furtrack photos side-by-side for review
- can sync one confirmed match or all exact `100%` visual-hash matches

The **Sync Furtrack cache** action queues a worker job that walks the full selected tag
feed until Furtrack returns no more posts, then fetches each post's tags and image
fingerprint and stores them locally. Run it for your photographer tag such as
`3:your_handle`; later album matching can use the local cache instead of re-fetching the
same Furtrack posts for every event. Re-run it as maintenance when old Furtrack posts
receive new tags. The worker keeps an internal high safety ceiling to avoid runaway jobs,
but the admin UI does not require guessing page or candidate counts.

The **Sync exact matches** action uses the exact matches currently shown, then imports
Furtrack tags and creates Furtrack external links for those photos.
It intentionally skips non-exact matches so the first writable version stays conservative.
Near matches must be confirmed individually before they write tags.

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

## Setup checklist and diagnostics

The admin overview and settings pages now expose:

- a first-run checklist
- storage connectivity checks
- Redis / database / bucket reachability
- worker heartbeat freshness
- queue backlog counts
- failed photo and import counts
- latest successful processing/import timestamps

If the worker stops, the heartbeat will go stale and admin will surface that directly.

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
- per-photo Furtrack tag import that maps Furtrack metadata into typed tags and aliases
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
- Storage credentials are still env-managed. The control center only manages non-secret storage behavior in this phase.

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

## Operator troubleshooting

### Storage connection failed

- Check `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
- Confirm the endpoint and bucket names in `/admin/settings`
- Use **Test storage** from `/admin/settings`

### Worker not processing

- Open `/admin` or `/admin/settings` and check the worker heartbeat
- Confirm Redis is reachable
- Check the queue counts and failed photo count

### Imports not appearing

- Confirm the imports prefix in `/admin/settings`
- Check `/admin/imports` for skipped or failed items
- Use the manual scan button as the fallback even when webhooks are enabled

### Direct uploads failing

- Confirm direct uploads are enabled in `/admin/settings`
- Check the browser-facing `S3_PUBLIC_ENDPOINT`
- Verify bucket CORS matches your `APP_URL`
- If uploads verify but do not process, check the worker heartbeat and queue counts

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
