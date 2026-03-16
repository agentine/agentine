import { getConfig, type CategoryConfig } from './configuration.js';
import { getLevel, type Level } from './levels.js';

/**
 * Resolve configuration for a category, walking up the dot-separated
 * hierarchy until a match is found. Falls back to "default".
 *
 * Example: "app.controllers.user" checks in order:
 *   1. "app.controllers.user"
 *   2. "app.controllers"
 *   3. "app"
 *   4. "default"
 */
export function getCategoryConfig(category: string): CategoryConfig {
  const config = getConfig();
  const cats = config.categories;

  // Exact match
  if (cats[category]) return cats[category];

  // Walk up dot hierarchy
  const parts = category.split('.');
  while (parts.length > 1) {
    parts.pop();
    const parent = parts.join('.');
    if (cats[parent]) return cats[parent];
  }

  // Fallback — default always exists (validated in configure)
  return cats['default'];
}

/** Resolve the effective Level for a category. */
export function getCategoryLevel(category: string): Level {
  const catConfig = getCategoryConfig(category);
  const level = getLevel(catConfig.level);
  if (!level) {
    // Should not happen after validation, but guard anyway
    return getLevel('DEBUG')!;
  }
  return level;
}

/** Return the appender names for a category. */
export function getCategoryAppenders(category: string): string[] {
  return getCategoryConfig(category).appenders;
}

/** Whether call-stack capture is enabled for a category. */
export function isCategoryCallStackEnabled(category: string): boolean {
  return getCategoryConfig(category).enableCallStack ?? false;
}
