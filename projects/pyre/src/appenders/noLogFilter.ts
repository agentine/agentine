import { registerAppenderType } from './index.js';
import type { AppenderConfig } from '../configuration.js';
import type { AppenderFunction, LayoutProvider } from './index.js';

registerAppenderType('noLogFilter', (config: AppenderConfig, _layouts: LayoutProvider, findAppender: (name: string) => AppenderFunction | undefined) => {
  const appenderName = config.appender as string;
  if (!appenderName) throw new Error('pyre: noLogFilter requires "appender"');

  const exclude = (config.exclude as string[]) ?? [];

  return (event) => {
    const target = findAppender(appenderName);
    if (!target) return;
    const msg = event.data.map((d) => (typeof d === 'string' ? d : JSON.stringify(d))).join(' ');
    for (const pattern of exclude) {
      if (msg.includes(pattern)) return;
    }
    target(event);
  };
});
