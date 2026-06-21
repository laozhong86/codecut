import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildApplyPlanEnvelope,
	buildCommandEnvelope,
	buildExportEnvelope,
	buildImportMediaEnvelope,
	buildTranscribeEnvelope,
	buildVideoContextEnvelope,
	parseBoolean,
	requireRuntimeConfig,
	runInstallDoctor,
	runCli,
	waitForExecutor,
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
		).toThrow("CODECUT_AGENT_BRIDGE_URL is required");
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

	test("buildVideoContextEnvelope creates a build_video_context command", () => {
		expect(
			buildVideoContextEnvelope({
				projectId: "project-1",
				mediaId: "media-1",
				language: "auto",
				modelId: "whisper-tiny",
			}),
		).toEqual({
			version: 1,
			projectId: "project-1",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "build_video_context",
					args: {
						mediaId: "media-1",
						language: "auto",
						modelId: "whisper-tiny",
					},
				},
			],
		});
	});

	test("builds an import-media command envelope from an absolute local file path", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-codex-bridge-"));
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
		const directory = await mkdtemp(join(tmpdir(), "codecut-codex-bridge-"));
		const planPath = join(directory, "edit-plan.json");
		const plan = {
			version: 1,
			projectId: "project-123",
			sourceMediaId: "media-123",
			target: { durationSec: 20, aspectRatio: "9:16" },
			clips: [
				{
					id: "clip-1",
					sourceStart: 0,
					sourceEnd: 10,
					timelineStart: 0,
					reason: "Strong opening",
				},
				{
					id: "clip-2",
					sourceStart: 30,
					sourceEnd: 40,
					timelineStart: 10,
					reason: "Concrete proof",
				},
			],
			title: {
				text: "One minute proof",
				startTime: 0,
				duration: 3,
				stylePreset: "hook_title",
			},
			captions: [
				{
					text: "资源不等于能力",
					startTime: 0,
					duration: 2,
				},
			],
			captionStyle: {
				preset: "black-bar",
				position: "lower-safe",
			},
			audio: {
				bgm: {
					assetId: "audio-bgm-1",
					volume: 0.12,
					mode: "loop_to_timeline",
				},
				sfx: [{ assetId: "audio-sfx-1", startTime: 0, volume: 0.8 }],
			},
			transitions: [
				{
					fromClipId: "clip-1",
					toClipId: "clip-2",
					type: "fade",
					duration: 0.5,
				},
			],
			rationale:
				"Short vertical cut with deterministic post-production assets.",
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
			return new Response(
				JSON.stringify({
					status: "completed",
					projectId: "project-123",
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
				CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
				CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
				CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
				CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
			},
			fetchImpl,
			stdout: (value) => output.push(value),
		});

		expect(exitCode).toBe(0);
		expect(requests[0].url).toBe(
			"http://localhost:4100/api/codex-executor/status?projectId=project-123",
		);
		expect(requests[0].init.headers.Authorization).toBe("Bearer local-token");
		expect(requests[1].url).toBe(
			"http://localhost:4100/api/codex-executor/commands",
		);
		expect(requests[1].init.headers.Authorization).toBe("Bearer local-token");
		expect(JSON.parse(requests[1].init.body).envelope).toMatchObject({
			projectId: "project-123",
			commands: [{ tool: "get_project_info", args: {} }],
		});
		expect(JSON.parse(output[0]).status).toBe("completed");
	});

	test("doctor verifies the local executor without enqueueing commands", async () => {
		const requests = [];
		const output = [];

		const exitCode = await runCli({
			argv: ["doctor", "--project-id", "project-123"],
			env: {
				CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
				CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
				CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
				CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
			},
			fetchImpl: async (url, init) => {
				requests.push({ url, init });
				return new Response(
					JSON.stringify({
						projectId: "project-123",
						status: "idle",
						message: "Executor project is ready.",
					}),
				);
			},
			stdout: (value) => output.push(value),
		});

		expect(exitCode).toBe(0);
		expect(requests).toHaveLength(1);
		expect(requests[0].url).toBe(
			"http://localhost:4100/api/codex-executor/status?projectId=project-123",
		);
		expect(JSON.parse(output[0])).toMatchObject({
			status: "ready",
			executor: { projectId: "project-123", status: "idle" },
		});
	});

	test("install doctor validates source, cache, env, service, and executor project", async () => {
		const sourceRoot = await mkdtemp(join(tmpdir(), "codecut-source-"));
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-home-"));
		const cacheRoot = join(
			homeRoot,
			".codex/plugins/cache/local-opc/codecut/0.1.1",
		);
		await mkdir(join(sourceRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(sourceRoot, "skills/codecut-jianying-editor-framework"), {
			recursive: true,
		});
		await mkdir(join(cacheRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(cacheRoot, "skills/codecut-jianying-editor-framework"), {
			recursive: true,
		});
		await writeFile(
			join(sourceRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(sourceRoot, "skills/codecut-jianying-editor-framework/SKILL.md"),
			"---\nname: codecut-jianying-editor-framework\n---\n",
			"utf8",
		);
		await writeFile(
			join(cacheRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "skills/codecut-jianying-editor-framework/SKILL.md"),
			"---\nname: codecut-jianying-editor-framework\n---\n",
			"utf8",
		);

		try {
			const result = await runInstallDoctor({
				projectId: "project-123",
				cwd: sourceRoot,
				homeDir: homeRoot,
				env: {
					CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
					CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
					CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
					CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
				},
				execFileImpl: async (command, args) => {
					expect(command).toBe("rsync");
					expect(args).toContain("--dry-run");
					expect(args).toContain("--itemize-changes");
					return { stdout: "", stderr: "" };
				},
				fetchImpl: async (url, init) => {
					if (String(url).endsWith("/en/projects")) {
						return new Response("ok");
					}
					expect(String(url)).toBe(
						"http://localhost:4100/api/codex-executor/status?projectId=project-123",
					);
					expect(init.headers.Authorization).toBe("Bearer local-token");
					return new Response(
						JSON.stringify({
							projectId: "project-123",
							status: "idle",
							message: "Executor project is ready.",
						}),
					);
				},
			});

			expect(result.ok).toBe(true);
			expect(result.checks.map((check) => [check.id, check.ok])).toEqual([
				["source_plugin", true],
				["cache_plugin", true],
				["plugin_sync", true],
				["environment", true],
				["web_service", true],
				["executor_project", true],
			]);
		} finally {
			await Promise.all([
				rm(sourceRoot, { recursive: true, force: true }),
				rm(homeRoot, { recursive: true, force: true }),
			]);
		}
	});

	test("install doctor fails when the installed plugin cache is stale", async () => {
		const sourceRoot = await mkdtemp(join(tmpdir(), "codecut-source-"));
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-home-"));
		const cacheRoot = join(
			homeRoot,
			".codex/plugins/cache/local-opc/codecut/0.1.1",
		);
		await mkdir(join(sourceRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(sourceRoot, "skills/codecut-jianying-editor-framework"), {
			recursive: true,
		});
		await mkdir(join(cacheRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(cacheRoot, "skills/codecut-jianying-editor-framework"), {
			recursive: true,
		});
		await writeFile(
			join(sourceRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(sourceRoot, "skills/codecut-jianying-editor-framework/SKILL.md"),
			"---\nname: codecut-jianying-editor-framework\n---\n",
			"utf8",
		);
		await writeFile(
			join(cacheRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "skills/codecut-jianying-editor-framework/SKILL.md"),
			"---\nname: codecut-jianying-editor-framework\n---\n",
			"utf8",
		);

		try {
			const result = await runInstallDoctor({
				projectId: "project-123",
				cwd: sourceRoot,
				homeDir: homeRoot,
				env: {
					CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
					CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
					CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
					CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
				},
				execFileImpl: async () => ({
					stdout: ">fcs....... scripts/codex-bridge.mjs\n",
					stderr: "",
				}),
				fetchImpl: async (url) => {
					if (String(url).endsWith("/en/projects")) {
						return new Response("ok");
					}
					return new Response(
						JSON.stringify({
							projectId: "project-123",
							status: "idle",
							message: "Executor project is ready.",
						}),
					);
				},
			});

			expect(result.ok).toBe(false);
			expect(result.checks.find((check) => check.id === "plugin_sync")).toEqual(
				expect.objectContaining({
					ok: false,
					message:
						"Installed Codecut plugin cache is out of sync with the source tree.",
					data: expect.objectContaining({
						changedPaths: ["scripts/codex-bridge.mjs"],
					}),
				}),
			);
		} finally {
			await Promise.all([
				rm(sourceRoot, { recursive: true, force: true }),
				rm(homeRoot, { recursive: true, force: true }),
			]);
		}
	});

	test("install doctor reports missing env and executor project without token output", async () => {
		const sourceRoot = await mkdtemp(join(tmpdir(), "codecut-source-"));
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-home-"));
		await mkdir(join(sourceRoot, ".codex-plugin"), { recursive: true });
		await writeFile(
			join(sourceRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);

		try {
			const result = await runInstallDoctor({
				projectId: undefined,
				cwd: sourceRoot,
				homeDir: homeRoot,
				env: {
					CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
					CODECUT_AGENT_BRIDGE_TOKEN: "secret-token",
					CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
				},
				fetchImpl: async () => {
					throw new Error("fetch should not run without valid env");
				},
			});

			expect(result.ok).toBe(false);
			expect(result.checks.find((check) => check.id === "environment")).toEqual(
				expect.objectContaining({
					ok: false,
					message: "Missing CODECUT_AGENT_BRIDGE_INTERVAL_MS",
				}),
			);
			expect(
				result.checks.find((check) => check.id === "executor_project"),
			).toEqual(
				expect.objectContaining({
					ok: false,
					message: "--project-id is required",
				}),
			);
			expect(JSON.stringify(result)).not.toContain("secret-token");
		} finally {
			await Promise.all([
				rm(sourceRoot, { recursive: true, force: true }),
				rm(homeRoot, { recursive: true, force: true }),
			]);
		}
	});

	test("executor readiness fails before commands are enqueued", async () => {
		const requests = [];

		await expect(
			waitForExecutor({
				config: {
					baseUrl: "http://localhost:4100",
					token: "local-token",
					timeoutMs: 1000,
					intervalMs: 1,
				},
				projectId: "project-123",
				fetchImpl: async (url, init) => {
					requests.push({ url, init });
					return new Response(
						JSON.stringify({ error: "Executor project not found" }),
						{ status: 404 },
					);
				},
			}),
		).rejects.toThrow("Executor readiness check failed");

		expect(requests).toHaveLength(1);
		expect(requests[0].url).toContain("/api/codex-executor/status");
	});

	test("creates a local executor project and prints its editor URL", async () => {
		const requests = [];
		const output = [];
		const exitCode = await runCli({
			argv: [
				"create-project",
				"--project-id",
				"project-123",
				"--name",
				"Codex cut",
			],
			env: {
				CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
				CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
				CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
				CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
			},
			fetchImpl: async (url, init) => {
				requests.push({ url, init });
				return new Response(
					JSON.stringify({
						projectId: "project-123",
						name: "Codex cut",
						editorUrl: "http://127.0.0.1:4100/en/editor/project-123",
					}),
				);
			},
			stdout: (value) => output.push(value),
		});

		expect(exitCode).toBe(0);
		expect(requests[0].url).toBe(
			"http://localhost:4100/api/codex-executor/projects",
		);
		expect(JSON.parse(requests[0].init.body)).toEqual({
			projectId: "project-123",
			name: "Codex cut",
		});
		expect(JSON.parse(output[0])).toMatchObject({
			projectId: "project-123",
			editorUrl: "http://127.0.0.1:4100/en/editor/project-123",
		});
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
					CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
					CODECUT_AGENT_BRIDGE_TOKEN: "env-token",
					CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
					CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
				},
				fetchImpl: async () => {
					throw new Error("fetch should not be called");
				},
			}),
		).rejects.toThrow(
			"Token must be provided through CODECUT_AGENT_BRIDGE_TOKEN",
		);
	});
});
