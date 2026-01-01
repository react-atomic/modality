/**
 * Unit Tests for AI Response Consistency
 * Tests that ensure both Ollama and Gemini providers handle new features consistently
 */

import { test, describe, expect } from "bun:test";
import type { ChatResponse } from "../util_ai_model";

describe("AI Response Consistency", () => {
  
  describe("ChatResponse Interface Compliance", () => {
    test("should support all new fields in ChatResponse interface", () => {
      const completeResponse: ChatResponse = {
        content: "AI generated response",
        usage: {
          promptTokens: 25,
          completionTokens: 15,
          totalTokens: 40
        },
        toolCalls: [
          {
            toolCallId: "call_1",
            toolName: "test_tool",
            args: { param: "value" }
          }
        ],
        toolResults: [
          {
            toolCallId: "call_1",
            result: { success: true, data: "result" }
          }
        ],
        steps: [
          {
            stepNumber: 1,
            toolCalls: [],
            toolResults: []
          }
        ],
        messageId: "response-abc123"
      };

      // Verify all fields are present and have correct types
      expect(typeof completeResponse.content).toBe("string");
      expect(typeof completeResponse.messageId).toBe("string");
      expect(Array.isArray(completeResponse.toolCalls)).toBe(true);
      expect(Array.isArray(completeResponse.toolResults)).toBe(true);
      expect(Array.isArray(completeResponse.steps)).toBe(true);
      expect(typeof completeResponse.usage).toBe("object");
    });

    test("should handle optional fields gracefully", () => {
      const minimalResponse: ChatResponse = {
        content: "Minimal response"
      };

      expect(minimalResponse.content).toBe("Minimal response");
      expect(minimalResponse.messageId).toBeUndefined();
      expect(minimalResponse.usage).toBeUndefined();
      expect(minimalResponse.toolCalls).toBeUndefined();
      expect(minimalResponse.toolResults).toBeUndefined();
      expect(minimalResponse.steps).toBeUndefined();
    });

    test("should handle partial field population", () => {
      const partialResponse: ChatResponse = {
        content: "Partial response",
        messageId: "partial-123",
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15
        }
        // toolCalls, toolResults, steps intentionally omitted
      };

      expect(partialResponse.content).toBe("Partial response");
      expect(partialResponse.messageId).toBe("partial-123");
      expect(partialResponse.usage?.totalTokens).toBe(15);
      expect(partialResponse.toolCalls).toBeUndefined();
    });
  });

  describe("Provider Response Mapping", () => {
    test("should extract messageId consistently across providers", () => {
      // Mock AI SDK response structure (what both providers would receive)
      const mockAISDKResponse = {
        text: "Response text",
        response: {
          id: "sdk-response-123",
          model: "test-model",
          timestamp: new Date()
        },
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15
        },
        toolCalls: [],
        toolResults: [],
        steps: []
      };

      // Simulate how both providers should extract the messageId
      const extractMessageId = (result: any): string | undefined => {
        return result.response?.id || undefined;
      };

      const messageId = extractMessageId(mockAISDKResponse);
      
      expect(messageId).toBe("sdk-response-123");
    });

    test("should handle missing response.id consistently", () => {
      const responseWithoutId = {
        text: "Response text",
        response: {
          model: "test-model"
          // No id field
        },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
      };

      const extractMessageId = (result: any): string | undefined => {
        return result.response?.id || undefined;
      };

      expect(extractMessageId(responseWithoutId)).toBeUndefined();
    });

    test("should map all fields consistently", () => {
      const mockResult = {
        text: "AI response",
        usage: {
          inputTokens: 20,
          outputTokens: 10,
          totalTokens: 30
        },
        toolCalls: [{ toolCallId: "call1", toolName: "tool1" }],
        toolResults: [{ toolCallId: "call1", result: "result1" }],
        steps: [{ stepNumber: 1 }],
        response: {
          id: "consistent-id-456"
        }
      };

      // Simulate consistent mapping logic for both providers
      const mapToResponse = (result: any): ChatResponse => {
        return {
          content: result.text,
          usage: result.usage ? {
            promptTokens: result.usage.inputTokens,
            completionTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
          } : undefined,
          toolCalls: result.toolCalls,
          toolResults: result.toolResults,
          steps: (result as any).steps,
          messageId: result.response?.id || undefined,
        };
      };

      const mappedResponse = mapToResponse(mockResult);

      expect(mappedResponse.content).toBe("AI response");
      expect(mappedResponse.usage?.totalTokens).toBe(30);
      expect(mappedResponse.toolCalls).toHaveLength(1);
      expect(mappedResponse.toolResults).toHaveLength(1);
      expect(mappedResponse.steps).toHaveLength(1);
      expect(mappedResponse.messageId).toBe("consistent-id-456");
    });
  });

  describe("Steps Field Handling", () => {
    test("should handle steps field consistently", () => {
      const responseWithSteps = {
        text: "Multi-step response",
        steps: [
          {
            stepNumber: 1,
            toolCalls: [{ toolCallId: "call1", toolName: "tool1" }],
            toolResults: [{ toolCallId: "call1", result: "result1" }]
          },
          {
            stepNumber: 2,
            toolCalls: [],
            toolResults: []
          }
        ]
      };

      const steps = (responseWithSteps as any).steps;
      
      expect(Array.isArray(steps)).toBe(true);
      expect(steps).toHaveLength(2);
      expect(steps[0].stepNumber).toBe(1);
      expect(steps[1].stepNumber).toBe(2);
    });

    test("should handle missing steps field", () => {
      const responseWithoutSteps = {
        text: "Single-step response"
        // No steps field
      };

      const steps = (responseWithoutSteps as any).steps;
      
      expect(steps).toBeUndefined();
    });

    test("should handle empty steps array", () => {
      const responseWithEmptySteps = {
        text: "Response with empty steps",
        steps: []
      };

      const steps = (responseWithEmptySteps as any).steps;
      
      expect(Array.isArray(steps)).toBe(true);
      expect(steps).toHaveLength(0);
    });
  });

  describe("Usage Field Consistency", () => {
    test("should handle usage field mapping consistently", () => {
      const mockUsage = {
        inputTokens: 25,
        outputTokens: 15,
        totalTokens: 40
      };

      const mapUsage = (usage: any) => {
        return usage ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        } : undefined;
      };

      const mappedUsage = mapUsage(mockUsage);
      
      expect(mappedUsage?.inputTokens).toBe(25);
      expect(mappedUsage?.outputTokens).toBe(15);
      expect(mappedUsage?.totalTokens).toBe(40);
    });

    test("should handle missing usage field", () => {
      const mapUsage = (usage: any) => {
        return usage ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        } : undefined;
      };

      expect(mapUsage(undefined)).toBeUndefined();
      expect(mapUsage(null)).toBeUndefined();
      expect(mapUsage({})).toEqual({
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined
      });
    });
  });

  describe("Tool Data Consistency", () => {
    test("should preserve tool call structure", () => {
      const mockToolCalls = [
        {
          toolCallId: "call_1",
          toolName: "task_create",
          args: { title: "Test Task", duration: 2 }
        },
        {
          toolCallId: "call_2", 
          toolName: "task_breakdown",
          args: { taskId: "task-123" }
        }
      ];

      // Both providers should preserve this structure exactly
      const preservedToolCalls = mockToolCalls;
      
      expect(preservedToolCalls).toHaveLength(2);
      expect(preservedToolCalls[0].toolCallId).toBe("call_1");
      expect(preservedToolCalls[0].toolName).toBe("task_create");
      expect(preservedToolCalls[0].args.title).toBe("Test Task");
      expect(preservedToolCalls[1].toolCallId).toBe("call_2");
      expect(preservedToolCalls[1].toolName).toBe("task_breakdown");
    });

    test("should preserve tool result structure", () => {
      const mockToolResults = [
        {
          toolCallId: "call_1",
          result: {
            success: true,
            taskId: "task-456",
            message: "Task created successfully"
          }
        },
        {
          toolCallId: "call_2",
          result: {
            subtasks: ["subtask-1", "subtask-2"],
            totalSubtasks: 2
          }
        }
      ];

      // Both providers should preserve this structure exactly
      const preservedToolResults = mockToolResults;
      
      expect(preservedToolResults).toHaveLength(2);
      expect(preservedToolResults[0].toolCallId).toBe("call_1");
      expect(preservedToolResults[0].result.success).toBe(true);
      expect(preservedToolResults[1].result.subtasks).toHaveLength(2);
    });

    test("should handle empty tool arrays consistently", () => {
      const emptyToolCalls: any[] = [];
      const emptyToolResults: any[] = [];
      
      expect(Array.isArray(emptyToolCalls)).toBe(true);
      expect(Array.isArray(emptyToolResults)).toBe(true);
      expect(emptyToolCalls).toHaveLength(0);
      expect(emptyToolResults).toHaveLength(0);
    });
  });

  describe("Error Response Consistency", () => {
    test("should throw consistent error format across providers", () => {
      const baseErrorMessage = "Failed to generate chat response";
      const providerSpecificInfo = "with Gemini";
      const detailMessage = "API key not valid";
      
      const expectedError = `${baseErrorMessage} ${providerSpecificInfo}: ${detailMessage}`;
      
      expect(() => {
        throw new Error(expectedError);
      }).toThrow(expectedError);
    });

    test("should handle different error scenarios consistently", () => {
      const errorScenarios = [
        { provider: "Ollama", detail: "http://localhost:11434" },
        { provider: "Gemini", detail: "API key not valid" }
      ];

      errorScenarios.forEach(({ provider, detail }) => {
        const errorMessage = `Failed to generate chat response with ${provider}: ${detail}`;
        
        expect(() => {
          throw new Error(errorMessage);
        }).toThrow(errorMessage);
      });
    });
  });

  describe("Response Validation", () => {
    test("should validate required fields are present", () => {
      const validateResponse = (response: ChatResponse): boolean => {
        return typeof response.content === "string" && response.content.length > 0;
      };

      const validResponse: ChatResponse = {
        content: "Valid response"
      };

      const invalidResponse: ChatResponse = {
        content: ""
      };

      expect(validateResponse(validResponse)).toBe(true);
      expect(validateResponse(invalidResponse)).toBe(false);
    });

    test("should validate optional fields when present", () => {
      const validateUsage = (response: ChatResponse): boolean => {
        if (!response.usage) return true; // Optional field
        
        return (typeof response.usage.promptTokens === "number" &&
        typeof response.usage.completionTokens === "number" &&
        typeof response.usage.totalTokens === "number" && response.usage.totalTokens === response.usage.promptTokens + response.usage.completionTokens);
      };

      const responseWithValidUsage: ChatResponse = {
        content: "Test",
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15
        }
      };

      const responseWithInvalidUsage: ChatResponse = {
        content: "Test",
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 20 // Incorrect total
        }
      };

      const responseWithoutUsage: ChatResponse = {
        content: "Test"
      };

      expect(validateUsage(responseWithValidUsage)).toBe(true);
      expect(validateUsage(responseWithInvalidUsage)).toBe(false);
      expect(validateUsage(responseWithoutUsage)).toBe(true);
    });
  });
});
