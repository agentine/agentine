import { createWriteStream, renameSync, existsSync, unlinkSync, type WriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createReadStream } from 'node:fs';
import { registerAppenderType, addShutdownCallback } from './index.js';
import type { AppenderConfig } from '../configuration.js';
import type { LayoutProvider } from './index.js';

function formatDate(date: Date, pattern: string): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return pattern
    .replace('yyyy', date.getFullYear().toString())
    .replace('MM', pad(date.getMonth() + 1))
    .replace('dd', pad(date.getDate()))
    .replace('hh', pad(date.getHours()));
}

registerAppenderType('dateFile', (config: AppenderConfig, layouts: LayoutProvider) => {
  const filename = config.filename as string;
  if (!filename) throw new Error('pyre: dateFile appender requires "filename"');

  const pattern = (config.pattern as string) ?? 'yyyy-MM-dd';
  const alwaysIncludePattern = (config.alwaysIncludePattern as boolean) ?? false;
  const keepFileExt = (config.keepFileExt as boolean) ?? false;
  const compress = (config.compress as boolean) ?? false;
  const encoding = (config.encoding as BufferEncoding) ?? 'utf-8';

  const layoutFn = layouts.layout(
    (config.layout as { type?: string })?.type ?? 'basic',
    config.layout as Record<string, unknown> | undefined,
  );

  let currentDateStr = formatDate(new Date(), pattern);
  let currentFilename = resolveFilename(filename, currentDateStr, alwaysIncludePattern, keepFileExt);
  let stream: WriteStream = createWriteStream(currentFilename, { flags: 'a', encoding });

  function resolveFilename(base: string, dateStr: string, always: boolean, keepExt: boolean): string {
    if (!always && dateStr === formatDate(new Date(), pattern)) {
      // Write to base file when it's the current date and alwaysIncludePattern is false
      // Actually log4js always writes to a file with date pattern if alwaysIncludePattern
      if (!always) return base;
    }

    if (keepExt) {
      const dotIdx = base.lastIndexOf('.');
      if (dotIdx > 0) {
        return `${base.substring(0, dotIdx)}.${dateStr}${base.substring(dotIdx)}`;
      }
    }
    return `${base}.${dateStr}`;
  }

  function rollIfNeeded(): void {
    const newDateStr = formatDate(new Date(), pattern);
    if (newDateStr === currentDateStr) return;

    stream.end();

    // If not alwaysIncludePattern, rename the base file to include old date
    if (!alwaysIncludePattern) {
      const oldFile = resolveFilename(filename, currentDateStr, true, keepFileExt);
      if (existsSync(filename)) {
        renameSync(filename, oldFile);
        if (compress) {
          const dst = `${oldFile}.gz`;
          pipeline(createReadStream(oldFile), createGzip(), createWriteStream(dst))
            .then(() => unlinkSync(oldFile))
            .catch(() => { /* best effort */ });
        }
      }
    } else if (compress) {
      // Compress the previous date file
      const prevFile = currentFilename;
      const dst = `${prevFile}.gz`;
      if (existsSync(prevFile)) {
        pipeline(createReadStream(prevFile), createGzip(), createWriteStream(dst))
          .then(() => unlinkSync(prevFile))
          .catch(() => { /* best effort */ });
      }
    }

    currentDateStr = newDateStr;
    currentFilename = resolveFilename(filename, currentDateStr, alwaysIncludePattern, keepFileExt);
    stream = createWriteStream(currentFilename, { flags: 'a', encoding });
  }

  const appenderFn = (event: import('../LogEvent.js').LogEvent) => {
    rollIfNeeded();
    stream.write(layoutFn(event) + '\n');
  };

  addShutdownCallback((done) => {
    stream.end(() => done());
  });

  return appenderFn;
});
