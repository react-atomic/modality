/**
 * MCP Session Manager - Simple session lifecycle management
 */

export interface McpSession {
  id: string;
  createdAt: Date;
  lastActivity: Date;
}

export class McpSessionManager {
  private sessions = new Map<string, McpSession>();

  /**
   * Create a new session
   */
  create(): McpSession {
    const now = new Date();
    const session: McpSession = {
      id: crypto.randomUUID(),
      createdAt: now,
      lastActivity: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Get session by ID
   */
  get(sessionId: string): McpSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update last activity timestamp
   */
  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * Remove a session
   */
  disconnect(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Check if session exists
   */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}
