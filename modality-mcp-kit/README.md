# Modality MCP Kit

Schema conversion utilities for MCP tool development with multi-library support. Provides universal JSON Schema conversion via xsschema and AITool-to-FastMCP transformation utilities.

## Features

- **Universal Schema Conversion**: Convert Zod, Valibot, ArkType, Effect, and Sury schemas to JSON Schema via `xsschema`
- **MCP Tool Registration**: Transform AITool definitions to FastMCP-compatible format
- **Type-Safe**: Full TypeScript support with preserved schema types
- **Lightweight**: Minimal dependencies, focused on MCP tool development

## Installation

```bash
npm install modality-mcp-kit
# or
bun add modality-mcp-kit
```

## Usage

### Schema Conversion

```typescript
import { toJsonSchema } from "modality-mcp-kit";
import { z } from "zod";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number(),
});

const jsonSchema = toJsonSchema(userSchema);
```

### MCP Tool Setup

```typescript
import { setupAITools, ModalityFastMCP } from "modality-mcp-kit";
import { z } from "zod";

const mcp = new ModalityFastMCP();

const aiTools = {
  getUserById: {
    name: "get_user",
    description: "Get user by ID",
    inputSchema: z.object({ id: z.string() }),
    execute: async (args) => {
      return { id: args.id, name: "John" };
    },
  },
};

// Registers tools with MCP server and transforms inputSchema → parameters
setupAITools(aiTools, mcp);
```

## API

### `toJsonSchema(schema)`

Converts any supported schema (Zod, Valibot, ArkType, Effect, Sury) to JSON Schema.

### `setupAITools(aiTools, mcpServer?)`

Transforms AITool definitions to FastMCP format:
- Converts `inputSchema` to `parameters`
- Uses key as `name` if not specified
- Registers with optional MCP server

### `ModalityFastMCP`

FastMCP-compatible implementation with `addTool()` and `getTools()` methods.

## Repository

- **GitHub**: https://github.com/react-atomic/modality
- **NPM**: https://www.npmjs.com/package/modality-mcp-kit

## License

MIT

