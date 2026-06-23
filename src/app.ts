import { renderHome, renderViewer } from "./html";
import { parseDuration, resolveRuntimeConfig, ttlToExpiresAt } from "./config";
import type { GlassviewEnv, ScreenshotMetadata, UploadResponse } from "./types";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

const VIEWER_SECURITY_HEADERS = {
  "x-robots-tag": "noindex, nofollow, noarchive",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; img-src 'self' blob: data:; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

const LATEST_KEY = "latest.json";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type UploadInput = {
  bytes: ArrayBuffer;
  contentType: string;
  mode?: string;
  originalContentType?: string;
  cipherAlg?: string;
  iv?: string;
  label?: string;
  sourceUrl?: string;
  appName?: string;
  viewport?: string;
  note?: string;
  ttl?: string;
};

export async function handleRequest(request: Request, env: GlassviewEnv): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const isRead = request.method === "GET" || request.method === "HEAD";
  const headOnly = request.method === "HEAD";

  if (isRead && pathname === "/") {
    const config = resolveRuntimeConfig(env);
    const latest = config.latestEnabled ? await getLatest(env) : undefined;
    return html(headOnly ? "" : renderHome(latest));
  }

  if (isRead && pathname === "/favicon.ico") {
    return new Response(null, { status: 204 });
  }

  if (isRead && pathname === "/health") {
    return json({ ok: true, stage: env.STAGE || "unknown" });
  }

  if (isRead && pathname === "/latest") {
    const config = resolveRuntimeConfig(env);
    if (!config.latestEnabled) {
      const unauthorized = authorize(request, env);
      if (unauthorized) return unauthorized;
    }
    const latest = await getLatest(env);
    if (!latest) return html(headOnly ? "" : renderHome(), 404);
    return Response.redirect(new URL(latest.viewUrl, request.url).toString(), 302);
  }

  if (request.method === "POST" && pathname === "/api/screenshots") {
    return uploadScreenshot(request, env);
  }

  const revokeMatch = pathname.match(/^\/api\/screenshots\/([A-Za-z0-9_-]+)\/revoke$/);
  if (request.method === "POST" && revokeMatch) {
    return revokeScreenshot(request, env, revokeMatch[1]);
  }

  const deleteMatch = pathname.match(/^\/api\/screenshots\/([A-Za-z0-9_-]+)$/);
  if (request.method === "DELETE" && deleteMatch) {
    return revokeScreenshot(request, env, deleteMatch[1]);
  }

  const viewMatch = pathname.match(/^\/v\/([A-Za-z0-9_-]+)$/);
  if (isRead && viewMatch) {
    const meta = await getMetadata(env, viewMatch[1]);
    if (!meta) return text("Screenshot not found", 404);
    const unavailable = unavailableResponse(meta);
    if (unavailable) return unavailable;
    return html(headOnly ? "" : renderViewer(meta), 200, VIEWER_SECURITY_HEADERS);
  }

  const rawMatch = pathname.match(/^\/raw\/([A-Za-z0-9_-]+)$/);
  if (isRead && rawMatch) {
    const meta = await getMetadata(env, rawMatch[1]);
    if (!meta) return text("Screenshot not found", 404);
    const unavailable = unavailableResponse(meta);
    if (unavailable) return unavailable;
    if (meta.mode === "encrypted") {
      return text("Raw image unavailable for encrypted screenshots", 404);
    }
    const object = await env.SCREENSHOTS.get(meta.imageKey);
    if (!object) return text("Image not found", 404);
    return new Response(headOnly ? null : object.body, {
      headers: {
        "content-type": meta.contentType,
        "cache-control": "private, max-age=3600",
      },
    });
  }

  const blobMatch = pathname.match(/^\/blob\/([A-Za-z0-9_-]+)$/);
  if (isRead && blobMatch) {
    const meta = await getMetadata(env, blobMatch[1]);
    if (!meta) return text("Screenshot not found", 404);
    const unavailable = unavailableResponse(meta);
    if (unavailable) return unavailable;
    if (meta.mode !== "encrypted") {
      return text("Ciphertext blob unavailable for public screenshots", 404);
    }
    const object = await env.SCREENSHOTS.get(meta.imageKey);
    if (!object) return text("Image not found", 404);
    return new Response(headOnly ? null : object.body, {
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow, noarchive",
        "referrer-policy": "no-referrer",
      },
    });
  }

  return text("Not found", 404);
}

async function uploadScreenshot(request: Request, env: GlassviewEnv): Promise<Response> {
  const unauthorized = authorize(request, env);
  if (unauthorized) return unauthorized;

  const input = await readUploadInput(request);
  const config = resolveRuntimeConfig(env);
  let mode: "encrypted" | "public";
  try {
    mode = normalizeUploadMode(input.mode, config.encryptUploads);
  } catch (error) {
    return json({ error: "invalid_share_mode", message: errorMessage(error) }, 400);
  }
  let ttlSeconds: number;
  try {
    ttlSeconds = input.ttl
      ? parseDuration(input.ttl, { maxSeconds: config.maxTtlSeconds, name: "ttl" })
      : config.defaultTtlSeconds;
  } catch (error) {
    return json({ error: "invalid_ttl", message: errorMessage(error) }, 400);
  }

  const storedContentType = mode === "encrypted" ? "application/octet-stream" : input.contentType;
  const imageContentType = mode === "encrypted" ? input.originalContentType : input.contentType;

  if (!imageContentType?.startsWith("image/")) {
    return json({ error: "unsupported_media_type" }, 415);
  }
  if (mode === "encrypted") {
    if (input.cipherAlg !== "AES-GCM" || !input.iv) {
      return json({ error: "invalid_cipher_metadata" }, 400);
    }
    if (input.contentType !== "application/octet-stream") {
      return json({ error: "invalid_ciphertext_media_type" }, 415);
    }
  }
  if (input.bytes.byteLength === 0) {
    return json({ error: "empty_upload" }, 400);
  }
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    return json({ error: "upload_too_large", maxBytes: MAX_UPLOAD_BYTES }, 413);
  }

  const id = createId();
  const createdAt = new Date().toISOString();
  const expiresAt = ttlToExpiresAt(createdAt, ttlSeconds);
  const ext = mode === "encrypted" ? "bin" : extensionForContentType(imageContentType);
  const datePrefix = createdAt.slice(0, 10).replaceAll("-", "/");
  const imageKey = `screenshots/${datePrefix}/${id}.${ext}`;
  const metaKey = `meta/${id}.json`;
  const baseUrl = new URL(request.url).origin;

  const meta: ScreenshotMetadata = {
    id,
    mode,
    label: mode === "public" ? input.label : undefined,
    sourceUrl: mode === "public" ? input.sourceUrl : undefined,
    appName: mode === "public" ? input.appName : undefined,
    viewport: mode === "public" ? input.viewport : undefined,
    note: mode === "public" ? input.note : undefined,
    imageKey,
    metaKey,
    contentType: imageContentType,
    size: input.bytes.byteLength,
    cipher: mode === "encrypted" ? { alg: "AES-GCM", iv: input.iv! } : undefined,
    createdAt,
    expiresAt,
    viewUrl: `${baseUrl}/v/${id}`,
    rawUrl: mode === "public" ? `${baseUrl}/raw/${id}` : undefined,
    blobUrl: mode === "encrypted" ? `${baseUrl}/blob/${id}` : undefined,
  };

  await env.SCREENSHOTS.put(imageKey, input.bytes, {
    httpMetadata: { contentType: storedContentType },
  });
  await env.SCREENSHOTS.put(metaKey, JSON.stringify(meta, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  await env.SCREENSHOTS.put(LATEST_KEY, JSON.stringify({ id }, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  const body: UploadResponse = {
    id: meta.id,
    viewUrl: meta.viewUrl,
    rawUrl: meta.rawUrl,
    blobUrl: meta.blobUrl,
    createdAt: meta.createdAt,
  };

  return json(body, 201);
}

async function revokeScreenshot(
  request: Request,
  env: GlassviewEnv,
  id: string,
): Promise<Response> {
  const unauthorized = authorize(request, env);
  if (unauthorized) return unauthorized;

  const meta = await getMetadata(env, id);
  if (!meta) return json({ error: "not_found" }, 404);

  const revokedAt = meta.revokedAt || new Date().toISOString();
  const updated: ScreenshotMetadata = { ...meta, revokedAt };
  await env.SCREENSHOTS.put(updated.metaKey, JSON.stringify(updated, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  return json({ id, revokedAt });
}

async function readUploadInput(request: Request): Promise<UploadInput> {
  const contentType = request.headers.get("content-type") || "application/octet-stream";
  const url = new URL(request.url);

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return {
        bytes: new ArrayBuffer(0),
        contentType: "application/octet-stream",
      };
    }
    return {
      bytes: await file.arrayBuffer(),
      contentType: file.type || "application/octet-stream",
      label: stringField(form, "label"),
      mode: stringField(form, "mode"),
      originalContentType: stringField(form, "contentType"),
      cipherAlg: stringField(form, "cipherAlg"),
      iv: stringField(form, "iv"),
      sourceUrl: stringField(form, "sourceUrl"),
      appName: stringField(form, "appName"),
      viewport: stringField(form, "viewport"),
      note: stringField(form, "note"),
      ttl: stringField(form, "ttl"),
    };
  }

  return {
    bytes: await request.arrayBuffer(),
    contentType: normalizeImageContentType(contentType),
    mode: url.searchParams.get("mode") || undefined,
    originalContentType: url.searchParams.get("contentType") || undefined,
    cipherAlg: url.searchParams.get("cipherAlg") || undefined,
    iv: url.searchParams.get("iv") || undefined,
    label: url.searchParams.get("label") || undefined,
    sourceUrl: url.searchParams.get("sourceUrl") || undefined,
    appName: url.searchParams.get("appName") || undefined,
    viewport: url.searchParams.get("viewport") || undefined,
    note: url.searchParams.get("note") || undefined,
    ttl: url.searchParams.get("ttl") || undefined,
  };
}

async function getLatest(env: GlassviewEnv): Promise<ScreenshotMetadata | undefined> {
  const latest = await env.SCREENSHOTS.get(LATEST_KEY);
  if (!latest) return undefined;
  const pointer = await latest.json<{ id?: string }>();
  if (!pointer.id) return undefined;
  return getMetadata(env, pointer.id);
}

async function getMetadata(env: GlassviewEnv, id: string): Promise<ScreenshotMetadata | undefined> {
  const object = await env.SCREENSHOTS.get(`meta/${id}.json`);
  if (!object) return undefined;
  return object.json<ScreenshotMetadata>();
}

function authorize(request: Request, env: GlassviewEnv): Response | undefined {
  const expected = env.GLASSVIEW_UPLOAD_TOKEN;
  const auth = request.headers.get("authorization") || "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return json({ error: "unauthorized" }, 401);
  }
  return undefined;
}

function unavailableResponse(meta: ScreenshotMetadata): Response | undefined {
  if (meta.revokedAt) return text("Screenshot revoked", 410);
  if (meta.expiresAt && Date.now() >= new Date(meta.expiresAt).getTime()) {
    return text("Screenshot expired", 410);
  }
  return undefined;
}

function normalizeUploadMode(value: string | undefined, encryptUploads: boolean): "encrypted" | "public" {
  if (!value) return encryptUploads ? "encrypted" : "public";
  switch (value) {
    case "encrypted":
    case "private":
      return "encrypted";
    case "public":
      return "public";
    default:
      throw new Error(`Unsupported upload mode: ${value}`);
  }
}

function stringField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeImageContentType(contentType: string): string {
  return contentType.split(";")[0]?.trim() || "application/octet-stream";
}

function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "png";
  }
}

function createId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function html(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}
