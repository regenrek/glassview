# Glassview

Glassview is a small Cloudflare Worker + R2 app for turning screenshots into shareable browser links. It is useful when an agent, CI job, browser test, or remote collaborator needs a real visual proof URL instead of a local-only screenshot file.

The app stores uploaded images in R2, serves a lightweight HTML viewer, and protects uploads with a bearer token. Reads are public by URL; writes require `GLASSVIEW_UPLOAD_TOKEN`.

## One-command deploy

Prerequisites:

- A Cloudflare account with Workers and R2 enabled.
- Cloudflare credentials available to Alchemy, preferably `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Node.js and pnpm.

Deploy from a fresh checkout:

```sh
git clone https://github.com/instructa/glassview.git
cd glassview
pnpm install
pnpm setup:deploy
```

`pnpm setup:deploy` creates `.env.local` with generated secrets when it does not exist, then runs `alchemy deploy --env-file .env.local`. It does not print the generated upload token.

If you prefer manual setup, copy `.env.example` to `.env.local`, replace the `CHANGEME_*` values, and run:

```sh
pnpm deploy
```

## Use it

Upload an image:

```sh
GLASSVIEW_URL=https://your-worker.your-subdomain.workers.dev \
GLASSVIEW_UPLOAD_TOKEN=your-upload-token \
pnpm upload /path/to/screenshot.png "Browser proof"
```

Capture a URL with Playwright and upload the screenshot:

```sh
GLASSVIEW_URL=https://your-worker.your-subdomain.workers.dev \
GLASSVIEW_UPLOAD_TOKEN=your-upload-token \
pnpm capture:url http://localhost:5173/ "Local app"
```

Local development:

```sh
pnpm dev
GLASSVIEW_LOCAL_URL=http://localhost:8787 GLASSVIEW_UPLOAD_TOKEN=your-upload-token pnpm upload ./example.png
```

## Endpoints

- `GET /health` returns service health and stage.
- `POST /api/screenshots` uploads an image with `Authorization: Bearer <token>`.
- `GET /v/:id` opens the HTML viewer.
- `GET /raw/:id` returns the uploaded image.
- `GET /latest` redirects to the newest screenshot viewer.

## Codex skill

This repo includes a portable Codex skill in `skills/glassview`.

Install it into your local Codex skills directory:

```sh
pnpm skill:install
```

The skill expects `GLASSVIEW_URL` or `GLASSVIEW_LOCAL_URL` plus `GLASSVIEW_UPLOAD_TOKEN`, captures or uploads a real image, checks the returned viewer URL, and returns the shareable link.

## Configuration

Environment variables:

- `ALCHEMY_PASSWORD`: local Alchemy state encryption password.
- `GLASSVIEW_UPLOAD_TOKEN`: bearer token required for uploads.
- `GLASSVIEW_BUCKET_NAME`: R2 bucket name.
- `GLASSVIEW_USE_EXISTING_R2`: set `true` to bind an existing bucket instead of letting Alchemy create one.
- `GLASSVIEW_ENABLE_WORKERS_DEV`: set `false` to disable the `workers.dev` route.
- `STAGE`: Alchemy stage, defaults to `dev`.

When Alchemy creates the bucket, screenshots and metadata are configured with a 14-day lifecycle. If `GLASSVIEW_USE_EXISTING_R2=true`, configure lifecycle rules on that existing bucket yourself.

## Security

Do not commit `.env.local`, Alchemy state, Cloudflare credentials, tokens, screenshots, or private keys.

Run local checks before publishing changes:

```sh
pnpm security:check
```

Optional local git hooks:

```sh
pnpm hooks:install
```

The repo includes:

- forbidden staged-file guardrails in `.forbidden-paths.regex`
- BetterLeaks configuration in `.betterleaks.toml`
- a local security check script in `scripts/secleak-check.sh`
- GitHub Actions secret scanning
- Dependabot for npm and GitHub Actions

## Verification

```sh
pnpm build
pnpm test
pnpm security:check
```

## License

MIT
