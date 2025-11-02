import type {
  AITools,
  FastMCPTool,
  ToolParameters,
} from "./schemas/schemas_tool_config";

/**
 * FastMCP-compatible interface for MCP server functionality
 * Provides exact API compatibility with FastMCP.addTool method
 */
export interface FastMCPCompatible {
  addTool<Params extends ToolParameters>(tool: FastMCPTool<any, Params>): void;
  getTools?(): FastMCPTool<any, any>[];
}

/**
 * ModalityFastMCP - A FastMCP-compatible implementation
 * Provides addTool and getTools functionality for managing MCP tools
 */
export class ModalityFastMCP implements FastMCPCompatible {
  private tools: Map<string, FastMCPTool<any, any>> = new Map();

  /**
   * Add a tool to the server
   */
  addTool<Params extends ToolParameters>(tool: FastMCPTool<any, Params>): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get all registered tools
   */
  getTools(): FastMCPTool<any, any>[] {
    return Array.from(this.tools.values());
  }
}

/**
 * Setup function that optionally registers AITools with MCP server
 * Automatically infers and preserves schema types from the input
 */
export const setupAITools = <T extends Record<string, ToolParameters>>(
  aiTools: AITools<T>,
  mcpServer?: FastMCPCompatible
): AITools<T> => {
  // Only register tools with MCP server if provided
  if (mcpServer) {
    Object.entries(aiTools).forEach(([toolName, aiTool]) => {
      let name = null != aiTool.name ? aiTool.name : toolName;
      const { inputSchema, ...restAITool } = aiTool; // Destructure to avoid unused variable warning
      mcpServer.addTool({
        ...restAITool,
        parameters: inputSchema,
        name,
      });
    });
  }

  return aiTools;
};
