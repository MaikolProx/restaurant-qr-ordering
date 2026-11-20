import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8788",
    trace: "retain-on-failure",
    extraHTTPHeaders: process.env.BASE_URL ? {} : { "cf-connecting-ip": `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
  },
  projects: [
    { name: "movil", use: { ...devices["Pixel 7"] } },
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
  ],
});
