import type { LogEvent } from '../LogEvent.js';
import type { LayoutProvider } from '../appenders/index.js';

export type LayoutFunction = (event: LogEvent) => string;
export type LayoutFactory = (config?: Record<string, unknown>) => LayoutFunction;

const layoutFactories = new Map<string, LayoutFactory>();

export function registerLayout(name: string, factory: LayoutFactory): void {
  layoutFactories.set(name, factory);
}

function getLayoutFactory(name: string): LayoutFactory {
  const factory = layoutFactories.get(name);
  if (!factory) {
    throw new Error(`pyre: unknown layout type "${name}"`);
  }
  return factory;
}

/** LayoutProvider passed to appenders. */
export const layoutFactory: LayoutProvider = {
  layout(name: string, config?: Record<string, unknown>): LayoutFunction {
    return getLayoutFactory(name)(config);
  },
};

/** Public API for registering custom layouts. */
export function addLayout(name: string, factory: LayoutFactory): void {
  layoutFactories.set(name, factory);
}

// -- Built-in layouts (inline to avoid circular imports) --

function formatData(data: unknown[]): string {
  return data
    .map((d) => {
      if (d instanceof Error) return d.stack ?? d.message;
      if (typeof d === 'string') return d;
      return JSON.stringify(d);
    })
    .join(' ');
}

// basic: [timestamp] [LEVEL] category - message
registerLayout('basic', () => (event) => {
  const ts = event.startTime.toISOString();
  return `[${ts}] [${event.level.levelStr}] ${event.categoryName} - ${formatData(event.data)}`;
});

// colored: basic with ANSI colors
const ANSI_COLORS: Record<string, string> = {
  grey: '\x1b[90m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};
const ANSI_RESET = '\x1b[0m';

registerLayout('colored', () => (event) => {
  const ts = event.startTime.toISOString();
  const color = ANSI_COLORS[event.level.colour] ?? '';
  const reset = color ? ANSI_RESET : '';
  return `[${ts}] ${color}[${event.level.levelStr}]${reset} ${color}${event.categoryName}${reset} - ${formatData(event.data)}`;
});

// coloured: alias
registerLayout('coloured', () => (event) => {
  const ts = event.startTime.toISOString();
  const color = ANSI_COLORS[event.level.colour] ?? '';
  const reset = color ? ANSI_RESET : '';
  return `[${ts}] ${color}[${event.level.levelStr}]${reset} ${color}${event.categoryName}${reset} - ${formatData(event.data)}`;
});

// messagePassThrough: just the raw message
registerLayout('messagePassThrough', () => (event) => formatData(event.data));

// dummy: empty string
registerLayout('dummy', () => () => '');

// json: structured JSON output
registerLayout('json', () => (event) => {
  return JSON.stringify({
    startTime: event.startTime.toISOString(),
    categoryName: event.categoryName,
    level: event.level.levelStr,
    data: event.data,
    context: Object.keys(event.context).length > 0 ? event.context : undefined,
    pid: event.pid,
    ...(event.fileName ? { fileName: event.fileName, lineNumber: event.lineNumber, columnNumber: event.columnNumber } : {}),
  });
});

// pattern: configurable format string
// Tokens: %d (date), %p (level), %c (category), %m (message), %n (newline),
//         %x{token} (context value), %z (pid), %f (filename), %l (line), %o (column),
//         %[ / %] (color start/end), %% (literal %)
registerLayout('pattern', (config) => {
  const pattern = (config?.pattern as string) ?? '%d %p %c - %m';
  const tokens = (config?.tokens as Record<string, string | ((event: LogEvent) => string)>) ?? {};

  return (event) => {
    let result = '';
    let i = 0;
    while (i < pattern.length) {
      if (pattern[i] === '%' && i + 1 < pattern.length) {
        const next = pattern[i + 1];
        switch (next) {
          case 'd': {
            // Check for date format: %d{format}
            if (pattern[i + 2] === '{') {
              const end = pattern.indexOf('}', i + 3);
              if (end > 0) {
                const fmt = pattern.substring(i + 3, end);
                result += formatDatePattern(event.startTime, fmt);
                i = end + 1;
                continue;
              }
            }
            result += event.startTime.toISOString();
            i += 2;
            break;
          }
          case 'p':
            result += event.level.levelStr;
            i += 2;
            break;
          case 'c': {
            // %c{n} — show only last n parts of category
            if (pattern[i + 2] === '{') {
              const end = pattern.indexOf('}', i + 3);
              if (end > 0) {
                const n = parseInt(pattern.substring(i + 3, end), 10);
                const parts = event.categoryName.split('.');
                result += parts.slice(-n).join('.');
                i = end + 1;
                continue;
              }
            }
            result += event.categoryName;
            i += 2;
            break;
          }
          case 'm':
            result += formatData(event.data);
            i += 2;
            break;
          case 'n':
            result += '\n';
            i += 2;
            break;
          case 'z':
            result += event.pid.toString();
            i += 2;
            break;
          case 'f':
            result += event.fileName ?? '';
            i += 2;
            break;
          case 'l':
            result += event.lineNumber?.toString() ?? '';
            i += 2;
            break;
          case 'o':
            result += event.columnNumber?.toString() ?? '';
            i += 2;
            break;
          case 'x': {
            // %x{tokenName}
            if (pattern[i + 2] === '{') {
              const end = pattern.indexOf('}', i + 3);
              if (end > 0) {
                const tokenName = pattern.substring(i + 3, end);
                const tokenVal = tokens[tokenName];
                if (typeof tokenVal === 'function') {
                  result += tokenVal(event);
                } else if (typeof tokenVal === 'string') {
                  result += tokenVal;
                } else if (event.context[tokenName] !== undefined) {
                  result += String(event.context[tokenName]);
                }
                i = end + 1;
                continue;
              }
            }
            i += 2;
            break;
          }
          case '[': {
            const color = ANSI_COLORS[event.level.colour] ?? '';
            result += color;
            i += 2;
            break;
          }
          case ']':
            result += ANSI_RESET;
            i += 2;
            break;
          case '%':
            result += '%';
            i += 2;
            break;
          default:
            result += pattern[i];
            i++;
        }
      } else {
        result += pattern[i];
        i++;
      }
    }
    return result;
  };
});

function formatDatePattern(date: Date, format: string): string {
  if (format === 'ISO8601' || format === 'ISO8601_FORMAT') {
    return date.toISOString();
  }
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
  return format
    .replace('yyyy', date.getFullYear().toString())
    .replace('MM', pad(date.getMonth() + 1))
    .replace('dd', pad(date.getDate()))
    .replace('hh', pad(date.getHours()))
    .replace('mm', pad(date.getMinutes()))
    .replace('ss', pad(date.getSeconds()))
    .replace('SSS', pad(date.getMilliseconds(), 3));
}

export { formatData };
