// Register all built-in appenders
import './appenders/register.js';

import { Level, getLevel, addLevels, allLevels } from './levels.js';
import {
  configure as _configure,
  getConfig,
  hasConfig,
  resetConfig,
  type Configuration,
  type AppenderConfig,
  type CategoryConfig,
} from './configuration.js';
import { getCategoryConfig, getCategoryLevel, getCategoryAppenders } from './categories.js';
import { Logger } from './logger.js';
import { configureAppenders, shutdownAppenders, clearActiveAppenders } from './appenders/index.js';
import { layoutFactory, addLayout } from './layouts/index.js';
import type { LogEvent } from './LogEvent.js';
import { connectLogger } from './connect-logger.js';

// Re-export types and utilities
export { Level, getLevel, addLevels, allLevels };
export type { Configuration, AppenderConfig, CategoryConfig, LogEvent };
export { getCategoryConfig, getCategoryLevel, getCategoryAppenders };
export { Logger };
export { addLayout };
export { connectLogger };
export { getRecordedEvents, clearRecordedEvents, clearAllRecordedEvents } from './appenders/recording.js';

// -- Singleton state --
let appenderMap = new Map<string, import('./appenders/index.js').AppenderFunction>();
const loggers = new Map<string, Logger>();

/**
 * Configure pyre with appenders, categories, and optional custom levels.
 * Must be called before getLogger().
 */
export function configure(config: Configuration | string): void {
  _configure(config);
  appenderMap = configureAppenders(getConfig(), layoutFactory);

  // Update existing loggers with new appenders
  for (const logger of loggers.values()) {
    logger._setAppenders(appenderMap);
  }
}

/**
 * Get a Logger for the given category (defaults to "default").
 */
export function getLogger(category = 'default'): Logger {
  if (!hasConfig()) {
    throw new Error('pyre: call configure() before getLogger()');
  }

  let logger = loggers.get(category);
  if (!logger) {
    logger = new Logger(category, appenderMap);
    loggers.set(category, logger);
  }
  return logger;
}

/**
 * Gracefully shut down all appenders.
 */
export function shutdown(callback?: (err?: Error) => void): void {
  shutdownAppenders((err) => {
    loggers.clear();
    clearActiveAppenders();
    resetConfig();
    if (callback) callback(err);
  });
}

/**
 * Access built-in levels as a named object.
 */
export const levels = allLevels();
