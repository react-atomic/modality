/**
 * Storage Logger for structured logging
 * Provides consistent logging across storage operations with configurable levels
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "success";

export interface LoggerOptions {
  timestampFormat?: "iso" | "locale" | false;
  name?: string;
}

export class ModalityLogger {
  private static instance: ModalityLogger;
  private options: LoggerOptions = {};
  private logLevel: LogLevel = "info";

  constructor(logOption: string | LoggerOptions, logLevel: LogLevel = "info") {
    if (typeof logOption === "string") {
      this.options.name = logOption;
    } else {
      this.options = { ...this.options, ...logOption };
    }
    this.logLevel = logLevel;
  }

  public static getInstance(
    logOption: string | LoggerOptions,
    logLevel?: LogLevel
  ) {
    if (!ModalityLogger.instance) {
      ModalityLogger.instance = new ModalityLogger(logOption, logLevel);
    }
    return ModalityLogger.instance;
  }

  private getTimestamp(): string | undefined {
    if (this.options.timestampFormat === false) return undefined;
    const now = new Date();
    if (this.options.timestampFormat === "locale") return now.toLocaleString();
    return now.toISOString();
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error", "success"];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  private format(level: LogLevel, payload: any, categroy?: string): any {
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
      default:
        prefix = "";
    }
    if (timestamp) {
      prefix += ` [${timestamp}]`;
    }
    if (this.options.name) {
      prefix += ` [${this.options.name}]`;
    }
    if (categroy) {
      prefix += ` [${categroy}]`;
    }

    console.log(prefix);
    return payload;
  }

  log(level: LogLevel, payload: any, categroy?: string) {
    if (!this.shouldLog(level)) return;
    const formatted = this.format(level, payload, categroy);
    switch (level) {
      case "debug":
        console.debug(formatted);
        break;
      case "info":
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        break;
      case "success":
        console.log(formatted);
        break;
      default:
        console.log(formatted);
        break;
    }
  }

  debug(message: string, error?: Error) {
    this.log("debug", { message, error });
  }

  info(message: string, data?: any) {
    this.log("info", { message, data });
  }

  warn(message: string, resolution: string) {
    this.log("warn", { message, resolution });
  }

  error(message: string, error?: Error | unknown, additionalData?: any) {
    const data: any = { message, additionalData };
    if (error instanceof Error) {
      data.error = {
        message: error?.message,
        stack: error?.stack,
      };
    }
    this.log("error", data);
  }

  success(message: string, data?: any) {
    this.log("success", { message, data });
  }
}

export const loggerInstance = ModalityLogger.getInstance.bind(ModalityLogger);
