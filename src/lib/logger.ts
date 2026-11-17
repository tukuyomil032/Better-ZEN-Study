// Debug logger shared by every extension context.
//
// Each call writes to the console (prefixed with [BZS:<scope>]) and forwards a
// redacted, length-limited record to a sink. The sink is injected so this file
// stays pure: background stores records in a ring buffer, other contexts send
// them to background with a runtime message.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogSource = "bg" | "top" | "player" | "popup" | "options" | "skin";

export type LogRecord = {
  time: string;
  scope: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  data?: unknown;
  path?: string;
};

export type LogSink = (record: LogRecord) => void;

export const LOG_MESSAGE_LIMIT = 500;
export const LOG_DATA_LIMIT = 1000;
// Enough for a long study session with the player logging each play, pause, and move: the
// diagnostics report needs the whole sequence, not just the last few minutes.
export const LOG_RING_BUFFER_SIZE = 4000;

const REDACTED_KEY_PATTERN = /cookie|token|authorization|password|secret|api[-_]?key/i;

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function redactKey(key: string): boolean {
  return REDACTED_KEY_PATTERN.test(key);
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…(truncated)` : text;
}

// Returns a JSON-safe copy of `value`: keys that look like credentials are
// replaced, strings are length-limited, and the serialized size is capped.
// Circular references and non-serializable values are reduced to placeholders.
export function sanitizeData(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) return value;
  if (depth > 4) return "[depth limit]";
  if (typeof value === "string") return truncate(value, 200);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeData(item, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      output[key] = redactKey(key) ? "[redacted]" : sanitizeData(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

// Serialized size check. Oversized data is replaced by a short marker so a single
// log line can never blow up the ring buffer.
export function limitData(value: unknown): unknown {
  const sanitized = sanitizeData(value);
  if (sanitized === undefined) return undefined;
  let serialized: string;
  try {
    serialized = JSON.stringify(sanitized) ?? "";
  } catch {
    return "[unserializable]";
  }
  if (serialized.length <= LOG_DATA_LIMIT) return sanitized;
  return `[truncated ${serialized.length} chars]`;
}

export function createRecord(args: {
  scope: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  data?: unknown;
  path?: string;
  now?: () => Date;
}): LogRecord {
  const now = args.now ?? (() => new Date());
  return {
    time: now().toISOString(),
    scope: args.scope,
    level: args.level,
    source: args.source,
    message: truncate(args.message, LOG_MESSAGE_LIMIT),
    data: limitData(args.data),
    path: args.path,
  };
}

export type Logger = {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
};

export type LoggerOptions = {
  scope: string;
  source: LogSource;
  sink: LogSink;
  // Records below this level are dropped everywhere (console and sink).
  minLevel?: LogLevel;
  // Set false to suppress console output but keep recording.
  console?: boolean;
  path?: () => string;
  now?: () => Date;
};

export function createLogger(options: LoggerOptions): Logger {
  const minRank = LEVEL_RANK[options.minLevel ?? "debug"];
  const emit = (level: LogLevel, message: string, data?: unknown) => {
    if (LEVEL_RANK[level] < minRank) return;
    const record = createRecord({
      scope: options.scope,
      level,
      source: options.source,
      message,
      data,
      path: options.path?.(),
      now: options.now,
    });
    if (options.console !== false) {
      const prefix = `[BZS:${options.scope}]`;
      if (record.data === undefined) console[level === "debug" ? "debug" : level](prefix, message);
      else console[level === "debug" ? "debug" : level](prefix, message, record.data);
    }
    try {
      options.sink(record);
    } catch {
      // Logging must never break the feature that is logging.
    }
  };
  return {
    debug: (message, data) => emit("debug", message, data),
    info: (message, data) => emit("info", message, data),
    warn: (message, data) => emit("warn", message, data),
    error: (message, data) => emit("error", message, data),
  };
}

// Ring buffer with insertion order. Keeps the newest `capacity` records.
export function createRingBuffer(capacity: number = LOG_RING_BUFFER_SIZE) {
  let records: LogRecord[] = [];
  return {
    push(record: LogRecord): void {
      records.push(record);
      if (records.length > capacity) records = records.slice(records.length - capacity);
    },
    list(filter?: { scope?: string; level?: LogLevel; source?: LogSource }): LogRecord[] {
      return records.filter(
        (record) =>
          (!filter?.scope || record.scope === filter.scope) &&
          (!filter?.level || LEVEL_RANK[record.level] >= LEVEL_RANK[filter.level]) &&
          (!filter?.source || record.source === filter.source),
      );
    },
    clear(): void {
      records = [];
    },
    size(): number {
      return records.length;
    },
  };
}
