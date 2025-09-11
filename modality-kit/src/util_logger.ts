/**
 * Storage Logger for structured logging
 * Provides consistent logging across storage operations with configurable levels
 */

const levels = [null, "debug", "info", "warn", "error", "success"] as const;
export type LogLevel = (typeof levels)[number];

export interface LoggerOptions {
  timestampFormat?: "iso" | "locale" | false;
  name?: string;
}

export class ModalityLogger {
  private options: LoggerOptions = {};
  private logLevel: LogLevel;

  private constructor(logOption: string | LoggerOptions, logLevel?: LogLevel) {
    if (typeof logOption === "string") {
      this.options.name = logOption;
    } else {
      this.options = { ...this.options, ...logOption };
    }
    this.logLevel = logLevel || null;
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

  private initLogLevel(): void {
    const processEnvLogLevel = process.env.MODALITY_LOG_LEVEL as LogLevel;
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

  private format(level: LogLevel, categroy?: string): any {
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
    return prefix;
  }

  /**
   * For control display logging level, the level could not set by user.
   */
  log(level: LogLevel, payload: any, categroy?: string) {
    if (!this.shouldLog(level)) return;
    const prefix = this.format(level, categroy);
    console.group(prefix);
    switch (level) {
      case "debug":
        console.debug(payload);
        break;
      case "info": {
        const { message, ...restPayload } = payload;
        console.info(message);
        console.dir(restPayload, {
          depth: null,
          colors: true,
          maxArrayLength: null,
        });
        break;
      }
      case "warn": {
        const { message, ...restPayload } = payload;
        console.warn(payload);
        console.dir(restPayload, {
          depth: null,
          colors: true,
          maxArrayLength: null,
        });
        break;
      }
      case "error": {
        const error = payload.error;
        if (error instanceof Error || error.stack) {
          delete payload.error;
          const { message, stack, ...restError } = error;
          if (stack) {
            if (Object.keys(restError).length) {
              console.error(restError);
              console.log(stack);
            } else {
              console.error(stack);
            }
          } else {
            if (message) {
              payload.error = message;
            }
            console.error(payload);
          }
        } else {
          console.error(payload);
        }
        break;
      }
      case "success":
        console.log(payload);
        break;
    }
    console.groupEnd();
  }

  cook(payload: any, data?: any) {
    const newPayload: any =
      typeof payload === "string" ? { message: payload } : payload;
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

export const getLoggerInstance =
  ModalityLogger.getInstance.bind(ModalityLogger);
