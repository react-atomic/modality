/**
 * TypeScript interfaces for tool configuration objects
 */

/**
 * Tool interface for AI SDK compatibility
 */
export interface AITool {
  name?: string; // Optional name, defaults to the key in the tools Object
  annotations?: any; // Optional annotations for the tool
  description: string;
  parameters: any; // Zod schema or JSON schema
  execute: (parameters: any, options?: any) => Promise<any>;
}

/**
 * Type for a collection of AI tools
 */
export type AITools = Record<string, AITool>;
