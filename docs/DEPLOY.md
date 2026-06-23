# Deploy

Glassview deploys a Cloudflare Worker and R2 bucket through Alchemy.

## Prerequisites

- A Cloudflare account with Workers and R2 enabled.
- Cloudflare credentials available to Alchemy, preferably `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Node.js and pnpm.

## One-Command Setup

```bash
git clone https://github.com/regenrek/glassview.git
cd glassview
pnpm install
pnpm setup:deploy
```

`pnpm setup:deploy` creates `.env.local` with generated secrets when it does not exist, then runs:

```bash
alchemy deploy --env-file .env.local
```

The generated upload token is written to `.env.local` and is not printed.

## Manual Setup

```bash
cp .env.example .env.local
```

Replace the `CHANGEME_*` values, then deploy:

```bash
pnpm deploy
```

## Environment

`.env.local` supports:

- `ALCHEMY_PASSWORD`: local Alchemy state encryption password.
- `GLASSVIEW_UPLOAD_TOKEN`: bearer token required for uploads.
- `GLASSVIEW_BUCKET_NAME`: R2 bucket name.
- `GLASSVIEW_USE_EXISTING_R2`: set `true` to bind an existing bucket instead of letting Alchemy create one.
- `GLASSVIEW_ENABLE_WORKERS_DEV`: set `false` to disable the generated Worker URL.
- `GLASSVIEW_SHARE_MODE`: default share mode, currently `private`, `public`, or `team`.
- `GLASSVIEW_DEFAULT_TTL`: default link lifetime, such as `7d`.
- `GLASSVIEW_MAX_TTL`: maximum accepted link lifetime, such as `30d`.
- `GLASSVIEW_ENABLE_LATEST`: set `true` only when `/latest` should be publicly available.
- `GLASSVIEW_ENCRYPT_UPLOADS`: set `true` for private encrypted uploads.
- `STAGE`: Alchemy stage, defaults to `dev`.

When Alchemy creates the bucket, screenshots and metadata are configured with a 14-day lifecycle. If `GLASSVIEW_USE_EXISTING_R2=true`, configure lifecycle rules on that existing bucket yourself.

## Scripts

```bash
pnpm dev       # alchemy dev --env-file .env.local
pnpm deploy    # alchemy deploy --env-file .env.local
pnpm destroy   # alchemy destroy --env-file .env.local
```
