/**
 * Storage Logger for structured logging
 * Provides consistent logging across storage operations with configurable levels
 */
import { BaseLogger } from "./logger_core";
import type { LogLevel, LoggerOptions } from "./logger_core";

export class ModalityLogger extends BaseLogger {
  public static getInstance(
    logOption: string | LoggerOptions,
    logLevel?: LogLevel
  ): ModalityLogger {
    return new ModalityLogger(logOption, logLevel);
  }

  protected output(level: string, payload: any, category?: string, originalLevel?: LogLevel) {
    const prefix = this.format(originalLevel ?? (level as LogLevel), category);
    console.group(prefix);
    switch (originalLevel ?? (level as LogLevel)) {
      case "debug":
        console.debug(payload);
        break;
      case "info": {
        const { message, ...restPayload } = payload;
        console.info(message);
        if (Object.keys(restPayload).length) {
          console.dir(restPayload, {
            depth: null,
            colors: true,
            maxArrayLength: null,
          });
        }
        break;
      }
      case "warn": {
        const { message, ...restPayload } = payload;
        console.warn(message);
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
}

export const getLoggerInstance =
  ModalityLogger.getInstance.bind(ModalityLogger);
