/**
 * log4js compatibility layer.
 *
 * Drop-in replacement: change your import from 'log4js' to '@agentine/pyre/compat/log4js'
 * and everything should work identically.
 *
 * Usage:
 *   import log4js from '@agentine/pyre/compat/log4js';
 *   log4js.configure({ ... });
 *   const logger = log4js.getLogger('myCategory');
 *   logger.info('Hello from pyre!');
 */

import {
  configure,
  getLogger,
  shutdown,
  levels,
  Level,
  getLevel,
  addLevels,
  allLevels,
  getRecordedEvents,
  clearRecordedEvents,
  clearAllRecordedEvents,
} from '../index.js';
import type { Configuration, AppenderConfig, CategoryConfig, LogEvent } from '../index.js';
import { Logger } from '../logger.js';
import { addLayout } from '../layouts/index.js';
import type { LayoutFunction, LayoutFactory } from '../layouts/index.js';
import { connectLogger } from '../connect-logger.js';
import type { ConnectLoggerOptions, StatusRule } from '../connect-logger.js';

// Re-export everything under the log4js-compatible API
export {
  configure,
  getLogger,
  shutdown,
  levels,
  Level,
  getLevel,
  addLevels,
  allLevels,
  addLayout,
  connectLogger,
  getRecordedEvents,
  clearRecordedEvents,
  clearAllRecordedEvents,
  Logger,
};

export type {
  Configuration,
  AppenderConfig,
  CategoryConfig,
  LogEvent,
  LayoutFunction,
  LayoutFactory,
  ConnectLoggerOptions,
  StatusRule,
};

// Default export — mimics `const log4js = require('log4js')`
const log4js = {
  configure,
  getLogger,
  shutdown,
  levels,
  Level,
  getLevel,
  addLevels,
  allLevels,
  addLayout,
  connectLogger,
  getRecordedEvents,
  clearRecordedEvents,
  clearAllRecordedEvents,
  Logger,
};

export default log4js;
