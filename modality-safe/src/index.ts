import { join } from "path";

export interface LeakData {
  line: number;
  match: string;
  pattern: string;
  filePath: string;
  key: string;
}

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
  "/proc",
  // REMINDER: Do not add documentation files here! They must be scanned for security.
];

// File extensions to scan for security issues
// Add new file types here to expand security coverage
const SCANNED_FILE_EXTENSIONS = [
  ".ts", // TypeScript files
  ".tsx",
  ".js", // JavaScript files
  ".jsx",
  ".mjs",
  ".cjs",
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

/**
 * Load ignore patterns from file (like .gitignore format)
 * @param {string} ignoreFilePath - Path to the ignore file
 * @returns {Promise<string[]>} Array of ignore patterns
 */
const loadIgnoreFile = async (ignoreFilePath: string): Promise<string[]> => {
  try {
    const { readFile } = await import("fs/promises");
    const content = await readFile(ignoreFilePath, "utf8");
    const patterns = content
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          line !== "" && !line.startsWith("#") && !line.startsWith("//")
      );
    return patterns;
  } catch {
    return [];
  }
};

/**
 * Load custom whitelist from file
 * @param {string} whitelistPath - Path to the whitelist file
 * @returns {Promise<Set<string>>} Set of whitelisted items
 */
const loadCustomWhitelist = async (
  whitelistPath: string
): Promise<Set<string>> => {
  try {
    const { readFile } = await import("fs/promises");
    const content = await readFile(whitelistPath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    return new Set(lines);
  } catch {
    return new Set();
  }
};

/**
 * Save custom whitelist to file
 * @param {string} whitelistPath - Path to save the whitelist file
 * @param {Set<string>} whitelist - Set of items to save
 */
const saveCustomWhitelist = async (
  whitelistPath: string,
  whitelist: Set<string>
): Promise<void> => {
  const { writeFile } = await import("fs/promises");
  const sortedList = Array.from(whitelist).sort();
  await writeFile(whitelistPath, sortedList.join("\n") + "\n", "utf8");
};

/**
 * Check if an item is in the custom whitelist
 * @param {string} item - Item to check
 * @param {Set<string>} whitelist - Whitelist set
 * @returns {boolean} True if item is whitelisted
 */
const isCustomWhitelisted = (item: string, whitelist: Set<string>): boolean => {
  return whitelist.has(item);
};

/**
 * Add detected leaks to whitelist Set
 * @param {Set<string>} whitelist - Existing whitelist Set
 * @param {Array<{key?: string, match: string}>} leaks - Array of detected leaks
 * @returns {number} Number of new items added
 */
const addLeaksToWhitelist = (
  whitelist: Set<string>,
  leaks: LeakData[]
): number => {
  const initialSize = whitelist.size;
  leaks.forEach((leak) => {
    // Use key if available (file-based), otherwise use match (content-based)
    const entryToAdd = leak.key || leak.match;
    whitelist.add(entryToAdd);
  });
  return whitelist.size - initialSize;
};

/**
 * Security Validation Tests
 *
 * This test suite ensures that no sensitive information is hardcoded in the source code.
 * It scans all TypeScript files for potential security issues including API keys and secrets.
 */
async function getAllSourceFiles(
  dir: string,
  ignoreFilePath?: string
): Promise<string[]> {
  const { readdir } = await import("fs/promises");
  const files: string[] = [];

  // Load ignore patterns from file if provided
  const ignorePatterns = ignoreFilePath
    ? await loadIgnoreFile(ignoreFilePath)
    : [];

  // Combine default exclude patterns with loaded ignore patterns
  const allExcludePatterns = [...EXCLUDE_PATTERNS, ...ignorePatterns];

  async function scanDirectory(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relativePath = fullPath.replace(process.cwd() + "/", "");

      // Skip excluded paths
      if (
        allExcludePatterns.some((pattern) => relativePath.includes(pattern))
      ) {
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

export const getSafePattern = () => {
  return {
    API_KEY_PATTERNS,
    WHITE_LIST_PATTERNS,
    EXCLUDE_PATTERNS,
    SCANNED_FILE_EXTENSIONS,
  };
};

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

export async function detectAPIKeyLeaksWithFiles(
  directory: string,
  ignoreFilePath?: string,
  customWhitelistPath?: string,
  updateWhitelist?: boolean
): Promise<LeakData[]> {
  const { readFile } = await import("fs/promises");

  // Get all source files using existing function, passing ignore file path
  if (null == ignoreFilePath) {
    ignoreFilePath = `${directory}/.gitignore`;
  }
  const files = await getAllSourceFiles(directory, ignoreFilePath);

  // Load custom whitelist if path provided
  // customWhitelist contains entries like: "src/config.ts:sk-1234567890..." or "docs/api.md:AIzaExample123"
  const customWhitelist = customWhitelistPath
    ? await loadCustomWhitelist(customWhitelistPath)
    : new Set<string>();

  const allLeaks: LeakData[] = [];

  for (const filePath of files) {
    try {
      // Read content from file
      const content = await readFile(filePath, "utf8");

      // Get basic leaks without whitelist filtering (we'll do file-based filtering)
      const basicLeaks = detectAPIKeyLeaks(content);

      // Transform basic leaks to include file info and check against file-based whitelist
      const leaksWithFile = basicLeaks
        .map((leak) => {
          const key = `${filePath}:${leak.match}`;
          return {
            ...leak,
            filePath,
            key,
          };
        })
        .filter((leak) => !isCustomWhitelisted(leak.key, customWhitelist));

      allLeaks.push(...leaksWithFile);
    } catch (error) {
      // Skip files that can't be read
      throw new Error(`Could not read file ${filePath}: ${error}`);
    }
  }

  // Update whitelist if requested and path provided
  if (updateWhitelist && customWhitelistPath && allLeaks.length > 0) {
    const newItemsAdded = addLeaksToWhitelist(customWhitelist, allLeaks);
    await saveCustomWhitelist(customWhitelistPath, customWhitelist);
    console.log(
      `Added ${newItemsAdded} new API key leaks to whitelist: ${customWhitelistPath}`
    );
  }

  return allLeaks;
}
