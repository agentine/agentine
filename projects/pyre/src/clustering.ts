/**
 * Clustering support — handles log event forwarding in Node.js cluster
 * and PM2 environments.
 *
 * When clustering is enabled:
 * - Workers serialize log events and send them to the primary process via IPC
 * - The primary process receives events and dispatches them to appenders
 * - PM2 mode uses process.send() for inter-process communication
 */

import cluster from 'node:cluster';
import type { LogEvent } from './LogEvent.js';
import type { Level } from './levels.js';
import { getLevel } from './levels.js';

export interface ClusteringConfig {
  pm2?: boolean;
  pm2InstanceVar?: string;
  disableClustering?: boolean;
}

interface SerializedLogEvent {
  type: 'pyre:log';
  startTime: string;
  categoryName: string;
  level: { levelStr: string; level: number; colour: string };
  data: unknown[];
  context: Record<string, unknown>;
  pid: number;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
  callStack?: string;
}

type AppenderDispatch = (event: LogEvent) => void;

let clusteringEnabled = false;
let isPrimary = true;
let dispatchFn: AppenderDispatch | undefined;

/**
 * Determine whether the current process is the primary (should run appenders)
 * or a worker (should forward events).
 */
export function isPrimaryProcess(config?: ClusteringConfig): boolean {
  if (config?.disableClustering) return true;

  if (config?.pm2) {
    const instanceVar = config.pm2InstanceVar ?? 'NODE_APP_INSTANCE';
    const instance = process.env[instanceVar];
    // Instance 0 is the primary in PM2
    return instance === '0' || instance === undefined;
  }

  return !cluster.isWorker;
}

/**
 * Set up clustering — call during configure().
 * Returns true if this process is a worker and should NOT run appenders locally.
 */
export function setupClustering(
  config: ClusteringConfig,
  dispatch: AppenderDispatch,
): boolean {
  if (config.disableClustering) {
    clusteringEnabled = false;
    isPrimary = true;
    return false;
  }

  isPrimary = isPrimaryProcess(config);
  dispatchFn = dispatch;
  clusteringEnabled = true;

  if (isPrimary && !config.pm2) {
    // Listen for messages from workers in cluster mode
    cluster.on('message', (_worker, message) => {
      if (isSerializedLogEvent(message)) {
        const event = deserializeLogEvent(message);
        if (event && dispatchFn) dispatchFn(event);
      }
    });
  }

  if (isPrimary && config.pm2) {
    // PM2 mode: listen on process message
    process.on('message', (message) => {
      if (isSerializedLogEvent(message as Record<string, unknown>)) {
        const event = deserializeLogEvent(message as SerializedLogEvent);
        if (event && dispatchFn) dispatchFn(event);
      }
    });
  }

  // Return true if this is a worker (caller should skip local appenders)
  return !isPrimary;
}

/**
 * Send a log event to the primary process. Called by workers.
 */
export function sendToListener(event: LogEvent): void {
  if (!clusteringEnabled || isPrimary) return;

  const serialized: SerializedLogEvent = {
    type: 'pyre:log',
    startTime: event.startTime.toISOString(),
    categoryName: event.categoryName,
    level: {
      levelStr: event.level.levelStr,
      level: event.level.level,
      colour: event.level.colour,
    },
    data: event.data,
    context: event.context,
    pid: event.pid,
    fileName: event.fileName,
    lineNumber: event.lineNumber,
    columnNumber: event.columnNumber,
    callStack: event.callStack,
  };

  if (process.send) {
    process.send(serialized);
  }
}

/**
 * Whether clustering is active and this is a worker process.
 */
export function isWorker(): boolean {
  return clusteringEnabled && !isPrimary;
}

/**
 * Tear down clustering listeners.
 */
export function disableClustering(): void {
  clusteringEnabled = false;
  isPrimary = true;
  dispatchFn = undefined;
}

function isSerializedLogEvent(msg: unknown): msg is SerializedLogEvent {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as Record<string, unknown>).type === 'pyre:log'
  );
}

function deserializeLogEvent(msg: SerializedLogEvent): LogEvent | undefined {
  const level: Level | undefined = getLevel(msg.level.levelStr);
  if (!level) return undefined;

  return {
    startTime: new Date(msg.startTime),
    categoryName: msg.categoryName,
    level,
    data: msg.data,
    context: msg.context,
    pid: msg.pid,
    fileName: msg.fileName,
    lineNumber: msg.lineNumber,
    columnNumber: msg.columnNumber,
    callStack: msg.callStack,
  };
}
