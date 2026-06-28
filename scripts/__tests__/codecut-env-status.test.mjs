import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildEnvStatus, parseEnvFile } from "../codecut-env-status.mjs";

describe("codecut env status", () => {
	test("reports key presence without exposing values", () => {
		const entries = parseEnvFile(
			[
				"CODECUT_AGENT_BRIDGE_URL=http://127.0.0.1:4100",
				"CODECUT_AGENT_BRIDGE_TOKEN=bridge-secret",
				"RUNNINGHUB_API_KEY=runninghub-secret",
				"VOLCENGINE_OPEN_SPEECH_API_KEY='volcengine-secret'",
			].join("\n"),
		);

		const status = buildEnvStatus(entries, {
			keys: [
				"CODECUT_AGENT_BRIDGE_URL",
				"CODECUT_AGENT_BRIDGE_TOKEN",
				"RUNNINGHUB_API_KEY",
				"VOLCENGINE_OPEN_SPEECH_API_KEY",
				"MISSING_KEY",
			],
		});

		expect(status).toEqual([
			{
				key: "CODECUT_AGENT_BRIDGE_URL",
				present: true,
				length: 21,
			},
			{
				key: "CODECUT_AGENT_BRIDGE_TOKEN",
				present: true,
				length: 13,
			},
			{
				key: "RUNNINGHUB_API_KEY",
				present: true,
				length: 17,
			},
			{
				key: "VOLCENGINE_OPEN_SPEECH_API_KEY",
				present: true,
				length: 17,
			},
			{
				key: "MISSING_KEY",
				present: false,
				length: 0,
			},
		]);

		expect(JSON.stringify(status)).not.toContain("secret");
		expect(JSON.stringify(status)).not.toContain("127.0.0.1");
	});

	test("rejects malformed env lines", () => {
		expect(() => parseEnvFile("RUNNINGHUB_API_KEY")).toThrow(
			"Invalid env line 1: expected KEY=value",
		);
	});

	test("CLI prints redacted status when launched from unicode paths", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-env-"));
		const envFile = join(directory, ".env.local");
		await writeFile(envFile, "RUNNINGHUB_API_KEY=runninghub-secret\n", "utf8");

		const result = spawnSync(
			process.execPath,
			["scripts/codecut-env-status.mjs", "--env-file", envFile],
			{ cwd: process.cwd(), encoding: "utf8" },
		);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('"envFileExists": true');
		expect(result.stdout).toContain('"RUNNINGHUB_API_KEY"');
		expect(result.stdout).toContain('"length": 17');
		expect(result.stdout).not.toContain("runninghub-secret");
	});
});
