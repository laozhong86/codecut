import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";

const port = 4100;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const executorStateDir = join(process.cwd(), "tmp", "playwright-executor-state");

export default defineConfig({
	testDir: "tests/e2e",
	testMatch: "**/*.e2e.ts",
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	timeout: 60_000,
	expect: {
		timeout: 15_000,
	},
	reporter: process.env.CI
		? [
				["list"],
				["html", { open: "never", outputFolder: "tmp/playwright-report" }],
			]
		: "list",
	use: {
		baseURL,
		screenshot: "only-on-failure",
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "bun run --cwd apps/web dev",
		url: `${baseURL}/en/projects`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		env: {
			BETTER_AUTH_SECRET: "playwright-secret",
			CODECUT_AGENT_BRIDGE_TOKEN: "playwright-smoke",
			CODECUT_EXECUTOR_STATE_DIR: executorStateDir,
			DATABASE_URL: "postgresql://codecut:codecut@localhost:5432/codecut",
			NEXT_PUBLIC_SITE_URL: baseURL,
			UPSTASH_REDIS_REST_TOKEN: "playwright-token",
			UPSTASH_REDIS_REST_URL: "https://example.invalid",
		},
	},
});
