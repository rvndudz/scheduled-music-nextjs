## Scheduled Music Console

Lightweight Next.js console for curating scheduled playlists that can power in-game radios, kiosks, or virtual venues—no dedicated streaming server required. Upload MP3s once, store their metadata alongside timing info, and let your game client pull the JSON schedule to simulate live programming (think GTA-style radio stations inside your own world).

### Features

- `/upload-event` page built with React + Tailwind for event management.
- Drag-and-drop style multi-file upload with live metadata preview.
- `music-metadata` powered extraction for track title + duration.
- File uploads to Cloudflare R2 via `@aws-sdk/client-s3`.
- REST API routes:
  - `POST /api/upload-track` - multipart MP3 upload, returns `{ track_id, track_name, track_url, track_duration_seconds }`.
  - `POST /api/create-event` - persists events and appended tracks to `data/events.json`.

### Getting Started

1. Install dependencies

   ```bash
   npm install
   ```

2. Configure environment variables by copying `.env.example` to `.env.local` and filling the Cloudflare R2 credentials.

3. Run the development server

   ```bash
   npm run dev
   ```

4. Visit [http://localhost:3000/upload-event](http://localhost:3000/upload-event) to schedule a new playlist.

> Want a companion Unity listener? Check out [rvndudz/scheduled-music-unity](https://github.com/rvndudz/scheduled-music-unity) for a minimal client that consumes the JSON schedule and streams the published MP3s inside your scene.

### Data & Storage

- Events are appended to `data/events.json`. Seed data is provided so the API always has a valid JSON file.
- Track uploads use the following env vars:

  | Variable | Description |
  | --- | --- |
  | `R2_ACCESS_KEY` | Cloudflare R2 access key ID |
  | `R2_SECRET_KEY` | Cloudflare R2 secret |
| `R2_BUCKET` | Public bucket name used for uploads |
| `R2_ENDPOINT` | S3-compatible endpoint, e.g. `https://<accountid>.r2.cloudflarestorage.com` |
| `R2_PUBLIC_BASE_URL` | Public base URL for served files, e.g. `https://pub-xxxxx.r2.dev` (falls back to `https://<bucket>.r2.dev`) |

### Testing Notes

- Metadata parsing errors, R2 upload failures, and JSON write issues return descriptive HTTP error responses.
- When running locally without valid env vars the upload route will respond with 502 errors surfaced in the UI banner.
