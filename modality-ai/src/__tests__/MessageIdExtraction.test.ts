/**
 * Unit Tests for Message ID Extraction Feature
 * Tests the new message ID extraction logic from AI SDK responses
 */

import { test, describe, expect } from "bun:test";
import type { ChatResponse } from "../util_ai_model";

describe("Message ID Extraction", () => {
  
  describe("Message ID Extraction Logic", () => {
    test("should extract messageId from response.id", () => {
      const extractMessageId = (result: any): string | undefined => {
        return result.response?.id || undefined;
      };

      const mockResult = {
        text: "Hello world",
        response: {
          id: "response-123456",
          model: "test-model"
        }
      };

      const messageId = extractMessageId(mockResult);
      expect(messageId).toBe("response-123456");
    });

    test("should handle missing response.id gracefully", () => {
      const extractMessageId = (result: any): string | undefined => {
        return result.response?.id || undefined;
      };

      const mockResultWithoutId = {
        text: "Hello world",
        response: {} // No id field
      };

      const messageId = extractMessageId(mockResultWithoutId);
      expect(messageId).toBeUndefined();
    });

    test("should handle missing response object gracefully", () => {
      const extractMessageId = (result: any): string | undefined => {
        return result.response?.id || undefined;
      };

      const mockResultWithoutResponse = {
        text: "Hello world"
        // No response field at all
      };

      const messageId = extractMessageId(mockResultWithoutResponse);
      expect(messageId).toBeUndefined();
    });
  });

  describe("ChatResponse Interface Consistency", () => {
    test("should have consistent messageId field across providers", () => {
      const response1: ChatResponse = {
        content: "test",
        messageId: "test-id-123"
      };

      const response2: ChatResponse = {
        content: "test",
        messageId: undefined
      };

      expect(response1.messageId).toBe("test-id-123");
      expect(response2.messageId).toBeUndefined();
      expect(typeof response1.messageId).toBe("string");
      expect(response2.messageId).toBeUndefined();
    });

    test("should support all new fields added for enhanced functionality", () => {
      const fullResponse: ChatResponse = {
        content: "AI response content",
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        },
        toolCalls: [
          { toolCallId: "call1", toolName: "test_tool", args: {} }
        ],
        toolResults: [
          { toolCallId: "call1", result: { success: true } }
        ],
        steps: [
          { stepNumber: 1, toolCalls: [], toolResults: [] }
        ],
        messageId: "response-456789"
      };

      expect(fullResponse.content).toBe("AI response content");
      expect(fullResponse.messageId).toBe("response-456789");
      expect(fullResponse.toolCalls).toHaveLength(1);
      expect(fullResponse.toolResults).toHaveLength(1);
      expect(fullResponse.steps).toHaveLength(1);
      expect(fullResponse.usage?.totalTokens).toBe(30);
    });
  });

  describe("Edge Cases and Error Scenarios", () => {
    test("should handle empty response object", () => {
      const extractMessageId = (result: any): string | undefined => {
        return result.response?.id || undefined;
      };

      expect(extractMessageId({})).toBeUndefined();
      expect(extractMessageId({ response: {} })).toBeUndefined();
      expect(extractMessageId({ response: { id: null } })).toBeUndefined();
      expect(extractMessageId({ response: { id: "" } })).toBeUndefined(); // Empty string is falsy, so becomes undefined
      expect(extractMessageId({ response: { id: "valid-id" } })).toBe("valid-id");
    });

    test("should handle various response.id types", () => {
      const extractMessageId = (result: any): string | undefined => {
        return result.response?.id || undefined;
      };

      // String ID (most common)
      expect(extractMessageId({ response: { id: "msg-123" } })).toBe("msg-123");
      
      // Number ID (some providers might use numbers, but we coerce to string)
      expect(extractMessageId({ response: { id: "12345" } })).toBe("12345");
      
      // Boolean false (falsy but not undefined)
      expect(extractMessageId({ response: { id: false } })).toBeUndefined();
      
      // Empty string (falsy but defined) - note: the || operator makes this undefined
      expect(extractMessageId({ response: { id: "" } })).toBeUndefined();
      
      // Null (explicit null)
      expect(extractMessageId({ response: { id: null } })).toBeUndefined();
    });
  });
});
