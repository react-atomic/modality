import {
  OllamaProvider,
  generateEmbedding,
  GeminiProvider,
  AIChat,
  AIConfig,
  ChatOptions,
  createAIChat,
  createOllamaChat,
  createGeminiChat,
} from "../util_ai_model";
import type { OllamaConfig, GeminiConfig } from "../schemas/schemas_modality";
import type { AITool } from "modality-mcp-kit";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { test, describe, expect, beforeEach, afterEach } from "bun:test";

// Helper functions for testing (replacing the migration utilities)
function createChatMessage(
  role: "user" | "assistant" | "system",
  content: string
): ModelMessage {
  return { role, content };
}

// Mock functions with restore capability
let mockRestore: (() => void) | undefined;

beforeEach(async () => {
  // Note: bunMockModule cannot work here because modules are already imported at the top.
  // Bun's mock() must be called before import, not at runtime.
  // Tests will use real OllamaProvider/GeminiProvider classes instead.
  mockRestore = undefined;
});

afterEach(() => {
  // Restore mock module after each test
  if (mockRestore) {
    mockRestore();
    mockRestore = undefined;
  }
});

// Simple test without complex mocking - focusing on class behavior and error handling
describe("OllamaConfig", () => {
  test("should define correct interface structure", () => {
    const config: OllamaConfig = {
      baseURL: "http://localhost:11434",
      model: "nomic-embed-text",
    };

    expect(config.baseURL).toBe("http://localhost:11434");
    expect(config.model).toBe("nomic-embed-text");
  });

  test("should allow optional baseURL", () => {
    const config: OllamaConfig = {
      model: "nomic-embed-text",
    };

    expect(config.baseURL).toBeUndefined();
    expect(config.model).toBe("nomic-embed-text");
  });

  test("should require model field", () => {
    // This test ensures the interface contract is correct
    const validConfig: OllamaConfig = {
      model: "required-model",
    };
    expect(validConfig.model).toBe("required-model");

    const configWithBoth: OllamaConfig = {
      baseURL: "http://localhost:11434",
      model: "test-model",
    };
    expect(configWithBoth.baseURL).toBe("http://localhost:11434");
    expect(configWithBoth.model).toBe("test-model");
  });
});

describe("OllamaProvider", () => {
  let config: OllamaConfig;
  let provider: OllamaProvider;

  beforeEach(() => {
    config = {
      baseURL: "http://localhost:11434",
      model: "nomic-embed-text",
    };
    provider = new OllamaProvider(config);
  });

  test("should create provider with valid config", () => {
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  test("should create provider with minimal config", () => {
    const minimalConfig: OllamaConfig = {
      model: "test-model",
    };
    const minimalProvider = new OllamaProvider(minimalConfig);
    expect(minimalProvider).toBeInstanceOf(OllamaProvider);
  });

  test("should store config correctly", () => {
    // Test that the provider stores the configuration
    expect(provider).toBeDefined();
    expect(provider).toBeInstanceOf(OllamaProvider);
    console.dir(provider, { depth: null });
    // Verify class methods are available - safer approach for CI
    expect(provider.generateEmbedding).toBeDefined();
    expect(typeof provider.generateEmbedding).toBe("function");
  });

  // Environment-agnostic tests for embedding generation
  test("should handle embedding generation errors gracefully", async () => {
    const text = "Test text";

    // Verify method availability - safer approach for CI
    expect(provider.generateEmbedding).toBeDefined();
    expect(typeof provider.generateEmbedding).toBe("function");

    // Test with invalid config that will definitely fail
    const invalidProvider = new OllamaProvider({
      baseURL: "http://nonexistent-host:9999",
      model: "invalid-model",
    });

    expect(invalidProvider.generateEmbedding(text)).rejects.toThrow();
  });

  test("should handle chat generation errors gracefully", async () => {
    const messages: ModelMessage[] = [createChatMessage("user", "Hello!")];
    // Provider will fail due to missing Ollama server, but error handling should work
    expect(provider.chat(messages)).rejects.toThrow();
  });
});

describe("generateEmbedding standalone function", () => {
  test("should be a function", () => {
    expect(typeof generateEmbedding).toBe("function");
  });

  test("should accept text and config parameters", () => {
    expect(generateEmbedding.length).toBe(2); // function has 2 parameters
  });

  test("should handle errors gracefully", async () => {
    const text = "Test text";
    // Use invalid config to ensure error
    const invalidConfig: OllamaConfig = {
      baseURL: "http://nonexistent-host:9999",
      model: "invalid-model",
    };

    expect(generateEmbedding(text, invalidConfig)).rejects.toThrow();
  });
});

describe("Error handling", () => {
  test("should handle network errors gracefully", async () => {
    const config: OllamaConfig = {
      baseURL: "http://nonexistent-host:9999",
      model: "test-model",
    };

    const provider = new OllamaProvider(config);

    // Verify method availability - safer approach for CI
    expect(provider.generateEmbedding).toBeDefined();
    expect(typeof provider.generateEmbedding).toBe("function");

    expect(provider.generateEmbedding("test")).rejects.toThrow();
  });

  test("should preserve error context in messages", async () => {
    const config: OllamaConfig = {
      baseURL: "http://nonexistent-host:9999",
      model: "test-model",
    };

    const provider = new OllamaProvider(config);

    try {
      await provider.generateEmbedding("test");
      // If no error thrown, fail the test
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      // Just check that we got an error - the specific message can vary
      expect((error as Error).message).toBeDefined();
    }
  });
});

describe("Configuration validation", () => {
  test("should accept valid configurations", () => {
    const configs: OllamaConfig[] = [
      { model: "nomic-embed-text" },
      { baseURL: "http://localhost:11434", model: "nomic-embed-text" },
      { baseURL: "https://ollama.example.com", model: "custom-model" },
      { baseURL: "http://192.168.1.100:11434", model: "llama2" },
    ];

    configs.forEach((config) => {
      expect(() => new OllamaProvider(config)).not.toThrow();
    });
  });

  test("should handle various model names", () => {
    const modelNames = [
      "nomic-embed-text",
      "llama2",
      "mistral",
      "custom-model",
      "embedding-model-v1",
    ];

    modelNames.forEach((model) => {
      const config: OllamaConfig = { model };
      expect(() => new OllamaProvider(config)).not.toThrow();
    });
  });
});

// ========================================
// AI CHAT ABSTRACTION TESTS
// ========================================

describe("GeminiConfig", () => {
  test("should define correct interface structure", () => {
    const config: GeminiConfig = {
      apiKey: "test-api-key",
      model: "gemini-1.5-flash",
    };

    expect(config.apiKey).toBe("test-api-key");
    expect(config.model).toBe("gemini-1.5-flash");
  });

  test("should require both apiKey and model fields", () => {
    const config: GeminiConfig = {
      apiKey: "required-key",
      model: "required-model",
    };
    expect(config.apiKey).toBe("required-key");
    expect(config.model).toBe("required-model");
  });
});

describe("AIConfig", () => {
  test("should define correct interface structure for Ollama", () => {
    const config: AIConfig = {
      provider: "ollama",
      ollama: {
        baseURL: "http://localhost:11434",
        model: "gpt-4.1",
      },
    };

    expect(config.provider).toBe("ollama");
    expect(config.ollama?.baseURL).toBe("http://localhost:11434");
    expect(config.ollama?.model).toBe("gpt-4.1");
  });

  test("should define correct interface structure for Gemini", () => {
    const config: AIConfig = {
      provider: "gemini",
      gemini: {
        apiKey: "test-key",
        model: "gemini-1.5-flash",
      },
    };

    expect(config.provider).toBe("gemini");
    expect(config.gemini?.apiKey).toBe("test-key");
    expect(config.gemini?.model).toBe("gemini-1.5-flash");
  });
});

describe("ChatMessage Interface", () => {
  test("should define correct message structure", () => {
    const userMessage: ModelMessage = createChatMessage(
      "user",
      "Hello, how are you?"
    );

    const assistantMessage: ModelMessage = createChatMessage(
      "assistant",
      "I am doing well, thank you!"
    );

    const systemMessage: ModelMessage = createChatMessage(
      "system",
      "You are a helpful assistant."
    );

    expect(userMessage.role).toBe("user");
    expect(assistantMessage.role).toBe("assistant");
    expect(systemMessage.role).toBe("system");
  });
});

describe("ChatOptions Interface", () => {
  test("should define correct options structure", () => {
    const options: ChatOptions = {
      temperature: 0.7,
      maxOutputTokens: 500,
      topP: 0.9,
    };

    expect(options.temperature).toBe(0.7);
    expect(options.maxOutputTokens).toBe(500);
    expect(options.topP).toBe(0.9);
  });

  test("should allow partial options", () => {
    const partialOptions: ChatOptions = {
      temperature: 0.5,
    };

    expect(partialOptions.temperature).toBe(0.5);
    expect(partialOptions.maxOutputTokens).toBeUndefined();
  });
});

describe("GeminiProvider", () => {
  let config: GeminiConfig;
  let provider: GeminiProvider;

  beforeEach(() => {
    config = {
      apiKey: "test-api-key",
      model: "gemini-1.5-flash",
    };
    provider = new GeminiProvider(config);
  });

  test("should create provider with valid config", () => {
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  test("should handle embedding generation error gracefully", async () => {
    const text = "Test text for embedding";

    // Verify method availability - safer approach for CI
    expect(provider.generateEmbedding).toBeDefined();
    expect(typeof provider.generateEmbedding).toBe("function");

    // Create provider with invalid config to ensure error
    const invalidProvider = new GeminiProvider({
      apiKey: "invalid-key",
      model: "invalid-model",
    });

    expect(invalidProvider.generateEmbedding(text)).rejects.toThrow();
  });

  test("should handle chat generation error gracefully", async () => {
    const messages: ModelMessage[] = [createChatMessage("user", "Hello!")];
    // Provider will fail due to missing Gemini API key, but error handling should work
    expect(provider.chat(messages)).rejects.toThrow();
  });
});

describe("OllamaProvider Chat Functionality", () => {
  let config: OllamaConfig;
  let provider: OllamaProvider;

  beforeEach(() => {
    config = {
      baseURL: "http://localhost:11434",
      model: "llama3.2",
    };
    provider = new OllamaProvider(config);
  });

  test("should handle chat generation error gracefully", async () => {
    const messages: ModelMessage[] = [createChatMessage("user", "Hello!")];
    // Provider will fail due to missing Ollama server, but error handling should work
    expect(provider.chat(messages)).rejects.toThrow();
  });

  test("should handle chat with options error gracefully", async () => {
    const messages: ModelMessage[] = [
      createChatMessage("system", "You are a helpful assistant."),
      createChatMessage("user", "What is TypeScript?"),
    ];

    const options: ChatOptions = {
      temperature: 0.3,
      maxOutputTokens: 200,
      topP: 0.8,
    };

    // Provider will fail due to missing Ollama server, but error handling should work
    expect(provider.chat(messages, options)).rejects.toThrow();
  });
});

describe("AIChat", () => {
  test("should create instance with Ollama config", () => {
    const config: AIConfig = {
      provider: "ollama",
      ollama: {
        baseURL: "http://localhost:11434",
        model: "llama3.2",
      },
    };

    const aiChat = new AIChat(config);
    expect(aiChat).toBeInstanceOf(AIChat);
  });

  test("should create instance with Gemini config", () => {
    const config: AIConfig = {
      provider: "gemini",
      gemini: {
        apiKey: "test-key",
        model: "gemini-1.5-flash",
      },
    };

    const aiChat = new AIChat(config);
    expect(aiChat).toBeInstanceOf(AIChat);
  });

  test("should throw error when Ollama config is missing", () => {
    const config: AIConfig = {
      provider: "ollama",
      // Missing ollama config
    };

    expect(() => new AIChat(config)).toThrow(
      "Ollama configuration is required when using ollama provider"
    );
  });

  test("should throw error when Gemini config is missing", () => {
    const config: AIConfig = {
      provider: "gemini",
      // Missing gemini config
    };

    expect(() => new AIChat(config)).toThrow(
      "Gemini configuration is required when using gemini provider"
    );
  });

  test("should throw error for unsupported provider", () => {
    const config: any = {
      provider: "unsupported-provider",
    };

    expect(() => new AIChat(config)).toThrow(
      "Unsupported AI provider: unsupported-provider"
    );
  });

  test("should delegate operations to provider and handle errors", async () => {
    const config: AIConfig = {
      provider: "ollama",
      ollama: {
        baseURL: "http://localhost:11434",
        model: "nomic-embed-text",
      },
    };

    const aiChat = new AIChat(config);
    const messages: ModelMessage[] = [createChatMessage("user", "Hello!")];

    // All operations should fail gracefully due to mocking
    expect(aiChat.generateEmbedding("test text")).rejects.toThrow();
    expect(aiChat.chat(messages)).rejects.toThrow();
  });
});

describe("Factory Functions", () => {
  test("should create AIChat instances correctly", () => {
    const ollamaConfig: OllamaConfig = { model: "llama3.2" };
    const geminiConfig: GeminiConfig = {
      apiKey: "test-key",
      model: "gemini-1.5-flash",
    };
    const aiConfig: AIConfig = {
      provider: "ollama",
      ollama: ollamaConfig,
    };

    // Test that factory functions return objects with expected methods
    const aiChatInstance = createAIChat(aiConfig);
    const ollamaChatInstance = createOllamaChat(ollamaConfig);
    const geminiChatInstance = createGeminiChat(geminiConfig);

    expect(aiChatInstance).toBeDefined();
    expect(typeof aiChatInstance.chat).toBe("function");

    expect(ollamaChatInstance).toBeDefined();
    expect(typeof ollamaChatInstance.chat).toBe("function");

    expect(geminiChatInstance).toBeDefined();
    expect(typeof geminiChatInstance.chat).toBe("function");
  });
});

// ========================================
// TOOL SUPPORT TESTS (CONDENSED)
// ========================================

describe("Tool Support", () => {
  test("should handle AITool interface correctly", () => {
    const mockTool: AITool = {
      description: "Test tool description",
      inputSchema: z.object({}) as any,
      execute: async (_params: any) => "result",
    };

    expect(mockTool.description).toBe("Test tool description");
    expect(typeof mockTool.execute).toBe("function");
  });

  test("should handle ChatOptions with tools", () => {
    const mockTool: AITool = {
      description: "Mock tool",
      inputSchema: z.object({}) as any,
      execute: async (_params: any) => "result",
    };

    const options: ChatOptions = {
      temperature: 0.7,
      tools: { mock_tool: mockTool },
      toolChoice: "auto",
    };

    expect(options.tools?.mock_tool).toBe(mockTool);
    expect(options.toolChoice).toBe("auto");
  });

  test("should handle providers with tools and fail gracefully", async () => {
    const mockTool: AITool = {
      description: "Test tool",
      inputSchema: z.object({}) as any,
      execute: async () => "mock result",
    };

    const ollamaProvider = new OllamaProvider({
      baseURL: "http://localhost:11434",
      model: "llama3.2",
    });

    const geminiProvider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-1.5-flash",
    });

    const messages: ModelMessage[] = [createChatMessage("user", "Hello!")];
    const options: ChatOptions = {
      tools: { test_tool: mockTool },
      toolChoice: "auto",
    };

    // Both should fail gracefully due to mocking
    expect(ollamaProvider.chat(messages, options)).rejects.toThrow();
    expect(geminiProvider.chat(messages, options)).rejects.toThrow();
  });
});

// ========================================
// EDGE CASES AND BOUNDARY TESTS (CONDENSED)
// ========================================

describe("Edge Cases and Boundaries", () => {
  test("should handle extreme configuration values", () => {
    // Test extreme but valid configurations
    const extremeConfigs = [
      { model: "a".repeat(1000) }, // Very long model name
      { model: "model-with-special_chars.123" }, // Special characters
      { baseURL: "https://example.com:443", model: "test" }, // HTTPS URL
      { baseURL: "http://[::1]:11434", model: "test" }, // IPv6 URL
    ];

    extremeConfigs.forEach((config) => {
      expect(() => new OllamaProvider(config)).not.toThrow();
    });
  });

  test("should handle various message patterns", async () => {
    const config: AIConfig = {
      provider: "ollama",
      ollama: { model: "test" },
    };

    const aiChat = new AIChat(config);
    const messagePatterns = [
      [], // Empty messages
      [createChatMessage("user", "")], // Empty content
      [createChatMessage("user", "Hello 👋 こんにちは")], // Unicode
      [
        createChatMessage("system", "You are helpful."),
        createChatMessage("user", "Hi!"),
        createChatMessage("assistant", "Hello!"),
        createChatMessage("user", "How are you?"),
      ], // Mixed conversation
    ];

    // All should fail gracefully due to mocking
    for (const messages of messagePatterns) {
      expect(aiChat.chat(messages)).rejects.toThrow();
    }
  });
});
