import { registerAppenderType } from './index.js';
import type { AppenderConfig } from '../configuration.js';
import type { AppenderFunction, LayoutProvider } from './index.js';
import { getLevel } from '../levels.js';

registerAppenderType('logLevelFilter', (config: AppenderConfig, _layouts: LayoutProvider, findAppender: (name: string) => AppenderFunction | undefined) => {
  const appenderName = config.appender as string;
  if (!appenderName) throw new Error('pyre: logLevelFilter requires "appender"');

  const minLevel = getLevel(config.level as string) ?? getLevel('TRACE')!;
  const maxLevel = config.maxLevel ? getLevel(config.maxLevel as string) : getLevel('OFF')!;
  if (!maxLevel) throw new Error(`pyre: logLevelFilter has unknown maxLevel "${config.maxLevel}"`);

  return (event) => {
    const target = findAppender(appenderName);
    if (!target) return;
    if (event.level.isGreaterThanOrEqualTo(minLevel) && event.level.isLessThanOrEqualTo(maxLevel)) {
      target(event);
    }
  };
});
