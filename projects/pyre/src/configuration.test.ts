import { describe, it, expect, afterEach } from 'vitest';
import { configure, getConfig, hasConfig, resetConfig } from './configuration.js';
import { getLevel } from './levels.js';

afterEach(() => resetConfig());

const validConfig = {
  appenders: { out: { type: 'stdout' } },
  categories: { default: { appenders: ['out'], level: 'INFO' } },
};

describe('configure', () => {
  it('accepts a valid config object', () => {
    configure(validConfig);
    expect(hasConfig()).toBe(true);
    expect(getConfig()).toEqual(validConfig);
  });

  it('throws if no appenders', () => {
    expect(() =>
      configure({ appenders: {}, categories: { default: { appenders: ['out'], level: 'INFO' } } }),
    ).toThrow('at least one appender');
  });

  it('throws if no categories', () => {
    expect(() =>
      configure({ appenders: { out: { type: 'stdout' } }, categories: {} }),
    ).toThrow('at least one category');
  });

  it('throws if no default category', () => {
    expect(() =>
      configure({
        appenders: { out: { type: 'stdout' } },
        categories: { app: { appenders: ['out'], level: 'INFO' } },
      }),
    ).toThrow('"default" category');
  });

  it('throws if category references missing appender', () => {
    expect(() =>
      configure({
        appenders: { out: { type: 'stdout' } },
        categories: { default: { appenders: ['missing'], level: 'INFO' } },
      }),
    ).toThrow('undefined appender "missing"');
  });

  it('throws if category has unknown level', () => {
    expect(() =>
      configure({
        appenders: { out: { type: 'stdout' } },
        categories: { default: { appenders: ['out'], level: 'NOPE' } },
      }),
    ).toThrow('unknown level "NOPE"');
  });

  it('registers custom levels', () => {
    configure({
      appenders: { out: { type: 'stdout' } },
      categories: { default: { appenders: ['out'], level: 'VERBOSE' } },
      levels: { VERBOSE: { value: 7500, colour: 'blue' } },
    });
    expect(getLevel('VERBOSE')).toBeDefined();
  });
});

describe('getConfig', () => {
  it('throws if not configured', () => {
    expect(() => getConfig()).toThrow('call configure()');
  });
});

describe('resetConfig', () => {
  it('clears config and custom levels', () => {
    configure({
      ...validConfig,
      levels: { CUSTOM: { value: 1, colour: 'grey' } },
    });
    resetConfig();
    expect(hasConfig()).toBe(false);
    expect(getLevel('CUSTOM')).toBeUndefined();
  });
});
