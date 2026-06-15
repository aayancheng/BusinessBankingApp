import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: { baseURL: 'http://localhost:5180' },
  webServer: [
    {
      command: 'cd ../.. && ./.venv/bin/uvicorn portal.server.main:app --port 8100',
      url: 'http://localhost:8100/health',
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5180',
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
