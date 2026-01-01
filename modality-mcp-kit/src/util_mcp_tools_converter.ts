import type {
  AITools,
  FastMCPTool,
  ToolParameters,
} from "./schemas/schemas_tool_config";

/**
 * Minimal prompt interface for cross-library compatibility
 * Compatible with both FastMCP's InputPrompt and modality's InputPrompt
 */
export interface BasePrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
    enum?: string[];
    complete?: (...args: any[]) => Promise<any>;
  }>;
  complete?: (...args: any[]) => Promise<any>;
  load: (...args: any[]) => Promise<any>;
  completionLimit?: number;
}

/**
 * FastMCP-compatible interface for MCP server functionality
 * Provides exact API compatibility with FastMCP.addTool method
 */
export interface FastMCPCompatible {
  addTool<Params extends ToolParameters>(tool: FastMCPTool<any, Params>): void;
  getTools?(): FastMCPTool<any, any>[];
  addPrompt?(prompt: BasePrompt): void;
  getPrompts?(): BasePrompt[];
}

/**
 * ModalityFastMCP - A FastMCP-compatible implementation
 * Provides addTool and getTools functionality for managing MCP tools
 */
export class ModalityFastMCP implements FastMCPCompatible {
  private tools: Map<string, FastMCPTool<any, any>> = new Map();
  private prompts: BasePrompt[] = [];

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

  addPrompt(prompt: BasePrompt): void {
    this.prompts.push(prompt);
  }

  getPrompts(): BasePrompt[] {
    return this.prompts;
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
