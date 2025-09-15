/**
 * TypeScript interfaces for tool configuration objects
 */

export type AIToolExecutor = (...args: any[]) => Promise<string>;

/**
 * Tool interface for AI SDK compatibility
 */
export interface AITool {
  name?: string; // Optional name, defaults to the key in the tools Object
  annotations?: any; // Optional annotations for the tool
  description: string;
  inputSchema: any; // Zod schema or JSON schema
  execute: AIToolExecutor;
}

/**
 * Type for a collection of AI tools
 * @template T - The key type for the tools record, defaults to string
 */
export type AITools<T extends string | number | symbol = string> = Record<T, AITool>;
