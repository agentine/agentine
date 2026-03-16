/**
 * Express/Connect middleware for HTTP request logging.
 *
 * Usage:
 *   import { configure, getLogger, connectLogger } from '@agentine/pyre';
 *   configure({ ... });
 *   const logger = getLogger('http');
 *   app.use(connectLogger(logger, { level: 'INFO' }));
 */

import type { Logger } from './logger.js';
import { getLevel, type Level } from './levels.js';

export interface ConnectLoggerOptions {
  /** Default log level (default: INFO) */
  level?: string | Level;
  /** Format string or function for log output */
  format?: string | FormatFn;
  /** Override level based on HTTP status code */
  statusRules?: StatusRule[];
  /** Nolog — patterns to exclude from logging */
  nolog?: string | RegExp | Array<string | RegExp>;
  /** Context — extra key-value pairs to add to the logger context */
  context?: boolean;
}

export interface StatusRule {
  from: number;
  to: number;
  level: string | Level;
}

type FormatFn = (
  req: HttpRequest,
  res: HttpResponse,
  formatToken: (str: string) => string,
) => string;

interface HttpRequest {
  method?: string;
  url?: string;
  originalUrl?: string;
  httpVersion?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

interface HttpResponse {
  statusCode?: number;
  getHeader?: (name: string) => string | number | string[] | undefined;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

type NextFn = (err?: unknown) => void;

/**
 * Create an Express/Connect middleware that logs HTTP requests.
 */
export function connectLogger(
  logger: Logger,
  options: ConnectLoggerOptions = {},
): (req: HttpRequest, res: HttpResponse, next: NextFn) => void {
  const defaultLevel = resolveLevel(options.level) ?? getLevel('INFO')!;

  return (req: HttpRequest, res: HttpResponse, next: NextFn): void => {
    // Check nolog exclusions
    if (options.nolog && matchesNolog(req, options.nolog)) {
      next();
      return;
    }

    const startTime = Date.now();

    // Set context if requested
    if (options.context) {
      logger.addContext('method', req.method);
      logger.addContext('url', req.originalUrl ?? req.url);
    }

    // Log on response finish
    const onFinish = (): void => {
      res.on('finish', () => {}); // prevent double-fire
      const responseTime = Date.now() - startTime;
      const level = resolveStatusLevel(res.statusCode ?? 200, options.statusRules) ?? defaultLevel;
      const message = formatMessage(req, res, responseTime, options.format);

      const logMethod = getLogMethod(logger, level);
      logMethod.call(logger, message);

      if (options.context) {
        logger.removeContext('method');
        logger.removeContext('url');
      }
    };

    res.on('finish', onFinish);
    next();
  };
}

function resolveLevel(level?: string | Level): Level | undefined {
  if (!level) return undefined;
  if (typeof level === 'string') return getLevel(level);
  return level;
}

function resolveStatusLevel(
  statusCode: number,
  rules?: StatusRule[],
): Level | undefined {
  if (!rules) return undefined;
  for (const rule of rules) {
    if (statusCode >= rule.from && statusCode <= rule.to) {
      return resolveLevel(rule.level);
    }
  }
  return undefined;
}

function getLogMethod(logger: Logger, level: Level): (...args: unknown[]) => void {
  const name = level.levelStr.toLowerCase();
  switch (name) {
    case 'trace': return logger.trace;
    case 'debug': return logger.debug;
    case 'info': return logger.info;
    case 'warn': return logger.warn;
    case 'error': return logger.error;
    case 'fatal': return logger.fatal;
    default: return logger.info;
  }
}

function formatMessage(
  req: HttpRequest,
  res: HttpResponse,
  responseTime: number,
  format?: string | FormatFn,
): string {
  const method = req.method ?? 'GET';
  const url = req.originalUrl ?? req.url ?? '/';
  const status = res.statusCode ?? 200;

  if (typeof format === 'function') {
    const tokenFn = (str: string): string =>
      replaceTokens(str, req, res, responseTime);
    return format(req, res, tokenFn);
  }

  if (typeof format === 'string') {
    return replaceTokens(format, req, res, responseTime);
  }

  // Default format
  return `${method} ${url} ${status} ${responseTime}ms`;
}

function replaceTokens(
  str: string,
  req: HttpRequest,
  res: HttpResponse,
  responseTime: number,
): string {
  return str
    .replace(/:method/g, req.method ?? 'GET')
    .replace(/:url/g, req.originalUrl ?? req.url ?? '/')
    .replace(/:status/g, String(res.statusCode ?? 200))
    .replace(/:response-time/g, String(responseTime))
    .replace(/:referrer/g, String(req.headers?.referer ?? req.headers?.referrer ?? ''))
    .replace(/:http-version/g, req.httpVersion ?? '1.1')
    .replace(/:remote-addr/g, req.socket?.remoteAddress ?? '');
}

function matchesNolog(
  req: HttpRequest,
  nolog: string | RegExp | Array<string | RegExp>,
): boolean {
  const url = req.originalUrl ?? req.url ?? '';
  const patterns = Array.isArray(nolog) ? nolog : [nolog];

  for (const pattern of patterns) {
    if (typeof pattern === 'string') {
      if (url.includes(pattern)) return true;
    } else {
      if (pattern.test(url)) return true;
    }
  }
  return false;
}
