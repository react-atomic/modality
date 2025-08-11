# `modality-kit`

> A TypeScript-based toolkit for building web applications and managing communication with a backend server. It provides a set of utilities and components for handling JSON-RPC messages, managing pending operations, and creating reactive web components.

## Repository

-   `GIT`
    -   https://github.com/react-atomic/modality
-   `NPM`
    -   https://www.npmjs.com/package/modality-kit

## Features

*   **JSON-RPC Manager:** A robust JSON-RPC 2.0 implementation for WebSocket communication, with support for method registration, request handling, and batching.
*   **Pending Operations:** A generic library for managing asynchronous operations with timeouts, cleanup, and lifecycle management.
*   **Reactive Components:** A base class for creating React-like web components with state management and automatic re-rendering.
*   **Text Compression:** A utility for compressing text, with support for language detection and importance analysis.
*   **Error Handling and Logging:** Consistent error handling and a flexible logging framework.
*   **AI Tools Integration:** A utility for setting up and registering AI tools with an MCP server.

## Usage

```typescript
import { JSONRPCManager } from 'modality-kit';

// 1. Initialize the JSON-RPC Manager
const rpcManager = new JSONRPCManager();

// 2. Register a method
rpcManager.registerMethod('echo', {
  handler: (params) => {
    return Promise.resolve(params);
  },
  description: 'Echoes back the given parameters.',
});

// 3. Handle an incoming request (e.g., from a WebSocket)
async function handleIncomingMessage(message: string) {
  const response = await rpcManager.validateMessage(message);
  // Send the response back to the client
}

// Example of an incoming request
const request = {
  jsonrpc: '2.0',
  method: 'echo',
  params: { message: 'Hello, world!' },
  id: 1,
};

handleIncomingMessage(JSON.stringify(request));
```