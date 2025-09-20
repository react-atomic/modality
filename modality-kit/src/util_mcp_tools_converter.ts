import type { AITools } from "./schemas/schemas_tool_config.ts";
import type { z } from "zod";

/**
 * Copy of StandardSchemaV1 interface for compatibility
 */
export interface ToolParameters<Input = unknown, Output = Input> {
  readonly "~standard": ToolParameters.Props<Input, Output>;
}

export namespace ToolParameters {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown
    ) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }
  export type Result<Output> = SuccessResult<Output> | FailureResult;
  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }
  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }
  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  export interface PathSegment {
    readonly key: PropertyKey;
  }
  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
  export type InferInput<Schema extends ToolParameters> = NonNullable<
    Schema["~standard"]["types"]
  >["input"];
  export type InferOutput<Schema extends ToolParameters> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}

/**
 * Copy of FastMCP's Tool type for compatibility
 */
export type Tool<
  T extends Record<string, unknown> | undefined = any,
  Params extends ToolParameters = ToolParameters,
> = {
  annotations?: {
    streamingHint?: boolean;
  } & {
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    readOnlyHint?: boolean;
    title?: string;
  };
  canAccess?: (auth: T) => boolean;
  description?: string;
  execute: (
    args: ToolParameters.InferOutput<Params>,
    context: any
  ) => Promise<any>;
  name: string;
  parameters?: Params;
  timeoutMs?: number;
};

/**
 * FastMCP-compatible interface for MCP server functionality
 * Provides exact API compatibility with FastMCP.addTool method
 */
export interface FastMCPCompatible {
  addTool<Params extends ToolParameters>(tool: Tool<any, Params>): void;
}

/**
 * ModalityFastMCP - A FastMCP-compatible implementation
 * Provides addTool and getTools functionality for managing MCP tools
 */
export class ModalityFastMCP implements FastMCPCompatible {
  private tools: Map<string, Tool<any, any>> = new Map();

  /**
   * Add a tool to the server
   */
  addTool<Params extends ToolParameters>(tool: Tool<any, Params>): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get all registered tools
   */
  getTools(): Tool<any, any>[] {
    return Array.from(this.tools.values());
  }
}

/**
 * Setup function that optionally registers AITools with MCP server
 * Automatically infers and preserves schema types from the input
 * @param aiTools - The AITools object with schema mapping
 * @param mcpServer - Optional MCP server to register tools with
 * @returns The same AITools object with preserved types
 */
export const setupAITools = <T extends Record<string, z.ZodSchema>>(
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
