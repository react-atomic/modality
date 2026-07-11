/**
 * BaseLogger — shared structured-logging engine.
 *
 * Handles level filtering, payload cooking, and optional level-name mapping.
 * Subclasses implement `output` to decide where log entries go
 * (console, VS Code OutputChannel, file, ...).
 */

const levels = [null, "debug", "info", "warn", "error", "success"] as const;
export type LogLevel = (typeof levels)[number];

export type LevelMap = Partial<Record<NonNullable<LogLevel>, string>>;

export interface LoggerOptions {
  timestampFormat?: "iso" | "locale" | false;
  name?: string;
  /**
   * Translate core level names before they reach `output`,
   * e.g. { info: "INFO", success: "INFO" }.
   */
  levelMap?: LevelMap;
}

export abstract class BaseLogger {
  protected options: LoggerOptions = {};
  private logLevel: LogLevel;

  protected constructor(
    logOption: string | LoggerOptions,
    logLevel?: LogLevel
  ) {
    if (typeof logOption === "string") {
      this.options.name = logOption;
    } else {
      this.options = { ...this.options, ...logOption };
    }
    this.logLevel = logLevel || null;
  }

  /**
   * Write a log entry to its destination. `level` is the core level name,
   * or its translation when `options.levelMap` is set. `originalLevel` is
   * always the untranslated LogLevel, preserved so subclasses can format
   * with the correct emoji and route to the corresponding console method.
   */
  protected abstract output(
    level: string,
    payload: any,
    category?: string,
    originalLevel?: LogLevel,
  ): void;

  private getTimestamp(): string | undefined {
    if (this.options.timestampFormat === false) return undefined;
    const now = new Date();
    if (this.options.timestampFormat === "locale") return now.toLocaleString();
    return now.toISOString();
  }

  private initLogLevel(): void {
    let processEnvLogLevel: LogLevel = null;
    if ("undefined" !== typeof process) {
      processEnvLogLevel = process.env.MODALITY_LOG_LEVEL as LogLevel;
    }
    this.logLevel =
      -1 !== levels.indexOf(processEnvLogLevel) ? processEnvLogLevel : "info";
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.logLevel) {
      this.initLogLevel();
    }
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  protected format(level: LogLevel, category?: string): string {
    const timestamp = this.getTimestamp();
    let prefix = "";
    switch (level) {
      case "debug":
        prefix = "🔍";
        break;
      case "info":
        prefix = "ℹ️";
        break;
      case "warn":
        prefix = "⚠️";
        break;
      case "error":
        prefix = "❌";
        break;
      case "success":
        prefix = "✅";
        break;
    }
    if (timestamp) {
      prefix += ` [${timestamp}]`;
    }
    if (this.options.name) {
      prefix += ` [${this.options.name}]`;
    }
    if (category) {
      prefix += ` [${category}]`;
    }
    return prefix;
  }

  /**
   * Dispatch a log entry. Filters by level, applies levelMap translation,
   * then delegates to `output` for delivery.
   */
  log(level: LogLevel, payload: any, category?: string) {
    if (!this.shouldLog(level)) return;
    const mapped = (level && this.options.levelMap?.[level]) ?? level;
    this.output(mapped as string, payload, category, level);
  }

  cook(payload: any, data?: any) {
    if (payload == null) return payload;
    const newPayload: any =
      typeof payload === "string" ? { message: payload } : { ...payload };
    if (data) {
      newPayload.data = data;
    }
    return newPayload;
  }

  debug(message: string, data?: any) {
    this.log("debug", this.cook(message, data));
  }

  info(message: string, data?: any) {
    this.log("info", this.cook(message, data));
  }

  warn(message: string, data?: any) {
    this.log("warn", this.cook(message, data));
  }

  error(message: string, error?: Error | unknown, additionalData?: any) {
    const payload: any = { error };
    this.log("error", this.cook(payload, additionalData), message);
  }

  success(message: string, data?: any) {
    this.log("success", this.cook(message, data));
  }
}
