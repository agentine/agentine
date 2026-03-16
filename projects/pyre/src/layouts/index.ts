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

export { formatData };
