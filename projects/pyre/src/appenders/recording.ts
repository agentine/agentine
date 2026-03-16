import { registerAppenderType } from './index.js';
import type { LogEvent } from '../LogEvent.js';

const recordings = new Map<string, LogEvent[]>();

registerAppenderType('recording', (config) => {
  const key = (config._key as string) ?? 'default';
  recordings.set(key, []);

  return (event) => {
    const arr = recordings.get(key);
    if (arr) arr.push(event);
  };
});

/** Retrieve recorded log events. */
export function getRecordedEvents(key = 'default'): LogEvent[] {
  return recordings.get(key) ?? [];
}

/** Clear recorded events. */
export function clearRecordedEvents(key = 'default'): void {
  const arr = recordings.get(key);
  if (arr) arr.length = 0;
}

/** Clear all recorded events across all keys. */
export function clearAllRecordedEvents(): void {
  for (const arr of recordings.values()) {
    arr.length = 0;
  }
  recordings.clear();
}
