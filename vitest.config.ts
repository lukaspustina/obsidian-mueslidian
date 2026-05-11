import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Global Vitest config.
// - Aliases the `obsidian` peer package to a manual mock so tests can run
//   without the real Obsidian runtime. Each test file may further override
//   individual exports via `vi.mock('obsidian', () => ({ ... }))`.
export default defineConfig({
  resolve: {
    alias: {
      obsidian: resolve(__dirname, 'tests/__mocks__/obsidian.ts'),
    },
  },
  test: {
    globals: true,
  },
});
