import { registerAppenderType } from './index.js';
import type { AppenderConfig } from '../configuration.js';
import type { LayoutProvider } from './index.js';

registerAppenderType('console', (config: AppenderConfig, layouts: LayoutProvider) => {
  const layoutFn = layouts.layout(
    (config.layout as { type?: string })?.type ?? 'colored',
    config.layout as Record<string, unknown> | undefined,
  );

  return (event) => {
    const msg = layoutFn(event);
    if (event.level.level >= 40000) {
      // ERROR or higher
      console.error(msg);
    } else {
      console.log(msg);
    }
  };
});
