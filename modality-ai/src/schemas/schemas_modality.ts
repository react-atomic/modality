import { z } from "zod";

// Default AI provider configurations
export const DEFAULT_AI_PROVIDER = "gemini"; // Default AI provider
export const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

// Chat message schema
export const chatMessageSchema = z.object({
  role: z
    .enum(["user", "assistant", "system"])
    .describe("Role of the message sender"),
  content: z.string().min(1).describe("Content of the message"),
});

// Default configurations
export const DEFAULT_OLLAMA_CONFIG = {
  baseURL: OLLAMA_URL,
  model: process.env.OLLAMA_MODEL || "gemma3:4b-it-q8_0",
};

export const DEFAULT_VSCODE_CONFIG = {
  baseURL: process.env.VSCODE_URL || "http://localhost:8080",
  model: process.env.VSCODE_MODEL || "copilot-gpt-4",
};

export const DEFAULT_GEMINI_CONFIG = {
  apiKey: "",
  model: process.env.GEMINI_MODEL || "",
};

// AI Provider configuration schemas
export const vscodeConfigSchema = z.object({
  baseURL: z
    .string()
    .url()
    .optional()
    .default(DEFAULT_VSCODE_CONFIG.baseURL)
    .describe("VS Code server URL"),
  model: z
    .string()
    .optional()
    .default(DEFAULT_VSCODE_CONFIG.model)
    .describe("VS Code model name"),
});
export const ollamaConfigSchema = z.object({
  baseURL: z
    .string()
    .url()
    .optional()
    .default(DEFAULT_OLLAMA_CONFIG.baseURL)
    .describe("Ollama server URL"),
  model: z
    .string()
    .optional()
    .default(DEFAULT_OLLAMA_CONFIG.model)
    .describe("Ollama model name"),
});

export const geminiConfigSchema = z.object({
  apiKey: z
    .string()
    .optional()
    .default(DEFAULT_GEMINI_CONFIG.apiKey)
    .describe("Gemini API key"),
  model: z
    .string()
    .optional()
    .default(DEFAULT_GEMINI_CONFIG.model)
    .describe("Gemini model name"),
});

// Chat options schema
const chatOptionsSchema = z.object({
  temperature: z
    .number()
    .min(0)
    .max(2)
    .optional()
    .describe("Controls randomness (0-2)"),
  maxOutputTokens: z
    .number()
    .positive()
    .optional()
    .describe("Maximum tokens to generate"),
  topP: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Controls diversity (0-1)"),
  toolChoice: z
    .enum(["auto", "none", "required"])
    .optional()
    .describe("Controls whether and how tools are used by the AI"),
  maxSteps: z
    .number()
    .positive()
    .optional()
    .describe("Maximum number of tool call steps allowed"),
});

// Memory options schema
const memoryOptionsSchema = z.object({
  maxMessages: z
    .number()
    .positive()
    .optional()
    .default(10)
    .describe("Maximum number of previous messages to include"),
  showContext: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to show the AI context messages in the response"),
});

export const simpleModalityAnswerSchema = z.object({
  question: z.string().min(1).describe("Question to answer"),
  context: z
    .string()
    .optional()
    .describe("Additional context for the question"),
  useMemory: z
    .boolean()
    .default(true)
    .describe("Whether to use conversation memory"),
});

const providerEnum = z.enum(["ollama", "gemini", "vscode"]).optional().describe("AI provider to use");

// Answer question schema
export const modalityAnswerSchema = z.object({
  question: z.string().min(1).describe("Question to answer"),
  context: z
    .string()
    .optional()
    .describe("Additional context for the question"),
  useMemory: z
    .boolean()
    .default(true)
    .describe("Whether to use conversation memory"),
  provider: providerEnum,
  ollama: ollamaConfigSchema.optional().default(DEFAULT_OLLAMA_CONFIG),
  gemini: geminiConfigSchema.optional().default(DEFAULT_GEMINI_CONFIG),
  vscode: vscodeConfigSchema.optional().default(DEFAULT_VSCODE_CONFIG),
  chatOptions: chatOptionsSchema
    .optional()
    .default({})
    .describe("Chat generation options"),
  memoryOptions: memoryOptionsSchema
    .optional()
    .default({ maxMessages: 10, showContext: false })
    .describe("Memory retrieval options"),
});

// Conversation reset schema
export const conversationResetSchema = z.object({
  sessionId: z
    .string()
    .optional()
    .describe("ID of the session to reset"),
});

// Type exports - using input type to make optional fields truly optional
export type ModalityAnswerSchema = z.input<typeof modalityAnswerSchema>;
export type ChatMessageSchema = z.infer<typeof chatMessageSchema>;
export type ChatOptionsSchema = z.infer<typeof chatOptionsSchema>;
export type MemoryOptionsSchema = z.infer<typeof memoryOptionsSchema>;

export type OllamaConfig = z.input<typeof ollamaConfigSchema>;
export type VSCodeConfig = z.input<typeof vscodeConfigSchema>;
export type GeminiConfig = z.input<typeof geminiConfigSchema>;
export type ProviderType = z.input<typeof providerEnum>;
