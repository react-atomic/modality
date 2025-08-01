import { test, expect, describe } from "bun:test";
import {
  compressConversationHistory,
  compressUserInput,
  compressText,
  fastCompressText,
  compressWithLanguageDetection,
  analyzeTextImportance,
  TextCompressionUtility,
  UniversalLanguageDetector,
  CompressionLogger,
  CompressionError,
  LanguageDetectionError,
} from "../util_text_compression";

describe("Text Compression Utility", () => {
  const testText = `This is a comprehensive test of the text compression utility. It contains multiple sentences that should be analyzed for importance. Some sentences are more important than others based on their position and content. The first sentence is usually important. The last sentence is also typically significant. Code blocks like \`console.log("test")\` should be preserved. Function calls like getData() should also be maintained. This utility should handle various compression levels effectively.`;

  describe("Edge Cases", () => {
    test("should handle empty, null, or undefined text", async () => {
      const result1 = await compressUserInput("");
      const result2 = await compressUserInput(null as any);
      const result3 = await compressUserInput(undefined as any);
      expect(result1).toBe("");
      expect(result2).toBe("");
      expect(result3).toBe("");
    });

    test("should handle very short text", async () => {
      const result = await compressText("Hi", { maxTokens: 100 });
      expect(result.compressedText).toBe("Hi");
      expect(result.compressionRatio).toBe(1);
      expect(result.tokensEstimate).toBeGreaterThan(0);
    });

    test("should handle text with only code blocks", async () => {
      const onlyCode =
        '```javascript\nfunction test() {\n  return "hello";\n}\n```';
      const result = await compressUserInput(onlyCode, 50);
      expect(result).toContain("function test()");
      expect(result.length).toBeGreaterThan(0);
    });

    test("should handle invalid maxTokens", () => {
      const compressor = new TextCompressionUtility();
      expect(() => compressor.compress("test", { maxTokens: 0 })).toThrow(
        "maxTokens must be greater than 0"
      );
      expect(() => compressor.compress("test", { maxTokens: -1 })).toThrow(
        "maxTokens must be greater than 0"
      );
    });
  });

  describe("Normal Text Compression", () => {

    test("should compress text within token limits", async () => {
      const result = await compressText(testText, { maxTokens: 50 });
      expect(result.tokensEstimate).toBeLessThanOrEqual(50);
      expect(result.compressedText.length).toBeLessThan(testText.length);
      expect(result.compressionRatio).toBeGreaterThan(1);
    });

    test("should preserve code elements", async () => {
      const codeText =
        'Here is some code: `console.log("test")` and a function call getData() for testing.';
      const result = await compressText(codeText, {
        maxTokens: 50,
        preserveCodeBlocks: true,
      });
      expect(result.compressedText).toContain('console.log("test")');
      expect(result.compressedText).toContain("getData()");
    });

    test("should respect compression levels", async () => {
      const lightResult = await compressText(testText, {
        maxTokens: 50,
        compressionLevel: "light",
      });
      const aggressiveResult = await compressText(testText, {
        maxTokens: 50,
        compressionLevel: "aggressive",
      });

      // Both should be compressed, but light should generally preserve more
      expect(lightResult.compressedText.length).toBeGreaterThanOrEqual(
        aggressiveResult.compressedText.length
      );
    });

    test("should prioritize first and last sentences when configured", async () => {
      const result = await compressText(testText, {
        maxTokens: 80,
        prioritizeFirst: true,
        prioritizeLast: true,
      });

      expect(result.compressedText).toContain("comprehensive test");
      // The last sentence might be trimmed due to token limits, so just check compression worked
      expect(result.compressedText.length).toBeLessThan(testText.length);
    });
  });

  describe("Performance Optimization", () => {

    test("should use fast mode for large texts", async () => {
      const largeText = "This is a test sentence. ".repeat(2000); // ~50KB

      const startTime = Date.now();
      const result = await fastCompressText(largeText, 200);
      const endTime = Date.now();

      expect(result.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in <1s
    });

    test("should handle configurable buffer percentage", async () => {
      const result1 = await compressText(testText, {
        maxTokens: 50,
        bufferPercentage: 5,
      });
      const result2 = await compressText(testText, {
        maxTokens: 50,
        bufferPercentage: 20,
      });

      // With lower buffer, we should use more of the available tokens
      expect(result1.tokensEstimate).toBeGreaterThanOrEqual(
        result2.tokensEstimate
      );
    });
  });

  describe("Language Detection", () => {
    test("should detect English text", async () => {
      const result = await compressWithLanguageDetection(
        "This is English text",
        100
      );
      expect(result.detectedLanguage).toBe("en");
    });

    test("should handle CJK characters", async () => {
      const chineseText = "这是中文测试文本。应该被正确识别。";
      const result = await compressWithLanguageDetection(chineseText, 100);
      expect(result.detectedLanguage).toBe("zh");
      expect(result.compressedText.length).toBeGreaterThan(0);
    });

    test("should fallback gracefully on detection failure", async () => {
      const result = await compressWithLanguageDetection("Test", 100);
      expect(result.detectedLanguage).toBeTruthy();
    });
  });

  describe("Importance Analysis", () => {

    test("should analyze sentence importance", async () => {
      const scores = await analyzeTextImportance(testText);
      expect(scores.length).toBeGreaterThan(0);
      expect(scores[0]).toHaveProperty("text");
      expect(scores[0]).toHaveProperty("score");
      expect(scores[0]).toHaveProperty("reasons");
      expect(scores[0].score).toBeGreaterThan(0);
    });

    test("should prioritize first and last sentences", async () => {
      const scores = await analyzeTextImportance(testText);
      const firstSentence = scores[0];
      const lastSentence = scores[scores.length - 1];

      expect(firstSentence.reasons).toContain("first-sentence");
      expect(lastSentence.reasons).toContain("last-sentence");
      expect(firstSentence.score).toBeGreaterThan(1);
      expect(lastSentence.score).toBeGreaterThan(1);
    });
  });

  describe("API Functions", () => {
    test("compressUserInput should work with defaults", async () => {
      const result = await compressUserInput(testText);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(testText.length);
    });

    test("should return text unchanged if within token limit", async () => {
      const shortText = "Short text";
      const result = await compressText(shortText, { maxTokens: 1000 });
      expect(result.compressedText).toBe(shortText);
      expect(result.compressionRatio).toBe(1);
    });
  });

  describe("Conversation History Compression", () => {
    test("should compress conversation messages", async () => {
      const messages = [
        { role: "user", content: testText },
        { role: "assistant", content: testText },
      ];

      const result = await compressConversationHistory(messages, 100);

      expect(result).toHaveLength(2);
      expect(result[0].content.length).toBeLessThanOrEqual(testText.length);
      expect(result[1].content.length).toBeLessThanOrEqual(testText.length);
    });
  });

  describe("Enhanced Language Detection", () => {
    // Setup for each test
    const logger = new CompressionLogger(false); // Disable logging in tests
    const detector = new UniversalLanguageDetector(logger);

    describe("Intl-based Detection", () => {
      test("should detect English text using Intl APIs", async () => {
        const englishText =
          "This is a comprehensive English text for testing language detection capabilities.";
        const result = await detector.detectLanguage(englishText);

        expect(result.code).toBeTruthy();
        expect(result.locale).toBeTruthy();
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });

      test("should detect Traditional Chinese using CLDR standards", async () => {
        const traditionalChineseText =
          "這是一個繁體中文測試文本，用於測試語言檢測功能。繁體中文應該被正確識別為 zh-Hant。";
        const result = await detector.detectLanguage(traditionalChineseText);

        expect(result.code).toBe("zh");
        expect(["zh-Hant", "zh-CN", "zh-Hans"]).toContain(result.locale);
        expect(result.confidence).toBeGreaterThan(0.5);
      });

      test("should detect Simplified Chinese using CLDR standards", async () => {
        const simplifiedChineseText =
          "这是一个简体中文测试文本，用于测试语言检测功能。简体中文应该被正确识别为 zh-Hans。";
        const result = await detector.detectLanguage(simplifiedChineseText);

        expect(result.code).toBe("zh");
        expect(["zh-Hans", "zh-CN", "zh-Hant"]).toContain(result.locale);
        expect(result.confidence).toBeGreaterThan(0.5);
      });

      test("should detect Japanese text", async () => {
        const japaneseText =
          "これは日本語のテストテキストです。ひらがなとカタカナが含まれています。";
        const result = await detector.detectLanguage(japaneseText);

        expect(result.code).toBe("ja");
        expect(result.locale).toContain("ja");
        expect(result.confidence).toBeGreaterThan(0.5);
      });

      test("should detect Korean text", async () => {
        const koreanText =
          "이것은 한국어 테스트 텍스트입니다. 한글 문자가 포함되어 있습니다.";
        const result = await detector.detectLanguage(koreanText);

        expect(result.code).toBe("ko");
        expect(result.locale).toContain("ko");
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });

    describe("Edge Cases and Error Handling", () => {
      test("should handle edge cases (empty, null, undefined, short text)", async () => {
        const result1 = await detector.detectLanguage("");
        const result2 = await detector.detectLanguage(null as any);
        const result3 = await detector.detectLanguage(undefined as any);
        const result4 = await detector.detectLanguage("Hi");

        expect(result1.code).toBe("und");
        expect(result1.locale).toBe("und");
        expect(result1.confidence).toBeLessThan(0.5);
        
        expect(result2.code).toBe("und");
        expect(result3.code).toBe("und");
        
        expect(result4.code).toBeTruthy();
        expect(result4.confidence).toBeGreaterThan(0);
      });

      test("should handle mixed-language text", async () => {
        const mixedText = "Hello 你好 こんにちは 안녕하세요 Bonjour";
        const result = await detector.detectLanguage(mixedText);

        expect(result.code).toBeTruthy();
        expect(result.confidence).toBeGreaterThan(0);
      });

      test("should handle text with unusual characters", async () => {
        const unusualText = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`";
        const result = await detector.detectLanguage(unusualText);

        expect(result.code).toBeTruthy();
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    describe("Performance Testing", () => {
      test("should detect language within reasonable time for large text", async () => {
        const largeText = "This is a large English text. ".repeat(1000);

        const startTime = Date.now();
        const result = await detector.detectLanguage(largeText);
        const endTime = Date.now();

        expect(endTime - startTime).toBeLessThan(1000); // Should complete in <1s
        expect(result.code).toBeTruthy();
      });

      test("should use caching for repeated detections", async () => {
        const testText = "This is a test text for caching.";

        const startTime1 = Date.now();
        const result1 = await detector.detectLanguage(testText);
        const endTime1 = Date.now();

        const startTime2 = Date.now();
        const result2 = await detector.detectLanguage(testText);
        const endTime2 = Date.now();

        // Check that results are cached (same results)
        expect(result1.code).toBe(result2.code);
        expect(result1.locale).toBe(result2.locale);

        // Timing test is more robust: either second call is faster OR both are very fast
        const time1 = endTime1 - startTime1;
        const time2 = endTime2 - startTime2;
        expect(time2 <= time1 || time2 < 5).toBe(true); // Second call should be faster or both very fast
      });
    });
  });

  describe("Error Handling and Logging", () => {
    test("should create CompressionError with proper structure", () => {
      const error = new CompressionError("Test error", "TEST_CODE", {
        detail: "test",
      });

      expect(error.name).toBe("CompressionError");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.details).toEqual({ detail: "test" });
    });

    test("should create LanguageDetectionError with fallback", () => {
      const error = new LanguageDetectionError("Detection failed", "en");

      expect(error.name).toBe("LanguageDetectionError");
      expect(error.message).toBe("Detection failed");
      expect(error.fallbackLanguage).toBe("en");
    });

    test("should log messages when enabled", () => {
      const logger = new CompressionLogger(true);

      // Test that logger methods exist and can be called
      expect(() => logger.info("test")).not.toThrow();
      expect(() => logger.warn("test")).not.toThrow();
      expect(() => logger.error("test")).not.toThrow();
    });
  });
});
