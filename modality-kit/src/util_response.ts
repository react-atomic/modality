/**
 * Utility functions for formatting MCP responses
 *
 * This is a global utility module that should not import domain-specific classes.
 * It provides generic response formatting for any MCP tool.
 */

// Standard response format for MCP tools
export interface McpSuccessResponse {
  success: true; // Indicates a successful operation
  content: any;
  meta?: any; // Optional metadata about the response
}

export interface McpErrorResponse {
  success: boolean; // for supporting graceful error, possibly set to true
  error: string;
  code?: string;
  operation?: string;
  meta?: Record<string, any>; // Optional metadata about the error
}

interface SuccessData {
  message?: string;
  instructions?: string;
  [key: string]: any; // Allow additional properties
}

/**
 * Generic error data interface for MCP error responses
 */
interface ErrorData {
  success?: boolean; // for supporting graceful error, possibly set to true
  message: string;
  code?: string;
  operation?: string;
  [key: string]: any; // Allow additional properties
}

/**
 * Format a successful response for MCP tools
 */
export function formatSuccessResponse(
  content: SuccessData,
  meta?: any
): string {
  const { instructions, ...restContent } = content; // Destructure to ensure content is an object
  return JSON.stringify({
    success: true,
    instructions,
    content: restContent,
    meta,
  } as McpSuccessResponse);
}

/**
 * Format an error response for MCP tools using generic error data
 */
export function formatErrorResponse(
  errorData: ErrorData | Error | string | unknown,
  operation?: string,
  meta?: Record<string, any>
): string {
  let errorResponse: McpErrorResponse;

  if (typeof errorData === "string") {
    // Handle string error messages
    errorResponse = {
      success: false,
      error: errorData,
      operation,
      meta,
    };
  } else if (errorData instanceof Error) {
    // Handle standard Error instances
    errorResponse = {
      success: false,
      error: errorData.message,
      operation,
      meta,
    };
  } else if (
    typeof errorData === "object" &&
    errorData !== null &&
    typeof (errorData as ErrorData).message === "string"
  ) {
    // Handle ErrorData objects
    const errObj = errorData as ErrorData;
    errorResponse = {
      success: errObj.success || false, // for supporting graceful error, possibly set to true
      error: errObj.message,
      code: errObj.code,
      operation: errObj.operation || operation,
      meta,
    };
  } else {
    // Handle unknown error types
    errorResponse = {
      success: false,
      error: "Unknown error",
      operation,
      meta,
    };
  }

  return JSON.stringify(errorResponse);
}
