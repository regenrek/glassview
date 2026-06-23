# Usage

## Agent Prompts

Capture a local app:

```text
Use $glassview.

Capture http://localhost:5173/ and return a verified Glassview link.
```

Upload an existing screenshot:

```text
Use $glassview.

Upload /tmp/screenshot.png as "Browser proof" and return the verified view URL.
```

Verify a visual state before reporting done:

```text
Use $glassview.

Open the app, capture the final browser state, upload the screenshot, verify the returned viewer URL, and include that URL in the final answer.
```

## Direct Commands

Upload an image:

```bash
GLASSVIEW_URL=https://your-glassview-worker.example \
GLASSVIEW_UPLOAD_TOKEN=your-upload-token \
pnpm upload /path/to/screenshot.png "Browser proof" --ttl 24h
```

Capture a URL with Playwright and upload the screenshot:

```bash
GLASSVIEW_URL=https://your-glassview-worker.example \
GLASSVIEW_UPLOAD_TOKEN=your-upload-token \
pnpm capture:url http://localhost:5173/ "Local app" --ttl 24h
```

Local backend:

```bash
pnpm dev
GLASSVIEW_LOCAL_URL=http://localhost:8787 \
GLASSVIEW_UPLOAD_TOKEN=your-upload-token \
pnpm upload ./example.png "Local proof"
```

TTL values use `m`, `h`, or `d`, for example `30m`, `1h`, `24h`, or `7d`.
Use `--public` only for screenshots that are safe to store and share as public-by-link plaintext.

## What Counts As Proof

A valid Glassview proof has all of these:

- a real PNG, JPEG, WebP, GIF, or SVG file was uploaded
- `POST /api/screenshots` returned `id`, `viewUrl`, and `rawUrl`
- the returned `viewUrl` was checked and returned `200 OK`
- the final answer includes the shareable `viewUrl`

An accessibility tree, DOM snapshot, terminal output, or generated URL that was not checked is not Glassview proof.
