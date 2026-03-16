import { describe, it, expect } from 'vitest';

describe('pyre', () => {
  it('should export module', async () => {
    const mod = await import('./index.js');
    expect(mod).toBeDefined();
  });
});
