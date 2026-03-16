import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLevel,
  addLevels,
  resetCustomLevels,
  allLevels,
  TRACE,
  DEBUG,
  INFO,
  WARN,
  ERROR,
  FATAL,
  ALL,
  MARK,
  OFF,
} from './levels.js';

describe('Level', () => {
  it('has correct built-in weights', () => {
    expect(ALL.level).toBe(Number.MIN_VALUE);
    expect(TRACE.level).toBe(5000);
    expect(DEBUG.level).toBe(10000);
    expect(INFO.level).toBe(20000);
    expect(WARN.level).toBe(30000);
    expect(ERROR.level).toBe(40000);
    expect(FATAL.level).toBe(50000);
    expect(MARK.level).toBe(Number.MAX_SAFE_INTEGER);
    expect(OFF.level).toBe(Number.MAX_VALUE);
  });

  it('compares levels', () => {
    expect(DEBUG.isLessThanOrEqualTo(INFO)).toBe(true);
    expect(INFO.isLessThanOrEqualTo(DEBUG)).toBe(false);
    expect(INFO.isGreaterThanOrEqualTo(DEBUG)).toBe(true);
    expect(INFO.isEqualTo(INFO)).toBe(true);
    expect(INFO.isEqualTo(DEBUG)).toBe(false);
  });

  it('compares with string names', () => {
    expect(DEBUG.isLessThanOrEqualTo('INFO')).toBe(true);
    expect(DEBUG.isEqualTo('debug')).toBe(true);
  });

  it('serializes to string and JSON', () => {
    expect(INFO.toString()).toBe('INFO');
    expect(JSON.stringify(INFO)).toBe('"INFO"');
  });
});

describe('getLevel', () => {
  it('returns level by name (case-insensitive)', () => {
    expect(getLevel('info')).toBe(INFO);
    expect(getLevel('INFO')).toBe(INFO);
    expect(getLevel('Info')).toBe(INFO);
  });

  it('returns Level instances as-is', () => {
    expect(getLevel(INFO)).toBe(INFO);
  });

  it('returns undefined for unknown levels', () => {
    expect(getLevel('NOPE')).toBeUndefined();
    expect(getLevel(undefined)).toBeUndefined();
  });
});

describe('custom levels', () => {
  beforeEach(() => resetCustomLevels());

  it('adds and retrieves custom levels', () => {
    addLevels({ VERBOSE: { value: 7500, colour: 'blue' } });
    const verbose = getLevel('VERBOSE');
    expect(verbose).toBeDefined();
    expect(verbose!.level).toBe(7500);
    expect(verbose!.colour).toBe('blue');
  });

  it('includes custom levels in allLevels()', () => {
    addLevels({ NOTICE: { value: 25000, colour: 'cyan' } });
    const all = allLevels();
    expect(all['NOTICE']).toBeDefined();
    expect(all['INFO']).toBeDefined();
  });

  it('resets custom levels', () => {
    addLevels({ CUSTOM: { value: 1, colour: 'grey' } });
    expect(getLevel('CUSTOM')).toBeDefined();
    resetCustomLevels();
    expect(getLevel('CUSTOM')).toBeUndefined();
  });
});
