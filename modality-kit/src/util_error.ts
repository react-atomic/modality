import { getLoggerInstance } from "./util_logger";
import { formatErrorResponse } from "./util_response";

const logger = getLoggerInstance("Safe to Handle");

/**
 * Base class for task-related errors
 */
export abstract class ErrorCode extends Error {
  abstract readonly code: string;
  public cause?: Error;
  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = this.constructor.name;
    if (originalError) {
      this.cause = originalError as Error;
    }
  }
}

/**
 * Wrapper for any functions that adds consistent error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  operation?: string
): T {
  return (async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      // Log the error for debugging
      if (error instanceof ErrorCode) {
        logger.error(
          `${operation || "Unknown operation"} failed: ${error.code}`,
          {
            code: error.code,
            cause: error.cause,
            stack: error.stack,
          }
        );
      } else if (error instanceof Error) {
        logger.error(`${operation || "Error"} failed`, error);
      } else {
        logger.error(`${operation || "Exception"} unexpected error:`, error);
      }

      // Return formatted error response
      return formatErrorResponse(error as Error, operation);
    }
  }) as T;
}
