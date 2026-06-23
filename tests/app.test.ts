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

  it("returns the raw image with the uploaded content type", async () => {
    const uploaded = (await (await upload()).json()) as UploadResponse;
    const response = await handleRequest(new Request(uploaded.rawUrl), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("supports HEAD checks for viewer and raw routes", async () => {
    const uploaded = (await (await upload()).json()) as UploadResponse;

    const view = await handleRequest(new Request(uploaded.viewUrl, { method: "HEAD" }), env);
    const raw = await handleRequest(new Request(uploaded.rawUrl, { method: "HEAD" }), env);

    expect(view.status).toBe(200);
    expect(view.headers.get("content-type")).toContain("text/html");
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toBe("image/png");
  });

  it("redirects latest to the newest screenshot", async () => {
    const uploaded = (await (await upload()).json()) as UploadResponse;
    const response = await handleRequest(new Request("https://glassview.test/latest"), env);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(uploaded.viewUrl);
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

  async function upload(query = "label=Example%20screenshot"): Promise<Response> {
    return handleRequest(
      new Request(`https://glassview.test/api/screenshots?${query}`, {
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
});
