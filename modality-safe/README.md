# Modality Safe

Advanced security scanner that detects API key leaks and sensitive information in source code. Scans TypeScript, JavaScript, Markdown, and configuration files for AWS keys, OpenAI tokens, GitHub/GitLab PATs, Slack/Discord tokens, JWT tokens, and other credentials with intelligent whitelist filtering to reduce false positives.

## Repository

- **GIT**
  - https://github.com/react-atomic/modality
- **NPM**
  - https://www.npmjs.com/package/modality-safe

## Features

- 🔍 **Comprehensive Detection** - Scans for 10+ types of API keys and tokens
- 🎯 **Smart Filtering** - Intelligent whitelist to reduce false positives
- 📁 **Multi-Format Support** - TypeScript, JavaScript, Markdown, YAML, JSON files
- ⚡ **Fast Scanning** - Built with Bun for high performance
- 🛡️ **Security First** - Designed for CI/CD pipeline integration

## Supported API Keys & Tokens

- **AWS**: Access Keys, Secret Keys
- **OpenAI**: API Keys (`sk-...`)
- **Google/Gemini**: API Keys (`AIza...`)
- **GitHub**: Personal Access Tokens (`ghp_...`)
- **GitLab**: Personal Access Tokens (`glpat-...`)
- **Slack**: Bot/App/User tokens (`xox...`)
- **Discord**: Bot tokens
- **JWT**: JSON Web Tokens
- **Generic**: API keys, Secret keys, Bearer tokens

## Installation

```bash
npm install modality-safe
# or
bun add modality-safe
```

## Usage

### Programmatic API

```typescript
import { detectAPIKeyLeaks, getAllSourceFiles } from 'modality-safe';

// Scan a single file content
const content = 'const apiKey = "sk-1234567890abcdef";';
const leaks = detectAPIKeyLeaks(content);

console.log(leaks);
// Output: [{ line: 1, match: "sk-1234567890abcdef", pattern: "/sk-[a-zA-Z0-9]{48}/g" }]

// Get all source files for scanning
const files = await getAllSourceFiles('./src');
console.log(files); // Array of file paths to scan
```

### Command Line (via tests)

```bash
# Run security tests
bun test

# Run specific test suites
bun test aws-api-key.test.ts
bun test github-api.test.ts
```

## Configuration

The scanner automatically excludes common build artifacts and dependencies:

- `node_modules/`
- `dist/`
- `build/`
- `.git/`
- `coverage/`

**Important**: Documentation files (`.md`, `.txt`) are **always scanned** for security compliance, as they may accidentally contain real API keys.

## Intelligent Filtering

The scanner includes smart filtering to reduce false positives:

- Template examples (`your-api-key`, `example-key`)
- Documentation placeholders
- Code block content in Markdown
- Comment separators
- Empty configuration defaults

## API Reference

### `detectAPIKeyLeaks(content: string)`

Scans text content for API key leaks.

**Parameters:**
- `content`: String content to scan

**Returns:**
Array of leak objects with:
- `line`: Line number (1-based)
- `match`: The detected API key
- `pattern`: RegExp pattern that matched

### `getAllSourceFiles(dir: string)`

Recursively scans directory for source files to analyze.

**Parameters:**
- `dir`: Directory path to scan

**Returns:**
Promise resolving to array of file paths

### `getSafePattern()`

Returns the internal patterns used for detection and filtering.

**Returns:**
Object with:
- `API_KEY_PATTERNS`: Detection patterns
- `WHITE_LIST_PATTERNS`: Safe patterns to ignore
- `EXCLUDE_PATTERNS`: Directories to skip
- `SCANNED_FILE_EXTENSIONS`: File types to scan

## Development

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Run tests
bun test

# Development with watch mode
bun run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new API key patterns
4. Ensure all tests pass
5. Submit a pull request

## Security

This tool is designed to help prevent security vulnerabilities. If you find security issues or need to report a vulnerability, please create an issue in the repository.

## License

ISC License

@202509
