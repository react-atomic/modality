import { z } from "zod";
import {
  setupAITools,
  type ModalityFastMCP,
  type AITools,
} from "modality-mcp-kit";
import { ModalityClient, type ModalityClientInstance } from "./ModalityClient";

export interface StdioToHttpOptions {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  pkg?: string;
  timeout?: number;
}

/**
 * Convert JSON schema to Zod schema for type-safe validation
 * Handles common JSON schema patterns while maintaining type information
 */
function jsonSchemaToZod(schema: any): z.ZodType<any> {
  if (!schema) return z.any();

  const { type, properties, required, items, enum: enumValues } = schema;

  // Handle enums
  if (enumValues && Array.isArray(enumValues)) {
    return z.enum(enumValues);
  }

  // Handle arrays
  if (type === "array") {
    const itemSchema = items ? jsonSchemaToZod(items) : z.any();
    return z.array(itemSchema);
  }

  // Handle objects
  if (type === "object" || properties) {
    const shape: Record<string, z.ZodType<any>> = {};
    if (properties) {
      for (const [key, prop] of Object.entries(properties)) {
        shape[key] = jsonSchemaToZod(prop);
      }
    }
    const objSchema = z.object(shape).catchall(z.any());

    // Mark required fields
    if (required && Array.isArray(required)) {
      return objSchema;
    }
    return objSchema.partial();
  }

  // Handle primitives
  switch (type) {
    case "string":
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "null":
      return z.null();
    default:
      return z.any();
  }
}

export const createStdioToHttpClient = (
  options?: StdioToHttpOptions
): ModalityClientInstance => {
  const {
    command = "bunx",
    args: optionArgs = [],
    env: optionEnv,
    pkg,
    timeout = 120000,
  } = options || {};

  const args = pkg ? [pkg, ...optionArgs] : optionArgs;

  const env: Record<string, string> = {
    ...(Object.fromEntries(
      Object.entries(process.env).filter((entry) => entry[1] !== undefined)
    ) as Record<string, string>),
    ...(optionEnv || {}),
  };

  const client = ModalityClient.stdio(
    {
      command,
      args,
      env,
    },
    timeout
  );
  return client;
};

/**
 * Setup Chrome DevTools MCP tools
 * Dynamically loads all tools from chrome-devtools-mcp@latest and exposes them as AITools
 */
export const setupStdioToHttpTools = async (
  client: ModalityClientInstance,
  mcpServer?: ModalityFastMCP
): Promise<AITools> => {
  // Dynamically load tools from Chrome DevTools MCP
  const tools = await client.listTools();

  const aiTools: AITools = {};

  for (const tool of tools.tools) {
    aiTools[tool.name] = {
      name: tool.name,
      description: tool.description || `Execute ${tool.name} tool`,
      inputSchema: jsonSchemaToZod(tool.inputSchema),
      execute: async (params) => {
        try {
          const result = await client.call(tool.name, params);
          return result;
        } catch (error) {
          throw new Error(`Chrome DevTools tool ${tool.name} failed: ${error}`);
        }
      },
    };
  }

  return setupAITools(aiTools, mcpServer);
};
