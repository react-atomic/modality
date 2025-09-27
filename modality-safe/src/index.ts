import { readdir } from "fs/promises";
import { join } from "path";

// Common API key patterns to detect
const API_KEY_PATTERNS = [
  // Google/Gemini API keys
  /AIza[0-9A-Za-z-_]{35}/g,
  // OpenAI API keys
  /sk-[a-zA-Z0-9]{48}/g,
  // Generic API key patterns
  /api[_-]?key["\s]*[:=]["\s]*[a-zA-Z0-9-_]{20,}/gi,
  /secret[_-]?key["\s]*[:=]["\s]*[a-zA-Z0-9-_]{20,}/gi,
  // Bearer tokens
  /bearer[\s]+[a-zA-Z0-9-_]{20,}/gi,
  // JWT tokens (basic detection)
  /eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+/g,
  // AWS Access Keys
  /AKIA[0-9A-Z]{16}/g,
  // AWS Secret Keys (very specific to avoid false positives - must contain mixed case and not be just = chars)
  /(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])[A-Za-z0-9/+=]{40}(?=\s|$|"|')/g,
  // Slack tokens
  /xox[baprs]-[0-9a-zA-Z-]{10,48}/g,
  // Discord tokens
  /[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}/g,
  // GitHub Personal Access Tokens
  /ghp_[0-9a-zA-Z]{36}/g,
  // GitLab Personal Access Tokens
  /glpat-[0-9a-zA-Z-_]{20}/g,
];

// Known safe patterns that might match but are not real API keys
// These patterns help distinguish between real API keys and documentation examples
const WHITE_LIST_PATTERNS = [
  // Documentation examples and placeholders
  /your[_-]?api[_-]?key/gi, // Example: "your-api-key", "your_api_key"
  /your[_-]?actual[_-]?api[_-]?key/gi, // Example: "your-actual-api-key"
  /example[_-]?key/gi, // Example: "example-key", "example_key"
  /test[_-]?api[_-]?key/gi, // Example: "test-api-key", "test_api_key"
  /demo[_-]?key/gi, // Example: "demo-key", "demo_key"

  // Template examples that show placeholders
  /your_.*_key/gi, // Example: "your_actual_key", "your_secret_key"
  /your_.*_api_key/gi, // Example: "your_gemini_api_key"

  // Comment separators and formatting
  /^=+$/, // Example: "=============="
  /^-+$/, // Example: "--------------"
  /^\*+$/, // Example: "**************"
  /^#+$/, // Example: "##############"

  // Safe empty string API key defaults in configuration
  /apiKey:\s*""\s*,?/gi, // Example: 'apiKey: "",' or 'apiKey: ""'
];

// Files/directories to exclude from scanning
// CRITICAL SECURITY NOTE: Documentation files (.md, .txt, etc.) should NEVER be excluded!
// Documentation can accidentally contain real API keys that developers copy-paste during writing.
// ONLY exclude build artifacts, dependencies, and this test file itself.
//
// DO NOT ADD: docs/, *.md, README.md, *.txt files to exclusions
// These files MUST be scanned for security compliance.
const EXCLUDE_PATTERNS = [
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
  "bun.lockb",
  // REMINDER: Do not add documentation files here! They must be scanned for security.
];

// File extensions to scan for security issues
// Add new file types here to expand security coverage
const SCANNED_FILE_EXTENSIONS = [
  ".ts", // TypeScript files
  ".tsx",
  ".js", // JavaScript files
  ".jsx",
  "mjs",
  "cjs",
  ".md", // Markdown documentation
  ".mdx", // MDX documentation with React components
  ".txt", // Text files
  ".yml", // YAML configuration files
  ".yaml", // YAML configuration files (alternative extension)
  ".json", // JSON configuration files
];

function isSafePattern(
  text: string,
  content?: string,
  lineNumber?: number
): boolean {
  // More robust code block detection if full content is provided
  if (content && lineNumber) {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlockMatches = content.matchAll(codeBlockRegex);

    for (const match of codeBlockMatches) {
      if (match.index !== undefined) {
        const codeBlockStart = match.index;
        const codeBlockEnd = codeBlockStart + match[0].length;
        const lineStartIndex = content
          .substring(0, codeBlockStart)
          .split("\n").length;
        const lineEndIndex = content
          .substring(0, codeBlockEnd)
          .split("\n").length;

        if (lineNumber >= lineStartIndex && lineNumber <= lineEndIndex) {
          return true; // Inside a code block
        }
      }
    }
  }

  // Check for comment separators (lines with only repeating characters)
  const trimmedLine = text.trim();
  if (/^[=\-*#]+$/.test(trimmedLine) && trimmedLine.length > 10) {
    return true; // This is a comment separator
  }

  // Check against regular safe patterns
  return WHITE_LIST_PATTERNS.some((pattern) => pattern.test(text));
}

export const getSafePattern = () => {
  return {
    API_KEY_PATTERNS,
    WHITE_LIST_PATTERNS,
    EXCLUDE_PATTERNS,
    SCANNED_FILE_EXTENSIONS,
  };
};

/**
 * Security Validation Tests
 *
 * This test suite ensures that no sensitive information is hardcoded in the source code.
 * It scans all TypeScript files for potential security issues including API keys and secrets.
 */
export async function getAllSourceFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function scanDirectory(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relativePath = fullPath.replace(process.cwd() + "/", "");

      // Skip excluded paths
      if (EXCLUDE_PATTERNS.some((pattern) => relativePath.includes(pattern))) {
        continue;
      }

      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (
        entry.isFile() &&
        SCANNED_FILE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))
      ) {
        files.push(fullPath);
      }
    }
  }

  await scanDirectory(dir);
  return files;
}

export function detectAPIKeyLeaks(
  content: string
): Array<{ line: number; match: string; pattern: string }> {
  const lines = content.split("\n");
  const leaks: Array<{ line: number; match: string; pattern: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of API_KEY_PATTERNS) {
      const matches = line.match(pattern);
      if (matches) {
        for (const match of matches) {
          // Skip if it's a safe pattern (environment variable reference, comment, etc.)
          if (!isSafePattern(line, content, i + 1)) {
            leaks.push({
              line: i + 1,
              match: match,
              pattern: pattern.toString(),
            });
          }
        }
      }
    }
  }

  return leaks;
}
