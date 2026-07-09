/**
 * Unit tests for Ollama V2 Adapter
 *
 * Tests the pure functions exported from src/provider/ollama-v2-adapter.ts.
 * All tests import from the real source — no re-implementations.
 */

import { describe, test, expect } from "bun:test";
import type { LanguageModelV4FinishReason } from "@ai-sdk/provider";

import {
  normalizeBaseURL,
  toBase64,
  mapFinishReason,
  mapUsage,
  convertToOllamaMessages,
  buildChatRequest,
} from "../provider/ollama-v2-adapter";
import type { OllamaChatResponse } from "../provider/ollama-v2-adapter";

// ================================================================
// normalizeBaseURL
// ================================================================
describe("normalizeBaseURL", () => {
  test("returns default URL when no baseURL given", () => {
    expect(normalizeBaseURL()).toBe("http://localhost:11434/api");
  });

  test("appends /api when baseURL does not end with /api", () => {
    expect(normalizeBaseURL("http://localhost:11434")).toBe(
      "http://localhost:11434/api"
    );
  });

  test("strips trailing slash and appends /api", () => {
    expect(normalizeBaseURL("http://localhost:11434/")).toBe(
      "http://localhost:11434/api"
    );
  });

  test("preserves baseURL that already ends with /api", () => {
    expect(normalizeBaseURL("http://localhost:11434/api")).toBe(
      "http://localhost:11434/api"
    );
  });

  test("strips trailing slash when URL ends with /api/", () => {
    expect(normalizeBaseURL("http://localhost:11434/api/")).toBe(
      "http://localhost:11434/api"
    );
  });

  test("handles custom host and port", () => {
    expect(normalizeBaseURL("http://192.168.1.100:11434")).toBe(
      "http://192.168.1.100:11434/api"
    );
  });

  test("handles HTTPS URLs", () => {
    expect(normalizeBaseURL("https://ollama.example.com")).toBe(
      "https://ollama.example.com/api"
    );
  });
});

// ================================================================
// toBase64
// ================================================================
describe("toBase64", () => {
  test("converts Uint8Array to base64 string", () => {
    const input = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const result = toBase64(input);
    expect(result).toBe(Buffer.from(input).toString("base64"));
    expect(result).toBe("SGVsbG8=");
  });

  test("extracts base64 payload from data URL string", () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    expect(toBase64(dataUrl)).toBe("iVBORw0KGgoAAAANSUhEUg==");
  });

  test("returns plain string as-is (already base64)", () => {
    const alreadyBase64 = "iVBORw0KGgoAAAANSUhEUg==";
    expect(toBase64(alreadyBase64)).toBe(alreadyBase64);
  });

  test("handles URL object", () => {
    const url = new URL("http://example.com/image.png");
    expect(toBase64(url)).toBe("http://example.com/image.png");
  });

  test("handles empty Uint8Array", () => {
    const input = new Uint8Array([]);
    expect(toBase64(input)).toBe("");
  });

  test("returns empty string for empty input", () => {
    expect(toBase64("")).toBe("");
  });
});

// ================================================================
// mapFinishReason
// ================================================================
describe("mapFinishReason", () => {
  test('maps "stop" to unified stop', () => {
    const result = mapFinishReason("stop");
    expect(result).toEqual<LanguageModelV4FinishReason>({
      unified: "stop",
      raw: "stop",
    });
  });

  test("maps undefined to unified stop", () => {
    const result = mapFinishReason(undefined);
    expect(result).toEqual<LanguageModelV4FinishReason>({
      unified: "stop",
      raw: undefined,
    });
  });

  test('maps "length" to unified length', () => {
    const result = mapFinishReason("length");
    expect(result).toEqual<LanguageModelV4FinishReason>({
      unified: "length",
      raw: "length",
    });
  });

  test('maps unknown reasons to unified "other"', () => {
    const result = mapFinishReason("tool-calls");
    expect(result).toEqual<LanguageModelV4FinishReason>({
      unified: "other",
      raw: "tool-calls",
    });
  });

  test('maps custom reason to unified "other"', () => {
    const result = mapFinishReason("some-custom-reason");
    expect(result).toEqual<LanguageModelV4FinishReason>({
      unified: "other",
      raw: "some-custom-reason",
    });
  });

  test('maps empty string to unified "other"', () => {
    const result = mapFinishReason("");
    expect(result).toEqual<LanguageModelV4FinishReason>({
      unified: "other",
      raw: "",
    });
  });
});

// ================================================================
// mapUsage
// ================================================================
describe("mapUsage", () => {
  test("maps prompt_eval_count and eval_count correctly", () => {
    const response: OllamaChatResponse = {
      prompt_eval_count: 42,
      eval_count: 7,
    };
    const result = mapUsage(response);
    expect(result.inputTokens.total).toBe(42);
    expect(result.inputTokens.noCache).toBe(42);
    expect(result.inputTokens.cacheRead).toBeUndefined();
    expect(result.inputTokens.cacheWrite).toBeUndefined();
    expect(result.outputTokens.total).toBe(7);
    expect(result.outputTokens.text).toBe(7);
    expect(result.outputTokens.reasoning).toBeUndefined();
  });

  test("handles undefined counts", () => {
    const response: OllamaChatResponse = {};
    const result = mapUsage(response);
    expect(result.inputTokens.total).toBeUndefined();
    expect(result.inputTokens.noCache).toBeUndefined();
    expect(result.outputTokens.total).toBeUndefined();
    expect(result.outputTokens.text).toBeUndefined();
  });

  test("handles zero counts", () => {
    const response: OllamaChatResponse = {
      prompt_eval_count: 0,
      eval_count: 0,
    };
    const result = mapUsage(response);
    expect(result.inputTokens.total).toBe(0);
    expect(result.outputTokens.total).toBe(0);
  });

  test("preserves raw values from response", () => {
    const response: OllamaChatResponse = {
      prompt_eval_count: 100,
      eval_count: 50,
    };
    const result = mapUsage(response);
    expect(result.inputTokens.total).toBe(100);
    expect(result.outputTokens.total).toBe(50);
  });
});

// ================================================================
// convertToOllamaMessages
// ================================================================
describe("convertToOllamaMessages", () => {
  test("converts a system message", () => {
    const prompt = [{ role: "system" as const, content: "You are a helpful assistant." }];
    const { messages, warnings } = convertToOllamaMessages(prompt);
    expect(warnings).toEqual([]);
    expect(messages).toEqual([
      { role: "system", content: "You are a helpful assistant." },
    ]);
  });

  test("converts user text message", () => {
    const prompt = [
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: "Hello!" }],
      },
    ];
    const { messages, warnings } = convertToOllamaMessages(prompt);
    expect(warnings).toEqual([]);
    expect(messages).toEqual([{ role: "user", content: "Hello!" }]);
  });

  test("converts user message with multiple text parts", () => {
    const prompt = [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: "Part 1" },
          { type: "text" as const, text: "Part 2" },
        ],
      },
    ];
    const { messages, warnings } = convertToOllamaMessages(prompt);
    expect(warnings).toEqual([]);
    expect(messages).toEqual([{ role: "user", content: "Part 1Part 2" }]);
  });

  test("converts user message with image data URL", () => {
    const base64Image = "iVBORw0KGgoAAAANSUhEUg==";
    const prompt = [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: "What is this?" },
          {
            type: "file" as const,
            mediaType: "image/png",
            data: {
              type: "data" as const,
              data: `data:image/png;base64,${base64Image}`,
            },
          },
        ],
      },
    ];
    const { messages, warnings } = convertToOllamaMessages(prompt);
    expect(warnings).toEqual([]);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("What is this?");
    expect(messages[0].images).toEqual([base64Image]);
  });

  test("warns on unsupported file parts", () => {
    const prompt = [
      {
        role: "user" as const,
        content: [
          {
            type: "file" as const,
            mediaType: "application/pdf",
            data: { type: "data" as const, data: new Uint8Array([1, 2, 3]) },
          },
        ],
      },
    ];
    const { messages, warnings } = convertToOllamaMessages(prompt);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("unsupported");
    if (warnings[0].type === "unsupported") {
      expect(warnings[0].feature).toContain("application/pdf");
    }
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].images).toBeUndefined();
  });

  test("converts assistant text message", () => {
    const prompt = [
      {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Sure, I can help!" }],
      },
    ];
    const { messages, warnings } = convertToOllamaMessages(prompt);
    expect(warnings).toEqual([]);
    expect(messages).toEqual([
      { role: "assistant", content: "Sure, I can help!" },
    ]);
  });

  test("converts assistant message with tool calls", () => {
    const prompt = [
      {
        role: "assistant" as const,
        content: [
          { type: "text" as const, text: "Let me look that up" },
          {
            type: "tool-call" as const,
            toolCallId: "call-1",
            toolName: "get_weather",
            input: '{"city":"London"}',
          },
        ],
      },
    ];
    const { messages, warnings } = convertToOllamaMessages(prompt);
    expect(warnings).toEqual([]);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content).toBe("Let me look that up");
    expect(messages[0].tool_calls).toEqual([
      {
        function: { name: "get_weather", arguments: { city: "London" } },
      },
    ]);
  });

  test("parses string tool input as JSON", () => {
    const prompt = [
      {
        role: "assistant" as const,
        content: [
          {
            type: "tool-call" as const,
            toolCallId: "call-1",
            toolName: "add",
            input: '{"a":1,"b":2}',
          },
        ],
      },
    ];
    const { messages, warnings } = convertToOllamaMessages(prompt);
    expect(messages[0].tool_calls![0].function.arguments).toEqual({
      a: 1,
      b: 2,
    });
  });

  test("handles empty string tool input", () => {
    const prompt = [
      {
        role: "assistant" as const,
        content: [
          {
            type: "tool-call" as const,
            toolCallId: "call-1",
            toolName: "noop",
            input: "",
          },
        ],
      },
    ];
    const { messages } = convertToOllamaMessages(prompt);
    expect(messages[0].tool_calls![0].function.arguments).toEqual({});
  });

  test("passes object tool input through directly", () => {
    const prompt = [
      {
        role: "assistant" as const,
        content: [
          {
            type: "tool-call" as const,
            toolCallId: "call-1",
            toolName: "calculate",
            input: { a: 1, b: 2 },
          },
        ],
      },
    ];
    const { messages } = convertToOllamaMessages(prompt);
    expect(messages[0].tool_calls![0].function.arguments).toEqual({
      a: 1,
      b: 2,
    });
  });

  test("converts tool result with text output", () => {
    const prompt = [
      {
        role: "tool" as const,
        content: [
          {
            type: "tool-result" as const,
            toolCallId: "call-1",
            toolName: "get_weather",
            output: { type: "text" as const, value: "Sunny, 22°C" },
          },
        ],
      },
    ];
    const { messages } = convertToOllamaMessages(prompt);
    expect(messages).toEqual([
      { role: "tool", content: "Sunny, 22°C" },
    ]);
  });

  test("converts tool result with error-text output", () => {
    const prompt = [
      {
        role: "tool" as const,
        content: [
          {
            type: "tool-result" as const,
            toolCallId: "call-2",
            toolName: "search",
            output: {
              type: "error-text" as const,
              value: "API rate limit exceeded",
            },
          },
        ],
      },
    ];
    const { messages } = convertToOllamaMessages(prompt);
    expect(messages).toEqual([
      { role: "tool", content: "API rate limit exceeded" },
    ]);
  });

  test("converts tool result with execution-denied output", () => {
    const prompt = [
      {
        role: "tool" as const,
        content: [
          {
            type: "tool-result" as const,
            toolCallId: "call-3",
            toolName: "dangerous_tool",
            output: {
              type: "execution-denied" as const,
              reason: "User denied access",
            },
          },
        ],
      },
    ];
    const { messages } = convertToOllamaMessages(prompt);
    expect(messages).toEqual([
      { role: "tool", content: "User denied access" },
    ]);
  });

  test("handles execution-denied without reason", () => {
    const prompt = [
      {
        role: "tool" as const,
        content: [
          {
            type: "tool-result" as const,
            toolCallId: "call-4",
            toolName: "dangerous_tool",
            output: { type: "execution-denied" as const },
          },
        ],
      },
    ];
    const { messages } = convertToOllamaMessages(prompt);
    expect(messages).toEqual([
      { role: "tool", content: "Tool execution denied" },
    ]);
  });

  test("converts tool result with JSON output", () => {
    const prompt = [
      {
        role: "tool" as const,
        content: [
          {
            type: "tool-result" as const,
            toolCallId: "call-5",
            toolName: "get_data",
            output: { type: "json" as const, value: { key: "value", count: 42 } },
          },
        ],
      },
    ];
    const { messages } = convertToOllamaMessages(prompt);
    expect(messages).toEqual([
      { role: "tool", content: JSON.stringify({ key: "value", count: 42 }) },
    ]);
  });

  test("ignores non-tool-result parts in tool messages", () => {
    const prompt = [
      {
        role: "tool" as const,
        content: [
          {
            type: "tool-approval-response" as const,
            approvalId: "ap-1",
            approved: true,
          } as any, // non-tool-result part, should be skipped
        ],
      },
    ];
    const { messages } = convertToOllamaMessages(prompt);
    expect(messages).toEqual([]);
  });

  test("handles mixed multi-message prompt", () => {
    const prompt = [
      { role: "system" as const, content: "You are a helpful assistant." },
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: "Hello!" }],
      },
      {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "How can I help?" }],
      },
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: "What's the weather?" }],
      },
    ];
    const { messages, warnings } = convertToOllamaMessages(prompt);
    expect(warnings).toEqual([]);
    expect(messages).toHaveLength(4);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[2].role).toBe("assistant");
    expect(messages[3].role).toBe("user");
  });

  test("handles empty prompt", () => {
    const { messages, warnings } = convertToOllamaMessages([]);
    expect(messages).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

// ================================================================
// buildChatRequest
// ================================================================
describe("buildChatRequest", () => {
  const baseOptions = {
    prompt: [
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: "Hello!" }],
      },
    ],
  };

  test("builds basic request body", () => {
    const { body, warnings } = buildChatRequest(
      "llama3.2",
      baseOptions,
      false
    );
    expect(warnings).toEqual([]);
    expect(body.model).toBe("llama3.2");
    expect(body.stream).toBe(false);
    expect(body.messages).toHaveLength(1);
    expect((body.messages as any[])[0].role).toBe("user");
    expect((body.messages as any[])[0].content).toBe("Hello!");
  });

  test("sets stream mode when true", () => {
    const { body } = buildChatRequest("llama3.2", baseOptions, true);
    expect(body.stream).toBe(true);
  });

  test("maps maxOutputTokens to num_predict in options", () => {
    const { body } = buildChatRequest("llama3.2", {
      ...baseOptions,
      maxOutputTokens: 500,
    }, false);
    expect((body.options as any).num_predict).toBe(500);
  });

  test("maps temperature", () => {
    const { body } = buildChatRequest("llama3.2", {
      ...baseOptions,
      temperature: 0.7,
    }, false);
    expect((body.options as any).temperature).toBe(0.7);
  });

  test("maps topP to top_p", () => {
    const { body } = buildChatRequest("llama3.2", {
      ...baseOptions,
      topP: 0.9,
    }, false);
    expect((body.options as any).top_p).toBe(0.9);
  });

  test("maps topK to top_k", () => {
    const { body } = buildChatRequest("llama3.2", {
      ...baseOptions,
      topK: 40,
    }, false);
    expect((body.options as any).top_k).toBe(40);
  });

  test("maps presencePenalty", () => {
    const { body } = buildChatRequest("llama3.2", {
      ...baseOptions,
      presencePenalty: 0.5,
    }, false);
    expect((body.options as any).presence_penalty).toBe(0.5);
  });

  test("maps frequencyPenalty", () => {
    const { body } = buildChatRequest("llama3.2", {
      ...baseOptions,
      frequencyPenalty: 0.3,
    }, false);
    expect((body.options as any).frequency_penalty).toBe(0.3);
  });

  test("maps stopSequences to stop", () => {
    const { body } = buildChatRequest("llama3.2", {
      ...baseOptions,
      stopSequences: ["\n", "END"],
    }, false);
    expect((body.options as any).stop).toEqual(["\n", "END"]);
  });

  test("maps seed", () => {
    const { body } = buildChatRequest("llama3.2", {
      ...baseOptions,
      seed: 42,
    }, false);
    expect((body.options as any).seed).toBe(42);
  });

  test("omits options when no extra params set", () => {
    const { body } = buildChatRequest("llama3.2", baseOptions, false);
    expect(body.options).toBeUndefined();
  });

  test("sets format to json when responseFormat is json", () => {
    const { body } = buildChatRequest("llama3.2", {
      ...baseOptions,
      responseFormat: { type: "json" as const },
    }, false);
    expect(body.format).toBe("json");
  });

  test("sets format to schema when json format with schema", () => {
    const { body } = buildChatRequest("llama3.2", {
      ...baseOptions,
      responseFormat: {
        type: "json" as const,
        schema: {
          type: "object",
          properties: { name: { type: "string" } },
        },
      },
    }, false);
    expect(body.format).toEqual({
      type: "object",
      properties: { name: { type: "string" } },
    });
  });

  test("includes function tools in request body", () => {
    const { body, warnings } = buildChatRequest(
      "llama3.2",
      {
        ...baseOptions,
        tools: [
          {
            type: "function" as const,
            name: "get_weather",
            description: "Get current weather",
            inputSchema: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        ],
      },
      false
    );
    expect(warnings).toEqual([]);
    expect(body.tools).toHaveLength(1);
    expect((body.tools as any[])[0]).toEqual({
      type: "function",
      function: {
        name: "get_weather",
        description: "Get current weather",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    });
  });

  test("warns on provider-defined tools", () => {
    const { body, warnings } = buildChatRequest(
      "llama3.2",
      {
        ...baseOptions,
        tools: [
          {
            type: "provider",
            id: "custom.custom_tool",
            name: "custom_tool",
            args: {},
          },
        ],
      },
      false
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("unsupported");
    if (warnings[0].type === "unsupported") {
      expect(warnings[0].feature).toContain("custom_tool");
    }
    expect(body.tools).toBeUndefined();
  });

  test("warns on non-auto toolChoice", () => {
    const { warnings } = buildChatRequest(
      "llama3.2",
      {
        ...baseOptions,
        toolChoice: { type: "required" as const },
      },
      false
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("unsupported");
    if (warnings[0].type === "unsupported") {
      expect(warnings[0].feature).toBe("toolChoice");
    }
  });

  test("does not warn on auto toolChoice", () => {
    const options = {
      ...baseOptions,
      toolChoice: { type: "auto" as const },
    };
    const { warnings } = buildChatRequest("llama3.2", options, false);
    const toolChoiceWarnings = warnings.filter(
      (w) => w.type === "unsupported" && w.feature === "toolChoice"
    );
    expect(toolChoiceWarnings).toEqual([]);
  });
});
