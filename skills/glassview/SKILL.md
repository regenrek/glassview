---
name: glassview
description: Upload agent, browser, or desktop screenshots to a Glassview Worker and return shareable view URLs.
---

# Glassview

Glassview turns real screenshot files into browser-openable URLs backed by a Cloudflare Worker and R2 bucket.

## Workflow

1. Confirm the service URL and token:
   - Prefer `GLASSVIEW_URL` for deployed Workers.
   - Use `GLASSVIEW_LOCAL_URL` for local dev.
   - Require `GLASSVIEW_UPLOAD_TOKEN`.
2. Capture or locate a real image file.
3. Upload the image with `scripts/upload-file.mjs`.
4. Verify the returned viewer URL with `curl -I` or a browser request.
5. Return the verified `viewUrl`.

Do not claim Glassview proof from an accessibility tree, DOM snapshot, or text output alone. A real image must be uploaded and the returned viewer URL must be checked.

## Capture Choices

- For browser pages or localhost apps, prefer `scripts/capture-url.mjs <url> [label] [--ttl 24h]`.
- For an existing local image file, use `scripts/upload-file.mjs <image-file> [label] [--ttl 24h]`.
- For desktop screenshots, first save the screenshot as PNG, JPEG, WebP, GIF, or SVG, then upload that file.

## Commands

From a clone of the Glassview repo:

```bash
GLASSVIEW_URL=https://your-worker.your-subdomain.workers.dev \
GLASSVIEW_UPLOAD_TOKEN=... \
node skills/glassview/scripts/upload-file.mjs /path/to/screenshot.png "Browser proof" --ttl 24h
```

For localhost/browser capture:

```bash
GLASSVIEW_URL=https://your-worker.your-subdomain.workers.dev \
GLASSVIEW_UPLOAD_TOKEN=... \
node skills/glassview/scripts/capture-url.mjs http://localhost:5173/ "Local app" --ttl 24h
```

## Verification

A successful proof has:

- `POST /api/screenshots` returned JSON with `id`, `viewUrl`, and `rawUrl`.
- `GET <viewUrl>` returns `200 OK` and an HTML viewer.
- The final answer includes the shareable `viewUrl`.
