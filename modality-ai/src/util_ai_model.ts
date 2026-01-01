/**
 * AI Chat and Embedding Abstraction
 * Supports both Gemini and Ollama providers for chat and embedding generation
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed, generateText, tool, stepCountIs } from "ai";
import { createOllamaV2 } from "./provider/ollama-v2-adapter";
import { VsCodeLmProvider } from "./provider/VsCodeLmProvider";

/**
 * Type Imports
 */
import type { ModelMessage } from "ai";
import type { AITools } from "modality-mcp-kit";
import type {
  OllamaConfig,
  GeminiConfig,
  VSCodeConfig,
} from "./schemas/schemas_modality";

/**
 * Randomly selects one of the available API keys based on a pattern
 * @param baseKeyName - Base environment variable name (e.g., "GEMINI_API_KEY")
 * @param keyCount - Total number of keys to check, including the base key
 * @returns A random API key if available, or undefined if none are set
 */
const evictKey: string[] = [];
function getRandomApiKey(baseKeyName: string, keyCount: number): string {
  const keys: (string | undefined)[] = [process.env[baseKeyName]];
  for (let i = 1; i < keyCount; i++) {
    keys.push(process.env[`${baseKeyName}${i}`]);
  }

  const validKeys = keys.filter(
    (key) => key && -1 === evictKey.indexOf(key) && key.trim() !== ""
  ) as string[];
  return validKeys.length > 0
    ? validKeys[Math.floor(Math.random() * validKeys.length)]
    : "";
}

/**
 * Randomly selects one of the available GEMINI_API_KEY environment variables
 * @returns A random GEMINI API key if available, or undefined if none are set
 */
function getGeminiKeyFromEnv(config: any): string {
  config.apiKey = getRandomApiKey("GEMINI_API_KEY", 6);
  return config.apiKey;
}

// Provider types
export type AIProvider = "gemini" | "ollama" | "vscode";

export interface AIConfig {
  provider: AIProvider;
  ollama?: OllamaConfig;
  gemini?: GeminiConfig;
  vscode?: VSCodeConfig;
}

export interface ChatOptions {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  tools?: AITools; // Add tools support
  toolChoice?:
    | "auto"
    | "none"
    | "required"
    | { type: "tool"; toolName: string };
  // Rate limiting options
  rateLimitDelay?: number; // Delay in milliseconds between requests
  enableRateLimit?: boolean; // Enable/disable rate limiting
  maxSteps?: number; // Max steps for multi-step tool execution (default 2)
}

export interface ChatResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: any[]; // Tool calls made by the model
  toolResults?: any[]; // Results from tool executions
  steps?: any[]; // Multi-step execution history (for maxSteps > 1)
  messageId?: string; // Message ID from AI model response
}

// Base AI provider interface
export interface AIProviderInterface {
  generateEmbedding(text: string): Promise<number[]>;
  chat(messages: ModelMessage[], options?: ChatOptions): Promise<ChatResponse>;
  evict(): void; // Optional method to evict or reset provider state
  getModel(): string;
}

/**
 * Ollama AI Provider Implementation
 */
export class OllamaProvider implements AIProviderInterface {
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
  }
  evict(): void {}
  getModel(): string {
    return this.config.model || "";
  }

  /**
   * Generate embeddings using Ollama
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const baseURL = `${this.config.baseURL}/api`;
    try {
      const provider = createOllamaV2({
        baseURL,
      });

      const { embedding } = await embed({
        model: provider.embeddingModel(this.config.model || ""),
        value: text,
      });

      return embedding;
    } catch (error) {
      // should not chang the error message to avoid breaking changes
      throw new Error(`Failed to generate embedding with Ollama: ${baseURL}`);
    }
  }

  /**
   * Generate chat response using Ollama
   */
  async chat(
    messages: ModelMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const baseURL = this.config.baseURL || "http://localhost:11434";
    try {
      const provider = createOllamaV2({
        baseURL,
      });

      // Convert tools if provided
      const tools: Record<string, any> = {};
      if (options?.tools) {
        for (const [name, aiTool] of Object.entries(options.tools)) {
          tools[name] = tool(aiTool as unknown as any);
        }
      }

      // https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text#returns
      const result = await callGenerateText({
        model: provider.languageModel(this.config.model || ""),
        messages,
        options,
        tools,
      });

      return {
        content: result.text,
        usage: result.usage
          ? {
              promptTokens: result.usage.inputTokens || 0,
              completionTokens: result.usage.outputTokens || 0,
              totalTokens: result.usage.totalTokens || 0,
            }
          : undefined,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        steps: (result as any).steps, // Include steps for multi-step processing
        messageId: result.response?.id || undefined, // Extract message ID from AI SDK response.id
      };
    } catch (error) {
      throw new Error(
        `Failed to generate chat response with Ollama: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

/**
 * Gemini AI Provider Implementation
 */
const GeminiDefaultModels = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
//  "gemini-2.0-flash",
//  "gemini-2.0-flash-lite",
];
export class GeminiProvider implements AIProviderInterface {
  private config: GeminiConfig;
  private model: string = "";

  constructor(config: GeminiConfig) {
    this.config = config;
  }
  evict(): void {
    const apiKey = this.config.apiKey;
    if (apiKey) {
      evictKey.push(apiKey);
      console.log({ evictKey });
    }
  }
  getModel(): string {
    this.model =
      this.config.model ||
      GeminiDefaultModels[
        Math.floor(Math.random() * GeminiDefaultModels.length)
      ];
    return this.model;
  }

  /**
   * Generate embeddings using Gemini
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const provider = createGoogleGenerativeAI({
        apiKey: getGeminiKeyFromEnv(this.config),
      });

      const { embedding } = await embed({
        model: provider.embeddingModel("text-embedding-004"),
        value: text,
      });

      return embedding;
    } catch (error) {
      throw new Error(
        `Failed to generate embedding with Gemini: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Generate chat response using Gemini
   */
  async chat(
    messages: ModelMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    try {
      const provider = createGoogleGenerativeAI({
        apiKey: getGeminiKeyFromEnv(this.config),
      });
      // Convert tools if provided
      const tools: Record<string, any> = {};
      if (options?.tools) {
        for (const [name, aiTool] of Object.entries(options.tools)) {
          tools[name] = tool(aiTool as unknown as any);
        }
      }

      const result = await callGenerateText({
        model: provider(this.model),
        messages,
        options,
        tools,
      });

      return {
        content: result.text,
        usage: result.usage
          ? {
              promptTokens: result.usage.inputTokens || 0,
              completionTokens: result.usage.outputTokens || 0,
              totalTokens: result.usage.totalTokens || 0,
            }
          : undefined,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        steps: (result as any).steps, // Include steps for multi-step processing
        messageId: result.response?.id || undefined, // Extract message ID from AI SDK response.id
      };
    } catch (error) {
      throw new Error(
        `Failed to generate chat response with Gemini: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}


/**
 * VS Code AI Provider Implementation
 */
export class VsCodeProvider implements AIProviderInterface {
  private config: VSCodeConfig;
  private provider: VsCodeLmProvider;

  constructor(config: VSCodeConfig) {
    this.config = config;
    this.provider = new VsCodeLmProvider({
      model: this.config.model,
    });
  }

  evict(): void {
    // Dispose MCP resources if needed
    this.provider.dispose();
  }

  getModel(): string {
    return this.provider.modelId;
  }

  /**
   * Generate embeddings using VS Code provider
   * Note: VS Code provider doesn't support embeddings, so we'll throw an error
   */
  async generateEmbedding(_text: string): Promise<number[]> {
    throw new Error(
      "VS Code provider does not support embedding generation. Use Ollama or Gemini provider for embeddings."
    );
  }

  /**
   * Generate chat response using VS Code provider
   * Uses direct callGenerateText approach - SIMPLICITY FIRST!
   */
  async chat(
    messages: ModelMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    try {
      // Convert tools if provided (VS Code doesn't support tools yet, but maintain structure)
      const tools: Record<string, any> = {};
      if (options?.tools) {
        for (const [name, aiTool] of Object.entries(options.tools)) {
          tools[name] = tool(aiTool as unknown as any);
        }
      }

      // DIRECT APPROACH: VsCodeLmProvider IS a LanguageModelV2 - use it directly!
      const result = await callGenerateText({
        model: this.provider,
        messages,
        options,
        tools,
      });

      return {
        content: result.text,
        usage: result.usage
          ? {
              promptTokens: result.usage.inputTokens || 0,
              completionTokens: result.usage.outputTokens || 0,
              totalTokens: result.usage.totalTokens || 0,
            }
          : undefined,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        steps: (result as any).steps, // Include steps for multi-step processing
        messageId: result.response?.id || undefined, // Extract message ID from AI SDK response.id
      };
    } catch (error) {
      throw new Error(
        `Failed to generate chat response with VS Code: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

/**
 * AI Chat Abstraction - Main class for managing different AI providers
 */
export class AIChat {
  private provider: AIProviderInterface;
  private lastRequestTime: number = 0;

  constructor(config: AIConfig) {
    switch (config.provider) {
      case "ollama":
        if (!config.ollama) {
          throw new Error(
            "Ollama configuration is required when using ollama provider"
          );
        }
        this.provider = new OllamaProvider(config.ollama);
        break;
      case "gemini":
        if (!config.gemini) {
          throw new Error(
            "Gemini configuration is required when using gemini provider"
          );
        }
        this.provider = new GeminiProvider(config.gemini);
        break;
      case "vscode":
        if (!config.vscode) {
          throw new Error(
            "VS Code configuration is required when using vscode provider"
          );
        }
        this.provider = new VsCodeProvider(config.vscode);
        break;
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  }
  evict(): void {
    this.provider.evict();
  }
  getModel(): string {
    return this.provider.getModel();
  }

  /**
   * Generate embeddings using the configured provider
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return this.provider.generateEmbedding(text);
  }

  /**
   * Generate chat response using the configured provider
   */
  async chat(
    messages: ModelMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    this.lastRequestTime =
      (await applyRateLimit(options, this.lastRequestTime)) || 0;
    return this.provider.chat(messages, options);
  }
}

/**
 * Utility functions for backwards compatibility and convenience
 */

/**
 * Apply rate limiting delay if enabled
 */
async function applyRateLimit(
  options?: ChatOptions,
  lastRequestTime?: number
): Promise<number | undefined> {
  if (
    !options?.enableRateLimit ||
    !options?.rateLimitDelay ||
    !lastRequestTime
  ) {
    return;
  }

  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  const delay = options.rateLimitDelay;

  if (timeSinceLastRequest < delay) {
    const waitTime = delay - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  return Date.now();
}

/**
 * Create a standalone function for generating embeddings (backwards compatibility)
 */
export async function generateEmbedding(
  text: string,
  config: OllamaConfig
): Promise<number[]> {
  const provider = new OllamaProvider(config);
  return provider.generateEmbedding(text);
}

/**
 * Factory function to create AI chat instances
 */
export function createAIChat(config: AIConfig): AIChat {
  return new AIChat(config);
}

/**
 * Convenience function to create Ollama chat instance
 */
export function createOllamaChat(config: OllamaConfig): AIChat {
  return new AIChat({ provider: "ollama", ollama: config });
}

/**
 * Convenience function to create Gemini chat instance
 */
export function createGeminiChat(config: GeminiConfig): AIChat {
  return new AIChat({ provider: "gemini", gemini: config });
}

/**
 * Convenience function to create VS Code chat instance
 */
export function createVsCodeChat(config: VSCodeConfig): AIChat {
  return new AIChat({ provider: "vscode", vscode: config });
}

// Extract and merge tool calls and results from multi-step processing
// When maxSteps > 1, the AI SDK processes tools internally and toolCalls/toolResults
// may be empty in the final response, but the information is available in steps
const getToolData = (tool: any) => {
  if (!tool) {
    return null;
  }
  const { toolCallId, toolName, result, args } = tool;
  const data: any = { toolCallId, toolName };
  if (result) {
    data.result = result;
  } else {
    data.args = args;
  }
  return data;
};
// Helper functions for ModelMessage creation
export function createTextMessage(
  role: "user" | "assistant" | "system",
  content: string
): ModelMessage {
  return { role, content };
}

function createToolResultMessage(
  toolCallId: string,
  result: any,
  isError: boolean = false
): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId,
        result,
        isError,
      } as any,
    ],
  } as ModelMessage;
}

export function createAssistantMessageWithToolCalls(
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, any>;
  }>
): ModelMessage {
  return {
    role: "assistant",
    content: toolCalls.map((tc) => ({
      type: "tool-call" as const,
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      args: tc.args,
    })) as any,
  } as ModelMessage;
}

// Function to build proper conversation history with tool results
export function buildMessagesWithToolResults(
  baseMessages: ModelMessage[],
  response: any
): ModelMessage[] {
  const messages = [...baseMessages];

  // If there are tool calls, add them to the conversation
  if (response.toolCalls && response.toolCalls.length > 0) {
    // Add assistant message with tool calls
    messages.push(createAssistantMessageWithToolCalls(response.toolCalls));

    // Add tool result messages
    if (response.toolResults) {
      response.toolResults.forEach((result: any) => {
        messages.push(
          createToolResultMessage(
            result.toolCallId,
            result.result,
            result.isError || false
          )
        );
      });
    }
  }

  return messages;
}

export function mergeToolCallsAndResults(
  response: any
): { call: any; result: any }[] {
  const merged: { call: any; result: any }[] = [];
  if (response.steps && response.steps.length > 0) {
    for (const step of response.steps) {
      if (step.toolCalls) {
        step.toolCalls.forEach((call: any) => {
          const result = step.toolResults.find(
            (res: any) => res.toolCallId === call.toolCallId
          );
          merged.push({
            call: getToolData(call),
            result: getToolData(result),
          });
        });
      }
    }
  }

  // Fallback to direct toolCalls/toolResults if steps are not available.
  // This occurs when maxSteps=1 (AI SDK default) or in specific error scenarios,
  // or if chatOptions.maxSteps overrides our default maxSteps: 8 setting.
  // Current implementation uses maxSteps: 8, so this fallback rarely executes.
  if (merged.length === 0 && (response.toolCalls || response.toolResults)) {
    const directCalls = response.toolCalls || [];
    const directResults = response.toolResults || [];

    if (directCalls.length > 0) {
      directCalls.forEach((call: any) => {
        const result = directResults.find(
          (res: any) => res.toolCallId === call.toolCallId
        );
        merged.push({
          call: getToolData(call),
          result: getToolData(result),
        });
      });
    }
  }

  return merged;
}

interface callGenerateTextProps {
  model: any;
  messages: ModelMessage[];
  options?: ChatOptions;
  tools: Record<string, any>;
}

async function callGenerateText({
  model,
  messages,
  options,
  tools,
}: callGenerateTextProps) {
  const result = await generateText({
    model,
    messages,
    temperature: options?.temperature,
    maxOutputTokens: options?.maxOutputTokens,
    topP: options?.topP,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    stopWhen: stepCountIs(options?.maxSteps || 2), // Default maxSteps to 2 for Ollama
    toolChoice: options?.toolChoice,
  });
  return result;
}
