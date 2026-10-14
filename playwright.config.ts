import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3457);

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: {
      // Sztuczny mikrofon (ton testowy) i automatyczna zgoda na jego użycie.
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } } },
  ],
  webServer: {
    command: `node apps/server/dist/index.cjs`,
    env: { PORT: String(PORT), DATA_DIR: 'test-results/e2e-data' },
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
  },
});
