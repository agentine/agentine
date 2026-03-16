/**
 * Log level definitions — compatible with log4js Level API.
 *
 * Built-in levels (by weight):
 *   ALL(Number.MIN_VALUE), TRACE(5000), DEBUG(10000), INFO(20000),
 *   WARN(30000), ERROR(40000), FATAL(50000), MARK(9007199254740992), OFF(Number.MAX_VALUE)
 */

export class Level {
  readonly level: number;
  readonly levelStr: string;
  readonly colour: string;

  constructor(level: number, levelStr: string, colour?: string) {
    this.level = level;
    this.levelStr = levelStr;
    this.colour = colour ?? '';
  }

  isLessThanOrEqualTo(other: Level | string): boolean {
    const otherLevel = typeof other === 'string' ? getLevel(other) : other;
    if (!otherLevel) return false;
    return this.level <= otherLevel.level;
  }

  isGreaterThanOrEqualTo(other: Level | string): boolean {
    const otherLevel = typeof other === 'string' ? getLevel(other) : other;
    if (!otherLevel) return false;
    return this.level >= otherLevel.level;
  }

  isEqualTo(other: Level | string): boolean {
    const otherLevel = typeof other === 'string' ? getLevel(other) : other;
    if (!otherLevel) return false;
    return this.level === otherLevel.level;
  }

  toString(): string {
    return this.levelStr;
  }

  toJSON(): string {
    return this.levelStr;
  }
}

const builtInLevels: Record<string, Level> = {
  ALL: new Level(Number.MIN_VALUE, 'ALL', 'grey'),
  TRACE: new Level(5000, 'TRACE', 'blue'),
  DEBUG: new Level(10000, 'DEBUG', 'cyan'),
  INFO: new Level(20000, 'INFO', 'green'),
  WARN: new Level(30000, 'WARN', 'yellow'),
  ERROR: new Level(40000, 'ERROR', 'red'),
  FATAL: new Level(50000, 'FATAL', 'magenta'),
  MARK: new Level(Number.MAX_SAFE_INTEGER, 'MARK', 'grey'),
  OFF: new Level(Number.MAX_VALUE, 'OFF', 'grey'),
};

const customLevels: Record<string, Level> = {};

export function getLevel(nameOrLevel: string | Level | undefined): Level | undefined {
  if (nameOrLevel instanceof Level) return nameOrLevel;
  if (typeof nameOrLevel !== 'string') return undefined;
  const upper = nameOrLevel.toUpperCase();
  return builtInLevels[upper] ?? customLevels[upper];
}

export function addLevels(
  levels: Record<string, { value: number; colour: string }>,
): void {
  for (const [name, def] of Object.entries(levels)) {
    const upper = name.toUpperCase();
    customLevels[upper] = new Level(def.value, upper, def.colour);
  }
}

export function resetCustomLevels(): void {
  for (const key of Object.keys(customLevels)) {
    delete customLevels[key];
  }
}

/** All currently defined levels (built-in + custom), keyed by uppercase name. */
export function allLevels(): Record<string, Level> {
  return { ...builtInLevels, ...customLevels };
}

// Named exports for convenience
export const ALL = builtInLevels.ALL;
export const TRACE = builtInLevels.TRACE;
export const DEBUG = builtInLevels.DEBUG;
export const INFO = builtInLevels.INFO;
export const WARN = builtInLevels.WARN;
export const ERROR = builtInLevels.ERROR;
export const FATAL = builtInLevels.FATAL;
export const MARK = builtInLevels.MARK;
export const OFF = builtInLevels.OFF;
