import { registerAppenderType } from './index.js';
import type { AppenderConfig } from '../configuration.js';
import type { AppenderFunction, LayoutProvider } from './index.js';

registerAppenderType('categoryFilter', (config: AppenderConfig, _layouts: LayoutProvider, findAppender: (name: string) => AppenderFunction | undefined) => {
  const appenderName = config.appender as string;
  if (!appenderName) throw new Error('pyre: categoryFilter requires "appender"');

  const exclude = (config.exclude as string[]) ?? [];

  return (event) => {
    const target = findAppender(appenderName);
    if (!target) return;
    if (exclude.includes(event.categoryName)) return;
    target(event);
  };
});
