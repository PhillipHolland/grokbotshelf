import { defineConfig } from 'vitest/config';

// Unit and API tests. The browser smoke test in e2e/ runs with Playwright
// instead (npm run test:e2e).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      // The modules with logic that runs without a browser. The 3D scene,
      // audio and DOM code in src/runner are covered by the e2e smoke test.
      include: ['api/**/*.ts', 'src/bots.ts', 'src/storage.ts', 'src/runner/net.ts'],
      exclude: ['api/_lib/bots.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
