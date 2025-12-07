import type {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";
import { ErrorCode } from "./ErrorCode";

/**
 * Utility functions for formatting MCP responses
 *
 * This is a global utility module that should not import domain-specific classes.
 * It provides generic response formatting for any MCP tool.
 */

export interface McpErrorResponse {
  code?: string | number;
  error: string;
  operation?: string;
  reason?: string; // Optional detailed reason for the error
  meta?: Record<string, any>; // Optional metadata about the error
}

interface SuccessData extends Record<string, any> {
  message?: string;
  instructions?: string | any[];
}

/**
 * Generic error data interface for MCP error responses
 */
interface ErrorData extends Record<string, any> {
  success?: boolean; // for supporting graceful error, possibly set to true
  code?: string | number;
  message: string;
  operation?: string;
}

/**
 * Format a successful response for MCP tools
 */
const ContentType = [
  "text",
  "image",
  "audio",
  "resource_link",
  "resource",
] as const;

export function mergeResponsesContent(content: any): ContentBlock[] {
  const contentData = content ? structuredClone(content) : null;
  const contentBlock = new Array<ContentBlock>();
  if (Array.isArray(contentData)) {
    contentBlock.push(
      ...contentData.map((item: any) => {
        if (typeof item === "string") {
          return { type: "text", text: item };
        } else if (item.type && ContentType.includes(item.type)) {
          return item;
        } else {
          return { type: "text", text: JSON.stringify(item) };
        }
      })
    );
  } else if (null != contentData) {
    contentBlock.push({
      type: "text",
      text:
        typeof contentData === "string"
          ? contentData
          : JSON.stringify(contentData),
    });
  }
  return contentBlock;
}

export function formatSuccessResponse(
  successData: SuccessData,
  content?: any
): CallToolResult {
  const data = structuredClone(successData);
  const result: CallToolResult = {
    isError: false,
    content: [
      {
        type: "text",
        text: JSON.stringify(data),
      },
    ],
  };
  const contetnBlock = mergeResponsesContent(content);
  if (contetnBlock.length > 0) {
    result.content.push(...contetnBlock);
  }
  return result;
}

/**
 * Format an error response for MCP tools using generic error data
 */
export function formatErrorResponse(
  errorData: ErrorData | Error | string | unknown,
  operation?: string,
  meta?: Record<string, any>
): CallToolResult {
  let errorResponse: McpErrorResponse;
  let isError = true;

  if (typeof errorData === "string") {
    // Handle string error messages
    errorResponse = {
      error: errorData,
      operation,
      meta,
    };
  } else if (errorData instanceof ErrorCode) {
    errorResponse = {
      error: errorData.message,
      operation: operation,
      meta,
      code: errorData.code,
      reason: errorData.cause?.message,
    };
  } else if (errorData instanceof Error) {
    // Handle standard Error instances
    errorResponse = {
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
    isError = !errObj.success; // for supporting graceful error, possibly set to true
    errorResponse = {
      error: errObj.message,
      code: errObj.code,
      operation: errObj.operation || operation,
      meta,
    };
  } else {
    // Handle unknown error types
    errorResponse = {
      error: "Unknown error",
      operation,
      meta,
    };
  }

  return {
    isError,
    content: [
      {
        type: "text",
        text: JSON.stringify(errorResponse),
      },
    ],
  };
}
