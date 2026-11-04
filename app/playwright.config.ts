import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e-results',
  timeout: 60_000,
  use: {
    // Chromium completo (no el "headless shell", que bloquea las notificaciones).
    channel: 'chromium',
    baseURL: 'http://localhost:5179',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    screenshot: 'only-on-failure',
    // Para ver qué pasó en los que fallan de a ratos (npx playwright show-trace).
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      // Build de producción: incluye el service worker real (offline, push, aviso diario).
      command: 'npx vite build && npx vite preview --port 5179 --strictPort',
      url: 'http://localhost:5179',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Servidor VikArg real, con base en memoria: cada corrida arranca limpia.
      command: 'node ../server/src/main.ts',
      url: 'http://127.0.0.1:8099/api/health',
      env: { PORT: '8099', HOST: '127.0.0.1', DATA_DIR: ':memory:' },
      reuseExistingServer: false,
    },
  ],
});
