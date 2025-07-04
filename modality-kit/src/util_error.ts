import { loggerInstance } from "./util_logger";
import { formatErrorResponse } from "./util_response";

const logger = loggerInstance("Error");

/**
 * Base class for task-related errors
 */
export abstract class ErrorCode extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
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
        logger.error(`${operation || "Task operation"} failed: ${error.code}`, {
          message: error.message,
          code: error.code,
        });
      } else if (error instanceof Error) {
        logger.error(`${operation || "Error"} failed`, {
          message: error.message,
        });
      } else {
        logger.error(`${operation || "Exception"} unexpected error:`, error);
      }

      // Return formatted error response
      return formatErrorResponse(error as Error, operation);
    }
  }) as T;
}
