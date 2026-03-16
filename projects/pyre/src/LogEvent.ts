import type { Level } from './levels.js';

export interface LogEvent {
  readonly startTime: Date;
  readonly categoryName: string;
  readonly level: Level;
  readonly data: unknown[];
  readonly context: Record<string, unknown>;
  readonly pid: number;
  readonly fileName?: string;
  readonly lineNumber?: number;
  readonly columnNumber?: number;
  readonly callStack?: string;
}

export function createLogEvent(
  categoryName: string,
  level: Level,
  data: unknown[],
  context: Record<string, unknown>,
  callStack?: string,
): LogEvent {
  const event: LogEvent = {
    startTime: new Date(),
    categoryName,
    level,
    data,
    context: { ...context },
    pid: process.pid,
  };

  if (callStack) {
    const parsed = parseCallStack(callStack);
    if (parsed) {
      return { ...event, ...parsed, callStack };
    }
  }

  return event;
}

function parseCallStack(stack: string): { fileName?: string; lineNumber?: number; columnNumber?: number } | undefined {
  // Skip the first two lines (Error + createLogEvent) and grab the caller
  const lines = stack.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const match = lines[i].match(/\((.+):(\d+):(\d+)\)/) ?? lines[i].match(/at (.+):(\d+):(\d+)/);
    if (match) {
      return {
        fileName: match[1],
        lineNumber: parseInt(match[2], 10),
        columnNumber: parseInt(match[3], 10),
      };
    }
  }
  return undefined;
}
