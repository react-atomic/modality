import { ModalityLogger, type LogLevel } from './util_logger.js';
import { ErrorCode } from './util_error.js';

// Simple configuration source
export interface CompressionConfig {
  maxTokens: number;
  compressionLevel: "light" | "moderate" | "aggressive";
  preserveCodeBlocks: boolean;
  autoDetectLanguage: boolean;
  enableLogging: boolean;
  maxSentencesForAnalysis: number;
  fastModeMaxSentences: number;
}

// Default configuration
export const DEFAULT_CONFIG: CompressionConfig = {
  maxTokens: 4000,
  compressionLevel: "moderate",
  preserveCodeBlocks: true,
  autoDetectLanguage: true,
  enableLogging: false,
  maxSentencesForAnalysis: 500,
  fastModeMaxSentences: 200,
};

// Options interface for overriding config
export interface CompressionOptions {
  maxTokens?: number;
  compressionLevel?: "light" | "moderate" | "aggressive";
  preserveCodeBlocks?: boolean;
  autoDetectLanguage?: boolean;
  locale?: string;
  prioritizeFirst?: boolean;
  prioritizeLast?: boolean;
  preserveStructure?: boolean;
  bufferPercentage?: number;
  maxSentences?: number;
  fastMode?: boolean;
  enableLogging?: boolean;
  sentenceSplitPattern?: RegExp;
  importanceWeights?: ImportanceWeights;
  tokenizationMethod?: "simple" | "advanced";
}

export interface ImportanceWeights {
  position: number;
  length: number;
  wordRarity: number;
  codeElements: number;
}

export interface CompressionResult {
  compressedText: string;
  originalLength: number;
  compressedLength: number;
  compressionRatio: number;
  tokensEstimate: number;
  detectedLanguage?: string;
  importanceScores?: Array<{ text: string; score: number; reasons: string[] }>;
  processingTime?: number;
  errors?: string[];
  warnings?: string[];
}

export interface LanguageDetectionResult {
  code: string;
  locale: string;
  confidence: number;
  script?: string;
  region?: string;
}

// Error classes for better error handling
export class CompressionError extends ErrorCode {
  readonly code: string;
  public details?: any;
  
  constructor(
    message: string,
    code: string,
    details?: any,
    originalError?: unknown
  ) {
    super(message, originalError);
    this.code = code;
    this.details = details;
  }
}

export class LanguageDetectionError extends ErrorCode {
  readonly code: string = 'LANGUAGE_DETECTION_ERROR';
  public fallbackLanguage: string;
  
  constructor(
    message: string,
    fallbackLanguage: string,
    originalError?: unknown
  ) {
    super(message, originalError);
    this.fallbackLanguage = fallbackLanguage;
  }
}

// Use ModalityLogger for centralized logging
type CompressionLogger = ModalityLogger;

// CLDR-compliant language detector with proper error handling
export class UniversalLanguageDetector {
  private logger: ModalityLogger;
  private cache = new Map<string, LanguageDetectionResult>();

  constructor(logger: ModalityLogger) {
    this.logger = logger;
  }

  async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    try {
      // Input validation
      if (!text || typeof text !== "string") {
        throw new LanguageDetectionError("Invalid input text", "und");
      }

      // Check cache
      const cacheKey = text.length > 200 ? text.substring(0, 200) : text;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }

      const result = await this.performDetection(text);

      // Cache result
      if (this.cache.size > 50) {
        // Limit cache size
        this.cache.clear();
      }
      this.cache.set(cacheKey, result);

      this.logger.info(
        `Language detected: ${result.code} (confidence: ${result.confidence})`
      );
      return result;
    } catch (error) {
      this.logger.error("Language detection failed", error as Error);
      const fallback: LanguageDetectionResult = {
        code: "und",
        locale: "und",
        confidence: 0.1,
      };
      return fallback;
    }
  }

  private async performDetection(
    text: string
  ): Promise<LanguageDetectionResult> {
    // Step 1: Get Unicode range hints
    const unicodeHints = this.analyzeUnicodeRanges(text);

    // Step 2: Test locales using Intl APIs (prioritize Unicode hints)
    const testLocales = this.prioritizeLocalesBasedOnUnicode(unicodeHints);

    let bestMatch: LanguageDetectionResult = {
      code: "und",
      locale: "und",
      confidence: 0.3,
    };

    // Test each locale using Intl APIs
    for (const testLocale of testLocales) {
      try {
        const intlScore = await this.testLocaleWithIntlAPIs(text, testLocale);
        const unicodeBoost = this.getUnicodeBoost(testLocale, unicodeHints);
        const combinedScore = Math.min(1.0, intlScore + unicodeBoost);

        if (combinedScore > bestMatch.confidence) {
          const locale = new Intl.Locale(testLocale);
          bestMatch = {
            code: locale.language,
            locale: testLocale,
            confidence: combinedScore,
            script: locale.script,
            region: locale.region,
          };
        }
      } catch (error) {
        // Continue testing other locales
        continue;
      }
    }

    return bestMatch;
  }

  private analyzeUnicodeRanges(text: string): Map<string, number> {
    const sample = text.slice(0, 500);
    const codePoints = Array.from(sample).map((char) => char.codePointAt(0)!);
    const ranges = new Map<string, number>();

    let totalRelevantChars = 0;

    for (const codePoint of codePoints) {
      let rangeFound = false;

      // Use Unicode.org defined ranges (not hardcoded patterns)
      if (codePoint >= 0x4e00 && codePoint <= 0x9fff) {
        // CJK Unified Ideographs - could be Chinese, Japanese, or Korean
        ranges.set("cjk", (ranges.get("cjk") || 0) + 1);
        totalRelevantChars++;
        rangeFound = true;
      }

      if (codePoint >= 0x3040 && codePoint <= 0x309f) {
        // Hiragana - Japanese specific
        ranges.set("hiragana", (ranges.get("hiragana") || 0) + 1);
        totalRelevantChars++;
        rangeFound = true;
      }

      if (codePoint >= 0x30a0 && codePoint <= 0x30ff) {
        // Katakana - Japanese specific
        ranges.set("katakana", (ranges.get("katakana") || 0) + 1);
        totalRelevantChars++;
        rangeFound = true;
      }

      if (codePoint >= 0xac00 && codePoint <= 0xd7af) {
        // Hangul - Korean specific
        ranges.set("hangul", (ranges.get("hangul") || 0) + 1);
        totalRelevantChars++;
        rangeFound = true;
      }

      if (codePoint >= 0x0400 && codePoint <= 0x04ff) {
        // Cyrillic
        ranges.set("cyrillic", (ranges.get("cyrillic") || 0) + 1);
        totalRelevantChars++;
        rangeFound = true;
      }

      if (codePoint >= 0x0600 && codePoint <= 0x06ff) {
        // Arabic
        ranges.set("arabic", (ranges.get("arabic") || 0) + 1);
        totalRelevantChars++;
        rangeFound = true;
      }

      if (!rangeFound && codePoint >= 0x0020 && codePoint <= 0x007e) {
        // Basic Latin
        ranges.set("latin", (ranges.get("latin") || 0) + 1);
        totalRelevantChars++;
      }
    }

    // Convert counts to percentages
    const percentages = new Map<string, number>();
    for (const [range, count] of ranges) {
      percentages.set(
        range,
        totalRelevantChars > 0 ? count / totalRelevantChars : 0
      );
    }

    return percentages;
  }

  private prioritizeLocalesBasedOnUnicode(
    unicodeHints: Map<string, number>
  ): string[] {
    // Generate locale list dynamically from Intl capabilities and system locales
    const availableLocales = this.getAvailableTestLocales(unicodeHints);

    // Sort locales based on Unicode range relevance
    return availableLocales.sort((a, b) => {
      const scoreA = this.getUnicodeRelevanceScore(a, unicodeHints);
      const scoreB = this.getUnicodeRelevanceScore(b, unicodeHints);
      return scoreB - scoreA; // Higher scores first
    });
  }

  private getAvailableTestLocales(unicodeHints: Map<string, number>): string[] {
    const locales = new Set<string>();

    // Start with system locales
    if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
      try {
        const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
        locales.add(systemLocale);

        // Add parent locale
        const locale = new Intl.Locale(systemLocale);
        if (locale.language) {
          locales.add(locale.language);
        }
      } catch (error) {
        // Continue with fallback
      }
    }

    // Add locales based on detected Unicode ranges
    const ranges = Array.from(unicodeHints.keys());

    if (ranges.includes("cjk")) {
      // Traditional Chinese uses Traditional script
      locales.add("zh-Hant");
      locales.add("zh-Hans");
    }
    if (ranges.includes("hiragana") || ranges.includes("katakana")) {
      locales.add("ja-JP");
      locales.add("ja");
    }
    if (ranges.includes("hangul")) {
      locales.add("ko-KR");
      locales.add("ko");
    }
    if (ranges.includes("cyrillic")) {
      locales.add("ru-RU");
      locales.add("ru");
    }
    if (ranges.includes("arabic")) {
      locales.add("ar-SA");
      locales.add("ar");
    }
    if (ranges.includes("latin")) {
      locales.add("en-US");
      locales.add("en");
      locales.add("fr-FR");
      locales.add("de-DE");
      locales.add("es-ES");
    }

    // Always include fallback locales
    locales.add("en-US");
    locales.add("en");

    return Array.from(locales);
  }

  private getUnicodeRelevanceScore(
    locale: string,
    unicodeHints: Map<string, number>
  ): number {
    // Calculate how relevant this locale is based on Unicode ranges
    const hiragana = unicodeHints.get("hiragana") || 0;
    const katakana = unicodeHints.get("katakana") || 0;
    const hangul = unicodeHints.get("hangul") || 0;
    const cjk = unicodeHints.get("cjk") || 0;
    const cyrillic = unicodeHints.get("cyrillic") || 0;
    const arabic = unicodeHints.get("arabic") || 0;
    const latin = unicodeHints.get("latin") || 0;

    switch (locale) {
      case "ja-JP":
        return hiragana * 10 + katakana * 10 + cjk * 2;
      case "ko-KR":
        return hangul * 10 + cjk * 1;
      case "zh-Hant":
      case "zh-Hans":
        return cjk * 5 - (hiragana + katakana + hangul) * 2; // Penalty for Japanese/Korean chars
      case "ru-RU":
        return cyrillic * 8;
      case "ar-SA":
        return arabic * 8;
      case "en-US":
      case "fr-FR":
      case "de-DE":
      case "es-ES":
        return latin * 3;
      default:
        return 0;
    }
  }

  private getUnicodeBoost(
    locale: string,
    unicodeHints: Map<string, number>
  ): number {
    // Provide boost to Intl API score based on Unicode range match
    const relevanceScore = this.getUnicodeRelevanceScore(locale, unicodeHints);
    return Math.min(0.4, relevanceScore * 0.1); // Max boost of 0.4
  }

  private async testLocaleWithIntlAPIs(
    text: string,
    locale: string
  ): Promise<number> {
    let score = 0;
    const sample = text.slice(0, 500);

    try {
      // Test 1: Intl.Segmenter word segmentation quality
      if (typeof Intl !== "undefined" && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
        const segments = Array.from(segmenter.segment(sample));

        // Better segmentation = higher score
        const segmentQuality =
          segments.length > 0
            ? Math.min(1, segments.length / (sample.length / 10))
            : 0;
        score += segmentQuality * 0.4;
      }

      // Test 2: Intl.Collator sensitivity
      if (typeof Intl !== "undefined" && Intl.Collator) {
        const collator = new Intl.Collator(locale, { sensitivity: "base" });
        // Test if collator handles the text appropriately
        const testChars = Array.from(sample).slice(0, 10);
        if (testChars.length > 1) {
          const sorted = testChars.sort(collator.compare);
          score += sorted.length > 0 ? 0.3 : 0;
        }
      }

      // Test 3: Intl.DisplayNames availability
      if (typeof Intl !== "undefined" && Intl.DisplayNames) {
        try {
          const displayNames = new Intl.DisplayNames([locale], {
            type: "language",
          });
          const langCode = new Intl.Locale(locale).language;
          const displayName = displayNames.of(langCode);
          score += displayName ? 0.2 : 0;
        } catch (displayError) {
          // DisplayNames not available for this locale
        }
      }

      // Test 4: Intl.RelativeTimeFormat availability
      if (typeof Intl !== "undefined" && Intl.RelativeTimeFormat) {
        try {
          const rtf = new Intl.RelativeTimeFormat(locale);
          score += rtf ? 0.1 : 0;
        } catch (rtfError) {
          // RelativeTimeFormat not available for this locale
        }
      }
    } catch (error) {
      this.logger.warn(`Testing locale ${locale} failed:`, error);
      return 0;
    }

    return Math.min(1, score);
  }
}

export class IntelligentImportanceAnalyzer {
  private wordFrequencyCache = new Map<string, Map<string, number>>();
  private logger: ModalityLogger;
  private config: CompressionConfig;

  constructor(logger: ModalityLogger, config: CompressionConfig) {
    this.logger = logger;
    this.config = config;
  }

  async analyzeImportance(
    text: string,
    detectedLanguage?: string
  ): Promise<Array<{ text: string; score: number; reasons: string[] }>> {
    // Performance optimization: early return for very large texts
    if (text.length > 50000) {
      return await this.fastAnalyzeImportance(text, detectedLanguage);
    }

    const sentences = this.segmentSentences(text, detectedLanguage);

    // Performance optimization: limit sentence processing for very large texts
    const maxSentences = Math.min(
      sentences.length,
      this.config.maxSentencesForAnalysis
    );
    const processedSentences = sentences.slice(0, maxSentences);

    const wordFrequencies = await this.calculateWordFrequencies(text);
    const avgSentenceLength =
      processedSentences.reduce((sum, s) => sum + s.length, 0) /
      processedSentences.length;

    // Process sentences asynchronously for better performance
    const results = await Promise.all(
      processedSentences.map(async (sentence, index) => {
        return new Promise<{ text: string; score: number; reasons: string[] }>(
          (resolve) => {
            const reasons: string[] = [];
            let score = 1.0;

            // Core scoring methods
            score *= this.analyzePosition(
              index,
              processedSentences.length,
              reasons
            );
            score *= this.analyzeLengthDeviation(
              sentence,
              avgSentenceLength,
              reasons
            );
            score *= this.analyzeWordRarity(sentence, wordFrequencies, reasons);

            resolve({
              text: sentence.trim(),
              score: Math.round(score * 100) / 100,
              reasons,
            });
          }
        );
      })
    );

    return results;
  }

  public async fastAnalyzeImportance(
    text: string,
    detectedLanguage?: string
  ): Promise<Array<{ text: string; score: number; reasons: string[] }>> {
    // Fast path for very large texts: simpler analysis
    const sentences = this.segmentSentences(text, detectedLanguage).slice(
      0,
      this.config.fastModeMaxSentences
    );
    const maxSentences = sentences.length;

    return sentences.slice(0, maxSentences).map((sentence, index) => {
      const reasons: string[] = [];
      let score = 1.0;

      // Simplified scoring for performance
      if (index < 3) {
        score = 2.0;
        reasons.push("first-sentences");
      } else if (index >= maxSentences - 3) {
        score = 1.8;
        reasons.push("last-sentences");
      } else if (sentence.length > 200) {
        score = 1.3;
        reasons.push("long-sentence");
      }

      return {
        text: sentence.trim(),
        score,
        reasons,
      };
    });
  }

  private segmentSentences(text: string, locale?: string): string[] {
    try {
      // Use Intl.Segmenter for language-aware sentence segmentation
      if (typeof Intl !== "undefined" && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter(locale || "en", {
          granularity: "sentence",
        });
        const segments = Array.from(segmenter.segment(text));
        return segments
          .map((segment) => segment.segment.trim())
          .filter((s) => s.length > 10); // Filter out very short fragments
      }
    } catch (error) {
      // Fallback if Intl.Segmenter not supported or fails
    }

    // Fallback: use basic period/exclamation/question mark splitting
    // This is not language-specific but works as emergency fallback
    return text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
  }

  private analyzePosition(
    index: number,
    totalSentences: number,
    reasons: string[]
  ): number {
    if (totalSentences === 1) return 2.0;

    if (index === 0) {
      reasons.push("first-sentence");
      return 2.0;
    }
    if (index === totalSentences - 1) {
      reasons.push("last-sentence");
      return 2.0;
    }
    if (index < 3 || index >= totalSentences - 3) {
      reasons.push("near-boundary");
      return 1.5;
    }
    return 1.0;
  }

  private analyzeLengthDeviation(
    sentence: string,
    avgLength: number,
    reasons: string[]
  ): number {
    if (avgLength === 0) return 1.0;

    const length = sentence.length;
    const deviation = Math.abs(length - avgLength) / avgLength;

    if (deviation > 0.8) {
      if (length > avgLength) {
        reasons.push("unusually-long");
        return 1.3;
      } else if (length > 20) {
        // Don't boost very short sentences
        reasons.push("unusually-short");
        return 1.2;
      }
    }
    return 1.0;
  }

  private analyzeWordRarity(
    sentence: string,
    wordFreqs: Map<string, number>,
    reasons: string[]
  ): number {
    const words = sentence
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (words.length === 0) return 1.0;

    const totalWords = Array.from(wordFreqs.values()).reduce(
      (sum, freq) => sum + freq,
      0
    );
    let rareWordCount = 0;
    let veryCommonCount = 0;

    words.forEach((word) => {
      const freq = wordFreqs.get(word) || 0;
      const relativeFreq = freq / totalWords;

      if (relativeFreq < 0.005) {
        // Less than 0.5% frequency
        rareWordCount++;
      } else if (relativeFreq > 0.05) {
        // More than 5% frequency
        veryCommonCount++;
      }
    });

    const rareWordRatio = rareWordCount / words.length;
    const commonWordRatio = veryCommonCount / words.length;

    if (rareWordRatio > 0.25) {
      reasons.push("has-rare-words");
      return 1.3;
    }

    if (commonWordRatio > 0.8) {
      reasons.push("mostly-common-words");
      return 0.7;
    }

    return 1.0;
  }

  private async calculateWordFrequencies(
    text: string
  ): Promise<Map<string, number>> {
    return new Promise((resolve) => {
      try {
        // Performance optimization: check cache first
        const cacheKey = text.length > 1000 ? text.substring(0, 1000) : text;
        if (this.wordFrequencyCache.has(cacheKey)) {
          resolve(this.wordFrequencyCache.get(cacheKey)!);
          return;
        }

        // Performance optimization: limit text processing for very large texts
        const processText =
          text.length > 10000 ? text.substring(0, 10000) : text;

        // Use async processing for large texts
        const processAsync = async () => {
          const words = processText
            .toLowerCase()
            .replace(/[^\w\s]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length > 2);

          const freq = new Map<string, number>();

          // Process in chunks for very large word lists
          const chunkSize = 1000;
          for (let i = 0; i < words.length; i += chunkSize) {
            const chunk = words.slice(i, i + chunkSize);
            chunk.forEach((word) => {
              freq.set(word, (freq.get(word) || 0) + 1);
            });

            // Yield control for large processing
            if (i % 5000 === 0 && i > 0) {
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }

          return freq;
        };

        processAsync().then((freq) => {
          // Cache the result for performance
          if (this.wordFrequencyCache.size > 10) {
            // Limit cache size
            this.wordFrequencyCache.clear();
          }
          this.wordFrequencyCache.set(cacheKey, freq);

          resolve(freq);
        });
      } catch (error) {
        this.logger.error("Word frequency calculation failed:", error as Error);
        resolve(new Map<string, number>());
      }
    });
  }
}

export class TextCompressionUtility {
  private languageDetector: UniversalLanguageDetector;
  private importanceAnalyzer: IntelligentImportanceAnalyzer;
  private logger: ModalityLogger;
  private config: CompressionConfig;

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = ModalityLogger.getInstance('TextCompression', this.config.enableLogging ? 'info' : 'error');
    this.languageDetector = new UniversalLanguageDetector(this.logger);
    this.importanceAnalyzer = new IntelligentImportanceAnalyzer(
      this.logger,
      this.config
    );
  }

  async compress(
    text: string,
    options: CompressionOptions = {}
  ): Promise<CompressionResult> {
    // Handle edge case: empty or null text
    if (!text || typeof text !== "string") {
      return {
        compressedText: "",
        originalLength: 0,
        compressedLength: 0,
        compressionRatio: 1,
        tokensEstimate: 0,
        detectedLanguage: "und",
      };
    }

    // Use config as source of truth, allow options to override
    const maxTokens = options.maxTokens ?? this.config.maxTokens;
    const preserveCodeBlocks =
      options.preserveCodeBlocks ?? this.config.preserveCodeBlocks;
    const compressionLevel =
      options.compressionLevel ?? this.config.compressionLevel;
    const autoDetectLanguage =
      options.autoDetectLanguage ?? this.config.autoDetectLanguage;

    const {
      prioritizeFirst = true,
      prioritizeLast = true,
      bufferPercentage = 10,
      maxSentences = 500,
      fastMode = false,
    } = options;

    // Validate maxTokens first
    if (maxTokens <= 0) {
      throw new CompressionError("maxTokens must be greater than 0", "INVALID_MAX_TOKENS");
    }

    const trimmedText = text.trim();
    const originalLength = trimmedText.length;

    // Handle edge case: very short text (< 10 characters)
    if (originalLength < 10) {
      return {
        compressedText: trimmedText,
        originalLength,
        compressedLength: originalLength,
        compressionRatio: 1,
        tokensEstimate: Math.max(1, Math.ceil(originalLength / 4)),
        detectedLanguage: "und",
      };
    }

    // Language detection
    let detectedLanguage: string | undefined;
    if (autoDetectLanguage) {
      try {
        const detection =
          await this.languageDetector.detectLanguage(trimmedText);
        detectedLanguage = detection.code;
      } catch (error) {
        this.logger.warn("Language detection failed, using fallback:", error);
        detectedLanguage = "und";
      }
    }

    // Early return if already within limits
    const initialTokens = this.estimateTokens(trimmedText);
    if (initialTokens <= maxTokens) {
      return {
        compressedText: trimmedText,
        originalLength,
        compressedLength: trimmedText.length,
        compressionRatio: 1,
        tokensEstimate: initialTokens,
        detectedLanguage,
      };
    }

    // Code preservation
    const { text: textWithoutCode, codeMap } = preserveCodeBlocks
      ? this.extractCodeElements(trimmedText)
      : { text: trimmedText, codeMap: new Map<string, string>() };

    // Handle edge case: text contains only code blocks
    if (textWithoutCode.trim().length < 10) {
      // If mostly code, preserve as much as possible within token limit
      const finalText = this.trimToTokenLimit(trimmedText, maxTokens);
      return {
        compressedText: finalText,
        originalLength,
        compressedLength: finalText.length,
        compressionRatio: originalLength / finalText.length,
        tokensEstimate: this.estimateTokens(finalText),
        detectedLanguage,
      };
    }

    // Importance analysis
    let importanceScores: Array<{
      text: string;
      score: number;
      reasons: string[];
    }>;
    try {
      importanceScores =
        fastMode || textWithoutCode.length > 50000
          ? await this.importanceAnalyzer.fastAnalyzeImportance(
              textWithoutCode,
              detectedLanguage
            )
          : await this.importanceAnalyzer.analyzeImportance(
              textWithoutCode,
              detectedLanguage
            );

      // Apply user preferences
      if (prioritizeFirst || prioritizeLast) {
        importanceScores = this.applyUserPriorities(
          importanceScores,
          prioritizeFirst,
          prioritizeLast
        );
      }

      // Limit processing if requested
      if (maxSentences && importanceScores.length > maxSentences) {
        importanceScores = importanceScores
          .sort((a, b) => b.score - a.score)
          .slice(0, maxSentences);
      }
    } catch (error) {
      console.warn("Importance analysis failed, using fallback:", error);
      // Fallback: simple sentence splitting without scoring
      const sentences = this.segmentSentences(textWithoutCode);
      importanceScores = sentences.map((sentence: string, index: number) => ({
        text: sentence.trim(),
        score: index < 3 ? 2.0 : 1.0, // Prioritize first few sentences
        reasons: index < 3 ? ["first-sentences-fallback"] : ["fallback"],
      }));
    }

    // Handle edge case: no analyzable sentences found
    if (importanceScores.length === 0) {
      const finalText = this.trimToTokenLimit(trimmedText, maxTokens);
      return {
        compressedText: finalText,
        originalLength,
        compressedLength: finalText.length,
        compressionRatio: originalLength / finalText.length,
        tokensEstimate: this.estimateTokens(finalText),
        detectedLanguage,
      };
    }

    // Compression
    let compressed: string;
    try {
      compressed = this.applyCompression(
        importanceScores,
        maxTokens,
        compressionLevel,
        codeMap,
        bufferPercentage
      );
    } catch (error) {
      console.warn("Compression failed, using fallback:", error);
      compressed = this.trimToTokenLimit(trimmedText, maxTokens);
    }

    // Ensure we have some content
    if (compressed.trim().length === 0) {
      compressed = this.trimToTokenLimit(trimmedText, Math.min(maxTokens, 100));
    }

    const finalTokens = this.estimateTokens(compressed);

    return {
      compressedText: compressed,
      originalLength,
      compressedLength: compressed.length,
      compressionRatio: originalLength / compressed.length,
      tokensEstimate: finalTokens,
      detectedLanguage,
      importanceScores,
    };
  }

  private extractCodeElements(text: string): {
    text: string;
    codeMap: Map<string, string>;
  } {
    const codeMap = new Map<string, string>();
    let counter = 0;
    let result = text;

    // Extract fenced code blocks
    result = result.replace(/```[\s\S]*?```/g, (match) => {
      const placeholder = `__CODE_BLOCK_${counter++}__`;
      codeMap.set(placeholder, match);
      return placeholder;
    });

    // Extract inline code
    result = result.replace(/`[^`\n]+`/g, (match) => {
      const placeholder = `__INLINE_CODE_${counter++}__`;
      codeMap.set(placeholder, match);
      return placeholder;
    });

    // Extract function calls and property access (common in technical text)
    result = result.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\(\)/g, (match) => {
      const placeholder = `__FUNC_CALL_${counter++}__`;
      codeMap.set(placeholder, match);
      return placeholder;
    });

    return { text: result, codeMap };
  }

  private applyUserPriorities(
    importanceScores: Array<{ text: string; score: number; reasons: string[] }>,
    prioritizeFirst: boolean,
    prioritizeLast: boolean
  ): Array<{ text: string; score: number; reasons: string[] }> {
    return importanceScores.map((item, index) => {
      const newReasons = [...item.reasons];
      let newScore = item.score;

      if (prioritizeFirst && index < 3) {
        newScore *= 1.5;
        newReasons.push("user-prioritize-first");
      }

      if (prioritizeLast && index >= importanceScores.length - 3) {
        newScore *= 1.4;
        newReasons.push("user-prioritize-last");
      }

      return {
        ...item,
        score: newScore,
        reasons: newReasons,
      };
    });
  }

  private applyCompression(
    importanceScores: Array<{ text: string; score: number; reasons: string[] }>,
    maxTokens: number,
    level: "light" | "moderate" | "aggressive",
    codeMap: Map<string, string>,
    bufferPercentage: number = 10
  ): string {
    // Sort by importance
    const sorted = [...importanceScores].sort((a, b) => b.score - a.score);

    // Determine threshold based on compression level
    const threshold = this.getCompressionThreshold(sorted, level);
    const important = sorted.filter((item) => item.score >= threshold);

    // Build compressed text within token limit
    let compressed = "";
    let currentTokens = 0;

    // Use configurable buffer percentage
    const bufferMultiplier = (100 - bufferPercentage) / 100;
    const effectiveMaxTokens = Math.floor(maxTokens * bufferMultiplier);

    // Always preserve highest scoring sentences first
    for (const item of important) {
      const sentenceTokens = this.estimateTokens(item.text);

      if (currentTokens + sentenceTokens <= effectiveMaxTokens) {
        compressed += item.text + ". ";
        currentTokens += sentenceTokens;
      }
    }

    // Restore code elements
    let result = compressed.trim();
    codeMap.forEach((code, placeholder) => {
      result = result.replace(new RegExp(placeholder, "g"), code);
    });

    // Final token-based trimming if still over limit
    if (this.estimateTokens(result) > maxTokens) {
      result = this.trimToTokenLimit(result, maxTokens);
    }

    return result;
  }

  private getCompressionThreshold(
    sortedScores: Array<{ score: number }>,
    level: "light" | "moderate" | "aggressive"
  ): number {
    if (sortedScores.length === 0) return 1.0;

    const scores = sortedScores.map((s) => s.score);
    const median = scores[Math.floor(scores.length / 2)];
    const max = Math.max(...scores);

    switch (level) {
      case "light":
        return Math.max(median * 0.8, 1.0);
      case "moderate":
        return Math.max(median * 1.1, 1.2);
      case "aggressive":
        return Math.max(max * 0.7, median * 1.3);
      default:
        return Math.max(median * 1.1, 1.2);
    }
  }

  private segmentSentences(text: string, locale?: string): string[] {
    try {
      // Use Intl.Segmenter for language-aware sentence segmentation
      if (typeof Intl !== "undefined" && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter(locale || "en", {
          granularity: "sentence",
        });
        const segments = Array.from(segmenter.segment(text));
        return segments
          .map((segment) => segment.segment.trim())
          .filter((s) => s.length > 10); // Filter out very short fragments
      }
    } catch (error) {
      // Fallback if Intl.Segmenter not supported or fails
    }

    // Fallback: use basic period/exclamation/question mark splitting
    // This is not language-specific but works as emergency fallback
    return text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
  }

  private trimToTokenLimit(text: string, maxTokens: number): string {
    const sentences = this.segmentSentences(text);
    let result = "";
    let tokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence + ".");
      if (tokens + sentenceTokens <= maxTokens) {
        result += sentence + ". ";
        tokens += sentenceTokens;
      } else {
        break;
      }
    }

    return result.trim();
  }

  private estimateTokens(text: string): number {
    // Use Intl.Segmenter for accurate word/grapheme counting when available
    try {
      if (typeof Intl !== "undefined" && Intl.Segmenter) {
        // Try to detect if text is primarily CJK using Unicode ranges (not hardcoded patterns)
        const sample = text.slice(0, 200);
        let cjkCount = 0;
        let totalChars = 0;

        // Count characters by Unicode ranges (Unicode.org standard ranges)
        for (const char of sample) {
          const codePoint = char.codePointAt(0)!;
          totalChars++;

          // CJK Unified Ideographs, Hiragana, Katakana, Hangul
          if (
            (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
            (codePoint >= 0x3040 && codePoint <= 0x309f) ||
            (codePoint >= 0x30a0 && codePoint <= 0x30ff) ||
            (codePoint >= 0xac00 && codePoint <= 0xd7af)
          ) {
            cjkCount++;
          }
        }

        const cjkRatio = totalChars > 0 ? cjkCount / totalChars : 0;

        if (cjkRatio > 0.3) {
          // Primarily CJK text: each character is roughly 1.5 tokens
          return Math.ceil(text.length * 1.5);
        } else {
          // Primarily non-CJK text: roughly 4 chars per token
          return Math.ceil(text.length / 4);
        }
      }
    } catch (error) {
      // Fallback if Intl.Segmenter not available
    }

    // Simple fallback: assume average of 4 characters per token
    return Math.ceil(text.length / 4);
  }
}

// Simple API functions with error handling
export async function compressUserInput(
  text: string,
  maxTokens: number = DEFAULT_CONFIG.maxTokens 
): Promise<string> {
  try {
    const compressor = new TextCompressionUtility();
    const result = await compressor.compress(text, {
      maxTokens,
      preserveCodeBlocks: true,
      compressionLevel: "moderate",
    });
    return result.compressedText;
  } catch (error) {
    console.error("Text compression failed:", error);
    // Fallback: simple truncation
    if (!text || typeof text !== "string") return "";
    const estimatedTokens = Math.ceil(text.length / 4);
    if (estimatedTokens <= maxTokens) return text;

    const targetLength = Math.floor(maxTokens * 3.5); // Conservative estimate
    return text.substring(0, targetLength) + "...";
  }
}

export async function compressConversationHistory(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): Promise<Array<{ role: string; content: string }>> {
  const tokensPerMessage = Math.floor(maxTokens / messages.length);
  const compressor = new TextCompressionUtility();

  const compressedMessages = await Promise.all(
    messages.map(async (message) => ({
      ...message,
      content: (
        await compressor.compress(message.content, {
          maxTokens: tokensPerMessage,
          compressionLevel: "moderate",
        })
      ).compressedText,
    }))
  );

  return compressedMessages;
}

export async function analyzeTextImportance(
  text: string
): Promise<Array<{ text: string; score: number; reasons: string[] }>> {
  const logger = ModalityLogger.getInstance('TextCompression', 'error');
  const analyzer = new IntelligentImportanceAnalyzer(logger, DEFAULT_CONFIG);
  return await analyzer.analyzeImportance(text);
}

// Advanced compression function with full options
export async function compressText(
  text: string,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const compressor = new TextCompressionUtility();
  return await compressor.compress(text, options);
}

// Fast compression for large texts
export async function fastCompressText(
  text: string,
  maxTokens: number = DEFAULT_CONFIG.maxTokens 
): Promise<string> {
  const compressor = new TextCompressionUtility();
  const result = await compressor.compress(text, {
    maxTokens,
    fastMode: true,
    preserveCodeBlocks: true,
    compressionLevel: "moderate",
    bufferPercentage: 5, // Tighter buffer for fast mode
  });
  return result.compressedText;
}

// Compress with language detection
export async function compressWithLanguageDetection(
  text: string,
  maxTokens: number = DEFAULT_CONFIG.maxTokens 
): Promise<CompressionResult> {
  const compressor = new TextCompressionUtility();
  return await compressor.compress(text, {
    maxTokens,
    autoDetectLanguage: true,
    preserveCodeBlocks: true,
    compressionLevel: "moderate",
  });
}

// Note: Synchronous versions have been removed as the implementation
// now relies on async Intl APIs for proper language detection and segmentation.
// Use the async versions (compressUserInput, compressText, fastCompressText) instead.
