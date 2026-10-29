import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests of everyday actions (adding, finding, editing and deleting books) in a real
 * browser against the app, with an empty library and the book catalogs stubbed (see e2e/).
 * Run with `npm test`. Stop `npm run dev` first: Next.js runs one dev server per project.
 */
const PORT = 3210;
// The public demo (BOOKBOX_DEMO=1), tested by demo.spec.ts.
const DEMO_PORT = 3211;

export default defineConfig({
  testDir: "e2e",
  // The tests share one library.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The first visit to each page compiles it.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "chromium", testIgnore: /demo\.spec/, use: { ...devices["Pixel 7"], baseURL: `http://localhost:${PORT}` } },
    { name: "demo", testMatch: /demo\.spec/, use: { ...devices["Pixel 7"], baseURL: `http://localhost:${DEMO_PORT}` } },
  ],
  webServer: [
    {
      command: "node e2e/serve.mjs",
      env: { PORT: String(PORT) },
      url: `http://localhost:${PORT}/login`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "node e2e/serve.mjs",
      env: { PORT: String(DEMO_PORT), DEMO: "1" },
      url: `http://localhost:${DEMO_PORT}/offline`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
