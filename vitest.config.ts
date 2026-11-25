import { defineConfig } from 'vitest/config';

// TypeScript analysis tests; the main-process tests run with node --test.
export default defineConfig({
  test: { include: ['tests/analysis/**/*.test.ts'] }
});
