/**
 * Storage Logger for structured logging
 * Provides consistent logging across storage operations with configurable levels
 */


export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

export interface LoggerOptions {
  timestampFormat?: 'iso' | 'locale' | false;
  color?: boolean;
  json?: boolean;
  context?: Record<string, any>;
}

export class ModalityLogger {
  constructor(
    private options: LoggerOptions = {},
    private logLevel: LogLevel = 'info'
  ) {}

  private getTimestamp(): string | undefined {
    if (this.options.timestampFormat === false) return undefined;
    const now = new Date();
    if (this.options.timestampFormat === 'locale') return now.toLocaleString();
    return now.toISOString();
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'success'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private format(level: LogLevel, message: string, context: Record<string, any> = {}, extra?: any): any {
    const timestamp = this.getTimestamp();
    const ctx = { ...(this.options.context || {}), ...context };
    const base = {
      level,
      message,
      ...(timestamp ? { timestamp } : {}),
      ...(Object.keys(ctx).length ? { context: ctx } : {}),
      ...(extra ? { ...extra } : {})
    };
    if (this.options.json) return JSON.stringify(base);
    let prefix = '';
    switch (level) {
      case 'debug': prefix = '🔍'; break;
      case 'info': prefix = 'ℹ️'; break;
      case 'warn': prefix = '⚠️'; break;
      case 'error': prefix = '❌'; break;
      case 'success': prefix = '✅'; break;
      default: prefix = '';
    }
    let out = `${prefix} ${message}`;
    if (timestamp) out = `[${timestamp}] ` + out;
    if (Object.keys(ctx).length) out += ` | context: ${JSON.stringify(ctx)}`;
    return extra ? [out, extra] : [out];
  }

  withContext(context: Record<string, any>) {
    return new ModalityLogger({ ...this.options, context: { ...(this.options.context || {}), ...context } }, this.logLevel);
  }

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  setOptions(options: LoggerOptions) {
    this.options = { ...this.options, ...options };
  }

  log(level: LogLevel, message: string, context: Record<string, any> = {}, extra?: any) {
    if (!this.shouldLog(level)) return;
    const formatted = this.format(level, message, context, extra);
    switch (level) {
      case 'debug':
        this.options.json ? console.debug(formatted) : console.debug(...formatted);
        break;
      case 'info':
        this.options.json ? console.info(formatted) : console.info(...formatted);
        break;
      case 'warn':
        this.options.json ? console.warn(formatted) : console.warn(...formatted);
        break;
      case 'error':
        this.options.json ? console.error(formatted) : console.error(...formatted);
        break;
      case 'success':
        this.options.json ? console.log(formatted) : console.log(...formatted);
        break;
      default:
        this.options.json ? console.log(formatted) : console.log(...formatted);
    }
  }

  debug(message: string, context?: Record<string, any>, error?: Error) {
    const extra = error ? { error: error.message, stack: error.stack } : undefined;
    this.log('debug', message, context, extra);
  }

  info(message: string, context?: Record<string, any>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, any>, error?: Error) {
    const extra = error ? { error: error.message, stack: error.stack } : undefined;
    this.log('error', message, context, extra);
  }

  success(message: string, context?: Record<string, any>) {
    this.log('success', message, context);
  }
}
