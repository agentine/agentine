import { createWriteStream, statSync, renameSync, unlinkSync, existsSync, type WriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createReadStream } from 'node:fs';
import { registerAppenderType, addShutdownCallback } from './index.js';
import type { AppenderConfig } from '../configuration.js';
import type { LayoutProvider } from './index.js';

registerAppenderType('file', (config: AppenderConfig, layouts: LayoutProvider) => {
  const filename = config.filename as string;
  if (!filename) throw new Error('pyre: file appender requires "filename"');

  const maxLogSize = (config.maxLogSize as number) ?? 0; // 0 = no rolling
  const backups = (config.backups as number) ?? 5;
  const compress = (config.compress as boolean) ?? false;
  const encoding = (config.encoding as BufferEncoding) ?? 'utf-8';
  const mode = (config.mode as number) ?? 0o644;
  const flags = (config.flags as string) ?? 'a';

  const layoutFn = layouts.layout(
    (config.layout as { type?: string })?.type ?? 'basic',
    config.layout as Record<string, unknown> | undefined,
  );

  let stream: WriteStream = createWriteStream(filename, { flags, encoding, mode });
  let currentSize = 0;

  try {
    currentSize = statSync(filename).size;
  } catch {
    // File doesn't exist yet — fine
  }

  const rollFiles = () => {
    stream.end();

    // Remove oldest backup
    const oldest = `${filename}.${backups}`;
    if (existsSync(oldest)) unlinkSync(oldest);
    const oldestGz = `${oldest}.gz`;
    if (existsSync(oldestGz)) unlinkSync(oldestGz);

    // Shift backups up
    for (let i = backups - 1; i >= 1; i--) {
      const from = `${filename}.${i}`;
      const to = `${filename}.${i + 1}`;
      if (existsSync(from)) renameSync(from, to);
      const fromGz = `${from}.gz`;
      const toGz = `${to}.gz`;
      if (existsSync(fromGz)) renameSync(fromGz, toGz);
    }

    // Rename current → .1
    if (existsSync(filename)) {
      renameSync(filename, `${filename}.1`);
      if (compress) {
        // Compress asynchronously in background
        const src = `${filename}.1`;
        const dst = `${src}.gz`;
        pipeline(createReadStream(src), createGzip(), createWriteStream(dst))
          .then(() => unlinkSync(src))
          .catch(() => { /* best effort */ });
      }
    }

    stream = createWriteStream(filename, { flags: 'a', encoding, mode });
    currentSize = 0;
  };

  const appenderFn = (event: import('../LogEvent.js').LogEvent) => {
    const msg = layoutFn(event) + '\n';
    if (maxLogSize > 0 && currentSize + msg.length > maxLogSize) {
      rollFiles();
    }
    stream.write(msg);
    currentSize += msg.length;
  };

  addShutdownCallback((done) => {
    stream.end(() => done());
  });

  return appenderFn;
});
