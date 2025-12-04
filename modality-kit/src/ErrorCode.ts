/**
 * Base class for task-related errors
 */
export abstract class ErrorCode extends Error {
  abstract readonly code: string | number;
  public cause?: Error;
  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = this.constructor.name;
    if (originalError) {
      this.cause = originalError as Error;
    }
  }
}

