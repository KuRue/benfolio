# Architecture Notes

## High-level flow

1. Admin authenticates with built-in credential auth.
2. Admin creates an event or creates one inline during upload.
3. Upload API stores original files in the private originals bucket.
4. Upload API inserts `Photo` rows and enqueues Redis jobs.
5. Worker consumes jobs, extracts EXIF data, generates responsive derivatives, and updates Prisma records.
6. Public pages render derivatives only.
7. Original downloads are served through the app by photo id.

## Storage model

- `originals` bucket
  - private source uploads
  - accessed only by the app and worker
- `derivatives` bucket
  - generated viewer/grid/thumb assets
  - read through the app at `/i/[...key]`

Local development uses MinIO as an R2-compatible S3 target. Production should swap the S3 env vars to Cloudflare R2.

## Routing model

- `/` - public homepage with profile header and event grid
- `/e/[slug]` - event page
- `/p/[id]` - canonical photo page
- `@modal/(.)p/[id]` - intercepted modal viewer when navigating from event pages
- `/admin/*` - protected admin area
- `/api/admin/uploads` - multi-file upload endpoint
- `/download/[id]` - original-file download

## Data model intent

- `SiteProfile` powers the profile-style public header
- `Event` owns public routing, metadata, visibility, and cover image references
- `Photo` owns canonical id routing and original-file metadata
- `PhotoDerivative` isolates display variants from originals
- `Tag`, `PhotoTag`, `ExternalAssetLink`, and `ImportJob` are already present for future taxonomy/import integrations such as Furtrack

## Visibility rules

- `DRAFT`
  - excluded from public routes
- `HIDDEN`
  - shareable if URL is known
  - excluded from homepage and sitemap
  - rendered with `noindex`
- `PUBLIC`
  - included in homepage and sitemap

## Worker responsibilities

- mark photo as `PROCESSING`
- read original from storage
- extract EXIF with `exifr`
- derive blur preview, dimensions, dominant color
- generate `THUMBNAIL`, `GRID`, and `VIEWER` webp outputs with Sharp
- persist derivative rows
- set event cover from the first processed photo when no explicit cover exists
- normalize in-event photo ordering based on capture time when available
