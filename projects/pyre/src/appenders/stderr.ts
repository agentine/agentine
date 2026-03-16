import { registerAppenderType } from './index.js';
import type { AppenderConfig } from '../configuration.js';
import type { LayoutProvider } from './index.js';

registerAppenderType('stderr', (config: AppenderConfig, layouts: LayoutProvider) => {
  const layoutFn = layouts.layout(
    (config.layout as { type?: string })?.type ?? 'colored',
    config.layout as Record<string, unknown> | undefined,
  );

  return (event) => {
    process.stderr.write(layoutFn(event) + '\n');
  };
});
