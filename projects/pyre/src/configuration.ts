import { readFileSync } from 'node:fs';
import { addLevels, getLevel, resetCustomLevels } from './levels.js';

/** Appender configuration — type plus type-specific options. */
export interface AppenderConfig {
  type: string;
  [key: string]: unknown;
}

/** Category configuration — appenders list + level. */
export interface CategoryConfig {
  appenders: string[];
  level: string;
  enableCallStack?: boolean;
}

/** Top-level configuration object. */
export interface Configuration {
  appenders: Record<string, AppenderConfig>;
  categories: Record<string, CategoryConfig>;
  levels?: Record<string, { value: number; colour: string }>;
  pm2?: boolean;
  pm2InstanceVar?: string;
  disableClustering?: boolean;
}

let currentConfig: Configuration | undefined;

export function configure(configOrPath: Configuration | string): void {
  let config: Configuration;

  if (typeof configOrPath === 'string') {
    const raw = readFileSync(configOrPath, 'utf-8');
    config = JSON.parse(raw) as Configuration;
  } else {
    config = configOrPath;
  }

  validate(config);

  // Reset and apply custom levels
  resetCustomLevels();
  if (config.levels) {
    addLevels(config.levels);
  }

  currentConfig = config;
}

export function getConfig(): Configuration {
  if (!currentConfig) {
    throw new Error('pyre: call configure() before using the logger');
  }
  return currentConfig;
}

export function hasConfig(): boolean {
  return currentConfig !== undefined;
}

export function resetConfig(): void {
  currentConfig = undefined;
  resetCustomLevels();
}

function validate(config: Configuration): void {
  if (!config.appenders || typeof config.appenders !== 'object' || Object.keys(config.appenders).length === 0) {
    throw new Error('pyre: configuration must define at least one appender');
  }

  if (!config.categories || typeof config.categories !== 'object' || Object.keys(config.categories).length === 0) {
    throw new Error('pyre: configuration must define at least one category');
  }

  if (!config.categories['default']) {
    throw new Error('pyre: configuration must define a "default" category');
  }

  // Validate each category
  for (const [name, cat] of Object.entries(config.categories)) {
    if (!cat.appenders || cat.appenders.length === 0) {
      throw new Error(`pyre: category "${name}" must have at least one appender`);
    }

    for (const appenderName of cat.appenders) {
      if (!config.appenders[appenderName]) {
        throw new Error(`pyre: category "${name}" references undefined appender "${appenderName}"`);
      }
    }

    // Validate custom levels are registered before checking
    if (config.levels) {
      addLevels(config.levels);
    }

    const level = getLevel(cat.level);
    if (!level) {
      throw new Error(`pyre: category "${name}" has unknown level "${cat.level}"`);
    }
    // Reset for now — they'll be properly added in configure()
    if (config.levels) {
      resetCustomLevels();
    }
  }

  // Validate appender types reference valid appenders for wrapper types
  for (const [name, appender] of Object.entries(config.appenders)) {
    if (typeof appender.type !== 'string') {
      throw new Error(`pyre: appender "${name}" must have a string type`);
    }
  }
}
