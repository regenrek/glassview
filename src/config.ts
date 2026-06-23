export type ShareMode = "private" | "public" | "team";

export type RuntimeConfig = {
  shareMode: ShareMode;
  defaultTtlSeconds: number;
  maxTtlSeconds: number;
  latestEnabled: boolean;
  encryptUploads: boolean;
};

export const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MAX_TTL_SECONDS = 30 * 24 * 60 * 60;

const SHARE_MODES = new Set<ShareMode>(["private", "public", "team"]);

type ConfigEnv = {
  GLASSVIEW_SHARE_MODE?: string;
  GLASSVIEW_DEFAULT_TTL?: string;
  GLASSVIEW_MAX_TTL?: string;
  GLASSVIEW_ENABLE_LATEST?: string;
  GLASSVIEW_ENCRYPT_UPLOADS?: string;
};

export function resolveRuntimeConfig(env: ConfigEnv): RuntimeConfig {
  const maxTtlSeconds = parseDuration(env.GLASSVIEW_MAX_TTL, {
    fallbackSeconds: MAX_TTL_SECONDS,
    name: "GLASSVIEW_MAX_TTL",
  });
  const defaultTtlSeconds = parseDuration(env.GLASSVIEW_DEFAULT_TTL, {
    fallbackSeconds: DEFAULT_TTL_SECONDS,
    maxSeconds: maxTtlSeconds,
    name: "GLASSVIEW_DEFAULT_TTL",
  });

  return {
    shareMode: parseShareMode(env.GLASSVIEW_SHARE_MODE),
    defaultTtlSeconds,
    maxTtlSeconds,
    latestEnabled: parseBoolean(env.GLASSVIEW_ENABLE_LATEST, false),
    encryptUploads: parseBoolean(env.GLASSVIEW_ENCRYPT_UPLOADS, true),
  };
}

export function parseShareMode(value: string | undefined): ShareMode {
  if (!value) return "private";
  const normalized = value.trim().toLowerCase();
  if (SHARE_MODES.has(normalized as ShareMode)) return normalized as ShareMode;
  throw new Error(`Invalid GLASSVIEW_SHARE_MODE: ${value}`);
}

export function parseDuration(
  value: string | undefined,
  options: { fallbackSeconds?: number; maxSeconds?: number; name?: string } = {},
): number {
  if (!value) {
    if (options.fallbackSeconds === undefined) {
      throw new Error(`${options.name || "duration"} is required`);
    }
    return options.fallbackSeconds;
  }

  const match = value.trim().match(/^(\d+)(m|h|d)$/);
  if (!match) {
    throw new Error(`${options.name || "duration"} must be like 30m, 1h, 24h, or 7d`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`${options.name || "duration"} must be positive`);
  }

  const seconds =
    unit === "m" ? amount * 60 : unit === "h" ? amount * 60 * 60 : amount * 24 * 60 * 60;

  if (options.maxSeconds !== undefined && seconds > options.maxSeconds) {
    throw new Error(`${options.name || "duration"} exceeds max TTL`);
  }

  return seconds;
}

export function ttlToExpiresAt(createdAt: string, ttlSeconds: number): string {
  return new Date(new Date(createdAt).getTime() + ttlSeconds * 1000).toISOString();
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.length === 0) return fallback;
  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      throw new Error(`Invalid boolean value: ${value}`);
  }
}
