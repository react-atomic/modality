/**
 * Tools/Call Handler
 *
 * Independent MCP JSON-RPC handler for tools/call method
 * Manages tool lookup, execution, result normalization, and error handling
 *
 * Features:
 * - Type-safe tool lookup with proper error handling
 * - Rich result support (multiple content types, structured data, errors)
 * - Exception-to-isError conversion
 * - Backward compatible with string-returning tools
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/spec.types.js";
import type { FastMCPTool } from "../schemas/schemas_tool_config.js";
import {
  normalizeToolResult,
  normalizeToolError,
} from "../utils/normalize-tool-result.js";

/**
 * Parameters for tools/call JSON-RPC method
 */
export interface ToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * Handles the tools/call JSON-RPC method
 *
 * @param params - Tool call parameters (name and arguments)
 * @param mcpTools - List of available tools
 * @returns CallToolResult with content, optional structured data, and error flag
 * @throws ERROR_METHOD_NOT_FOUND if tool not found (converted to isError in caller)
 */
export async function handleToolCall(
  params: ToolCallParams,
  mcpTools: FastMCPTool<any, any>[]
): Promise<CallToolResult> {
  const { ERROR_METHOD_NOT_FOUND } = await import("modality-kit");
  const { name, arguments: args } = params;

  // Find the requested tool
  const tool = mcpTools.find((t) => t.name === name);
  if (!tool) {
    throw new ERROR_METHOD_NOT_FOUND(`Tool not found: ${name}`);
  }

  try {
    // Execute the tool with provided arguments
    const result = await tool.execute(args || {});

    // Normalize result to CallToolResult format
    return normalizeToolResult(result);
  } catch (error) {
    // Convert exceptions to isError response
    // This ensures errors don't break the protocol, following MCP spec guidance
    return normalizeToolError(error);
  }
}
