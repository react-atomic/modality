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
  private options: LoggerOptions = {};
  private logLevel: LogLevel = "info";

  private constructor(
    logOption: string | LoggerOptions,
    logLevel: LogLevel = "info"
  ) {
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
  ): ModalityLogger {
    return new ModalityLogger(logOption, logLevel);
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
    return { prefix, result: payload };
  }

  log(level: LogLevel, payload: any, categroy?: string) {
    if (!this.shouldLog(level)) return;
    const { prefix, result } = this.format(level, payload, categroy);
    switch (level) {
      case "debug":
        console.debug("\n", prefix, result, "\n");
        break;
      case "info":
        console.log("\n", prefix);
        console.dir(result, {
          depth: null,
          colors: true,
          maxArrayLength: null,
        });
        console.log("\n");
        break;
      case "warn":
        console.log("\n", prefix);
        console.warn(result);
        console.log("\n");
        break;
      case "error":
        const error = result.error;
        if (error instanceof Error) {
          delete result.error;
          const { message, stack } = error;
          if (stack) {
            if (Object.keys(result).length) {
              console.error("\n", prefix, result, "\n", stack, "\n");
            } else {
              console.error("\n", prefix, "\n", stack, "\n");
            }
          } else {
            if (message) {
              result.error = message;
            }
            console.error("\n", prefix, result, "\n");
          }
        } else {
          console.error("\n", prefix, result, "\n");
        }
        break;
      case "success":
        console.log("\n", prefix, result, "\n");
        break;
      default:
        console.log("\n", prefix, result, "\n");
        break;
    }
  }

  cook(message: any, data?: any) {
    const payload: any = typeof message === "string" ? { message } : message;
    if (data) {
      payload.data = data;
    }
    return payload;
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

export const getLoggerInstance =
  ModalityLogger.getInstance.bind(ModalityLogger);
