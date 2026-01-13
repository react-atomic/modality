/**
 * MCP Connection Demo Handler
 *
 * Provides an interactive demonstration page for MCP connection patterns
 * with examples showing how to connect various AI tools and development utilities.
 *
 * Usage: /mcp-demo - returns MCP connection demo documentation and tool showcase
 */

// ============================================
// TOOL SHOWCASE DATA
// ============================================

interface ToolInfo {
  name: string;
  description: string;
  connectionCode: string;
  type: "terminal" | "editor" | "platform";
}

interface MCPConnectionConfig {
  serverName: string;
  serverVersion?: string;
  serverUrl?: string;
  mcpPath?: string;
  defaultFormat?: "json" | "markdown" | "html";
  helloWorld?: string;
}

const defaultOutputFormat = "html";

const connectAIShowcase = (
  serverName: string,
  serverUrl: string,
  mcpPath: string = "/mcp"
): Record<string, ToolInfo> => ({
  claudeCode: {
    name: "Claude Code",
    description: "Official Claude IDE tool for seamless development workflow",
    connectionCode: `claude mcp add -s user --transport http ${serverName} {serverUrl}${mcpPath}`,
    type: "editor",
  },
  githubCli: {
    name: "GitHub CLI",
    description: "Command-line tool with MCP support for GitHub operations",
    connectionCode: `vim ~/.copilot/mcp-config.json

{
  "mcpServers": {
    "${serverName}": {
      "type": "http",
      "url": "{serverUrl}${mcpPath}",
      "headers": {},
      "tools": ["*"]
    }
  }
}`,
    type: "terminal",
  },
  vscode: {
    name: "VS Code",
    description: "Popular code editor with MCP extension support",
    connectionCode: `code --add-mcp '{"name":"${serverName}", "url": "{serverUrl}${mcpPath}", "type": "http"}'`,
    type: "editor",
  },
  mytyAi: {
    name: "Myty AI",
    description: "AI assistant platform with comprehensive MCP capabilities",
    connectionCode: `{
  "mcpServers": {
    "${serverName}": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "{serverUrl}${mcpPath}"
      ]
    }
  }
}`,
    type: "platform",
  },
});

// ============================================
// DEMO CONTENT - MARKDOWN-BASED
// ============================================

const generateDemoDocumentation = (
  serverName: string,
  serverUrl: string,
  mcpPath: string = "/mcp",
  helloWorld?: string
): string => {
  const tools = connectAIShowcase(serverName, "{serverUrl}", mcpPath);
  return `# MCP Connection Guide

${helloWorld ? `## Hello Prompt\n\n${helloWorld}\n` : ""}## How to Connect

1. Copy the connection code for your tool
2. Add it to your MCP configuration
3. Establish the session

## Connection Codes

${
  Object.entries(tools)
    .map(
      ([, tool]) =>
        `### ${tool.name}
\`\`\`
${tool.connectionCode}
\`\`\``
    )
    .join("\n\n")
}
`;
};

// ============================================
// HONO HANDLER
// ============================================


/**
 * Create MCP connection demo handler with server configuration
 * @param config - Server name and version for consistency
 * @returns Hono handler function
 */
export const createMcpConnectionDemoHandler = (config: MCPConnectionConfig) => {
  return async (c: any) => {
    return mcpConnectionDemoHandler(c, config);
  };
};

/**
 * Hono handler for MCP connection demo
 * Returns documentation and tool showcase data
 * @param c - Hono context
 * @param config - Optional server configuration
 * @returns Demo page with connection information
 */
export const mcpConnectionDemoHandler = async (
  c: any,
  config?: MCPConnectionConfig
) => {
  const format = c.req.query("format") || config?.defaultFormat || defaultOutputFormat;
  const serverName = config?.serverName || "mcp-server";
  const mcpPath = config?.mcpPath || "/mcp";

  // Get server URL: from config only (client-side will detect actual protocol)
  let serverUrl: string = config?.serverUrl || "";

  const tools = connectAIShowcase(serverName, serverUrl, mcpPath);
  const documentation = generateDemoDocumentation(serverName, serverUrl, mcpPath, config?.helloWorld);

  // Handle different format requests
  if (format === "markdown" || format === "md") {
    return new Response(documentation, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (format === "html") {
    const htmlContent = generateHtmlPage(serverUrl, config, tools,  mcpPath);
    return new Response(htmlContent, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Default: JSON format with complete data
  const demoData = {
    documentation,
    tools: Object.entries(tools).map(([key, tool]) => ({
      id: key,
      ...tool,
    })),
    server: {
      name: serverName,
      version: config?.serverVersion || "unknown",
      url: serverUrl,
      mcpPath: mcpPath,
    },
    metadata: {
      toolCount: Object.keys(tools).length,
      lastUpdated: new Date().toISOString(),
      format: "json",
      availableFormats: ["json", "markdown", "html"],
    },
  };

  return c.json(demoData, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

// ============================================
// HTML GENERATION
// ============================================

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

function escapeForJs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}

function generateHtmlPage(
  serverUrl: string,
  config?: MCPConnectionConfig,
  tools?: Record<string, ToolInfo>,
  mcpPath: string = "/mcp"
): string {
  const toolsToDisplay =
    tools || connectAIShowcase(config?.serverName || "mcp-server", serverUrl, mcpPath);
  const toolsHtml = Object.entries(toolsToDisplay)
    .map(
      ([, tool]) => `
    <div class="tool-card">
      <h3>${tool.name}</h3>
      <p class="tool-type">${tool.type}</p>
      <p class="tool-description">${tool.description}</p>
      <div class="connection-section">
        <label>Connection Code</label>
        <pre class="code-block"><code>${escapeHtml(tool.connectionCode)}</code></pre>
        <button class="copy-btn" onclick="copyToClipboard(\`${escapeForJs(tool.connectionCode)}\`)">
          Copy
        </button>
      </div>
    </div>
  `
    )
    .join("\n");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config?.serverName || "MCP Connection Demo"}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 3rem 2rem;
      text-align: center;
    }

    header h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }

    header p {
      font-size: 1.1rem;
      opacity: 0.9;
    }

    .content {
      padding: 2rem;
    }

    .intro-section {
      margin-bottom: 3rem;
      padding: 2rem;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }

    .intro-section h2 {
      color: #333;
      margin-bottom: 1rem;
      font-size: 1.5rem;
    }

    .intro-section p {
      color: #666;
      line-height: 1.6;
      margin-bottom: 1rem;
    }

    .tools-section {
      margin-top: 3rem;
    }

    .tools-section h2 {
      color: #333;
      margin-bottom: 2rem;
      font-size: 1.5rem;
      border-bottom: 2px solid #667eea;
      padding-bottom: 1rem;
    }

    .tools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 2rem;
    }

    .tool-card {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 1.5rem;
      transition: all 0.3s ease;
      background: white;
    }

    .tool-card:hover {
      border-color: #667eea;
      box-shadow: 0 8px 24px rgba(102, 126, 234, 0.15);
      transform: translateY(-2px);
    }

    .tool-card h3 {
      color: #333;
      margin-bottom: 0.5rem;
      font-size: 1.3rem;
    }

    .tool-type {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 1rem;
    }

    .tool-description {
      color: #666;
      margin-bottom: 1.5rem;
      line-height: 1.6;
      font-size: 0.95rem;
    }

    .connection-section {
      margin-top: 1rem;
    }

    .connection-section label {
      display: block;
      color: #333;
      font-weight: 600;
      margin-bottom: 0.5rem;
      font-size: 0.9rem;
    }

    .url-container {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    code {
      background: transparent;
      padding: 0;
      border: none;
      color: #333;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.85rem;
      word-break: break-all;
    }

    .code-block {
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.85rem;
      color: #333;
      border: 1px solid #e0e0e0;
      overflow-x: auto;
      margin: 0.5rem 0 1rem 0;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .copy-btn {
      background: #667eea;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.85rem;
      transition: background 0.2s ease;
      white-space: nowrap;
    }

    .copy-btn:hover {
      background: #764ba2;
    }

    .copy-btn:active {
      transform: scale(0.98);
    }

    footer {
      background: #f8f9fa;
      padding: 2rem;
      text-align: center;
      color: #666;
      border-top: 1px solid #e0e0e0;
      font-size: 0.9rem;
    }

    @media (max-width: 768px) {
      header h1 {
        font-size: 1.8rem;
      }

      .tools-grid {
        grid-template-columns: 1fr;
      }

      .content {
        padding: 1rem;
      }

      .url-container {
        flex-direction: column;
      }

      .copy-btn {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🌐 ${config?.serverName || "MCP Connection Demo"}</h1>
      <p>Interactive guide for connecting AI tools and development utilities</p>
      <p style="font-size: 0.95rem; margin-top: 1rem; opacity: 0.9;">Server URL: <strong id="server-url-display" style="color: #ffd700; background: rgba(255, 215, 0, 0.2); padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 700;">${serverUrl ? serverUrl + mcpPath : "Detecting..."}</strong></p>
    </header>

    <div class="content">
      ${
        config?.helloWorld
          ? `<div class="intro-section">
        <h2>Hello Prompt</h2>
        <code>${config.helloWorld}</code>
      </div>`
          : `<div class="intro-section">
        <h2>Welcome to MCP</h2>
        <p>
          The Model Context Protocol (MCP) provides a standardized way for AI tools
          and development utilities to exchange information and capabilities.
        </p>
        <p>
          Below you'll find connection URLs for popular tools. Copy the URL for your
          tool and add it to your MCP configuration.
        </p>
      </div>`
      }

      <div class="tools-section">
        <h2>Connect your AI assistant</h2>
        <div class="tools-grid">
          ${toolsHtml}
        </div>
      </div>
    </div>

    <footer>
      <p>${config?.serverName || "MCP Connection Demo"} &copy; 2026 | Last updated: ${new Date().toLocaleDateString()}</p>
      ${
        config
          ? `<p>Server: <strong>${config.serverName} ${config.serverVersion ? `v${config.serverVersion}` : ""}</strong></p>`
          : ""
      }
    </footer>
  </div>

  <script>
    // Detect client-side protocol and replace placeholders
    function initializeServerUrl() {
      const protocol = window.location.protocol.replace(':', '');
      const host = window.location.host;
      const serverUrl = protocol + '://' + host;
      const mcpPath = '${mcpPath}';

      // Update server URL display
      const displayElement = document.getElementById('server-url-display');
      if (displayElement) {
        displayElement.textContent = serverUrl + mcpPath;
      }

      // Replace {serverUrl} placeholders in all code blocks
      document.querySelectorAll('pre code').forEach(codeBlock => {
        let code = codeBlock.textContent;
        code = code.replace(/{serverUrl}/g, serverUrl);
        codeBlock.textContent = code;
      });
    }

    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
      });
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeServerUrl);
    } else {
      initializeServerUrl();
    }

    // Log page load performance
    window.addEventListener('load', () => {
      const perfData = performance.getEntriesByType('navigation')[0];
      if (perfData) {
        console.log('Page Load Time:', perfData.loadEventEnd - perfData.fetchStart, 'ms');
      }
    });
  </script>
</body>
</html>
  `.trim();
}

