import { FastMCP } from "fastmcp";
import type { AITools } from "./schemas/schemas_tool_config.ts";

/**
 * Setup function that optionally registers AITools with MCP server
 * @param aiTools - The AITools object to optionally register
 * @param mcpServer - Optional MCP server to register tools with
 * @returns The AITools object
 */
export const setupAITools = (
  aiTools: AITools,
  mcpServer?: FastMCP
): AITools => {
  // Only register tools with MCP server if provided
  if (mcpServer) {
    Object.entries(aiTools).forEach(([toolName, aiTool]) => {
      let name = null != aiTool.name ? aiTool.name : toolName;
      mcpServer.addTool({
        ...aiTool,
        name,
      });
    });
  }

  return aiTools;
};

