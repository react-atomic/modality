/**
 * Ollama Provider (V4 spec, native for ai@7.x)
 *
 * Standalone provider for Ollama that talks to the Ollama REST API directly
 * (no `ollama-ai-provider` dependency). Implements the LanguageModelV4 and
 * EmbeddingModelV4 specifications — the native spec for ai@7.x.
 *
 * API reference: https://github.com/ollama/ollama/blob/main/docs/api.md
 * (message conversion modeled after https://github.com/sgomez/ollama-ai-provider)
 */

import type {
  EmbeddingModelV4,
  EmbeddingModelV4CallOptions,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  SharedV4Warning,
} from "@ai-sdk/provider";

const DEFAULT_BASE_URL = "http://localhost:11434/api";

/**
 * Ollama REST API wire types (subset used by this provider)
 */
interface OllamaToolCall {
  function: {
    name: string;
    arguments: unknown;
  };
}

/** @internal exported for testing */
export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
}

/** @internal exported for testing */
export interface OllamaChatResponse {
  model?: string;
  created_at?: string;
  message?: {
    role?: string;
    content?: string;
    tool_calls?: OllamaToolCall[];
  };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

/** @internal exported for testing */
export interface OllamaEmbedResponse {
  embeddings: number[][];
  prompt_eval_count?: number;
  error?: string;
}

/**
 * Accept both `http://host:11434` and `http://host:11434/api` forms.
 * @internal exported for testing
 */
export function normalizeBaseURL(baseURL?: string): string {
  const url = (baseURL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return url.endsWith("/api") ? url : `${url}/api`;
}

/** @internal exported for testing */
export function toBase64(data: Uint8Array | string | URL): string {
  if (data instanceof Uint8Array) {
    return Buffer.from(data).toString("base64");
  }
  const text = data instanceof URL ? data.toString() : data;
  const dataUrlMatch = text.match(/^data:[^;]*;base64,(.+)$/);
  if (dataUrlMatch) {
    return dataUrlMatch[1];
  }
  return text;
}

/**
 * Safely parse JSON — returns `fallback` on failure instead of throwing.
 * @internal exported for testing
 */
export function safeParseJson(input: string, fallback: unknown = {}): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

/** @internal exported for testing */
export function mapFinishReason(doneReason?: string): LanguageModelV4FinishReason {
  let unified: LanguageModelV4FinishReason["unified"];
  switch (doneReason) {
    case "stop":
    case undefined:
      unified = "stop";
      break;
    case "length":
      unified = "length";
      break;
    default:
      unified = "other";
  }
  return { unified, raw: doneReason };
}

/** @internal exported for testing */
export function mapUsage(response: OllamaChatResponse): LanguageModelV4Usage {
  const inputTokens = response.prompt_eval_count;
  const outputTokens = response.eval_count;
  return {
    inputTokens: {
      total: inputTokens,
      noCache: inputTokens,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputTokens,
      text: outputTokens,
      reasoning: undefined,
    },
  };
}

let toolCallCounter = 0;

function nextToolCallId(): string {
  toolCallCounter += 1;
  return `ollama-tool-call-${toolCallCounter}`;
}

/**
 * Convert an AI SDK V4 prompt into Ollama chat messages.
 * @internal exported for testing
 */
export function convertToOllamaMessages(prompt: LanguageModelV4Prompt): {
  messages: OllamaMessage[];
  warnings: SharedV4Warning[];
} {
  const messages: OllamaMessage[] = [];
  const warnings: SharedV4Warning[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case "system": {
        messages.push({ role: "system", content: message.content });
        break;
      }

      case "user": {
        let content = "";
        const images: string[] = [];
        for (const part of message.content) {
          if (part.type === "text") {
            content += part.text;
          } else if (
            part.mediaType.startsWith("image/") &&
            part.data.type === "data"
          ) {
            images.push(toBase64(part.data.data));
          } else {
            warnings.push({
              type: "unsupported",
              feature: `file part (${part.mediaType}, ${part.data.type})`,
            });
          }
        }
        messages.push({
          role: "user",
          content,
          ...(images.length > 0 ? { images } : {}),
        });
        break;
      }

      case "assistant": {
        let content = "";
        const toolCalls: OllamaToolCall[] = [];
        for (const part of message.content) {
          if (part.type === "text") {
            content += part.text;
          } else if (part.type === "tool-call") {
            toolCalls.push({
              function: {
                name: part.toolName,
                arguments:
                  typeof part.input === "string"
                    ? safeParseJson(part.input, {})
                    : part.input,
              },
            });
          }
          // reasoning / file / tool-result parts have no Ollama equivalent
        }
        messages.push({
          role: "assistant",
          content,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
        break;
      }

      case "tool": {
        for (const part of message.content) {
          if (part.type !== "tool-result") {
            continue;
          }
          const output = part.output;
          let content: string;
          switch (output.type) {
            case "text":
            case "error-text":
              content = output.value;
              break;
            case "execution-denied":
              content = output.reason ?? "Tool execution denied";
              break;
            default:
              content = JSON.stringify(output.value);
          }
          messages.push({ role: "tool", content });
        }
        break;
      }
    }
  }

  return { messages, warnings };
}

/**
 * Convert AI SDK V4 call options into an Ollama /api/chat request body.
 * @internal exported for testing
 */
export function buildChatRequest(
  modelId: string,
  options: LanguageModelV4CallOptions,
  stream: boolean
): { body: Record<string, unknown>; warnings: SharedV4Warning[] } {
  const { messages, warnings } = convertToOllamaMessages(options.prompt);

  const ollamaOptions: Record<string, unknown> = {};
  if (options.maxOutputTokens != null)
    ollamaOptions.num_predict = options.maxOutputTokens;
  if (options.temperature != null)
    ollamaOptions.temperature = options.temperature;
  if (options.topP != null) ollamaOptions.top_p = options.topP;
  if (options.topK != null) ollamaOptions.top_k = options.topK;
  if (options.presencePenalty != null)
    ollamaOptions.presence_penalty = options.presencePenalty;
  if (options.frequencyPenalty != null)
    ollamaOptions.frequency_penalty = options.frequencyPenalty;
  if (options.stopSequences?.length) ollamaOptions.stop = options.stopSequences;
  if (options.seed != null) ollamaOptions.seed = options.seed;

  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    stream,
    ...(Object.keys(ollamaOptions).length > 0
      ? { options: ollamaOptions }
      : {}),
  };

  if (options.responseFormat?.type === "json") {
    body.format = options.responseFormat.schema ?? "json";
  }

  if (options.tools?.length) {
    const tools: unknown[] = [];
    for (const tool of options.tools) {
      if (tool.type === "function") {
        tools.push({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        });
      } else {
        warnings.push({
          type: "unsupported",
          feature: `provider-defined tool: ${tool.name}`,
        });
      }
    }
    if (tools.length > 0) {
      body.tools = tools;
    }
  }

  if (options.toolChoice && options.toolChoice.type !== "auto") {
    warnings.push({
      type: "unsupported",
      feature: "toolChoice",
      details: "Ollama only supports automatic tool choice",
    });
  }

  return { body, warnings };
}

interface OllamaRequestContext {
  baseURL: string;
  headers: Record<string, string>;
  fetch: typeof globalThis.fetch;
}

async function postToOllama(
  context: OllamaRequestContext,
  path: string,
  body: Record<string, unknown>,
  callHeaders?: Record<string, string | undefined>,
  abortSignal?: AbortSignal
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...context.headers,
  };
  for (const [key, value] of Object.entries(callHeaders ?? {})) {
    if (value != null) headers[key] = value;
  }

  const response = await context.fetch(`${context.baseURL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: abortSignal ?? AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Ollama request failed (${response.status} ${response.statusText}): ${errorText}`
    );
  }

  return response;
}

/**
 * V4-compliant Language Model for Ollama
 */
class OllamaLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = "v4" as const;
  readonly provider = "ollama";
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private context: OllamaRequestContext;

  constructor(modelId: string, context: OllamaRequestContext) {
    this.modelId = modelId;
    this.context = context;
  }

  async doGenerate(options: LanguageModelV4CallOptions) {
    const { body, warnings } = buildChatRequest(this.modelId, options, false);

    const response = await postToOllama(
      this.context,
      "/chat",
      body,
      options.headers,
      options.abortSignal
    );
    const result = (await response.json()) as OllamaChatResponse;

    if (result.error) {
      throw new Error(`Ollama error: ${result.error}`);
    }

    const content: LanguageModelV4Content[] = [];
    if (result.message?.content) {
      content.push({ type: "text", text: result.message.content });
    }
    const toolCalls = result.message?.tool_calls ?? [];
    for (const toolCall of toolCalls) {
      content.push({
        type: "tool-call",
        toolCallId: nextToolCallId(),
        toolName: toolCall.function.name,
        input: JSON.stringify(toolCall.function.arguments ?? {}),
      });
    }

    const finishReason: LanguageModelV4FinishReason =
      toolCalls.length > 0
        ? { unified: "tool-calls", raw: result.done_reason }
        : mapFinishReason(result.done_reason);

    return {
      content,
      finishReason,
      usage: mapUsage(result),
      warnings,
      request: { body },
      response: {
        id: `ollama-${this.modelId}-${Date.now()}`,
        modelId: result.model ?? this.modelId,
        timestamp: result.created_at ? new Date(result.created_at) : new Date(),
      },
    };
  }

  async doStream(options: LanguageModelV4CallOptions) {
    const { body, warnings } = buildChatRequest(this.modelId, options, true);
    const modelId = this.modelId;

    const response = await postToOllama(
      this.context,
      "/chat",
      body,
      options.headers,
      options.abortSignal
    );

    if (!response.body) {
      throw new Error("Ollama streaming response has no body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      async start(controller) {
        controller.enqueue({ type: "stream-start", warnings });
        controller.enqueue({
          type: "response-metadata",
          id: `ollama-${modelId}-${Date.now()}`,
          modelId,
          timestamp: new Date(),
        });

        const textId = "text-0";
        let textStarted = false;
        let hasToolCalls = false;
        let finishReason: LanguageModelV4FinishReason = {
          unified: "stop",
          raw: undefined,
        };
        let usage = mapUsage({});
        let buffer = "";

        const processLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;

          const chunk = JSON.parse(trimmed) as OllamaChatResponse;
          if (chunk.error) {
            controller.enqueue({
              type: "error",
              error: new Error(`Ollama error: ${chunk.error}`),
            });
            return;
          }

          if (chunk.message?.content) {
            if (!textStarted) {
              textStarted = true;
              controller.enqueue({ type: "text-start", id: textId });
            }
            controller.enqueue({
              type: "text-delta",
              id: textId,
              delta: chunk.message.content,
            });
          }

          for (const toolCall of chunk.message?.tool_calls ?? []) {
            hasToolCalls = true;
            controller.enqueue({
              type: "tool-call",
              toolCallId: nextToolCallId(),
              toolName: toolCall.function.name,
              input: JSON.stringify(toolCall.function.arguments ?? {}),
            });
          }

          if (chunk.done) {
            finishReason = hasToolCalls
              ? { unified: "tool-calls", raw: chunk.done_reason }
              : mapFinishReason(chunk.done_reason);
            usage = mapUsage(chunk);
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              processLine(line);
            }
          }
          if (buffer.trim()) {
            processLine(buffer);
          }

          if (textStarted) {
            controller.enqueue({ type: "text-end", id: textId });
          }
          controller.enqueue({ type: "finish", finishReason, usage });
        } catch (error) {
          controller.enqueue({ type: "error", error });
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return {
      stream,
      request: { body },
    };
  }
}

/**
 * V4-compliant Embedding Model for Ollama
 */
class OllamaEmbeddingModel implements EmbeddingModelV4 {
  readonly specificationVersion = "v4" as const;
  readonly provider = "ollama";
  readonly modelId: string;
  readonly maxEmbeddingsPerCall = 2048;
  readonly supportsParallelCalls = true;

  private context: OllamaRequestContext;

  constructor(modelId: string, context: OllamaRequestContext) {
    this.modelId = modelId;
    this.context = context;
  }

  async doEmbed(options: EmbeddingModelV4CallOptions) {
    const response = await postToOllama(
      this.context,
      "/embed",
      { model: this.modelId, input: options.values },
      options.headers,
      options.abortSignal
    );
    const result = (await response.json()) as OllamaEmbedResponse;

    if (result.error) {
      throw new Error(`Ollama error: ${result.error}`);
    }

    return {
      embeddings: result.embeddings,
      usage: {
        tokens: result.prompt_eval_count ?? 0,
      },
      warnings: [],
    };
  }
}

/**
 * Ollama Provider (V4 spec, native for ai@7.x)
 */
export interface OllamaV2ProviderOptions {
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export class OllamaV2Provider {
  private context: OllamaRequestContext;

  constructor(options: OllamaV2ProviderOptions = {}) {
    this.context = {
      baseURL: normalizeBaseURL(options.baseURL),
      headers: options.headers ?? {},
      fetch: options.fetch ?? globalThis.fetch,
    };
  }

  /**
   * Get language model
   */
  languageModel(modelId: string): LanguageModelV4 {
    return new OllamaLanguageModel(modelId, this.context);
  }

  /**
   * Get embedding model
   */
  embeddingModel(modelId: string): EmbeddingModelV4 {
    return new OllamaEmbeddingModel(modelId, this.context);
  }
}

/**
 * Create an Ollama provider
 */
export function createOllamaV2(
  options: OllamaV2ProviderOptions = {}
): OllamaV2Provider {
  return new OllamaV2Provider(options);
}
