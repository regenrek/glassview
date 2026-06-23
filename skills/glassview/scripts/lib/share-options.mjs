export function parseShareOptions(argv, { targetName = "image-file" } = {}) {
  const positionals = [];
  const options = {
    mode: undefined,
    ttl: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--public") {
      options.mode = "public";
      continue;
    }
    if (arg === "--private") {
      options.mode = "private";
      continue;
    }
    if (arg === "--ttl") {
      const value = argv[index + 1];
      if (!value) throw new Error("--ttl requires a value");
      options.ttl = assertTtl(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--ttl=")) {
      options.ttl = assertTtl(arg.slice("--ttl=".length));
      continue;
    }
    if (arg === "--label") {
      const value = argv[index + 1];
      if (!value) throw new Error("--label requires a value");
      positionals[1] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  const target = positionals[0];
  if (!target) throw new Error(`Missing ${targetName}.`);

  return {
    target,
    label: positionals[1],
    mode: options.mode,
    ttl: options.ttl,
  };
}

export function applyShareOptions(url, options) {
  if (options.label) url.searchParams.set("label", options.label);
  if (options.mode) url.searchParams.set("mode", options.mode);
  if (options.ttl) url.searchParams.set("ttl", options.ttl);
}

export function shareOptionsToArgs(options) {
  const args = [];
  if (options.label) args.push(options.label);
  if (options.mode === "public") args.push("--public");
  if (options.mode === "private") args.push("--private");
  if (options.ttl) args.push("--ttl", options.ttl);
  return args;
}

function assertTtl(value) {
  if (!/^\d+(m|h|d)$/.test(value)) {
    throw new Error("--ttl must be like 30m, 1h, 24h, or 7d");
  }
  return value;
}
