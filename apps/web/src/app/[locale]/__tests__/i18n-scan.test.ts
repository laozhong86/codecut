import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const appDir = resolve(import.meta.dir, "../../../..");
const scanTimeoutMs = 30_000;

describe("frontend i18n scan", () => {
	test("keeps user-facing copy covered by translations", () => {
		const result = spawnSync(process.execPath, ["run", "translation:scan"], {
			cwd: appDir,
			encoding: "utf8",
			timeout: scanTimeoutMs,
		});

		const output = `${result.stdout}${result.stderr}`;
		if (result.error) {
			throw new Error(`${result.error.message}\n${output.slice(-8000)}`);
		}
		if (result.status !== 0) {
			throw new Error(output.slice(-8000));
		}
		expect(result.status).toBe(0);
	}, scanTimeoutMs + 5_000);
});
