// SatGuardView smoke suite config
// Run:  BASE_URL=http://localhost:8080 npx playwright test
module.exports = {
  testDir: '.',
  testMatch: 'smoke.spec.js',
  timeout: 120 * 1000,
  expect: { timeout: 20 * 1000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    headless: true,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    actionTimeout: 15 * 1000,
    trace: 'retain-on-failure',
  },
};
