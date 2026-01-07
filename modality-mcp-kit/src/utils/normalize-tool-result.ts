/**
 * Tool Result Normalizer
 *
 * Converts various tool execution result types into valid MCP CallToolResult
 * format. Implements smart detection with strict validation and backward
 * compatibility for string-returning tools.
 *
 * Supported Input Types:
 * - string: Wrapped as TextContent
 * - CallToolResult: Validated and returned as-is
 * - Plain object: Converted to structuredContent with text summary
 * - null/undefined: Returns empty content array
 * - Error: Returns error CallToolResult
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/spec.types.js";
import {
  isString,
  isCallToolResult,
  looksLikeCallToolResult,
  isPlainObject,
  isNullOrUndefined,
  validateCallToolResult,
  createTextContent,
  createSimpleResult,
  type ToolExecuteResult,
} from "../types/mcp-result-types.js";

/**
 * Generates a human-readable JSON summary of an object
 * Limits depth and size for reasonable output
 */
function generateJsonSummary(obj: Record<string, unknown>): string {
  try {
    // Limit JSON string length to 2000 chars
    const json = JSON.stringify(obj, null, 2);
    if (json.length > 2000) {
      return json.substring(0, 2000) + "\n... (truncated)";
    }
    return json;
  } catch {
    // If JSON serialization fails, try string representation
    try {
      const str = String(obj);
      return str.length > 500 ? str.substring(0, 500) + "..." : str;
    } catch {
      return "[Unable to serialize object]";
    }
  }
}

/**
 * Normalizes a tool execution result into a valid CallToolResult
 *
 * @param result - The result from tool.execute()
 * @returns Valid CallToolResult with appropriate content and metadata
 * @throws Error if result validation fails (strict mode)
 */
export function normalizeToolResult(result: ToolExecuteResult): CallToolResult {
  // Handle string results (backward compatibility)
  if (isString(result)) {
    return createSimpleResult(result);
  }

  // Handle null/undefined
  if (isNullOrUndefined(result)) {
    return {
      content: [],
    };
  }

  // Check if it looks like CallToolResult (has content array)
  // If so, validate strictly regardless of other fields
  if (looksLikeCallToolResult(result)) {
    const validation = validateCallToolResult(result);
    if (!validation.valid) {
      const errorMessages = validation.errors
        .map((e) => `${e.field}: ${e.message}`)
        .join("; ");
      throw new Error(`Invalid CallToolResult: ${errorMessages}`);
    }
    return result as CallToolResult;
  }

  // Handle plain objects - convert to structuredContent with summary
  if (isPlainObject(result)) {
    const summary = generateJsonSummary(result);
    return {
      content: [createTextContent(`Result:\n\`\`\`json\n${summary}\n\`\`\``)],
      structuredContent: result,
    };
  }

  // Shouldn't reach here, but handle unexpected types
  return createSimpleResult(`[Unexpected result type: ${typeof result}]`);
}

/**
 * Normalizes a tool execution result with error handling
 *
 * Returns error in CallToolResult format instead of throwing
 * Useful for handlers that want to catch and format errors
 *
 * @param result - The result from tool.execute()
 * @returns Valid CallToolResult (never throws)
 */
export function normalizeToolResultSafe(
  result: ToolExecuteResult
): CallToolResult {
  try {
    return normalizeToolResult(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return createSimpleResult(message, true);
  }
}

/**
 * Normalizes an error into a CallToolResult with isError flag
 *
 * @param error - The error to normalize
 * @returns CallToolResult with isError: true
 */
export function normalizeToolError(error: unknown): CallToolResult {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (typeof error === "object" && error !== null) {
    message = JSON.stringify(error);
  } else {
    message = String(error);
  }

  return createSimpleResult(message, true);
}
