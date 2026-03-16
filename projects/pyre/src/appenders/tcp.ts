import { connect, type Socket } from 'node:net';
import { registerAppenderType, addShutdownCallback } from './index.js';
import type { AppenderConfig } from '../configuration.js';
import type { LayoutProvider } from './index.js';

registerAppenderType('tcp', (config: AppenderConfig, layouts: LayoutProvider) => {
  const host = (config.host as string) ?? '127.0.0.1';
  const port = config.port as number;
  if (!port) throw new Error('pyre: tcp appender requires "port"');

  const endMsg = (config.endMsg as string) ?? '';

  const layoutFn = layouts.layout(
    (config.layout as { type?: string })?.type ?? 'json',
    config.layout as Record<string, unknown> | undefined,
  );

  let socket: Socket | null = null;
  let connected = false;
  let buffer: string[] = [];

  function ensureConnection(): void {
    if (socket) return;
    socket = connect({ host, port });
    socket.on('connect', () => {
      connected = true;
      // Flush buffer
      for (const msg of buffer) {
        socket!.write(msg);
      }
      buffer = [];
    });
    socket.on('error', () => {
      connected = false;
      socket = null;
    });
    socket.on('close', () => {
      connected = false;
      socket = null;
    });
  }

  const appenderFn = (event: import('../LogEvent.js').LogEvent) => {
    ensureConnection();
    const msg = layoutFn(event) + endMsg;
    if (connected && socket) {
      socket.write(msg);
    } else {
      buffer.push(msg);
    }
  };

  addShutdownCallback((done) => {
    if (socket) {
      socket.end(() => done());
    } else {
      done();
    }
  });

  return appenderFn;
});
