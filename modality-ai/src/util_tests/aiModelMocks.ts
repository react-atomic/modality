/**
 * Shared mock utilities for AI Model testing
 * Centralizes mock class definitions to reduce duplication across test files
 */

// Standard mock errors for consistent testing
export const mockOllamaError = new Error("Mock Ollama provider error for testing");
export const mockGeminiError = new Error("Mock Gemini provider error for testing");

// Reusable mock provider classes
export class MockOllamaProvider {
  constructor(_config: any) {}
  async chat(_messages: any[], _options?: any): Promise<any> {
    throw mockOllamaError;
  }
}

export class MockGeminiProvider {
  constructor(_config: any) {}
  async chat(_messages: any[], _options?: any): Promise<any> {
    throw mockGeminiError;
  }
}

export class MockAIChat {
  private config: any;

  constructor(config: any) {
    // Validate configuration like the real AIChat class
    if (config?.provider === 'ollama' && !config?.ollama) {
      throw new Error("Ollama configuration is required when using ollama provider");
    }
    if (config?.provider === 'gemini' && !config?.gemini) {
      throw new Error("Gemini configuration is required when using gemini provider");
    }
    if (config?.provider && !['ollama', 'gemini'].includes(config.provider)) {
      throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
    this.config = config;
  }

  async generateEmbedding(_text: string): Promise<any> {
    if (this.config?.provider === 'gemini') throw mockGeminiError;
    throw mockOllamaError;
  }

  async chat(_messages: any[], _options?: any): Promise<any> {
    if (this.config?.provider === 'gemini') throw mockGeminiError;
    throw mockOllamaError;
  }

}

// Factory functions for consistent mock creation
export const createMockOllamaChat = (_config: any) => ({
  chat: () => Promise.reject(mockOllamaError),
});

export const createMockGeminiChat = (_config: any) => ({
  chat: () => Promise.reject(mockGeminiError),
});

// Complete mock module for util_ai_model
export const createAiModelMockModule = () => ({
  OllamaProvider: MockOllamaProvider,
  GeminiProvider: MockGeminiProvider,
  AIChat: MockAIChat,
  createOllamaChat: createMockOllamaChat,
  createGeminiChat: createMockGeminiChat,
  AIConfig: {} as any,
  ChatOptions: {} as any,
  ChatResponse: {} as any
});
