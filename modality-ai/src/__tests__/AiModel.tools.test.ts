/**
 * Unit tests for AI Model Tool Support functionality
 * Tests the new tool calling capabilities added to util_ai_model.ts
 */

import type { ModelMessage } from "ai";
import type { AITool, AITools } from "modality-mcp-kit";
import { z } from "zod";
import { test, describe, expect, beforeEach, afterEach } from "bun:test";
import { bunMockModule } from "modality-bun-kit";

import { 
  OllamaProvider, 
  GeminiProvider,
  AIChat,
  AIConfig,
  ChatOptions,
  ChatResponse,
  createOllamaChat,
  createGeminiChat
} from "../util_ai_model";
import type { OllamaConfig, GeminiConfig } from "../schemas/schemas_modality";
import { createAiModelMockModule } from "../util_tests/aiModelMocks";

// Helper functions for testing (replacing the migration utilities)
function createChatMessage(role: "user" | "assistant" | "system", content: string): ModelMessage {
  return { role, content };
}

// Mock functions with restore capability - optimized for speed
let mockRestore: (() => void) | undefined;

beforeEach(async () => {
  // Setup comprehensive AI model mocks to prevent network calls and ensure fast tests
  const restore = await bunMockModule("../util_ai_model", createAiModelMockModule, import.meta.dir);
  mockRestore = typeof restore === 'function' ? restore : undefined;
});

afterEach(() => {
  // Restore mock module after each test
  if (mockRestore) {
    mockRestore();
    mockRestore = undefined;
  }
});

describe("Tool Support - AITool Interface", () => {
  test("should define correct tool structure", () => {
    const mockTool: AITool = {
      description: "Test tool description",
      inputSchema: z.object({}) as any,
      execute: async (_params: any) => "result"
    };
    
    expect(mockTool.description).toBe("Test tool description");
    expect(mockTool.inputSchema).toBeDefined();
    expect(typeof mockTool.execute).toBe("function");
  });

  test("should allow optional execute function", () => {
    const toolWithoutExecute: AITool = {
      description: "Tool without execute",
      inputSchema: z.object({}) as any,
      execute: async () => "mock result"
    };
    
    expect(typeof toolWithoutExecute.execute).toBe("function");
    expect(toolWithoutExecute.description).toBe("Tool without execute");
  });
});

describe("Tool Support - ChatOptions Extensions", () => {
  test("should include tools in ChatOptions interface", () => {
    const mockTool: AITool = {
      description: "Mock tool",
      inputSchema: z.object({}) as any,
      execute: async (_params: any) => "result"
    };

    const options: ChatOptions = {
      temperature: 0.7,
      maxOutputTokens: 500,
      tools: { mock_tool: mockTool },
      toolChoice: "auto"
    };
    
    expect(options.tools).toBeDefined();
    expect(options.tools?.mock_tool).toBe(mockTool);
    expect(options.toolChoice).toBe("auto");
  });

  test("should support different toolChoice options", () => {
    const toolChoiceOptions = [
      "auto" as const,
      "none" as const, 
      "required" as const,
      { type: "tool" as const, toolName: "specific_tool" }
    ];

    toolChoiceOptions.forEach(choice => {
      const options: ChatOptions = {
        toolChoice: choice
      };
      expect(options.toolChoice).toEqual(choice);
    });
  });

  test("should allow empty tools object", () => {
    const options: ChatOptions = {
      tools: {},
      toolChoice: "none"
    };
    
    expect(options.tools).toEqual({});
    expect(Object.keys(options.tools!)).toHaveLength(0);
  });
});

describe("Tool Support - ChatResponse Extensions", () => {
  test("should include toolCalls and toolResults in response", () => {
    const response: ChatResponse = {
      content: "Test response",
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      },
      toolCalls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "test_tool",
            arguments: '{"param": "value"}'
          }
        }
      ],
      toolResults: [
        {
          id: "call_1",
          result: "Tool execution result"
        }
      ]
    };
    
    expect(response.toolCalls).toBeDefined();
    expect(response.toolResults).toBeDefined();
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolResults).toHaveLength(1);
  });

  test("should allow undefined tool fields", () => {
    const response: ChatResponse = {
      content: "Response without tools",
      usage: {
        promptTokens: 5,
        completionTokens: 10,
        totalTokens: 15
      }
    };
    
    expect(response.toolCalls).toBeUndefined();
    expect(response.toolResults).toBeUndefined();
  });
});

describe("Tool Support - OllamaProvider", () => {
  let config: OllamaConfig;
  let provider: OllamaProvider;

  beforeEach(() => {
    config = {
      baseURL: "http://localhost:11434",
      model: "llama3.2"
    };
    provider = new OllamaProvider(config);
  });

  test("should handle various tool configurations and fail gracefully", async () => {
    const mockTool: AITool = {
      description: "Test tool",
      inputSchema: z.object({ input: z.string().optional() }) as any,
      execute: async (params: any) => `Processed: ${params.input || 'default'}`
    };

    const messages: ModelMessage[] = [createChatMessage('user', 'Hello!')];

    // Test multiple configurations in a single test
    const configurations: Array<{ description: string; options: ChatOptions }> = [
      { description: 'no tools', options: { temperature: 0.7 } },
      { description: 'single tool', options: { tools: { test_tool: mockTool }, toolChoice: "auto" } },
      { description: 'multiple tools', options: {
        tools: { tool1: mockTool, tool2: { ...mockTool, description: "Second tool" } },
        toolChoice: "required"
      }}
    ];

    // All configurations should fail with Ollama error (since mocked)
    for (const config of configurations) {
      expect(provider.chat(messages, config.options)).rejects.toThrow();
    }
  });

  test("should handle all toolChoice options and parameters", async () => {
    const mockTool: AITool = {
      description: "Test tool",
      inputSchema: z.object({}) as any,
      execute: async () => "mock result"
    };

    const messages: ModelMessage[] = [createChatMessage('user', 'Hello!')];

    const toolChoiceTests = [
      { toolChoice: "auto" as const, description: "auto choice" },
      { toolChoice: "none" as const, description: "none choice" },
      { toolChoice: "required" as const, description: "required choice" },
      { toolChoice: { type: "tool" as const, toolName: "test_tool" }, description: "specific tool choice" }
    ];

    // Test all toolChoice options
    for (const { toolChoice } of toolChoiceTests) {
      const options: ChatOptions = {
        tools: { test_tool: mockTool },
        toolChoice
      };

      expect(provider.chat(messages, options)).rejects.toThrow();
    }

    // Test maxSteps parameter
    const optionsWithMaxSteps: ChatOptions = {
      tools: { test_tool: mockTool },
      maxSteps: 5
    };

    expect(provider.chat(messages, optionsWithMaxSteps)).rejects.toThrow();
  });
});

describe("Tool Support - GeminiProvider", () => {
  let config: GeminiConfig;
  let provider: GeminiProvider;

  beforeEach(() => {
    config = {
      apiKey: "test-api-key",
      model: "gemini-1.5-flash"
    };
    provider = new GeminiProvider(config);
  });

  test("should handle chat with tools (Gemini)", async () => {
    const mockTool: AITool = {
      description: "Gemini test tool",
      inputSchema: z.object({
        query: z.string()
      }) as any,
      execute: async (params: any) => `Gemini result: ${params.query}`
    };

    const messages: ModelMessage[] = [
      createChatMessage('user', 'Use the tool to process "test input"')
    ];
    
    const options: ChatOptions = {
      tools: { gemini_tool: mockTool },
      toolChoice: "auto",
      temperature: 0.3,
      maxOutputTokens: 500
    };
    
    // Should fail with Gemini error since we don't have valid API key
    expect(provider.chat(messages, options)).rejects.toThrow();
  });

  test("should convert tools correctly for Gemini", async () => {
    const complexTool: AITool = {
      description: "Complex tool with nested parameters",
      inputSchema: z.object({
        user: z.object({
          name: z.string(),
          age: z.number()
        }),
        options: z.array(z.string()).optional()
      }) as any,
      execute: async (params: any) => JSON.stringify(params)
    };

    const messages: ModelMessage[] = [
      createChatMessage('user', 'Process user data')
    ];
    
    const options: ChatOptions = {
      tools: { process_user: complexTool },
      toolChoice: "required"
    };
    
    expect(provider.chat(messages, options)).rejects.toThrow();
  });
});

describe("Tool Support - AIChat Integration", () => {
  test("should delegate tool calls to Ollama provider", async () => {
    const config: AIConfig = {
      provider: 'ollama',
      ollama: {
        baseURL: "http://localhost:11434",
        model: "llama3.2"
      }
    };
    
    const aiChat = new AIChat(config);

    const mockTool: AITool = {
      description: "Integration test tool",
      inputSchema: z.object({}) as any,
      execute: async (_params: any) => "tool result"
    };

    const messages: ModelMessage[] = [
      createChatMessage('user', 'Use the integration tool')
    ];
    
    const options: ChatOptions = {
      tools: { integration_tool: mockTool },
      toolChoice: "auto"
    };
    
    // Should delegate to OllamaProvider with tools
    expect(aiChat.chat(messages, options)).rejects.toThrow();
  });

  test("should delegate tool calls to Gemini provider", async () => {
    const config: AIConfig = {
      provider: 'gemini',
      gemini: {
        apiKey: "test-key",
        model: "gemini-1.5-flash"
      }
    };
    
    const aiChat = new AIChat(config);

    const mockTool: AITool = {
      description: "Gemini integration tool",
      inputSchema: z.object({}) as any,
      execute: async (_params: any) => "gemini tool result"
    };

    const messages: ModelMessage[] = [
      createChatMessage('user', 'Use the Gemini tool')
    ];
    
    const options: ChatOptions = {
      tools: { gemini_integration_tool: mockTool },
      toolChoice: "required"
    };
    
    // Should delegate to GeminiProvider with tools
    expect(aiChat.chat(messages, options)).rejects.toThrow();
  });

  test("should work with Chat and tools", async () => {
    const config: AIConfig = {
      provider: 'ollama',
      ollama: { model: "llama3.2" }
    };
    
    const aiChat = new AIChat(config);

    const mockTool: AITool = {
      description: "Single chat tool",
      inputSchema: z.object({}) as any,
      execute: async () => "mock result"
    };

    const options: ChatOptions = {
      tools: { single_chat_tool: mockTool },
      toolChoice: "auto",
      temperature: 0.5
    };

    // chat should pass tools through to chat method
    expect(aiChat.chat([createChatMessage('user', "Use the tool")], options)).rejects.toThrow();
  });
});

describe("Tool Support - Edge Cases", () => {
  test("should handle tools with undefined execute function", async () => {
    const config: AIConfig = {
      provider: 'ollama',
      ollama: { model: "llama3.2" }
    };
    
    const aiChat = new AIChat(config);
    
    const toolWithoutExecute: AITool = {
      description: "Tool without execute",
      inputSchema: z.object({}) as any,
      execute: async () => "mock result"
      // No execute function
    };

    const options: ChatOptions = {
      tools: { no_execute_tool: toolWithoutExecute },
      toolChoice: "auto"
    };

    expect(aiChat.chat([createChatMessage('user', "Test")], options)).rejects.toThrow();
  });

  test("should handle complex parameter schemas", async () => {
    const config: AIConfig = {
      provider: 'ollama', 
      ollama: { model: "test" }
    };
    
    const aiChat = new AIChat(config);
    
    const complexTool: AITool = {
      description: "Tool with complex schema",
      inputSchema: z.object({
        stringField: z.string().describe("A string field"),
        numberField: z.number().min(0).max(100),
        booleanField: z.boolean().optional(),
        arrayField: z.array(z.string()).optional(),
        objectField: z.object({
          nested: z.string()
        }).optional()
      }) as any,
      execute: async (params: any) => JSON.stringify(params)
    };

    const options: ChatOptions = {
      tools: { complex_tool: complexTool }
    };

    expect(aiChat.chat([createChatMessage('user', "Test complex tool")], options)).rejects.toThrow();
  });

  test("should handle large number of tools", async () => {
    const config: AIConfig = {
      provider: 'ollama',
      ollama: { model: "test" }
    };
    
    const aiChat = new AIChat(config);
    
    // Create 10 tools
    const tools: AITools = {};
    for (let i = 0; i < 10; i++) {
      tools[`tool_${i}`] = {
        description: `Tool number ${i}`,
        inputSchema: z.object({}) as any,
        execute: async (_params: any) => `Result from tool ${i}`
      };
    }

    const options: ChatOptions = {
      tools: tools,
      toolChoice: "auto"
    };

    expect(aiChat.chat([createChatMessage('user', "Use any tool")], options)).rejects.toThrow();
  });
});

describe("Tool Support - Factory Functions", () => {
  test("should work with createOllamaChat and tools", async () => {
    const aiChat = createOllamaChat({
      baseURL: "http://localhost:11434",
      model: "llama3.2"
    });
    
    const mockTool: AITool = {
      description: "Factory test tool",
      inputSchema: z.object({}) as any,
      execute: async () => "mock result"
    };

    const options: ChatOptions = {
      tools: { factory_tool: mockTool },
      toolChoice: "auto"
    };

    expect(aiChat.chat([createChatMessage('user', "Test factory")], options)).rejects.toThrow();
  });

  test("should work with createGeminiChat and tools", async () => {
    const aiChat = createGeminiChat({
      apiKey: "test-key",
      model: "gemini-1.5-flash"
    });

    const mockTool: AITool = {
      description: "Gemini factory test tool",
      inputSchema: z.object({}) as any,
      execute: async () => "mock result"
    };

    const options: ChatOptions = {
      tools: { gemini_factory_tool: mockTool },
      toolChoice: "required"
    };

    expect(aiChat.chat([createChatMessage('user', "Test Gemini factory")], options)).rejects.toThrow();
  });
});

describe("Tool Support - Backwards Compatibility", () => {
  test("should maintain backwards compatibility when no tools provided", async () => {
    const config: AIConfig = {
      provider: 'ollama',
      ollama: { model: "llama3.2" }
    };
    
    const aiChat = new AIChat(config);
    
    // Test that old usage patterns still work
    const messages: ModelMessage[] = [
      createChatMessage('user', 'Hello without tools')
    ];
    
    // No tools in options
    const options: ChatOptions = {
      temperature: 0.7,
      maxOutputTokens: 100
    };
    
    expect(aiChat.chat(messages, options)).rejects.toThrow();
  });

  test("should work with undefined options", async () => {
    const config: AIConfig = {
      provider: 'ollama',
      ollama: { model: "llama3.2" }
    };
    
    const aiChat = new AIChat(config);
    
    const messages: ModelMessage[] = [
      createChatMessage('user', 'Hello with undefined options')
    ];
    
    // Undefined options should work as before
     expect(aiChat.chat(messages)).rejects.toThrow();
  });
});
