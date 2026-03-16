import { describe, it, expect, beforeEach } from 'vitest';
import { configure, resetConfig } from './configuration.js';
import { getCategoryConfig, getCategoryLevel, getCategoryAppenders, isCategoryCallStackEnabled } from './categories.js';
import { INFO, WARN, DEBUG } from './levels.js';

beforeEach(() => {
  resetConfig();
  configure({
    appenders: {
      out: { type: 'stdout' },
      file: { type: 'file', filename: 'app.log' },
    },
    categories: {
      default: { appenders: ['out'], level: 'DEBUG' },
      app: { appenders: ['out', 'file'], level: 'INFO' },
      'app.controllers': { appenders: ['file'], level: 'WARN', enableCallStack: true },
    },
  });
});

describe('getCategoryConfig', () => {
  it('returns exact match', () => {
    const cat = getCategoryConfig('app');
    expect(cat.level).toBe('INFO');
    expect(cat.appenders).toEqual(['out', 'file']);
  });

  it('returns parent match for sub-categories', () => {
    // "app.controllers.user" inherits from "app.controllers"
    const cat = getCategoryConfig('app.controllers.user');
    expect(cat.level).toBe('WARN');
    expect(cat.appenders).toEqual(['file']);
  });

  it('walks up hierarchy', () => {
    // "app.services.auth" inherits from "app"
    const cat = getCategoryConfig('app.services.auth');
    expect(cat.level).toBe('INFO');
  });

  it('falls back to default', () => {
    const cat = getCategoryConfig('unknown');
    expect(cat.level).toBe('DEBUG');
    expect(cat.appenders).toEqual(['out']);
  });
});

describe('getCategoryLevel', () => {
  it('resolves Level object for category', () => {
    expect(getCategoryLevel('app')).toBe(INFO);
    expect(getCategoryLevel('app.controllers')).toBe(WARN);
    expect(getCategoryLevel('unknown')).toBe(DEBUG);
  });
});

describe('getCategoryAppenders', () => {
  it('returns appender names', () => {
    expect(getCategoryAppenders('app')).toEqual(['out', 'file']);
  });
});

describe('isCategoryCallStackEnabled', () => {
  it('returns true when enabled', () => {
    expect(isCategoryCallStackEnabled('app.controllers')).toBe(true);
  });

  it('returns false by default', () => {
    expect(isCategoryCallStackEnabled('app')).toBe(false);
  });
});
