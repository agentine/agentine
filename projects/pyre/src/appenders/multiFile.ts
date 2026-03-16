import { createWriteStream, type WriteStream } from 'node:fs';
import { registerAppenderType, addShutdownCallback } from './index.js';
import type { AppenderConfig } from '../configuration.js';
import type { LayoutProvider } from './index.js';

registerAppenderType('multiFile', (config: AppenderConfig, layouts: LayoutProvider) => {
  const base = (config.base as string) ?? '';
  const property = config.property as string;
  const extension = (config.extension as string) ?? '';
  const encoding = (config.encoding as BufferEncoding) ?? 'utf-8';

  if (!property) throw new Error('pyre: multiFile appender requires "property"');

  const layoutFn = layouts.layout(
    (config.layout as { type?: string })?.type ?? 'basic',
    config.layout as Record<string, unknown> | undefined,
  );

  const streams = new Map<string, WriteStream>();

  function getStream(key: string): WriteStream {
    let ws = streams.get(key);
    if (!ws) {
      const filename = `${base}${key}${extension}`;
      ws = createWriteStream(filename, { flags: 'a', encoding });
      streams.set(key, ws);
    }
    return ws;
  }

  const appenderFn = (event: import('../LogEvent.js').LogEvent) => {
    const key = event.context[property] as string | undefined;
    if (!key) return; // No routing property → drop
    const ws = getStream(key);
    ws.write(layoutFn(event) + '\n');
  };

  addShutdownCallback((done) => {
    let pending = streams.size;
    if (pending === 0) { done(); return; }
    for (const ws of streams.values()) {
      ws.end(() => {
        pending--;
        if (pending === 0) done();
      });
    }
  });

  return appenderFn;
});
