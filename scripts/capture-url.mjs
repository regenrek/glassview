#!/usr/bin/env node
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { parseShareOptions, shareOptionsToArgs } from "./lib/share-options.mjs";

let parsed;
try {
  parsed = parseShareOptions(process.argv.slice(2), { targetName: "url" });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Usage: node scripts/capture-url.mjs <url> [label] [--ttl 24h] [--public]");
  process.exit(2);
}

const targetUrl = parsed.target;
const label = parsed.label || targetUrl;

const dir = await mkdtemp(join(tmpdir(), "glassview-"));
await mkdir(dir, { recursive: true });
const screenshotPath = join(dir, "screenshot.png");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: screenshotPath, fullPage: true });
} finally {
  await browser.close();
}

const result = spawnSync(
  process.execPath,
  [
    new URL("./upload-file.mjs", import.meta.url).pathname,
    screenshotPath,
    ...shareOptionsToArgs({ ...parsed, label }),
  ],
  { stdio: "inherit", env: process.env },
);

process.exit(result.status ?? 1);
