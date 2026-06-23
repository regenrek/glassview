import { describe, expect, it } from "vitest";
import {
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  parseDuration,
  parseShareMode,
  resolveRuntimeConfig,
  ttlToExpiresAt,
} from "../src/config";

describe("runtime config", () => {
  it("defaults to private encrypted links with a seven day ttl", () => {
    expect(resolveRuntimeConfig({})).toEqual({
      shareMode: "private",
      defaultTtlSeconds: DEFAULT_TTL_SECONDS,
      maxTtlSeconds: MAX_TTL_SECONDS,
      latestEnabled: false,
      encryptUploads: true,
    });
  });

  it("parses supported ttl units", () => {
    expect(parseDuration("30m")).toBe(30 * 60);
    expect(parseDuration("1h")).toBe(60 * 60);
    expect(parseDuration("24h")).toBe(24 * 60 * 60);
    expect(parseDuration("7d")).toBe(7 * 24 * 60 * 60);
  });

  it("rejects malformed ttl values", () => {
    expect(() => parseDuration("forever")).toThrow(/must be like/);
    expect(() => parseDuration("0h")).toThrow(/positive/);
    expect(() => parseDuration("31d", { maxSeconds: MAX_TTL_SECONDS })).toThrow(/exceeds/);
  });

  it("parses explicit share modes", () => {
    expect(parseShareMode(undefined)).toBe("private");
    expect(parseShareMode("public")).toBe("public");
    expect(parseShareMode("team")).toBe("team");
    expect(() => parseShareMode("open")).toThrow(/Invalid/);
  });

  it("derives expiry timestamps from ttl seconds", () => {
    expect(ttlToExpiresAt("2026-06-23T00:00:00.000Z", 60)).toBe(
      "2026-06-23T00:01:00.000Z",
    );
  });
});
