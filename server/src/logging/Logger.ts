type Level = "debug" | "info" | "warn" | "error";

/** Structured logger. Swap transport (pino/winston) without touching call sites. */
export class Logger {
  private log(level: Level, message: string, meta?: Record<string, unknown>) {
    const entry = { level, message, meta, timestamp: new Date().toISOString() };
    // eslint-disable-next-line no-console
    console[level === "debug" ? "log" : level](JSON.stringify(entry));
  }
  debug(m: string, meta?: Record<string, unknown>) { this.log("debug", m, meta); }
  info(m: string, meta?: Record<string, unknown>) { this.log("info", m, meta); }
  warn(m: string, meta?: Record<string, unknown>) { this.log("warn", m, meta); }
  error(m: string, meta?: Record<string, unknown>) { this.log("error", m, meta); }
}

export const logger = new Logger();
