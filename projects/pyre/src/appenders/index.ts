import type { LogEvent } from '../LogEvent.js';
import type { AppenderConfig, Configuration } from '../configuration.js';

export type AppenderFunction = (event: LogEvent) => void;
export type ShutdownFunction = (done: (err?: Error) => void) => void;
export type AppenderFactory = (
  config: AppenderConfig,
  layouts: LayoutProvider,
  findAppender: (name: string) => AppenderFunction | undefined,
  allConfig: Configuration,
) => AppenderFunction;

export interface LayoutProvider {
  layout(name: string, config?: Record<string, unknown>): (event: LogEvent) => string;
}

const appenderFactories = new Map<string, AppenderFactory>();
const activeAppenders = new Map<string, AppenderFunction>();
const shutdownCallbacks: ShutdownFunction[] = [];

// Register built-in appender types
export function registerAppenderType(name: string, factory: AppenderFactory): void {
  appenderFactories.set(name, factory);
}

export function getAppenderFactory(type: string): AppenderFactory | undefined {
  return appenderFactories.get(type);
}

/**
 * Build all appenders from configuration and return a map from name → function.
 */
export function configureAppenders(
  config: Configuration,
  layouts: LayoutProvider,
): Map<string, AppenderFunction> {
  clearActiveAppenders();

  const findAppender = (name: string) => activeAppenders.get(name);

  for (const [name, appConfig] of Object.entries(config.appenders)) {
    const factory = appenderFactories.get(appConfig.type);
    if (!factory) {
      throw new Error(`pyre: unknown appender type "${appConfig.type}"`);
    }
    const appender = factory(appConfig, layouts, findAppender, config);
    activeAppenders.set(name, appender);
  }

  return new Map(activeAppenders);
}

export function addShutdownCallback(cb: ShutdownFunction): void {
  shutdownCallbacks.push(cb);
}

export function shutdownAppenders(done: (err?: Error) => void): void {
  let pending = shutdownCallbacks.length;
  if (pending === 0) {
    done();
    return;
  }
  let firstError: Error | undefined;
  for (const cb of shutdownCallbacks) {
    cb((err) => {
      if (err && !firstError) firstError = err;
      pending--;
      if (pending === 0) done(firstError);
    });
  }
}

export function clearActiveAppenders(): void {
  activeAppenders.clear();
  shutdownCallbacks.length = 0;
}
