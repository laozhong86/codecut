import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildApplyPlanEnvelope,
	buildCommandEnvelope,
	buildExportEnvelope,
	buildImportMediaEnvelope,
	buildTranscribeEnvelope,
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

	test("builds a transcribe command envelope with explicit model options", () => {
		const envelope = buildTranscribeEnvelope({
			projectId: "project-123",
			mediaId: "media-123",
			language: "auto",
			modelId: "whisper-base",
		});

		expect(envelope.commands[0]).toEqual({
			id: "cmd-1",
			tool: "transcribe_media",
			args: {
				mediaId: "media-123",
				language: "auto",
				modelId: "whisper-base",
			},
		});
	});

	test("builds an import-media command envelope from an absolute local file path", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cutia-codex-bridge-"));
		const filePath = join(directory, "source.mp4");
		await writeFile(filePath, "video-bytes");

		try {
			const envelope = await buildImportMediaEnvelope({
				projectId: "project-123",
				filePath,
			});

			expect(envelope.commands[0].id).toBe("cmd-1");
			expect(envelope.commands[0].tool).toBe("import_media_file");
			expect(envelope.commands[0].args).toMatchObject({
				fileName: "source.mp4",
				mimeType: "video/mp4",
				size: 11,
				base64: Buffer.from("video-bytes").toString("base64"),
			});
			expect(typeof envelope.commands[0].args.lastModified).toBe("number");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("import-media requires an absolute local file path", async () => {
		await expect(
			buildImportMediaEnvelope({
				projectId: "project-123",
				filePath: "source.mp4",
			}),
		).rejects.toThrow("--file-path must be an absolute path");
	});

	test("builds an apply-plan command envelope from a local JSON file", async () => {
		const directory = await mkdtemp(join(tmpdir(), "cutia-codex-bridge-"));
		const planPath = join(directory, "edit-plan.json");
		const plan = {
			version: 1,
			projectId: "project-123",
			sourceMediaId: "media-123",
			target: { durationSec: 12, aspectRatio: "9:16" },
			clips: [
				{
					id: "clip-1",
					sourceStart: 0,
					sourceEnd: 12,
					timelineStart: 0,
					reason: "Strong opening",
				},
			],
			rationale: "Short vertical cut",
		};
		await writeFile(planPath, JSON.stringify(plan), "utf8");

		try {
			const envelope = await buildApplyPlanEnvelope({
				projectId: "project-123",
				planJsonFile: planPath,
				replaceExisting: true,
			});

			expect(envelope.commands[0]).toEqual({
				id: "cmd-1",
				tool: "apply_edit_plan",
				args: {
					plan,
					replaceExisting: true,
				},
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
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

	test("rejects token passed through CLI flags", async () => {
		await expect(
			runCli({
				argv: [
					"send",
					"--project-id",
					"project-123",
					"--tool",
					"get_project_info",
					"--args-json",
					"{}",
					"--token",
					"local-token",
				],
				env: {
					CUTIA_AGENT_BRIDGE_URL: "http://localhost:4100",
					CUTIA_AGENT_BRIDGE_TOKEN: "env-token",
					CUTIA_AGENT_BRIDGE_TIMEOUT_MS: "1000",
					CUTIA_AGENT_BRIDGE_INTERVAL_MS: "1",
				},
				fetchImpl: async () => {
					throw new Error("fetch should not be called");
				},
			}),
		).rejects.toThrow("Token must be provided through CUTIA_AGENT_BRIDGE_TOKEN");
	});
});
