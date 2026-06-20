import { describe, expect, test } from "bun:test";
import {
	buildCommandEnvelope,
	buildExportEnvelope,
	parseBoolean,
	requireRuntimeConfig,
	runCli,
} from "../codex-bridge.mjs";

describe("codex bridge CLI helpers", () => {
	test("prints usage when invoked through the executable entrypoint", async () => {
		const process = Bun.spawn(["node", "scripts/codex-bridge.mjs", "help"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const output = await new Response(process.stdout).text();
		const exitCode = await process.exited;

		expect(exitCode).toBe(0);
		expect(output).toContain("node scripts/codex-bridge.mjs send");
	});

	test("requires local runtime config instead of using hidden defaults", () => {
		expect(() =>
			requireRuntimeConfig({
				env: {},
				flags: {},
			}),
		).toThrow("CUTIA_AGENT_BRIDGE_URL is required");
	});

	test("builds a bridge command envelope with explicit args", () => {
		const envelope = buildCommandEnvelope({
			projectId: "project-123",
			tool: "add_text_to_timeline",
			args: { content: "Hook", startTime: 0, duration: 3 },
		});

		expect(envelope).toEqual({
			version: 1,
			projectId: "project-123",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "add_text_to_timeline",
					args: { content: "Hook", startTime: 0, duration: 3 },
				},
			],
		});
	});

	test("builds an export command only from explicit export options", () => {
		const envelope = buildExportEnvelope({
			projectId: "project-123",
			format: "mp4",
			quality: "high",
			includeAudio: true,
			download: true,
		});

		expect(envelope.commands[0]).toEqual({
			id: "cmd-1",
			tool: "export_project",
			args: {
				format: "mp4",
				quality: "high",
				includeAudio: true,
				download: true,
			},
		});
	});

	test("parses boolean flags strictly", () => {
		expect(parseBoolean("true", "includeAudio")).toBe(true);
		expect(parseBoolean("false", "includeAudio")).toBe(false);
		expect(() => parseBoolean("yes", "includeAudio")).toThrow(
			"includeAudio must be true or false",
		);
	});

	test("sends and polls a command using documented CLI flags", async () => {
		const requests = [];
		const fetchImpl = async (url, init) => {
			requests.push({ url, init });
			if (requests.length === 1) {
				return new Response(JSON.stringify({ id: "queue-1", status: "pending" }));
			}

			return new Response(
				JSON.stringify({
					id: "queue-1",
					status: "completed",
					results: [{ id: "cmd-1", success: true, message: "Done" }],
				}),
			);
		};
		const output = [];

		const exitCode = await runCli({
			argv: [
				"send",
				"--project-id",
				"project-123",
				"--tool",
				"get_project_info",
				"--args-json",
				"{}",
			],
			env: {
				CUTIA_AGENT_BRIDGE_URL: "http://localhost:4100",
				CUTIA_AGENT_BRIDGE_TOKEN: "local-token",
				CUTIA_AGENT_BRIDGE_TIMEOUT_MS: "1000",
				CUTIA_AGENT_BRIDGE_INTERVAL_MS: "1",
			},
			fetchImpl,
			stdout: (value) => output.push(value),
		});

		expect(exitCode).toBe(0);
		expect(requests[0].url).toBe(
			"http://localhost:4100/api/agent-bridge/commands",
		);
		expect(requests[0].init.headers.Authorization).toBe("Bearer local-token");
		expect(JSON.parse(requests[0].init.body).envelope).toMatchObject({
			projectId: "project-123",
			commands: [{ tool: "get_project_info", args: {} }],
		});
		expect(requests[1].url).toBe(
			"http://localhost:4100/api/agent-bridge/results?id=queue-1",
		);
		expect(JSON.parse(output[0]).status).toBe("completed");
	});
});
