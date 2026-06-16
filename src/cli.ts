export type ParsedCliArgs = {
  configPath?: string;
  transport?: "stdio" | "http";
  host?: string;
  port?: number;
  sse?: boolean;
  stateless?: boolean;
  debug?: boolean;
};

function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return defaultValue;
}

function nextValue(argv: string[], index: number): { value: string | undefined; nextIndex: number } {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    return { value: undefined, nextIndex: index };
  }
  return { value, nextIndex: index + 1 };
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const parsed: ParsedCliArgs = {};
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "--config") {
      const { value, nextIndex } = nextValue(argv, i);
      if (value) parsed.configPath = value;
      i = nextIndex + 1;
      continue;
    }

    if (arg === "--transport") {
      const { value, nextIndex } = nextValue(argv, i);
      if (value === "stdio" || value === "http") parsed.transport = value;
      i = nextIndex + 1;
      continue;
    }

    if (arg === "--host") {
      const { value, nextIndex } = nextValue(argv, i);
      if (value) parsed.host = value;
      i = nextIndex + 1;
      continue;
    }

    if (arg === "--port") {
      const { value, nextIndex } = nextValue(argv, i);
      if (value && /^-?\d+$/.test(value)) parsed.port = parseInt(value, 10);
      i = nextIndex + 1;
      continue;
    }

    if (arg === "--sse") {
      parsed.sse = true;
      i += 1;
      continue;
    }

    if (arg === "--no-sse") {
      parsed.sse = false;
      i += 1;
      continue;
    }

    if (arg === "--stateless") {
      parsed.stateless = true;
      i += 1;
      continue;
    }

    if (arg === "--no-stateless") {
      parsed.stateless = false;
      i += 1;
      continue;
    }

    if (arg === "--debug") {
      parsed.debug = true;
      i += 1;
      continue;
    }

    if (arg === "--no-debug") {
      parsed.debug = false;
      i += 1;
      continue;
    }

    i += 1;
  }

  return parsed;
}
