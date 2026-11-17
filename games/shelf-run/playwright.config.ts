import { defineConfig, devices } from '@playwright/test';

// Browser smoke tests: boot the real game on the Vite dev server in headless
// Chromium and play a little. Every /api call is stubbed inside the tests, so
// these never touch the live leaderboard.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // software WebGL is CPU heavy; parallel browsers starve each other's frames
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5199',
    trace: 'off',
    // software WebGL, so the 3D scene renders on machines without a GPU
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
