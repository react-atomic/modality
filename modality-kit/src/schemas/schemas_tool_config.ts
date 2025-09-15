/**
 * TypeScript interfaces for tool configuration objects
 */

import { z } from "zod";

/**
 * Tool interface for AI SDK compatibility
 */
export interface AITool<T extends z.ZodSchema = z.ZodSchema> {
  name?: string; // Optional name, defaults to the key in the tools Object
  annotations?: any; // Optional annotations for the tool
  description: string;
  inputSchema: T;
  execute: (args: z.infer<T>) => Promise<string>;
}

/**
 * Type for a collection of AI tools with preserved schema types
 * @template T - Record mapping tool names to their inputSchema types
 * @example AITools<{getUserById: z.object({id: z.string()}), createUser: z.object({name: z.string()})}>
 */
export type AITools<T extends Record<string, z.ZodSchema> = Record<string, z.ZodSchema>> = {
  [K in keyof T]: AITool<T[K]>;
};
