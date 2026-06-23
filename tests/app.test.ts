import { beforeEach, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app";
import type { GlassviewEnv, UploadResponse } from "../src/types";
import { MemoryR2Bucket } from "./memory-r2";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("glassview worker", () => {
  let bucket: MemoryR2Bucket;
  let env: GlassviewEnv;

  beforeEach(() => {
    bucket = new MemoryR2Bucket();
    env = {
      SCREENSHOTS: bucket as unknown as R2Bucket,
      GLASSVIEW_UPLOAD_TOKEN: "test-token",
    };
  });

  it("rejects uploads without the bearer token", async () => {
    const response = await handleRequest(
      new Request("https://glassview.test/api/screenshots", {
        method: "POST",
        body: PNG_BYTES,
        headers: { "content-type": "image/png" },
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("stores a raw image upload and returns view links", async () => {
    const response = await upload();
    expect(response.status).toBe(201);

    const body = (await response.json()) as UploadResponse;
    expect(body.id).toMatch(/^[a-f0-9]{32}$/);
    expect(body.viewUrl).toBe(`https://glassview.test/v/${body.id}`);
    expect(body.rawUrl).toBe(`https://glassview.test/raw/${body.id}`);
    expect(bucket.objects.has(`meta/${body.id}.json`)).toBe(true);

    const metaObject = await bucket.get(`meta/${body.id}.json`);
    const meta = await metaObject?.json<{ expiresAt?: string }>();
    expect(meta?.expiresAt).toBeDefined();
  });

  it("stores encrypted uploads as ciphertext with cipher metadata", async () => {
    const ciphertext = Uint8Array.from([0x01, 0x02, 0x03, 0x04, 0x05]);
    const response = await handleRequest(
      new Request(
        "https://glassview.test/api/screenshots?mode=encrypted&contentType=image/png&cipherAlg=AES-GCM&iv=test-iv",
        {
          method: "POST",
          body: ciphertext,
          headers: {
            authorization: "Bearer test-token",
            "content-type": "application/octet-stream",
          },
        },
      ),
      env,
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as UploadResponse;
    expect(body.blobUrl).toBe(`https://glassview.test/blob/${body.id}`);
    expect(body.rawUrl).toBeUndefined();

    const metaObject = await bucket.get(`meta/${body.id}.json`);
    const meta = await metaObject?.json<{
      mode: string;
      imageKey: string;
      blobUrl: string;
      contentType: string;
      cipher: { alg: string; iv: string };
    }>();

    expect(meta).toMatchObject({
      mode: "encrypted",
      blobUrl: `https://glassview.test/blob/${body.id}`,
      contentType: "image/png",
      cipher: { alg: "AES-GCM", iv: "test-iv" },
    });
    expect(meta?.imageKey).toMatch(/\.bin$/);

    const stored = await bucket.get(meta!.imageKey);
    expect(stored?.httpMetadata?.contentType).toBe("application/octet-stream");
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(ciphertext);
    expect(new Uint8Array(await stored!.arrayBuffer())).not.toEqual(PNG_BYTES);

    const blob = await handleRequest(new Request(body.blobUrl!), env);
    expect(blob.status).toBe(200);
    expect(blob.headers.get("content-type")).toBe("application/octet-stream");
    expect(blob.headers.get("cache-control")).toBe("no-store");
    expect(blob.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(blob.headers.get("referrer-policy")).toBe("no-referrer");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(ciphertext);

    const raw = await handleRequest(new Request(`https://glassview.test/raw/${body.id}`), env);
    expect(raw.status).toBe(404);
  });

  it("requires cipher metadata for encrypted uploads", async () => {
    const response = await handleRequest(
      new Request("https://glassview.test/api/screenshots?mode=encrypted&contentType=image/png", {
        method: "POST",
        body: PNG_BYTES,
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/octet-stream",
        },
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_cipher_metadata" });
  });

  it("omits plaintext convenience metadata for encrypted uploads", async () => {
    const uploaded = await uploadEncrypted(
      "&label=Secret%20dashboard&sourceUrl=https%3A%2F%2Flocalhost%3A5173%2Fadmin&appName=Browser&viewport=1440x900&note=token%3Dsecret",
    );
    const metaObject = await bucket.get(`meta/${uploaded.id}.json`);
    const meta = await metaObject?.json<{
      label?: string;
      sourceUrl?: string;
      appName?: string;
      viewport?: string;
      note?: string;
    }>();

    expect(meta?.label).toBeUndefined();
    expect(meta?.sourceUrl).toBeUndefined();
    expect(meta?.appName).toBeUndefined();
    expect(meta?.viewport).toBeUndefined();
    expect(meta?.note).toBeUndefined();

    const viewer = await handleRequest(new Request(uploaded.viewUrl), env);
    const html = await viewer.text();
    expect(html).toContain("<title>Glassview proof</title>");
    expect(html).toContain("<h1>Glassview proof</h1>");
    expect(html).not.toContain("Secret dashboard");
    expect(html).not.toContain("localhost");
    expect(html).not.toContain("token=secret");
  });

  it("stores custom ttl metadata for uploads", async () => {
    const uploaded = (await (await upload("ttl=24h")).json()) as UploadResponse;
    const metaObject = await bucket.get(`meta/${uploaded.id}.json`);
    const meta = await metaObject?.json<{ createdAt: string; expiresAt: string }>();

    expect(meta).toBeDefined();
    expect(new Date(meta!.expiresAt).getTime() - new Date(meta!.createdAt).getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("renders the viewer page for an uploaded screenshot", async () => {
    const uploaded = (await (await upload()).json()) as UploadResponse;
    const response = await handleRequest(new Request(uploaded.viewUrl), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Glassview");
    expect(html).toContain(uploaded.rawUrl);
    expect(html).toContain("Example screenshot");
  });

  it("renders the private viewer with browser-side decrypt logic", async () => {
    const uploaded = await uploadEncrypted();
    const response = await handleRequest(new Request(uploaded.viewUrl), env);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("data-private-viewer");
    expect(html).toContain(`data-blob-url="${uploaded.blobUrl}"`);
    expect(html).toContain("window.location.hash");
    expect(html).toContain("crypto.subtle.decrypt");
    expect(html).toContain("Missing decrypt key.");
    expect(html).toContain("Could not decrypt screenshot.");
    expect(html).toContain("data-download hidden");
    expect(html).not.toContain(`<img src="${uploaded.blobUrl}"`);
  });

  it("sets anti-indexing and leak-reduction headers on private viewer responses", async () => {
    const uploaded = await uploadEncrypted();
    const response = await handleRequest(new Request(uploaded.viewUrl), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(await response.text()).toContain(
      '<meta name="robots" content="noindex,nofollow,noarchive" />',
    );
  });

  it("returns the raw image with the uploaded content type", async () => {
    const uploaded = (await (await upload()).json()) as UploadResponse;
    expect(uploaded.rawUrl).toBeDefined();
    const response = await handleRequest(new Request(uploaded.rawUrl!), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("returns 404 for missing viewer and blob routes", async () => {
    const view = await handleRequest(new Request("https://glassview.test/v/missing"), env);
    const blob = await handleRequest(new Request("https://glassview.test/blob/missing"), env);

    expect(view.status).toBe(404);
    expect(blob.status).toBe(404);
  });

  it("returns 410 for expired viewer and blob routes", async () => {
    const uploaded = await uploadEncrypted();
    await updateMetadata(uploaded.id, {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const view = await handleRequest(new Request(uploaded.viewUrl), env);
    const blob = await handleRequest(new Request(uploaded.blobUrl!), env);

    expect(view.status).toBe(410);
    expect(await view.text()).toBe("Screenshot expired");
    expect(blob.status).toBe(410);
  });

  it("revokes screenshots and returns 410 for revoked links", async () => {
    const uploaded = await uploadEncrypted();
    const revoke = await handleRequest(
      new Request(`https://glassview.test/api/screenshots/${uploaded.id}/revoke`, {
        method: "POST",
        headers: { authorization: "Bearer test-token" },
      }),
      env,
    );

    expect(revoke.status).toBe(200);
    const body = (await revoke.json()) as { revokedAt: string };
    expect(body.revokedAt).toBeDefined();

    const metaObject = await bucket.get(`meta/${uploaded.id}.json`);
    const meta = await metaObject?.json<{ revokedAt?: string }>();
    expect(meta?.revokedAt).toBe(body.revokedAt);

    const view = await handleRequest(new Request(uploaded.viewUrl), env);
    const blob = await handleRequest(new Request(uploaded.blobUrl!), env);

    expect(view.status).toBe(410);
    expect(await view.text()).toBe("Screenshot revoked");
    expect(blob.status).toBe(410);
  });

  it("supports HEAD checks for viewer and raw routes", async () => {
    const uploaded = (await (await upload()).json()) as UploadResponse;

    const view = await handleRequest(new Request(uploaded.viewUrl, { method: "HEAD" }), env);
    expect(uploaded.rawUrl).toBeDefined();
    const raw = await handleRequest(new Request(uploaded.rawUrl!, { method: "HEAD" }), env);

    expect(view.status).toBe(200);
    expect(view.headers.get("content-type")).toContain("text/html");
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toBe("image/png");
  });

  it("does not expose latest publicly by default", async () => {
    const uploaded = (await (await upload()).json()) as UploadResponse;
    const response = await handleRequest(new Request("https://glassview.test/latest"), env);

    expect(response.status).toBe(401);

    const authorized = await handleRequest(
      new Request("https://glassview.test/latest", {
        headers: { authorization: "Bearer test-token" },
      }),
      env,
    );

    expect(authorized.status).toBe(302);
    expect(authorized.headers.get("location")).toBe(uploaded.viewUrl);
  });

  it("allows public latest only when explicitly enabled", async () => {
    env.GLASSVIEW_ENABLE_LATEST = "true";
    const uploaded = (await (await upload()).json()) as UploadResponse;
    const response = await handleRequest(new Request("https://glassview.test/latest"), env);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(uploaded.viewUrl);
  });

  it("hides latest from the home page unless latest is explicitly enabled", async () => {
    const uploaded = (await (await upload()).json()) as UploadResponse;
    const hidden = await handleRequest(new Request("https://glassview.test/"), env);

    expect(await hidden.text()).not.toContain(uploaded.viewUrl);

    env.GLASSVIEW_ENABLE_LATEST = "true";
    const visible = await handleRequest(new Request("https://glassview.test/"), env);

    expect(await visible.text()).toContain(uploaded.viewUrl);
  });

  it("returns 415 for non-image uploads", async () => {
    const response = await handleRequest(
      new Request("https://glassview.test/api/screenshots", {
        method: "POST",
        body: "hello",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "text/plain",
        },
      }),
      env,
    );

    expect(response.status).toBe(415);
  });

  it("returns 400 for invalid ttl uploads", async () => {
    const response = await upload("ttl=forever");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_ttl" });
  });

  it("does not log a favicon 404 in browsers", async () => {
    const response = await handleRequest(new Request("https://glassview.test/favicon.ico"), env);

    expect(response.status).toBe(204);
  });

  it("reports health without requiring an upload token", async () => {
    const response = await handleRequest(new Request("https://glassview.test/health"), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, stage: "unknown" });
  });

  async function upload(query = "label=Example%20screenshot&mode=public"): Promise<Response> {
    const uploadQuery = query.includes("mode=") ? query : `${query}&mode=public`;
    return handleRequest(
      new Request(`https://glassview.test/api/screenshots?${uploadQuery}`, {
        method: "POST",
        body: PNG_BYTES,
        headers: {
          authorization: "Bearer test-token",
          "content-type": "image/png",
        },
      }),
      env,
    );
  }

  async function uploadEncrypted(querySuffix = ""): Promise<UploadResponse> {
    const response = await handleRequest(
      new Request(
        `https://glassview.test/api/screenshots?mode=encrypted&contentType=image/png&cipherAlg=AES-GCM&iv=test-iv${querySuffix}`,
        {
          method: "POST",
          body: Uint8Array.from([0x01, 0x02, 0x03, 0x04, 0x05]),
          headers: {
            authorization: "Bearer test-token",
            "content-type": "application/octet-stream",
          },
        },
      ),
      env,
    );

    expect(response.status).toBe(201);
    return (await response.json()) as UploadResponse;
  }

  async function updateMetadata(id: string, patch: Record<string, unknown>): Promise<void> {
    const metaObject = await bucket.get(`meta/${id}.json`);
    const meta = await metaObject?.json<Record<string, unknown>>();
    expect(meta).toBeDefined();
    await bucket.put(`meta/${id}.json`, JSON.stringify({ ...meta, ...patch }, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
  }
});
