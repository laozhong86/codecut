import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildAddCaptionsEnvelope,
	buildAddTextsEnvelope,
	buildAddTransitionsEnvelope,
	buildApplyPlanEnvelope,
	buildCommandEnvelope,
	buildDeleteSystemTemplateScriptEnvelope,
	buildDigitalHumanEnvelope,
	buildRunningHubVoiceCloneEnvelope,
	buildRunningHubVoiceDesignEnvelope,
	buildExportEnvelope,
	buildFreshSessionSmokeReport,
	buildGetTimelineStateEnvelope,
	buildGetTranscriptEnvelope,
	buildImportSystemTemplateScriptEnvelope,
	buildImportMediaEnvelope,
	buildInsertClipsEnvelope,
	buildInspectTimelineEnvelope,
	buildInspectVideoRangeEnvelope,
	buildListModelsEnvelope,
	buildMoveClipsEnvelope,
	buildPreviewEditPlanEnvelope,
	buildPostCutCaptionsEnvelope,
	buildRemoveClipsEnvelope,
	buildRemoveTransitionEnvelope,
	buildRippleDeleteRangesEnvelope,
	buildSearchMediaEnvelope,
	buildSetClipPropertiesEnvelope,
	buildSetKeyframesEnvelope,
	buildSplitClipEnvelope,
	buildTranscribeEnvelope,
	buildUpdateTransitionEnvelope,
	buildUpdateSystemTemplateScriptEnvelope,
	buildValidateEditPlanEnvelope,
	buildVideoContextEnvelope,
	buildVideoQualityReportEnvelope,
	buildVisualContextEnvelope,
	buildVerifyTimelineEnvelope,
	parseBoolean,
	requireRuntimeConfig,
	runInstallDoctor,
	runPluginFreshness,
	runCli,
	waitForExecutor,
} from "../codex-bridge.mjs";
import {
	createPendingCodecutConfirmation,
	mintCodecutConfirmationToken,
} from "../codecut-confirmation-gate.mjs";
import { buildBridgeCliArgs } from "../../mcp/server.mjs";

async function createTestConfirmationToken(root, projectId = "project-123") {
	return mintCodecutConfirmationToken({
		root,
		projectId,
		pendingConfirmationId: createPendingCodecutConfirmation(),
	});
}

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
		expect(output).toContain(
			"node scripts/codex-bridge.mjs fresh-session-smoke",
		);
		expect(output).toContain(
			"node scripts/codex-bridge.mjs generate-digital-human",
		);
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

	test("buildGetTimelineStateEnvelope builds canonical readback args", () => {
		expect(
			buildGetTimelineStateEnvelope({
				projectId: "project-1",
				startTime: 1,
				endTime: 3,
				includeFrames: true,
				includeReferencedMedia: true,
			}),
		).toEqual({
			version: 1,
			projectId: "project-1",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "get_timeline_state",
					args: {
						startTime: 1,
						endTime: 3,
						includeFrames: true,
						includeReferencedMedia: true,
					},
				},
			],
		});
	});

	test("buildGetTimelineStateEnvelope rejects removed format selector", () => {
		expect(() =>
			buildGetTimelineStateEnvelope({
				projectId: "project-1",
				format: "v2",
			}),
		).toThrow("get_timeline_state does not accept option(s): format");
	});

	test("buildInspectTimelineEnvelope validates timeline inspect ranges", () => {
		expect(
			buildInspectTimelineEnvelope({
				projectId: "project-1",
				startTime: 1,
				endTime: 3,
				frameCount: 4,
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-1",
				tool: "inspect_timeline",
				args: {
					startTime: 1,
					endTime: 3,
					frameCount: 4,
				},
			}),
		);
		expect(() =>
			buildInspectTimelineEnvelope({
				projectId: "project-1",
				startTime: Number.NaN,
			}),
		).toThrow("--start-time must be a finite non-negative number");
		expect(() =>
			buildInspectTimelineEnvelope({
				projectId: "project-1",
				startTime: 3,
				endTime: 1,
			}),
		).toThrow("--end-time must be greater than --start-time");
		expect(() =>
			buildInspectTimelineEnvelope({
				projectId: "project-1",
				startTime: 1,
				endTime: 3,
				frameCount: 17,
			}),
		).toThrow("--frame-count must be an integer from 1 to 16");
	});

	test("buildGetTranscriptEnvelope validates transcript args", () => {
		expect(
			buildGetTranscriptEnvelope({
				projectId: "project-1",
				granularity: "word",
				language: "auto",
				modelId: "whisper-base",
				startTime: 0,
				endTime: 10,
				includeFrames: true,
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-1",
				tool: "get_transcript",
				args: {
					granularity: "word",
					language: "auto",
					modelId: "whisper-base",
					startTime: 0,
					endTime: 10,
					includeFrames: true,
				},
			}),
		);
		expect(() =>
			buildGetTranscriptEnvelope({
				projectId: "project-1",
				granularity: "segment",
				language: "",
				modelId: "whisper-base",
			}),
		).toThrow("--language is required");
		expect(() =>
			buildGetTranscriptEnvelope({
				projectId: "project-1",
				granularity: "sentence",
				language: "auto",
				modelId: "whisper-base",
			}),
		).toThrow("--granularity must be segment or word");
		expect(() =>
			buildGetTranscriptEnvelope({
				projectId: "project-1",
				granularity: "segment",
				language: "auto",
				modelId: "whisper-base",
				startTime: 10,
				endTime: 0,
			}),
		).toThrow("--end-time must be greater than --start-time");
	});

	test("micro edit envelope helpers require stable ids and payloads", () => {
		expect(
			buildInsertClipsEnvelope({
				projectId: "project-1",
				trackId: "track-1",
				atTime: 1,
				clips: [{ mediaId: "media-1", duration: 2 }],
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-1",
				tool: "insert_clips",
				args: {
					trackId: "track-1",
					atTime: 1,
					clips: [{ mediaId: "media-1", duration: 2 }],
				},
			}),
		);
		expect(
			buildMoveClipsEnvelope({
				projectId: "project-1",
				moves: [{ elementId: "clip-1", toTrackId: "track-2" }],
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-1",
				tool: "move_clips",
				args: {
					moves: [{ elementId: "clip-1", toTrackId: "track-2" }],
				},
			}),
		);
		expect(
			buildRemoveClipsEnvelope({
				projectId: "project-1",
				elementIds: ["clip-1"],
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-1",
				tool: "remove_clips",
				args: { elementIds: ["clip-1"] },
			}),
		);
		expect(
			buildSplitClipEnvelope({
				projectId: "project-1",
				elementId: "clip-1",
				atTime: 4,
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-1",
				tool: "split_clip",
				args: { elementId: "clip-1", atTime: 4 },
			}),
		);
		expect(
			buildSetClipPropertiesEnvelope({
				projectId: "project-1",
				elementId: "clip-1",
				properties: { duration: 3, opacity: 0.4 },
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-1",
				tool: "set_clip_properties",
				args: {
					elementId: "clip-1",
					properties: { duration: 3, opacity: 0.4 },
				},
			}),
		);
		expect(
			buildRippleDeleteRangesEnvelope({
				projectId: "project-1",
				scope: { type: "track", trackId: "track-1" },
				ranges: [[1, 3]],
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-1",
				tool: "ripple_delete_ranges",
				args: {
					scope: { type: "track", trackId: "track-1" },
					ranges: [[1, 3]],
				},
			}),
		);
		expect(() =>
			buildInsertClipsEnvelope({
				projectId: "project-1",
				trackId: "",
				atTime: 1,
				clips: [{ mediaId: "media-1", duration: 2 }],
			}),
		).toThrow("--track-id is required");
		expect(() =>
			buildRemoveClipsEnvelope({
				projectId: "project-1",
				elementIds: [],
			}),
		).toThrow("--element-ids must contain at least one id");
		expect(() =>
			buildSetClipPropertiesEnvelope({
				projectId: "project-1",
				elementId: "clip-1",
				properties: null,
			}),
		).toThrow("--properties must be a JSON object");
		expect(() =>
			buildRippleDeleteRangesEnvelope({
				projectId: "project-1",
				scope: { type: "track", trackId: "track-1" },
				ranges: [[3, 1]],
			}),
		).toThrow(
			"--ranges entries must be [start, end] with end greater than start",
		);
		expect(() =>
			buildRippleDeleteRangesEnvelope({
				projectId: "project-1",
				ranges: [[1, 3]],
			}),
		).toThrow("--scope is required");
		expect(() =>
			buildRippleDeleteRangesEnvelope({
				projectId: "project-1",
				scope: { type: "track", trackId: "" },
				ranges: [[1, 3]],
			}),
		).toThrow("--scope.trackId is required for track scope");
	});

	test("builds an export command only from explicit export options", () => {
		const envelope = buildExportEnvelope({
			projectId: "project-123",
			format: "mp4",
			quality: "high",
			includeAudio: true,
			outputFile: "/tmp/codecut-export.mp4",
			overwrite: false,
		});

		expect(envelope.commands[0]).toEqual({
			id: "cmd-1",
			tool: "export_project",
			args: {
				format: "mp4",
				quality: "high",
				includeAudio: true,
				outputFile: "/tmp/codecut-export.mp4",
				overwrite: false,
			},
		});
	});

	test("export command requires an absolute output file and explicit overwrite", () => {
		expect(() =>
			buildExportEnvelope({
				projectId: "project-123",
				format: "mp4",
				quality: "high",
				includeAudio: true,
				outputFile: "relative.mp4",
				overwrite: false,
			}),
		).toThrow("--output-file must be an absolute path");
		expect(() =>
			buildExportEnvelope({
				projectId: "project-123",
				format: "mp4",
				quality: "high",
				includeAudio: true,
				outputFile: "/tmp/codecut-export.mp4",
			}),
		).toThrow("--overwrite is required");
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

	test("buildVisualContextEnvelope creates a build_visual_context command", () => {
		expect(
			buildVisualContextEnvelope({
				projectId: "project-1",
				mediaId: "media-1",
				targetAspectRatio: "9:16",
			}),
		).toEqual({
			version: 1,
			projectId: "project-1",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "build_visual_context",
					args: {
						mediaId: "media-1",
						targetAspectRatio: "9:16",
					},
				},
			],
		});
	});

	test("buildVisualContextEnvelope requires explicit inputs", () => {
		expect(() =>
			buildVisualContextEnvelope({
				projectId: "project-1",
				mediaId: "",
				targetAspectRatio: "9:16",
			}),
		).toThrow("--media-id is required");
		expect(() =>
			buildVisualContextEnvelope({
				projectId: "project-1",
				mediaId: "media-1",
				targetAspectRatio: undefined,
			}),
		).toThrow("--target-aspect-ratio is required");
		expect(() =>
			buildVisualContextEnvelope({
				projectId: "project-1",
				mediaId: "media-1",
				targetAspectRatio: "4:5",
			}),
		).toThrow("--target-aspect-ratio must be one of 9:16, 16:9, 1:1");
	});

	test("buildInspectVideoRangeEnvelope creates an inspect_video_range command", () => {
		expect(
			buildInspectVideoRangeEnvelope({
				projectId: "project-1",
				mediaId: "media-1",
				startSeconds: 12.5,
				endSeconds: 18,
				frameCount: 8,
			}),
		).toEqual({
			version: 1,
			projectId: "project-1",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "inspect_video_range",
					args: {
						mediaId: "media-1",
						startSeconds: 12.5,
						endSeconds: 18,
						frameCount: 8,
					},
				},
			],
		});
	});

	test("buildInspectVideoRangeEnvelope rejects invalid inspect range flags", () => {
		expect(() =>
			buildInspectVideoRangeEnvelope({
				projectId: "project-1",
				mediaId: "media-1",
				startSeconds: Number.NaN,
				endSeconds: 18,
			}),
		).toThrow("--start-seconds must be a finite non-negative number");
		expect(() =>
			buildInspectVideoRangeEnvelope({
				projectId: "project-1",
				mediaId: "media-1",
				startSeconds: 12.5,
				endSeconds: 12.5,
			}),
		).toThrow("--end-seconds must be greater than --start-seconds");
		expect(() =>
			buildInspectVideoRangeEnvelope({
				projectId: "project-1",
				mediaId: "media-1",
				startSeconds: 12.5,
				endSeconds: 18,
				frameCount: 17,
			}),
		).toThrow("--frame-count must be an integer from 1 to 16");
	});

	test("buildPostCutCaptionsEnvelope creates a post-cut caption command", () => {
		expect(
			buildPostCutCaptionsEnvelope({
				projectId: "project-1",
				language: "zh",
				modelId: "whisper-base",
			}),
		).toEqual({
			version: 1,
			projectId: "project-1",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "build_post_cut_captions",
					args: {
						language: "zh",
						modelId: "whisper-base",
					},
				},
			],
		});
	});

	test("buildDigitalHumanEnvelope creates a generate_digital_human command", () => {
		expect(
			buildDigitalHumanEnvelope({
				projectId: "project-1",
				imageMediaId: "image-1",
				audioMediaId: "audio-1",
				scriptText: "欢迎来到今天的口播",
				motionPrompt: "女人自然点头微笑",
				width: 1280,
				height: 720,
				fps: 25,
			}),
		).toEqual({
			version: 1,
			projectId: "project-1",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "generate_digital_human",
					args: {
						imageMediaId: "image-1",
						audioMediaId: "audio-1",
						scriptText: "欢迎来到今天的口播",
						motionPrompt: "女人自然点头微笑",
						width: 1280,
						height: 720,
						fps: 25,
					},
				},
			],
		});
	});

	test("buildDigitalHumanEnvelope requires all explicit inputs", () => {
		expect(() =>
			buildDigitalHumanEnvelope({
				projectId: "project-1",
				imageMediaId: "",
				audioMediaId: "audio-1",
				scriptText: "欢迎来到今天的口播",
				motionPrompt: "女人自然点头微笑",
				width: 1280,
				height: 720,
				fps: 25,
			}),
		).toThrow("--image-media-id is required");
		expect(() =>
			buildDigitalHumanEnvelope({
				projectId: "project-1",
				imageMediaId: "image-1",
				audioMediaId: "audio-1",
				scriptText: "",
				motionPrompt: "女人自然点头微笑",
				width: 1280,
				height: 720,
				fps: 25,
			}),
		).toThrow("--script-text is required");
		expect(() =>
			buildDigitalHumanEnvelope({
				projectId: "project-1",
				imageMediaId: "image-1",
				audioMediaId: "audio-1",
				scriptText: "欢迎来到今天的口播",
				motionPrompt: "女人自然点头微笑",
				width: 0,
				height: 720,
				fps: 25,
			}),
		).toThrow("--width must be a positive number");
	});

	test("buildRunningHubVoiceDesignEnvelope creates an independent voice design command", () => {
		expect(
			buildRunningHubVoiceDesignEnvelope({
				projectId: "project-1",
				text: "欢迎来到今天的测试",
				emotionPrompt: "温柔、稳定的中文播客女声",
				protectedTerms: ["今天的测试"],
			}),
		).toEqual({
			version: 1,
			projectId: "project-1",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "generate_runninghub_voice_design",
					args: {
						text: "欢迎来到今天的测试",
						emotionPrompt: "温柔、稳定的中文播客女声",
						protectedTerms: ["今天的测试"],
					},
				},
			],
		});
	});

	test("buildRunningHubVoiceCloneEnvelope creates an independent voice clone command", () => {
		expect(
			buildRunningHubVoiceCloneEnvelope({
				projectId: "project-1",
				audioPath: "/tmp/reference.wav",
				text: "欢迎来到今天的测试",
				protectedTerms: ["今天的测试"],
			}),
		).toEqual({
			version: 1,
			projectId: "project-1",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "generate_runninghub_voice_clone",
					args: {
						audioPath: "/tmp/reference.wav",
						text: "欢迎来到今天的测试",
						protectedTerms: ["今天的测试"],
					},
				},
			],
		});
	});

	test("voice generation envelopes require all explicit inputs", () => {
		expect(() =>
			buildRunningHubVoiceDesignEnvelope({
				projectId: "project-1",
				text: "",
				emotionPrompt: "warm",
			}),
		).toThrow("--text is required");
		expect(() =>
			buildRunningHubVoiceDesignEnvelope({
				projectId: "project-1",
				text: "hello",
				emotionPrompt: "",
			}),
		).toThrow("--emotion-prompt is required");
		expect(() =>
			buildRunningHubVoiceCloneEnvelope({
				projectId: "project-1",
				audioPath: "",
				text: "hello",
			}),
		).toThrow("--audio-path is required");
		expect(() =>
			buildRunningHubVoiceCloneEnvelope({
				projectId: "project-1",
				audioPath: "/tmp/reference.wav",
				text: "",
			}),
		).toThrow("--text is required");
	});

	test("buildVideoQualityReportEnvelope creates a read-only quality report command", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-quality-report-"));
		const planJsonFile = join(directory, "edit-plan.json");
		const titleRubricJsonFile = join(directory, "title-rubric.json");
		const outputFile = join(directory, "final.mp4");
		const plan = {
			version: 1,
			projectId: "project-1",
			sourceMediaId: "media-1",
			target: { durationSec: 2, aspectRatio: "9:16" },
			clips: [
				{
					id: "clip-1",
					sourceStart: 0,
					sourceEnd: 2,
					timelineStart: 0,
					reason: "Hook",
				},
			],
			rationale: "Quality report fixture",
		};
		const titleRubric = {
			platform: "youtube",
			primaryKeyword: "customer retention",
		};
		await writeFile(planJsonFile, JSON.stringify(plan), "utf8");
		await writeFile(titleRubricJsonFile, JSON.stringify(titleRubric), "utf8");

		try {
			expect(
				await buildVideoQualityReportEnvelope({
					projectId: "project-1",
					planJsonFile,
					startTime: 0,
					endTime: 2,
					frameCount: 3,
					titleRubricJsonFile,
					outputFile,
					outputFormat: "mp4",
					includeAudio: true,
				}),
			).toEqual({
				version: 1,
				projectId: "project-1",
				source: "codex",
				commands: [
					{
						id: "cmd-1",
						tool: "build_video_quality_report",
						args: {
							plan,
							inspection: {
								startTime: 0,
								endTime: 2,
								frameCount: 3,
							},
							titleRubric,
							exportedFile: {
								outputFile,
								format: "mp4",
								includeAudio: true,
							},
						},
					},
				],
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
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

	test("import-media probes local video dimensions when explicit duration is already provided", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-codex-bridge-"));
		const confirmationRoot = await mkdtemp(
			join(tmpdir(), "codecut-confirmation-"),
		);
		const filePath = join(directory, "source.mp4");
		await writeFile(filePath, "video-bytes");
		const confirmationToken = await createTestConfirmationToken(
			confirmationRoot,
			"project-123",
		);
		const requests = [];
		const output = [];
		let probeCallCount = 0;

		const fetchImpl = async (url, init) => {
			requests.push({ url: String(url), init });
			if (
				String(url).endsWith("/api/codex-executor/status?projectId=project-123")
			) {
				return new Response(
					JSON.stringify({
						projectId: "project-123",
						status: "idle",
						message: "Executor project is ready.",
					}),
				);
			}
			if (String(url).endsWith("/api/codex-executor/commands")) {
				return new Response(
					JSON.stringify({
						status: "completed",
						projectId: "project-123",
						results: [{ id: "cmd-1", success: true, message: "Imported" }],
					}),
				);
			}
			throw new Error(`Unexpected request: ${url}`);
		};

		try {
			const exitCode = await runCli({
				argv: [
					"import-media",
					"--project-id",
					"project-123",
					"--file-path",
					filePath,
					"--duration",
					"9",
					"--confirmation-token",
					confirmationToken,
				],
				env: {
					CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
					CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
					CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
					CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
					CODECUT_CONFIRMATION_ROOT: confirmationRoot,
				},
				fetchImpl,
				execFileImpl: async (command, args) => {
					probeCallCount += 1;
					expect(command).toBe("ffprobe");
					expect(args.at(-1)).toBe(filePath);
					return {
						stdout: JSON.stringify({
							format: { duration: "12.5" },
							streams: [{ width: 1920, height: 1080 }],
						}),
						stderr: "",
					};
				},
				stdout: (value) => output.push(value),
			});

			const postedEnvelope = JSON.parse(requests[1].init.body).envelope;
			expect(exitCode).toBe(0);
			expect(probeCallCount).toBe(1);
			expect(postedEnvelope.commands[0]).toMatchObject({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					duration: 9,
					width: 1920,
					height: 1080,
				},
			});
			expect(JSON.parse(output[0]).status).toBe("completed");
		} finally {
			await rm(directory, { recursive: true, force: true });
			await rm(confirmationRoot, { recursive: true, force: true });
		}
	});

	test("builds import-media envelopes from bytes", async () => {
		const base64 = Buffer.from("image-bytes").toString("base64");
		expect(
			await buildImportMediaEnvelope({
				projectId: "project-123",
				bytes: base64,
				fileName: "source.png",
				mimeType: "image/png",
				lastModified: 1234,
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-123",
				tool: "import_media_file",
				args: {
					fileName: "source.png",
					mimeType: "image/png",
					base64,
					size: 11,
					lastModified: 1234,
				},
			}),
		);
	});

	test("builds import-media envelopes with scripted TTS metadata", async () => {
		const base64 = Buffer.from("audio-bytes").toString("base64");
		const spokenScript = {
			source: "tts",
			text: "A pizza portion costs $2.34. Venmo that ASAP.",
			captions: ["A pizza portion costs $2.34.", "Venmo that ASAP."],
			protectedTerms: ["$2.34", "Venmo"],
		};

		expect(
			await buildImportMediaEnvelope({
				projectId: "project-123",
				bytes: base64,
				fileName: "voice.mp3",
				mimeType: "audio/mpeg",
				lastModified: 1234,
				duration: 8,
				spokenScript,
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-123",
				tool: "import_media_file",
				args: {
					fileName: "voice.mp3",
					mimeType: "audio/mpeg",
					base64,
					size: 11,
					lastModified: 1234,
					duration: 8,
					spokenScript,
				},
			}),
		);
	});

	test("import-media validates exactly one source and rejects unsafe URLs", async () => {
		await expect(
			buildImportMediaEnvelope({
				projectId: "project-123",
				filePath: "source.mp4",
			}),
		).rejects.toThrow("--file-path must be an absolute path");
		await expect(
			buildImportMediaEnvelope({
				projectId: "project-123",
				filePath: "/tmp/source.mp4",
				bytes: Buffer.from("png").toString("base64"),
				fileName: "source.png",
				mimeType: "image/png",
			}),
		).rejects.toThrow("exactly one media source");
		await expect(
			buildImportMediaEnvelope({
				projectId: "project-123",
				bytes: Buffer.from("png").toString("base64"),
				mimeType: "image/png",
			}),
		).rejects.toThrow("--file-name is required for bytes import");
		await expect(
			buildImportMediaEnvelope({
				projectId: "project-123",
				url: "http://cdn.example.com/source.png",
			}),
		).rejects.toThrow(
			"import-media --url is disabled; use --file-path or --bytes-base64-file",
		);
	});

	test("builds rich editing command envelopes from args-json payloads", () => {
		expect(
			buildAddTextsEnvelope({
				projectId: "project-123",
				entries: [{ startTime: 0, duration: 2, content: "Hook" }],
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-123",
				tool: "add_texts",
				args: { entries: [{ startTime: 0, duration: 2, content: "Hook" }] },
			}),
		);
		expect(() =>
			buildAddTextsEnvelope({ projectId: "project-123", entries: [] }),
		).toThrow("--entries must contain at least one text entry");

		expect(
			buildAddCaptionsEnvelope({
				projectId: "project-123",
				language: "auto",
				modelId: "whisper-base",
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-123",
				tool: "add_captions",
				args: { language: "auto", modelId: "whisper-base" },
			}),
		);

		expect(
			buildListModelsEnvelope({
				projectId: "project-123",
				type: "transcription",
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-123",
				tool: "list_models",
				args: { type: "transcription" },
			}),
		);

		expect(
			buildSetKeyframesEnvelope({
				projectId: "project-123",
				elementId: "text-1",
				property: "opacity",
				keyframes: [
					{ time: 0, value: 1 },
					{ time: 1, value: 0, interpolation: "linear" },
				],
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-123",
				tool: "set_keyframes",
				args: {
					elementId: "text-1",
					property: "opacity",
					keyframes: [
						{ time: 0, value: 1 },
						{ time: 1, value: 0, interpolation: "linear" },
					],
				},
			}),
		);
		expect(() =>
			buildSetKeyframesEnvelope({
				projectId: "project-123",
				elementId: "text-1",
				property: "blur",
				keyframes: [],
			}),
		).toThrow("--property must be a supported keyframe property");

		expect(
			buildAddTransitionsEnvelope({
				projectId: "project-123",
				entries: [
					{
						trackId: "video-track-1",
						fromElementId: "clip-1",
						toElementId: "clip-2",
						type: "fade",
						duration: 0.35,
					},
				],
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-123",
				tool: "add_transitions",
				args: {
					entries: [
						{
							trackId: "video-track-1",
							fromElementId: "clip-1",
							toElementId: "clip-2",
							type: "fade",
							duration: 0.35,
						},
					],
				},
			}),
		);

		expect(
			buildUpdateTransitionEnvelope({
				projectId: "project-123",
				trackId: "video-track-1",
				transitionId: "transition-1",
				type: "slide-left",
				duration: 0.25,
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-123",
				tool: "update_transition",
				args: {
					trackId: "video-track-1",
					transitionId: "transition-1",
					type: "slide-left",
					duration: 0.25,
				},
			}),
		);

		expect(
			buildRemoveTransitionEnvelope({
				projectId: "project-123",
				trackId: "video-track-1",
				transitionId: "transition-1",
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-123",
				tool: "remove_transition",
				args: {
					trackId: "video-track-1",
					transitionId: "transition-1",
				},
			}),
		);
		expect(() =>
			buildUpdateTransitionEnvelope({
				projectId: "project-123",
				trackId: "video-track-1",
				transitionId: "transition-1",
			}),
		).toThrow("--type or --duration is required");

		expect(
			buildSearchMediaEnvelope({
				projectId: "project-123",
				query: "intro",
				scope: "both",
				limit: 5,
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-123",
				tool: "search_media",
				args: { query: "intro", scope: "both", limit: 5 },
			}),
		);
		expect(() =>
			buildSearchMediaEnvelope({ projectId: "project-123", query: "" }),
		).toThrow("--query is required");
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

	test("builds validate and preview EditPlan command envelopes without mutation flags", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-codex-bridge-"));
		const planPath = join(directory, "edit-plan.json");
		const plan = {
			version: 1,
			projectId: "project-123",
			sourceMediaId: "media-123",
			target: { durationSec: 10, aspectRatio: "9:16" },
			clips: [
				{
					id: "clip-1",
					sourceStart: 0,
					sourceEnd: 10,
					timelineStart: 0,
					reason: "Hook",
				},
			],
			rationale: "Short cut",
		};
		await writeFile(planPath, JSON.stringify(plan), "utf8");

		try {
			await expect(
				buildValidateEditPlanEnvelope({
					projectId: "project-123",
					planJsonFile: "edit-plan.json",
				}),
			).rejects.toThrow("--plan-json-file must be an absolute path");

			expect(
				await buildValidateEditPlanEnvelope({
					projectId: "project-123",
					planJsonFile: planPath,
				}),
			).toEqual(
				buildCommandEnvelope({
					projectId: "project-123",
					tool: "validate_edit_plan",
					args: { plan },
				}),
			);
			expect(
				await buildPreviewEditPlanEnvelope({
					projectId: "project-123",
					planJsonFile: planPath,
				}),
			).toEqual(
				buildCommandEnvelope({
					projectId: "project-123",
					tool: "preview_edit_plan",
					args: { plan },
				}),
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("builds a confirmed system template import envelope from a JSON draft", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-codex-bridge-"));
		const templatePath = join(directory, "local-template-script.json");
		const template = {
			id: "proof-demo-cut",
			name: "Proof demo cut",
			description: "A proof-led system template script.",
			trigger: {
				types: ["product-proof-ad"],
				defaultForTypes: [],
				aliases: ["proof demo"],
			},
			script: {
				objective: "Create a proof-led product demo short.",
				steps: [
					{
						id: "open-with-proof",
						label: "Open with proof",
						instruction: "Open with visible proof before any claim.",
					},
				],
				verification: ["Claims map to visible proof."],
			},
			createdAt: "2026-06-23T00:00:00.000Z",
			updatedAt: "2026-06-23T00:00:00.000Z",
		};
		await writeFile(templatePath, JSON.stringify(template), "utf8");

		try {
			await expect(
				buildImportSystemTemplateScriptEnvelope({
					projectId: "project-123",
					templateJsonFile: templatePath,
					confirmedByUser: false,
				}),
			).rejects.toThrow(
				"--confirmed-by-user must be true after explicit user confirmation",
			);

			expect(
				await buildImportSystemTemplateScriptEnvelope({
					projectId: "project-123",
					templateJsonFile: templatePath,
					confirmedByUser: true,
				}),
			).toEqual(
				buildCommandEnvelope({
					projectId: "project-123",
					tool: "import_system_template_script",
					args: {
						confirmedByUser: true,
						template,
					},
				}),
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("builds a confirmed system template update envelope from a JSON draft", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-codex-bridge-"));
		const templatePath = join(directory, "local-template-script.json");
		const template = {
			id: "proof-demo-cut",
			name: "Proof demo cut v2",
			description: "An updated proof-led system template script.",
			trigger: {
				types: ["product-proof-ad"],
				defaultForTypes: [],
				aliases: ["proof update"],
			},
			script: {
				objective: "Create an updated proof-led product demo short.",
				steps: [
					{
						id: "open-with-proof",
						label: "Open with proof",
						instruction: "Open with visible proof before any claim.",
					},
					{
						id: "close-with-evidence",
						label: "Close with evidence",
						instruction: "Close with a visible proof recovery.",
					},
				],
				verification: [
					"Claims map to visible proof.",
					"get_timeline_state verifies proof recovery.",
				],
			},
			createdAt: "2026-06-23T00:00:00.000Z",
			updatedAt: "2026-06-24T00:00:00.000Z",
		};
		await writeFile(templatePath, JSON.stringify(template), "utf8");

		try {
			await expect(
				buildUpdateSystemTemplateScriptEnvelope({
					projectId: "project-123",
					templateJsonFile: templatePath,
					confirmedByUser: false,
				}),
			).rejects.toThrow(
				"--confirmed-by-user must be true after explicit user confirmation",
			);

			expect(
				await buildUpdateSystemTemplateScriptEnvelope({
					projectId: "project-123",
					templateJsonFile: templatePath,
					confirmedByUser: true,
				}),
			).toEqual(
				buildCommandEnvelope({
					projectId: "project-123",
					tool: "update_system_template_script",
					args: {
						confirmedByUser: true,
						template,
					},
				}),
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("builds a confirmed system template delete envelope for cleanup", () => {
		expect(() =>
			buildDeleteSystemTemplateScriptEnvelope({
				projectId: "project-123",
				templateId: "proof-demo-cut",
				confirmedByUser: false,
			}),
		).toThrow(
			"--confirmed-by-user must be true after explicit user confirmation",
		);

		expect(
			buildDeleteSystemTemplateScriptEnvelope({
				projectId: "project-123",
				templateId: "proof-demo-cut",
				confirmedByUser: true,
			}),
		).toEqual(
			buildCommandEnvelope({
				projectId: "project-123",
				tool: "delete_system_template_script",
				args: {
					confirmedByUser: true,
					templateId: "proof-demo-cut",
				},
			}),
		);
	});

	test("builds verify-timeline envelope from an absolute verification JSON file", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-codex-bridge-"));
		const verificationPath = join(directory, "verification.json");
		const verification = {
			totalDuration: 10,
			trackCount: 2,
			clipCount: 1,
			captionCount: 0,
			audioCount: 0,
			mediaIds: ["media-123"],
		};
		await writeFile(verificationPath, JSON.stringify(verification), "utf8");

		try {
			const envelope = await buildVerifyTimelineEnvelope({
				projectId: "project-123",
				verificationJsonFile: verificationPath,
			});

			expect(envelope).toEqual(
				buildCommandEnvelope({
					projectId: "project-123",
					tool: "verify_timeline",
					args: { verification },
				}),
			);
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

	test("get-timeline-state CLI rejects removed format flag", async () => {
		await expect(
			runCli({
				argv: [
					"get-timeline-state",
					"--project-id",
					"project-123",
					"--format",
					"v2",
				],
				env: {
					CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
					CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
					CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
					CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
				},
				fetchImpl: async (url) => {
					throw new Error(`Unexpected request: ${url}`);
				},
				stdout: () => {},
			}),
		).rejects.toThrow("get-timeline-state does not accept flag(s): --format");
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

	test("imports system templates through the browser agent bridge", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-codex-bridge-"));
		const templatePath = join(directory, "local-template-script.json");
		await writeFile(
			templatePath,
			JSON.stringify({
				id: "proof-demo-cut",
				name: "Proof demo cut",
				trigger: {
					types: ["product-proof-ad"],
					defaultForTypes: [],
					aliases: [],
				},
				script: {
					objective: "Verify import.",
					steps: [
						{
							id: "open",
							label: "Open",
							instruction: "Open with proof.",
						},
					],
					verification: ["Visible in Templates UI."],
				},
				createdAt: "2026-06-23T00:00:00.000Z",
				updatedAt: "2026-06-23T00:00:00.000Z",
			}),
			"utf8",
		);

		const requests = [];
		const fetchImpl = async (url, init = {}) => {
			requests.push({ url, init });
			if (String(url).includes("/api/agent-bridge/heartbeat")) {
				return new Response(
					JSON.stringify({ projectId: "project-123", mounted: true }),
				);
			}
			if (String(url).endsWith("/api/agent-bridge/commands")) {
				return new Response(
					JSON.stringify({
						id: "bridge-1",
						status: "pending",
						projectId: "project-123",
					}),
				);
			}
			if (String(url).includes("/api/agent-bridge/results?id=bridge-1")) {
				return new Response(
					JSON.stringify({
						id: "bridge-1",
						status: "completed",
						projectId: "project-123",
						results: [
							{
								commandId: "cmd-1",
								tool: "import_system_template_script",
								success: true,
								message: "Imported",
							},
						],
					}),
				);
			}
			throw new Error(`Unexpected request: ${url}`);
		};
		const output = [];

		try {
			const exitCode = await runCli({
				argv: [
					"import-system-template-script",
					"--project-id",
					"project-123",
					"--template-json-file",
					templatePath,
					"--confirmed-by-user",
					"true",
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
			expect(requests.map((request) => request.url)).toEqual([
				"http://localhost:4100/api/agent-bridge/heartbeat?projectId=project-123",
				"http://localhost:4100/api/agent-bridge/commands",
				"http://localhost:4100/api/agent-bridge/results?id=bridge-1",
			]);
			expect(requests[1].init.headers.Authorization).toBe("Bearer local-token");
			expect(JSON.parse(requests[1].init.body).envelope.commands[0]).toEqual({
				id: "cmd-1",
				tool: "import_system_template_script",
				args: {
					confirmedByUser: true,
					template: {
						id: "proof-demo-cut",
						name: "Proof demo cut",
						trigger: {
							types: ["product-proof-ad"],
							defaultForTypes: [],
							aliases: [],
						},
						script: {
							objective: "Verify import.",
							steps: [
								{
									id: "open",
									label: "Open",
									instruction: "Open with proof.",
								},
							],
							verification: ["Visible in Templates UI."],
						},
						createdAt: "2026-06-23T00:00:00.000Z",
						updatedAt: "2026-06-23T00:00:00.000Z",
					},
				},
			});
			expect(JSON.parse(output[0]).status).toBe("completed");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("updates system templates through the browser agent bridge", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-codex-bridge-"));
		const templatePath = join(directory, "local-template-script.json");
		await writeFile(
			templatePath,
			JSON.stringify({
				id: "proof-demo-cut",
				name: "Proof demo cut v2",
				trigger: {
					types: ["product-proof-ad"],
					defaultForTypes: [],
					aliases: ["proof update"],
				},
				script: {
					objective: "Verify update.",
					steps: [
						{
							id: "open",
							label: "Open",
							instruction: "Open with proof.",
						},
					],
					verification: ["Visible in Templates UI."],
				},
				createdAt: "2026-06-23T00:00:00.000Z",
				updatedAt: "2026-06-24T00:00:00.000Z",
			}),
			"utf8",
		);

		const requests = [];
		const fetchImpl = async (url, init = {}) => {
			requests.push({ url, init });
			if (String(url).includes("/api/agent-bridge/heartbeat")) {
				return new Response(
					JSON.stringify({ projectId: "project-123", mounted: true }),
				);
			}
			if (String(url).endsWith("/api/agent-bridge/commands")) {
				return new Response(
					JSON.stringify({
						id: "bridge-1",
						status: "pending",
						projectId: "project-123",
					}),
				);
			}
			if (String(url).includes("/api/agent-bridge/results?id=bridge-1")) {
				return new Response(
					JSON.stringify({
						id: "bridge-1",
						status: "completed",
						projectId: "project-123",
						results: [
							{
								commandId: "cmd-1",
								tool: "update_system_template_script",
								success: true,
								message: "Updated",
							},
						],
					}),
				);
			}
			throw new Error(`Unexpected request: ${url}`);
		};
		const output = [];

		try {
			const exitCode = await runCli({
				argv: [
					"update-system-template-script",
					"--project-id",
					"project-123",
					"--template-json-file",
					templatePath,
					"--confirmed-by-user",
					"true",
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
			expect(requests.map((request) => request.url)).toEqual([
				"http://localhost:4100/api/agent-bridge/heartbeat?projectId=project-123",
				"http://localhost:4100/api/agent-bridge/commands",
				"http://localhost:4100/api/agent-bridge/results?id=bridge-1",
			]);
			expect(JSON.parse(requests[1].init.body).envelope.commands[0]).toEqual({
				id: "cmd-1",
				tool: "update_system_template_script",
				args: {
					confirmedByUser: true,
					template: {
						id: "proof-demo-cut",
						name: "Proof demo cut v2",
						trigger: {
							types: ["product-proof-ad"],
							defaultForTypes: [],
							aliases: ["proof update"],
						},
						script: {
							objective: "Verify update.",
							steps: [
								{
									id: "open",
									label: "Open",
									instruction: "Open with proof.",
								},
							],
							verification: ["Visible in Templates UI."],
						},
						createdAt: "2026-06-23T00:00:00.000Z",
						updatedAt: "2026-06-24T00:00:00.000Z",
					},
				},
			});
			expect(JSON.parse(output[0]).status).toBe("completed");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("deletes system templates through the browser agent bridge", async () => {
		const requests = [];
		const fetchImpl = async (url, init = {}) => {
			requests.push({ url, init });
			if (String(url).includes("/api/agent-bridge/heartbeat")) {
				return new Response(
					JSON.stringify({ projectId: "project-123", mounted: true }),
				);
			}
			if (String(url).endsWith("/api/agent-bridge/commands")) {
				return new Response(
					JSON.stringify({
						id: "bridge-1",
						status: "pending",
						projectId: "project-123",
					}),
				);
			}
			if (String(url).includes("/api/agent-bridge/results?id=bridge-1")) {
				return new Response(
					JSON.stringify({
						id: "bridge-1",
						status: "completed",
						projectId: "project-123",
						results: [
							{
								commandId: "cmd-1",
								tool: "delete_system_template_script",
								success: true,
								message: "Deleted",
							},
						],
					}),
				);
			}
			throw new Error(`Unexpected request: ${url}`);
		};
		const output = [];

		const exitCode = await runCli({
			argv: [
				"delete-system-template-script",
				"--project-id",
				"project-123",
				"--template-id",
				"proof-demo-cut",
				"--confirmed-by-user",
				"true",
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
		expect(requests.map((request) => request.url)).toEqual([
			"http://localhost:4100/api/agent-bridge/heartbeat?projectId=project-123",
			"http://localhost:4100/api/agent-bridge/commands",
			"http://localhost:4100/api/agent-bridge/results?id=bridge-1",
		]);
		expect(JSON.parse(requests[1].init.body).envelope.commands[0]).toEqual({
			id: "cmd-1",
			tool: "delete_system_template_script",
			args: {
				confirmedByUser: true,
				templateId: "proof-demo-cut",
			},
		});
		expect(JSON.parse(output[0]).status).toBe("completed");
	});

	test("project management commands call executor project endpoints directly", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-confirmation-"));
		const confirmationToken = await createTestConfirmationToken(
			directory,
			"project-123",
		);
		const requests = [];
		const fetchImpl = async (url, init = {}) => {
			requests.push({ url, init });
			return new Response(JSON.stringify({ ok: true }));
		};
		const env = {
			CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
			CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
			CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
			CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
			CODECUT_CONFIRMATION_ROOT: directory,
		};

		try {
			await runCli({
				argv: ["list-projects"],
				cwd: directory,
				env,
				fetchImpl,
				stdout: () => {},
			});
			await runCli({
				argv: [
					"rename-project",
					"--project-id",
					"project-123",
					"--name",
					"Renamed",
					"--confirmation-token",
					confirmationToken,
				],
				cwd: directory,
				env,
				fetchImpl,
				stdout: () => {},
			});
			await runCli({
				argv: [
					"delete-project",
					"--project-id",
					"project-123",
					"--confirmation-token",
					confirmationToken,
				],
				cwd: directory,
				env,
				fetchImpl,
				stdout: () => {},
			});

			expect(
				requests.map((request) => [request.init.method, request.url]),
			).toEqual([
				["GET", "http://localhost:4100/api/codex-executor/projects"],
				["PATCH", "http://localhost:4100/api/codex-executor/project"],
				["DELETE", "http://localhost:4100/api/codex-executor/project"],
			]);
			expect(JSON.parse(requests[1].init.body)).toEqual({
				projectId: "project-123",
				name: "Renamed",
			});
			expect(JSON.parse(requests[2].init.body)).toEqual({
				projectId: "project-123",
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("MCP internal project setup mappings call explicit project commands", () => {
		expect(() =>
			buildBridgeCliArgs("create_project", {
				projectId: "launch-cut-001",
				name: "Launch Cut",
			}),
		).toThrow("confirmationToken is required");
		expect(
			buildBridgeCliArgs("create_project", {
				projectId: "launch-cut-001",
				name: "Launch Cut",
				confirmationToken: "ccconfirmed_test",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"create-project",
			"--project-id",
			"launch-cut-001",
			"--name",
			"Launch Cut",
			"--confirmation-token",
			"ccconfirmed_test",
		]);
		expect(buildBridgeCliArgs("list_projects", {})).toEqual([
			"scripts/codex-bridge.mjs",
			"list-projects",
		]);
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

	test("buildFreshSessionSmokeReport proves scripted media and protected caption text readback", () => {
		const report = buildFreshSessionSmokeReport({
			projectId: "project-123",
			installDoctorResult: {
				ok: true,
				checks: [{ id: "plugin_sync", ok: true, message: "Cache is synced" }],
			},
			doctorResult: {
				status: "ready",
				executor: { projectId: "project-123", status: "idle" },
			},
			mediaAssetsResult: {
				status: "completed",
				results: [
					{
						commandId: "cmd-1",
						tool: "list_media_assets",
						success: true,
						data: {
							assets: [
								{
									id: "audio-1",
									name: "blind-narration.wav",
									type: "audio",
									hasSpokenScript: true,
									spokenScriptCaptionLineCount: 4,
									spokenScriptProtectedTermCount: 3,
								},
							],
						},
					},
				],
			},
			timelineResult: {
				status: "completed",
				results: [
					{
						commandId: "cmd-1",
						tool: "get_timeline_state",
						success: true,
						data: {
							schemaVersion: 2,
							project: {
								id: "project-123",
								revision: 13,
								totalDuration: 8.740544,
							},
							summary: { trackCount: 4, elementCount: 8 },
							tracks: [
								{
									type: "text",
									elements: [
										{ content: "A pizza portion costs $2.34." },
										{ content: "The reveal is Venmo that ASAP." },
									],
								},
							],
							referencedMedia: {
								"audio-1": {
									id: "audio-1",
									name: "blind-narration.wav",
									type: "audio",
									hasSpokenScript: true,
									spokenScriptCaptionLineCount: 4,
									spokenScriptProtectedTermCount: 3,
								},
							},
						},
					},
				],
			},
			scriptedMediaName: "blind-narration.wav",
			expectedCaptionLineCount: 4,
			expectedProtectedTermCount: 3,
			expectedCaptionTexts: ["$2.34", "Venmo that ASAP"],
		});

		expect(report.ok).toBe(true);
		expect(report.summary).toMatchObject({
			projectId: "project-123",
			revision: 13,
			totalDuration: 8.740544,
			scriptedMediaId: "audio-1",
			scriptedMediaName: "blind-narration.wav",
		});
			expect(report.checks.map((check) => [check.id, check.ok])).toEqual([
				["doctor_install", true],
				["doctor", true],
				["scripted_media_asset", true],
				["timeline_readback", true],
				["referenced_scripted_media", true],
				["expected_caption_text", true],
		]);
		expect(JSON.stringify(report)).not.toContain("local-token");
	});

	test("buildFreshSessionSmokeReport fails when expected caption text is absent", () => {
		const report = buildFreshSessionSmokeReport({
			projectId: "project-123",
			installDoctorResult: {
				ok: true,
				checks: [{ id: "plugin_sync", ok: true, message: "Cache is synced" }],
			},
			doctorResult: {
				status: "ready",
				executor: { projectId: "project-123", status: "idle" },
			},
			mediaAssetsResult: {
				status: "completed",
				results: [
					{
						commandId: "cmd-1",
						tool: "list_media_assets",
						success: true,
						data: {
							assets: [
								{
									id: "audio-1",
									name: "blind-narration.wav",
									type: "audio",
									hasSpokenScript: true,
									spokenScriptCaptionLineCount: 4,
									spokenScriptProtectedTermCount: 3,
								},
							],
						},
					},
				],
			},
			timelineResult: {
				status: "completed",
				results: [
					{
						commandId: "cmd-1",
						tool: "get_timeline_state",
						success: true,
						data: {
							schemaVersion: 2,
							project: { id: "project-123", revision: 13 },
							tracks: [
								{
									type: "text",
									elements: [{ content: "A pizza portion costs $2.34." }],
								},
							],
							referencedMedia: {
								"audio-1": {
									id: "audio-1",
									name: "blind-narration.wav",
									type: "audio",
									hasSpokenScript: true,
									spokenScriptCaptionLineCount: 4,
									spokenScriptProtectedTermCount: 3,
								},
							},
						},
					},
				],
			},
			scriptedMediaName: "blind-narration.wav",
			expectedCaptionLineCount: 4,
			expectedProtectedTermCount: 3,
			expectedCaptionTexts: ["$2.34", "Venmo that ASAP"],
		});

		expect(report.ok).toBe(false);
		expect(
			report.checks.find((check) => check.id === "expected_caption_text"),
		).toMatchObject({
			ok: false,
			message: "Missing expected caption text: Venmo that ASAP",
		});
	});

	test("fresh-session-smoke command verifies runtime readback and expected captions", async () => {
		const requests = [];
		const output = [];
		const installDoctorImpl = async () => ({
			ok: true,
			checks: [{ id: "plugin_sync", ok: true, message: "Cache is synced" }],
		});
		const fetchImpl = async (url, init = {}) => {
			requests.push({ url, init });
			if (String(url).includes("/api/codex-executor/status")) {
				return new Response(
					JSON.stringify({
						projectId: "project-123",
						status: "idle",
						message: "Executor project is ready.",
					}),
				);
			}
			if (String(url).endsWith("/api/codex-executor/commands")) {
				const envelope = JSON.parse(init.body).envelope;
				const tool = envelope.commands[0].tool;
				if (tool === "list_media_assets") {
					return new Response(
						JSON.stringify({
							status: "completed",
							projectId: "project-123",
							results: [
								{
									commandId: "cmd-1",
									tool,
									success: true,
									data: {
										assets: [
											{
												id: "audio-1",
												name: "blind-narration.wav",
												type: "audio",
												hasSpokenScript: true,
												spokenScriptCaptionLineCount: 4,
												spokenScriptProtectedTermCount: 3,
											},
										],
									},
								},
							],
						}),
					);
				}
				if (tool === "get_timeline_state") {
					return new Response(
						JSON.stringify({
							status: "completed",
							projectId: "project-123",
							results: [
								{
									commandId: "cmd-1",
									tool,
									success: true,
									data: {
										schemaVersion: 2,
										project: {
											id: "project-123",
											revision: 13,
											totalDuration: 8.740544,
										},
										summary: { trackCount: 4, elementCount: 8 },
										tracks: [
											{
												type: "text",
												elements: [
													{ content: "A pizza portion costs $2.34." },
													{ content: "The reveal is Venmo that ASAP." },
												],
											},
										],
										referencedMedia: {
											"audio-1": {
												id: "audio-1",
												name: "blind-narration.wav",
												type: "audio",
												hasSpokenScript: true,
												spokenScriptCaptionLineCount: 4,
												spokenScriptProtectedTermCount: 3,
											},
										},
									},
								},
							],
						}),
					);
				}
			}
			throw new Error(`Unexpected request: ${url}`);
		};

		const exitCode = await runCli({
			argv: [
				"fresh-session-smoke",
				"--project-id",
				"project-123",
				"--scripted-media-name",
				"blind-narration.wav",
				"--expected-caption-line-count",
				"4",
				"--expected-protected-term-count",
				"3",
				"--expected-caption-texts-json",
				'["$2.34","Venmo that ASAP"]',
			],
			env: {
				CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
				CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
				CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
				CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
			},
			fetchImpl,
			installDoctorImpl,
			stdout: (value) => output.push(value),
		});

		expect(exitCode).toBe(0);
		expect(requests.map((request) => request.url)).toEqual([
			"http://localhost:4100/api/codex-executor/status?projectId=project-123",
			"http://localhost:4100/api/codex-executor/commands",
			"http://localhost:4100/api/codex-executor/commands",
		]);
		expect(
			requests
				.slice(1)
				.map((request) => JSON.parse(request.init.body).envelope.commands[0]),
			).toMatchObject([
				{ tool: "list_media_assets", args: {} },
				{
					tool: "get_timeline_state",
					args: { includeReferencedMedia: true },
				},
			]);
		const report = JSON.parse(output[0]);
		expect(report.ok).toBe(true);
		expect(report.summary).toMatchObject({
			revision: 13,
			scriptedMediaId: "audio-1",
		});
		expect(JSON.stringify(report)).not.toContain("local-token");
	});

	test("install doctor validates source, cache, env, service, and executor project", async () => {
		const sourceRoot = await mkdtemp(join(tmpdir(), "codecut-source-"));
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-home-"));
		const cacheRoot = join(
			homeRoot,
			".codex/plugins/cache/local-opc/codecut/0.1.1",
		);
		await mkdir(join(sourceRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(sourceRoot, "skills/codecut"), {
			recursive: true,
		});
		await mkdir(join(sourceRoot, "apps/web"), { recursive: true });
		await mkdir(join(cacheRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(cacheRoot, "skills/codecut"), {
			recursive: true,
		});
		await mkdir(join(cacheRoot, "apps/web"), { recursive: true });
		await writeFile(
			join(sourceRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(sourceRoot, "skills/codecut/SKILL.md"),
			"---\nname: codecut\n---\n",
			"utf8",
		);
		await writeFile(
			join(sourceRoot, "apps/web/.env.local"),
			[
				"CODECUT_AGENT_BRIDGE_URL=http://localhost:4100",
				"CODECUT_AGENT_BRIDGE_TOKEN=local-token",
				"CODECUT_AGENT_BRIDGE_TIMEOUT_MS=1000",
				"CODECUT_AGENT_BRIDGE_INTERVAL_MS=1",
			].join("\n"),
			"utf8",
		);
		await writeFile(
			join(cacheRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "skills/codecut/SKILL.md"),
			"---\nname: codecut\n---\n",
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "apps/web/.env.local"),
			[
				"CODECUT_AGENT_BRIDGE_URL=http://localhost:4100",
				"CODECUT_AGENT_BRIDGE_TOKEN=local-token",
				"CODECUT_AGENT_BRIDGE_TIMEOUT_MS=1000",
				"CODECUT_AGENT_BRIDGE_INTERVAL_MS=1",
			].join("\n"),
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
				nodeRendererProbe: async () => ({
					id: "node_renderer",
					ok: true,
					message: "Node Canvas/WebCodecs renderer is available.",
				}),
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
				["cache_bridge_env", true],
				["environment", true],
				["node_renderer", true],
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

	test("install doctor fails when cache bridge env drifts from source bridge env", async () => {
		const sourceRoot = await mkdtemp(join(tmpdir(), "codecut-source-"));
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-home-"));
		const cacheRoot = join(
			homeRoot,
			".codex/plugins/cache/local-opc/codecut/0.1.1",
		);
		await mkdir(join(sourceRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(sourceRoot, "skills/codecut"), {
			recursive: true,
		});
		await mkdir(join(sourceRoot, "apps/web"), { recursive: true });
		await mkdir(join(cacheRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(cacheRoot, "skills/codecut"), {
			recursive: true,
		});
		await mkdir(join(cacheRoot, "apps/web"), { recursive: true });
		await writeFile(
			join(sourceRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(sourceRoot, "skills/codecut/SKILL.md"),
			"---\nname: codecut\n---\n",
			"utf8",
		);
		await writeFile(
			join(sourceRoot, "apps/web/.env.local"),
			[
				"CODECUT_AGENT_BRIDGE_URL=http://127.0.0.1:4100",
				"CODECUT_AGENT_BRIDGE_TOKEN=source-token",
				"CODECUT_AGENT_BRIDGE_TIMEOUT_MS=120000",
				"CODECUT_AGENT_BRIDGE_INTERVAL_MS=1000",
			].join("\n"),
			"utf8",
		);
		await writeFile(
			join(cacheRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "skills/codecut/SKILL.md"),
			"---\nname: codecut\n---\n",
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "apps/web/.env.local"),
			[
				"CODECUT_AGENT_BRIDGE_URL=http://127.0.0.1:4102",
				"CODECUT_AGENT_BRIDGE_TOKEN=cache-token",
				"CODECUT_AGENT_BRIDGE_TIMEOUT_MS=120000",
				"CODECUT_AGENT_BRIDGE_INTERVAL_MS=1000",
			].join("\n"),
			"utf8",
		);

		try {
			const result = await runInstallDoctor({
				projectId: "project-123",
				cwd: sourceRoot,
				homeDir: homeRoot,
				env: {
					CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					CODECUT_AGENT_BRIDGE_TOKEN: "source-token",
					CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "120000",
					CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1000",
				},
				execFileImpl: async () => ({ stdout: "", stderr: "" }),
				nodeRendererProbe: async () => ({
					id: "node_renderer",
					ok: true,
					message: "Node Canvas/WebCodecs renderer is available.",
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

			const cacheBridgeEnv = result.checks.find(
				(check) => check.id === "cache_bridge_env",
			);
			expect(result.ok).toBe(false);
			expect(cacheBridgeEnv).toMatchObject({
				ok: false,
				data: {
					mismatched: [
						"CODECUT_AGENT_BRIDGE_URL",
						"CODECUT_AGENT_BRIDGE_TOKEN",
					],
				},
			});
			expect(JSON.stringify(cacheBridgeEnv)).not.toContain("source-token");
			expect(JSON.stringify(cacheBridgeEnv)).not.toContain("cache-token");
		} finally {
			await Promise.all([
				rm(sourceRoot, { recursive: true, force: true }),
				rm(homeRoot, { recursive: true, force: true }),
			]);
		}
	});

	test("install doctor fails when source and cache bridge env both miss a required key", async () => {
		const sourceRoot = await mkdtemp(join(tmpdir(), "codecut-source-"));
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-home-"));
		const cacheRoot = join(
			homeRoot,
			".codex/plugins/cache/local-opc/codecut/0.1.1",
		);
		await mkdir(join(sourceRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(sourceRoot, "skills/codecut"), {
			recursive: true,
		});
		await mkdir(join(sourceRoot, "apps/web"), { recursive: true });
		await mkdir(join(cacheRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(cacheRoot, "skills/codecut"), {
			recursive: true,
		});
		await mkdir(join(cacheRoot, "apps/web"), { recursive: true });
		await writeFile(
			join(sourceRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(sourceRoot, "skills/codecut/SKILL.md"),
			"---\nname: codecut\n---\n",
			"utf8",
		);
		const incompleteBridgeEnv = [
			"CODECUT_AGENT_BRIDGE_URL=http://127.0.0.1:4100",
			"CODECUT_AGENT_BRIDGE_TOKEN=local-token",
			"CODECUT_AGENT_BRIDGE_TIMEOUT_MS=120000",
		].join("\n");
		await writeFile(
			join(sourceRoot, "apps/web/.env.local"),
			incompleteBridgeEnv,
			"utf8",
		);
		await writeFile(
			join(cacheRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "skills/codecut/SKILL.md"),
			"---\nname: codecut\n---\n",
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "apps/web/.env.local"),
			incompleteBridgeEnv,
			"utf8",
		);

		try {
			const result = await runInstallDoctor({
				projectId: "project-123",
				cwd: sourceRoot,
				homeDir: homeRoot,
				env: {
					CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
					CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "120000",
					CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1000",
				},
				execFileImpl: async () => ({ stdout: "", stderr: "" }),
				nodeRendererProbe: async () => ({
					id: "node_renderer",
					ok: true,
					message: "Node Canvas/WebCodecs renderer is available.",
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

			const cacheBridgeEnv = result.checks.find(
				(check) => check.id === "cache_bridge_env",
			);
			expect(result.ok).toBe(false);
			expect(cacheBridgeEnv).toMatchObject({
				ok: false,
				data: {
					sourceMissing: ["CODECUT_AGENT_BRIDGE_INTERVAL_MS"],
					cacheMissing: ["CODECUT_AGENT_BRIDGE_INTERVAL_MS"],
				},
			});
			expect(JSON.stringify(cacheBridgeEnv)).not.toContain("local-token");
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
		await mkdir(join(sourceRoot, "skills/codecut"), {
			recursive: true,
		});
		await mkdir(join(sourceRoot, "apps/web"), { recursive: true });
		await mkdir(join(cacheRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(cacheRoot, "skills/codecut"), {
			recursive: true,
		});
		await mkdir(join(cacheRoot, "apps/web"), { recursive: true });
		const bridgeEnv = [
			"CODECUT_AGENT_BRIDGE_URL=http://localhost:4100",
			"CODECUT_AGENT_BRIDGE_TOKEN=local-token",
			"CODECUT_AGENT_BRIDGE_TIMEOUT_MS=1000",
			"CODECUT_AGENT_BRIDGE_INTERVAL_MS=1",
		].join("\n");
		await writeFile(
			join(sourceRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(sourceRoot, "skills/codecut/SKILL.md"),
			"---\nname: codecut\n---\n",
			"utf8",
		);
		await writeFile(join(sourceRoot, "apps/web/.env.local"), bridgeEnv, "utf8");
		await writeFile(
			join(cacheRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "skills/codecut/SKILL.md"),
			"---\nname: codecut\n---\n",
			"utf8",
		);
		await writeFile(join(cacheRoot, "apps/web/.env.local"), bridgeEnv, "utf8");

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
				nodeRendererProbe: async () => ({
					id: "node_renderer",
					ok: true,
					message: "Node Canvas/WebCodecs renderer is available.",
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

	test("install doctor ignores rsync mtime-only differences", async () => {
		const sourceRoot = await mkdtemp(join(tmpdir(), "codecut-source-"));
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-home-"));
		const cacheRoot = join(
			homeRoot,
			".codex/plugins/cache/local-opc/codecut/0.1.1",
		);
		await mkdir(join(sourceRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(sourceRoot, "skills/codecut"), {
			recursive: true,
		});
		await mkdir(join(cacheRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(cacheRoot, "skills/codecut"), {
			recursive: true,
		});
		await writeFile(
			join(sourceRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(sourceRoot, "skills/codecut/SKILL.md"),
			"---\nname: codecut\n---\n",
			"utf8",
		);
		await writeFile(
			join(cacheRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "skills/codecut/SKILL.md"),
			"---\nname: codecut\n---\n",
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
					stdout: ".f..t.... README.md\n.d..t.... docs/\n",
					stderr: "",
				}),
				nodeRendererProbe: async () => ({
					id: "node_renderer",
					ok: true,
					message: "Node Canvas/WebCodecs renderer is available.",
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

			expect(result.checks.find((check) => check.id === "plugin_sync")).toEqual(
				expect.objectContaining({
					ok: true,
					message: "Installed Codecut plugin cache matches the source tree.",
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
				nodeRendererProbe: async () => ({
					id: "node_renderer",
					ok: true,
					message: "Node Canvas/WebCodecs renderer is available.",
				}),
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

	test("plugin freshness reports source cache config and session layers without runtime checks", async () => {
		const marketplaceRoot = await mkdtemp(
			join(tmpdir(), "codecut-marketplace-"),
		);
		const sourceRoot = join(marketplaceRoot, "plugins/cutia");
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-home-"));
		const cacheRoot = join(
			homeRoot,
			".codex/plugins/cache/local-opc/codecut/0.1.1",
		);
		await mkdir(join(marketplaceRoot, ".agents/plugins"), { recursive: true });
		await mkdir(join(sourceRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(sourceRoot, "skills/codecut"), {
			recursive: true,
		});
		await mkdir(join(cacheRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(cacheRoot, "skills/codecut"), {
			recursive: true,
		});
		await mkdir(join(homeRoot, ".codex"), { recursive: true });
		await writeFile(
			join(marketplaceRoot, ".agents/plugins/marketplace.json"),
			JSON.stringify({
				name: "local-opc",
				plugins: [
					{
						name: "codecut",
						source: { source: "local", path: "./plugins/cutia" },
						policy: {
							installation: "AVAILABLE",
							authentication: "ON_INSTALL",
						},
						category: "Developer Tools",
					},
				],
			}),
			"utf8",
		);
		await writeFile(
			join(homeRoot, ".codex/config.toml"),
			[
				'[plugins."codecut@local-opc"]',
				"enabled = true",
				"",
				"[marketplaces.local-opc]",
				'source_type = "local"',
				`source = ${JSON.stringify(marketplaceRoot)}`,
			].join("\n"),
			"utf8",
		);
		await writeFile(
			join(sourceRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(sourceRoot, "skills/codecut/SKILL.md"),
			"---\nname: codecut\n---\n",
			"utf8",
		);
		await writeFile(
			join(cacheRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "skills/codecut/SKILL.md"),
			"---\nname: codecut\n---\n",
			"utf8",
		);

		try {
			const result = await runPluginFreshness({
				cwd: sourceRoot,
				homeDir: homeRoot,
				execFileImpl: async (command, args) => {
					expect(command).toBe("rsync");
					expect(args).toContain("--dry-run");
					expect(args).toContain("--itemize-changes");
					return { stdout: "", stderr: "" };
				},
			});

			expect(result.ok).toBe(true);
			expect(result.layers.map((layer) => [layer.id, layer.status])).toEqual([
				["source", "ok"],
				["cache", "ok"],
				["config", "ok"],
				["session", "manual_check_required"],
			]);
			expect(
				result.layers.find((layer) => layer.id === "config"),
			).toMatchObject({
				data: {
					marketplaceName: "local-opc",
					enabled: true,
					sourcePath: "./plugins/cutia",
				},
			});
			expect(
				result.layers.find((layer) => layer.id === "session"),
			).toMatchObject({
				data: {
					requiresFreshSession: true,
					toolSearchQuery: "open_codecut_workspace Codecut MCP",
				},
			});
			expect(JSON.stringify(result)).not.toContain(
				"CODECUT_AGENT_BRIDGE_TOKEN",
			);
		} finally {
			await Promise.all([
				rm(marketplaceRoot, { recursive: true, force: true }),
				rm(homeRoot, { recursive: true, force: true }),
			]);
		}
	});

	test("plugin freshness CLI does not require bridge env or call the web service", async () => {
		const output = [];
		const exitCode = await runCli({
			argv: ["plugin:freshness"],
			env: {},
			stdout: (value) => output.push(value),
			fetchImpl: async () => {
				throw new Error("plugin:freshness must not fetch runtime services");
			},
			pluginFreshnessImpl: async () => ({
				ok: true,
				status: "fresh",
				layers: [],
				checks: [],
			}),
		});

		expect(exitCode).toBe(0);
		expect(JSON.parse(output[0])).toMatchObject({
			ok: true,
			status: "fresh",
		});
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
		const cwdRoot = await mkdtemp(join(tmpdir(), "codecut-cwd-"));
		const confirmationRoot = await mkdtemp(
			join(tmpdir(), "codecut-confirmation-"),
		);
		const requests = [];
		const output = [];
		const confirmationToken = await createTestConfirmationToken(
			confirmationRoot,
			"project-123",
		);
		const exitCode = await runCli({
			argv: [
				"create-project",
				"--project-id",
				"project-123",
				"--name",
				"Codex cut",
				"--confirmation-token",
				confirmationToken,
			],
			cwd: cwdRoot,
			env: {
				CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
				CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
				CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
				CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
				CODECUT_CONFIRMATION_ROOT: confirmationRoot,
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

		try {
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
		} finally {
			await rm(cwdRoot, { recursive: true, force: true });
			await rm(confirmationRoot, { recursive: true, force: true });
		}
	});

	test("blocks project creation before widget confirmation", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-confirmation-"));
		const requests = [];

		try {
			await expect(
				runCli({
					argv: [
						"create-project",
						"--project-id",
						"project-123",
						"--name",
						"Codex cut",
					],
					cwd: directory,
					env: {
						CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
						CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
						CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
						CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
					},
					fetchImpl: async (url, init) => {
						requests.push({ url, init });
						return new Response("{}");
					},
					stdout: () => {},
				}),
			).rejects.toThrow("confirmationToken is required");
			expect(requests).toEqual([]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("blocks direct send side effects before widget confirmation", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-confirmation-"));
		const requests = [];

		try {
			await expect(
				runCli({
					argv: [
						"send",
						"--project-id",
						"project-123",
						"--tool",
						"add_texts",
						"--args-json",
						JSON.stringify({
							entries: [
								{
									startTime: 0,
									duration: 2,
									content: "Hook",
								},
							],
						}),
					],
					cwd: directory,
					env: {
						CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
						CODECUT_AGENT_BRIDGE_TOKEN: "local-token",
						CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
						CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
					},
					fetchImpl: async (url, init) => {
						requests.push({ url, init });
						return new Response("{}");
					},
					stdout: () => {},
				}),
			).rejects.toThrow("confirmationToken is required");
			expect(requests).toEqual([]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
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

	test("generate-digital-human requires RUNNINGHUB_API_KEY before contacting executor", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-confirmation-"));
		const requests = [];
		const confirmationToken = await createTestConfirmationToken(
			directory,
			"project-123",
		);

		try {
			await expect(
				runCli({
					argv: [
						"generate-digital-human",
						"--project-id",
						"project-123",
						"--image-media-id",
						"image-1",
						"--audio-media-id",
						"audio-1",
						"--script-text",
						"欢迎来到今天的口播",
						"--motion-prompt",
						"女人自然点头微笑",
						"--width",
						"1280",
						"--height",
						"720",
						"--fps",
						"25",
						"--confirmation-token",
						confirmationToken,
					],
					cwd: directory,
					env: {
						CODECUT_AGENT_BRIDGE_URL: "http://localhost:4100",
						CODECUT_AGENT_BRIDGE_TOKEN: "env-token",
						CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "1000",
						CODECUT_AGENT_BRIDGE_INTERVAL_MS: "1",
						CODECUT_CONFIRMATION_ROOT: directory,
					},
					fetchImpl: async (url, init) => {
						requests.push({ url, init });
						throw new Error("fetch should not be called");
					},
				}),
			).rejects.toThrow("RUNNINGHUB_API_KEY is required");
			expect(requests).toHaveLength(0);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
