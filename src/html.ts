import type { ScreenshotMetadata } from "./types";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function renderHome(latest?: ScreenshotMetadata): string {
  const latestLink = latest
    ? `<a class="button" href="${escapeHtml(latest.viewUrl)}">Open latest screenshot</a>`
    : `<p class="muted">No screenshots have been uploaded yet.</p>`;

  return page("Glassview", `
    <main class="shell">
      <h1>Glassview</h1>
      <p>Remote screenshot links for agent work.</p>
      ${latestLink}
    </main>
  `);
}

export function renderViewer(meta: ScreenshotMetadata): string {
  if (meta.mode === "encrypted") return renderPrivateViewer(meta);

  const assetUrl = meta.rawUrl || meta.blobUrl || "#";
  const rows = metadataRows(meta);

  return page(`Glassview ${meta.id}`, `
    <main class="viewer">
      <header>
        <div>
          <p class="eyebrow">Glassview</p>
          <h1>${escapeHtml(meta.label || meta.id)}</h1>
        </div>
        <a class="button" href="${escapeHtml(assetUrl)}">Open raw</a>
      </header>
      <figure>
        <img src="${escapeHtml(assetUrl)}" alt="${escapeHtml(meta.label || "Uploaded screenshot")}" />
      </figure>
      ${renderMetadataRows(rows)}
    </main>
  `);
}

function renderPrivateViewer(meta: ScreenshotMetadata): string {
  const rows = metadataRows(meta);
  const blobUrl = meta.blobUrl || "";
  const iv = meta.cipher?.iv || "";

  return page("Glassview proof", `
    <main class="viewer">
      <header>
        <div>
          <p class="eyebrow">Glassview</p>
          <h1>Glassview proof</h1>
        </div>
        <a class="button" data-download hidden>Download</a>
      </header>
      <figure
        data-private-viewer
        data-id="${escapeHtml(meta.id)}"
        data-blob-url="${escapeHtml(blobUrl)}"
        data-iv="${escapeHtml(iv)}"
        data-content-type="${escapeHtml(meta.contentType)}"
      >
        <div class="status" data-status>Decrypting screenshot...</div>
      </figure>
      ${renderMetadataRows(rows)}
    </main>
    <script>
      (() => {
        const root = document.querySelector("[data-private-viewer]");
        if (!root) return;
        const status = root.querySelector("[data-status]");
        const download = document.querySelector("[data-download]");
        const setStatus = (message) => {
          if (status) status.textContent = message;
        };
        const key = new URLSearchParams(window.location.hash.slice(1)).get("k");
        if (!key) {
          setStatus("Missing decrypt key.");
          return;
        }

        decryptAndRender().catch(() => {
          setStatus("Could not decrypt screenshot.");
        });

        async function decryptAndRender() {
          if (!window.crypto?.subtle) {
            setStatus("Web Crypto is unavailable.");
            return;
          }
          const response = await fetch(root.dataset.blobUrl, { cache: "no-store" });
          if (!response.ok) {
            setStatus(response.status === 410 ? "Screenshot expired or revoked." : "Screenshot unavailable.");
            return;
          }
          const cryptoKey = await crypto.subtle.importKey(
            "raw",
            decodeBase64Url(key),
            "AES-GCM",
            false,
            ["decrypt"],
          );
          const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: decodeBase64Url(root.dataset.iv || "") },
            cryptoKey,
            await response.arrayBuffer(),
          );
          const blob = new Blob([plaintext], { type: root.dataset.contentType || "image/png" });
          const objectUrl = URL.createObjectURL(blob);
          const image = new Image();
          image.alt = "Uploaded screenshot";
          image.onload = () => {
            root.replaceChildren(image);
            if (download instanceof HTMLAnchorElement) {
              download.href = objectUrl;
              download.download =
                "glassview-" +
                (root.dataset.id || "screenshot") +
                "." +
                extensionFor(root.dataset.contentType || "");
              download.hidden = false;
            }
          };
          image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            setStatus("Could not render decrypted screenshot.");
          };
          image.src = objectUrl;
        }

        function decodeBase64Url(value) {
          const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
          const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
          const binary = atob(padded);
          return Uint8Array.from(binary, (char) => char.charCodeAt(0));
        }

        function extensionFor(contentType) {
          if (contentType === "image/jpeg") return "jpg";
          if (contentType === "image/webp") return "webp";
          if (contentType === "image/gif") return "gif";
          if (contentType === "image/svg+xml") return "svg";
          return "png";
        }
      })();
    </script>
  `);
}

function metadataRows(meta: ScreenshotMetadata): string[][] {
  return [
    ["Created", meta.createdAt],
    ["Label", meta.label],
    ["Source", meta.sourceUrl],
    ["App", meta.appName],
    ["Viewport", meta.viewport],
    ["Note", meta.note],
    ["Content type", meta.contentType],
    ["Size", `${meta.size} bytes`],
  ].filter((row): row is string[] => Boolean(row[1]));
}

function renderMetadataRows(rows: string[][]): string {
  return `<dl>
    ${rows
      .map(
        ([label, value]) => `
            <div>
              <dt>${escapeHtml(label || "")}</dt>
              <dd>${escapeHtml(value || "")}</dd>
            </div>
          `,
      )
      .join("")}
  </dl>`;
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #101214;
      color: #f4f1ec;
    }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(180deg, rgba(31, 35, 39, 0.96), rgba(12, 14, 16, 1));
    }
    .shell, .viewer {
      width: min(1120px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 40px 0;
    }
    .shell {
      min-height: calc(100vh - 80px);
      display: grid;
      align-content: center;
      gap: 16px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0;
      font-size: clamp(32px, 5vw, 64px);
      line-height: 1;
      letter-spacing: 0;
    }
    p {
      color: #c8c0b6;
      max-width: 64ch;
    }
    .eyebrow {
      margin: 0 0 8px;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.14em;
      color: #8fd3ff;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 0 14px;
      color: #061014;
      background: #8fd3ff;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 700;
      white-space: nowrap;
    }
    figure {
      margin: 0;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: #050607;
      overflow: auto;
      border-radius: 8px;
    }
    .status {
      min-height: 320px;
      display: grid;
      place-items: center;
      color: #c8c0b6;
      padding: 24px;
      text-align: center;
    }
    img {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 0 auto;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin: 20px 0 0;
    }
    dl div {
      border-top: 1px solid rgba(255, 255, 255, 0.16);
      padding-top: 10px;
      overflow-wrap: anywhere;
    }
    dt {
      color: #8fd3ff;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    dd {
      margin: 0;
      color: #f4f1ec;
    }
    .muted {
      color: #948a80;
    }
    @media (max-width: 640px) {
      header {
        align-items: start;
        flex-direction: column;
      }
      .button {
        width: 100%;
      }
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}
