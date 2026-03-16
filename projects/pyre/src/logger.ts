import { Level, getLevel } from './levels.js';
import { getCategoryLevel, getCategoryAppenders, isCategoryCallStackEnabled } from './categories.js';
import { createLogEvent } from './LogEvent.js';
import type { AppenderFunction } from './appenders/index.js';

export class Logger {
  readonly category: string;
  private _context: Record<string, unknown> = {};
  private _appenders: Map<string, AppenderFunction>;
  private _levelOverride: Level | undefined;

  constructor(category: string, appenders: Map<string, AppenderFunction>) {
    this.category = category;
    this._appenders = appenders;
  }

  get level(): Level {
    return this._levelOverride ?? getCategoryLevel(this.category);
  }

  set level(levelOrName: Level | string) {
    if (typeof levelOrName === 'string') {
      this._levelOverride = getLevel(levelOrName);
    } else {
      this._levelOverride = levelOrName;
    }
  }

  addContext(key: string, value: unknown): void {
    this._context[key] = value;
  }

  removeContext(key: string): void {
    delete this._context[key];
  }

  clearContext(): void {
    this._context = {};
  }

  isLevelEnabled(level: Level | string): boolean {
    const target = typeof level === 'string' ? getLevel(level) : level;
    if (!target) return false;
    return target.isGreaterThanOrEqualTo(this.level);
  }

  isTraceEnabled(): boolean { return this.isLevelEnabled('TRACE'); }
  isDebugEnabled(): boolean { return this.isLevelEnabled('DEBUG'); }
  isInfoEnabled(): boolean { return this.isLevelEnabled('INFO'); }
  isWarnEnabled(): boolean { return this.isLevelEnabled('WARN'); }
  isErrorEnabled(): boolean { return this.isLevelEnabled('ERROR'); }
  isFatalEnabled(): boolean { return this.isLevelEnabled('FATAL'); }

  trace(...args: unknown[]): void { this._log('TRACE', args); }
  debug(...args: unknown[]): void { this._log('DEBUG', args); }
  info(...args: unknown[]): void { this._log('INFO', args); }
  warn(...args: unknown[]): void { this._log('WARN', args); }
  error(...args: unknown[]): void { this._log('ERROR', args); }
  fatal(...args: unknown[]): void { this._log('FATAL', args); }
  mark(...args: unknown[]): void { this._log('MARK', args); }

  private _log(levelName: string, data: unknown[]): void {
    const level = getLevel(levelName)!;
    if (!level.isGreaterThanOrEqualTo(this.level)) return;

    const callStack = isCategoryCallStackEnabled(this.category)
      ? new Error().stack
      : undefined;

    const event = createLogEvent(this.category, level, data, this._context, callStack);

    const appenderNames = getCategoryAppenders(this.category);
    for (const name of appenderNames) {
      const appender = this._appenders.get(name);
      if (appender) appender(event);
    }
  }

  /** Update the appender map (used when reconfiguring). */
  _setAppenders(appenders: Map<string, AppenderFunction>): void {
    this._appenders = appenders;
  }
}
