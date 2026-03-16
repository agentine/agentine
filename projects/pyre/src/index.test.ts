import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configure, getLogger, shutdown, Logger } from './index.js';
import { getRecordedEvents, clearRecordedEvents } from './appenders/recording.js';

afterEach(() => {
  clearRecordedEvents();
  return new Promise<void>((resolve) => shutdown(() => resolve()));
});

describe('configure + getLogger', () => {
  it('throws if getLogger called before configure', () => {
    expect(() => getLogger()).toThrow('call configure()');
  });

  it('returns a Logger instance', () => {
    configure({
      appenders: { out: { type: 'stdout' } },
      categories: { default: { appenders: ['out'], level: 'INFO' } },
    });
    const logger = getLogger();
    expect(logger).toBeInstanceOf(Logger);
    expect(logger.category).toBe('default');
  });
});

describe('Logger with recording appender', () => {
  beforeEach(() => {
    configure({
      appenders: { rec: { type: 'recording' } },
      categories: { default: { appenders: ['rec'], level: 'INFO' } },
    });
  });

  it('logs at or above configured level', () => {
    const logger = getLogger();
    logger.info('hello');
    logger.warn('warning');
    logger.debug('should not appear');

    const events = getRecordedEvents();
    expect(events).toHaveLength(2);
    expect(events[0].data).toEqual(['hello']);
    expect(events[0].level.levelStr).toBe('INFO');
    expect(events[1].level.levelStr).toBe('WARN');
  });

  it('supports context', () => {
    const logger = getLogger();
    logger.addContext('user', 'alice');
    logger.info('with context');

    const events = getRecordedEvents();
    expect(events[0].context).toEqual({ user: 'alice' });
  });

  it('supports isLevelEnabled', () => {
    const logger = getLogger();
    expect(logger.isInfoEnabled()).toBe(true);
    expect(logger.isDebugEnabled()).toBe(false);
    expect(logger.isErrorEnabled()).toBe(true);
  });

  it('supports level override', () => {
    const logger = getLogger();
    logger.level = 'ERROR';
    logger.info('should not appear');
    logger.error('should appear');

    const events = getRecordedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].level.levelStr).toBe('ERROR');
  });

  it('supports category hierarchy', () => {
    configure({
      appenders: { rec: { type: 'recording' } },
      categories: {
        default: { appenders: ['rec'], level: 'DEBUG' },
        app: { appenders: ['rec'], level: 'WARN' },
      },
    });

    const appLogger = getLogger('app.service');
    appLogger.info('should not appear');
    appLogger.warn('should appear');

    const events = getRecordedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].categoryName).toBe('app.service');
  });
});

describe('shutdown', () => {
  it('calls callback when done', () => {
    configure({
      appenders: { rec: { type: 'recording' } },
      categories: { default: { appenders: ['rec'], level: 'INFO' } },
    });

    return new Promise<void>((resolve) => {
      shutdown((err) => {
        expect(err).toBeUndefined();
        resolve();
      });
    });
  });
});

describe('stdout appender', () => {
  it('writes to stdout', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    configure({
      appenders: { out: { type: 'stdout' } },
      categories: { default: { appenders: ['out'], level: 'INFO' } },
    });

    const logger = getLogger();
    logger.info('test message');

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toContain('test message');
    expect(output).toContain('INFO');

    writeSpy.mockRestore();
  });
});
