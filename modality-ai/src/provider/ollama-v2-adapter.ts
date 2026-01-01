/**
 * Ollama V2 Adapter
 * 
 * Clean V2-only adapter for ollama-ai-provider that converts V1 models to V2 interfaces.
 * This adapter ensures compatibility with AI SDK 5.0 by providing V2-compliant models.
 */

import { createOllama, type OllamaProvider } from 'ollama-ai-provider';
import type { 
  LanguageModelV2, 
  EmbeddingModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2FinishReason,
  LanguageModelV2Content,
  LanguageModelV2Usage,
  LanguageModelV2CallWarning,
  LanguageModelV2ResponseMetadata,
  SharedV2ProviderMetadata
} from '@ai-sdk/provider';

/**
 * V2-compliant Language Model adapter for Ollama
 */
class OllamaLanguageModelV2 implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private v1Model: any;

  constructor(v1Model: any, provider: string, modelId: string) {
    this.v1Model = v1Model;
    this.provider = provider;
    this.modelId = modelId;
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    // Convert V2 options to V1 format
    const v1Options = {
      messages: options.prompt,
      temperature: options.temperature,
      maxTokens: options.maxOutputTokens,
      topP: options.topP,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      abortSignal: options.abortSignal,
      headers: options.headers,
    };

    // Call V1 model
    const v1Result = await this.v1Model.doGenerate(v1Options);

    // Convert V1 result to V2 format
    const content: LanguageModelV2Content[] = [
      {
        type: 'text',
        text: v1Result.text
      }
    ];

    const finishReason: LanguageModelV2FinishReason = 
      v1Result.finishReason === 'stop' ? 'stop' :
      v1Result.finishReason === 'length' ? 'length' :
      v1Result.finishReason === 'content-filter' ? 'content-filter' :
      v1Result.finishReason === 'tool-calls' ? 'tool-calls' :
      'other';

    const usage: LanguageModelV2Usage = {
      inputTokens: v1Result.usage.promptTokens || v1Result.usage.inputTokens || 0,
      outputTokens: v1Result.usage.completionTokens || v1Result.usage.outputTokens || 0,
      totalTokens: v1Result.usage.totalTokens || undefined
    };

    const warnings: LanguageModelV2CallWarning[] = [];
    
    const providerMetadata: SharedV2ProviderMetadata = {
      ollama: {
        id: `ollama-${this.modelId}-${Date.now()}`,
        timestamp: new Date().toISOString()
      }
    };

    const responseMetadata: LanguageModelV2ResponseMetadata = {
      id: `ollama-${this.modelId}-${Date.now()}`,
      timestamp: new Date()
    };

    return {
      content,
      finishReason,
      usage,
      warnings,
      providerMetadata,
      response: responseMetadata
    };
  }

  async doStream(options: LanguageModelV2CallOptions) {
    // Convert V2 options to V1 format
    const v1Options = {
      messages: options.prompt,
      temperature: options.temperature,
      maxTokens: options.maxOutputTokens,
      topP: options.topP,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      abortSignal: options.abortSignal,
      headers: options.headers,
    };

    // Call V1 model stream
    const v1Result = await this.v1Model.doStream(v1Options);

    // Create V2-compatible stream
    const v2Stream = new ReadableStream({
      async start(controller) {
        const reader = v1Result.stream.getReader();
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            // Convert V1 stream parts to V2 format
            if (value.type === 'text-delta') {
              controller.enqueue({
                type: 'content-delta',
                delta: {
                  type: 'text',
                  text: value.textDelta
                }
              });
            } else if (value.type === 'finish') {
              const finishReason: LanguageModelV2FinishReason = 
                value.finishReason === 'stop' ? 'stop' :
                value.finishReason === 'length' ? 'length' :
                value.finishReason === 'content-filter' ? 'content-filter' :
                value.finishReason === 'tool-calls' ? 'tool-calls' :
                'other';

              const usage: LanguageModelV2Usage = {
                inputTokens: value.usage.promptTokens || value.usage.inputTokens || 0,
                outputTokens: value.usage.completionTokens || value.usage.outputTokens || 0,
                totalTokens: value.usage.totalTokens || undefined
              };

              controller.enqueue({
                type: 'finish',
                finishReason,
                usage
              });
            }
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      }
    });

    const providerMetadata: SharedV2ProviderMetadata = {
      ollama: {
        id: `ollama-stream-${this.modelId}-${Date.now()}`,
        timestamp: new Date().toISOString()
      }
    };

    return {
      stream: v2Stream,
      providerMetadata
    };
  }
}

/**
 * V2-compliant Embedding Model adapter for Ollama
 */
class OllamaEmbeddingModelV2<VALUE> implements EmbeddingModelV2<VALUE> {
  readonly specificationVersion = "v2" as const;
  readonly provider: string;
  readonly modelId: string;
  readonly maxEmbeddingsPerCall: number;
  readonly supportsParallelCalls: boolean;

  private v1Model: any;

  constructor(v1Model: any, provider: string, modelId: string) {
    this.v1Model = v1Model;
    this.provider = provider;
    this.modelId = modelId;
    this.maxEmbeddingsPerCall = v1Model.maxEmbeddingsPerCall || 1;
    this.supportsParallelCalls = v1Model.supportsParallelCalls || false;
  }

  async doEmbed(options: { values: VALUE[] }) {
    // Call V1 model
    const v1Result = await this.v1Model.doEmbed(options);

    // Convert V1 result to V2 format
    return {
      embeddings: v1Result.embeddings,
      usage: {
        tokens: v1Result.usage?.tokens || 0
      }
    };
  }
}

/**
 * V2-compliant Ollama Provider
 */
export interface OllamaV2ProviderOptions {
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export class OllamaV2Provider {
  private provider: OllamaProvider;

  constructor(options: OllamaV2ProviderOptions = {}) {
    this.provider = createOllama({
      baseURL: options.baseURL,
      fetch: options.fetch,
    });
  }

  /**
   * Get V2-compliant language model
   */
  languageModel(modelId: string): LanguageModelV2 {
    const v1Model = this.provider(modelId);
    return new OllamaLanguageModelV2(v1Model, 'ollama', modelId);
  }

  /**
   * Get V2-compliant embedding model
   */
  embeddingModel<VALUE = string>(modelId: string): EmbeddingModelV2<VALUE> {
    const v1Model = this.provider.embedding(modelId);
    return new OllamaEmbeddingModelV2<VALUE>(v1Model, 'ollama', modelId);
  }
}

/**
 * Create a V2-compliant Ollama provider
 */
export function createOllamaV2(options: OllamaV2ProviderOptions = {}): OllamaV2Provider {
  return new OllamaV2Provider(options);
}
