import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DerivedAsset } from "@/types/project";
import {
	createExecutorProject,
	executeCodexExecutorEnvelope,
	getExecutorProjectSnapshot,
	getExecutorProjectState,
	getExecutorStatus,
} from "../executor";

const projectId = "project-1";

function envelope({
	tool,
	args,
}: {
	tool:
		| "get_project_info"
		| "update_project_settings"
		| "list_media_assets"
		| "import_media_file"
		| "transcribe_media"
		| "build_video_context"
		| "build_visual_context"
		| "inspect_video_range"
		| "build_post_cut_captions"
		| "validate_edit_plan"
		| "preview_edit_plan"
		| "apply_edit_plan"
		| "apply_narrated_remix_plan"
		| "create_text_background_effect"
		| "create_human_pip_effect"
		| "generate_digital_human"
		| "export_project"
		| "verify_timeline"
		| "get_timeline_state";
	args: Record<string, unknown>;
}) {
	return {
		version: 1,
		projectId,
		source: "codex",
		commands: [{ id: "cmd-1", tool, args }],
	};
}

function resultData<T>(result: unknown): T {
	if (typeof result !== "object" || !result || !("data" in result)) {
		throw new Error("Expected executor result data.");
	}
	return (result as { data: T }).data;
}

function personMask(overrides: Partial<DerivedAsset> = {}): DerivedAsset {
	return {
		id: "mask-1",
		type: "person-mask",
		sourceMediaId: "source-id",
		alphaMediaId: "alpha-id",
		duration: 12,
		width: 1920,
		height: 1080,
		fps: 30,
		confidence: 0.8,
		createdAt: "2026-06-21T00:00:00.000Z",
		...overrides,
	};
}

describe("codex executor", () => {
	let stateDir: string;
	let previousStateDir: string | undefined;

	beforeEach(async () => {
		previousStateDir = process.env.CODECUT_EXECUTOR_STATE_DIR;
		stateDir = await mkdtemp(join(tmpdir(), "codecut-executor-"));
		process.env.CODECUT_EXECUTOR_STATE_DIR = stateDir;
	});

	test("lists imported media through the local executor", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});

		const listResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "list_media_assets", args: {} }),
		});

		expect(listResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "list_media_assets",
			success: true,
			message: "Found 1 media asset(s)",
			data: {
				assets: [
					{
						name: "source.mp4",
						type: "video",
						duration: 120,
						width: 1920,
						height: 1080,
					},
				],
			},
		});
	});

	afterEach(async () => {
		if (previousStateDir === undefined) {
			delete process.env.CODECUT_EXECUTOR_STATE_DIR;
		} else {
			process.env.CODECUT_EXECUTOR_STATE_DIR = previousStateDir;
		}
		await rm(stateDir, { recursive: true, force: true });
	});

	test("imports media and exposes project info without a browser-mounted bridge", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });

		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const infoResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_project_info", args: {} }),
		});

		expect(importResult.status).toBe("completed");
		expect(importResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "import_media_file",
			success: true,
			data: {
				assets: [
					{
						name: "source.mp4",
						type: "video",
						duration: 120,
						width: 1920,
						height: 1080,
					},
				],
			},
		});
		expect(infoResult.results[0]).toMatchObject({
			success: true,
			data: {
				name: "Codex cut",
				canvasSize: { width: 1080, height: 1920 },
				mediaAssets: [{ name: "source.mp4", duration: 120 }],
			},
		});
	});

	test("generate_digital_human creates a local video media asset", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importImage = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "portrait.png",
					mimeType: "image/png",
					base64: Buffer.from("image").toString("base64"),
					size: 5,
					lastModified: 1,
					width: 1280,
					height: 720,
				},
			}),
		});
		const importAudio = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "voice.mp3",
					mimeType: "audio/mpeg",
					base64: Buffer.from("audio").toString("base64"),
					size: 5,
					lastModified: 2,
					duration: 3,
				},
			}),
		});
		const imageId = resultData<{ assets: Array<{ id: string }> }>(
			importImage.results[0],
		).assets[0].id;
		const audioId = resultData<{ assets: Array<{ id: string }> }>(
			importAudio.results[0],
		).assets[0].id;

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "generate_digital_human",
				args: {
					imageMediaId: imageId,
					audioMediaId: audioId,
					scriptText: "欢迎来到今天的口播",
					motionPrompt: "女人自然点头微笑",
					width: 1280,
					height: 720,
					fps: 25,
				},
			}),
			env: { RUNNINGHUB_API_KEY: "rh-key" },
			generateDigitalHuman: async ({
				apiKey,
				imageAsset,
				audioAsset,
				request,
			}) => {
				expect(apiKey).toBe("rh-key");
				expect(imageAsset.id).toBe(imageId);
				expect(audioAsset.id).toBe(audioId);
				expect(request).toMatchObject({
					scriptText: "欢迎来到今天的口播",
					motionPrompt: "女人自然点头微笑",
					width: 1280,
					height: 720,
					fps: 25,
				});
				return {
					taskId: "task-1",
					videoBytes: Buffer.from("mp4"),
					mimeType: "video/mp4",
					duration: 3,
				};
			},
		});

		expect(result.results[0]).toMatchObject({
			tool: "generate_digital_human",
			success: true,
			message: "Generated digital human video 'digital-human-task-1.mp4'",
			data: {
				taskId: "task-1",
				provider: "runninghub-digital-human",
				duration: 3,
				name: "digital-human-task-1.mp4",
			},
		});
		expect(typeof resultData<{ mediaId: string }>(result.results[0]).mediaId).toBe(
			"string",
		);

		const snapshot = await getExecutorProjectSnapshot({ projectId });
		expect(snapshot.mediaAssets).toContainEqual(
			expect.objectContaining({
				name: "digital-human-task-1.mp4",
				type: "video",
				duration: 3,
				size: 3,
			}),
		);
	});

	test("generate_digital_human rejects wrong media types and missing API key", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importAudio = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "voice.mp3",
					mimeType: "audio/mpeg",
					base64: Buffer.from("audio").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 3,
				},
			}),
		});
		const audioId = resultData<{ assets: Array<{ id: string }> }>(
			importAudio.results[0],
		).assets[0].id;

		const wrongType = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "generate_digital_human",
				args: {
					imageMediaId: audioId,
					audioMediaId: audioId,
					scriptText: "欢迎来到今天的口播",
					motionPrompt: "女人自然点头微笑",
					width: 1280,
					height: 720,
					fps: 25,
				},
			}),
			env: { RUNNINGHUB_API_KEY: "rh-key" },
			generateDigitalHuman: async () => {
				throw new Error("should not run");
			},
		});

		expect(wrongType.results[0]).toMatchObject({
			success: false,
			message: expect.stringContaining("expected image"),
		});

		const missingKey = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "generate_digital_human",
				args: {
					imageMediaId: "image-1",
					audioMediaId: audioId,
					scriptText: "欢迎来到今天的口播",
					motionPrompt: "女人自然点头微笑",
					width: 1280,
					height: 720,
					fps: 25,
				},
			}),
			env: {},
			generateDigitalHuman: async () => {
				throw new Error("should not run");
			},
		});

		expect(missingKey.results[0]).toMatchObject({
			success: false,
			message: "RUNNINGHUB_API_KEY is required",
		});
		expect(JSON.stringify(missingKey)).not.toContain("rh-key");
	});

	test("applies an EditPlan and exposes timeline state plus run status", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;

		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: mediaId,
						target: { durationSec: 12, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 10,
								sourceEnd: 22,
								timelineStart: 0,
								reason: "Hook",
							},
						],
						title: { text: "Main claim", startTime: 0, duration: 3 },
						rationale: "Short cut",
					},
				},
			}),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});
		const status = await getExecutorStatus({ projectId });
		const state = await getExecutorProjectState({ projectId });

		expect(applyResult.results[0]).toMatchObject({
			success: true,
			summary: { clipCount: 1, totalDuration: 12, rationale: "Short cut" },
		});
		expect(timelineResult.results[0]).toMatchObject({
			success: true,
			data: {
				revision: state.revision,
				totalDuration: 12,
				tracks: [
					{
						type: "text",
						elements: [
							{
								type: "text",
								content: "Main claim",
								style: {
									fontSize: 15,
									transform: { position: { x: 0, y: 0 }, scale: 1 },
								},
							},
						],
					},
					{
						type: "video",
						elements: [
							{
								type: "video",
								mediaId,
								trimStart: 10,
								trimEnd: 22,
								visual: {
									opacity: 1,
									transform: { position: { x: 0, y: 0 }, scale: 1 },
								},
							},
						],
					},
				],
			},
		});
		expect(status).toMatchObject({
			projectId,
			status: "succeeded",
			tool: "get_timeline_state",
			message: "Timeline has 2 track(s), total duration: 12.00s",
			revision: state.revision,
		});
		expect(state.revision).toBeGreaterThan(1);
	});

	test("project info exposes draft revision summary and last executor status", async () => {
		await createExecutorProject({ projectId, name: "Draft truth" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: mediaId,
						target: { durationSec: 8, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 0,
								sourceEnd: 8,
								timelineStart: 0,
								reason: "Hook",
							},
						],
						captions: [
							{
								text: "这是字幕",
								startTime: 0.5,
								duration: 2,
							},
						],
						captionStyle: {
							preset: "talking-head-pop",
							position: "lower-safe",
						},
						rationale: "Draft truth proof",
					},
				},
			}),
		});
		const infoResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_project_info", args: {} }),
		});
		const state = await getExecutorProjectState({ projectId });

		expect(infoResult.results[0]).toMatchObject({
			success: true,
			data: {
				revision: state.revision,
				draft: {
					version: 1,
					revision: state.revision,
					mediaCount: 1,
					trackCount: 2,
					elementCount: 2,
				},
				tracks: [
					{
						type: "text",
						elementCount: 1,
					},
					{
						type: "video",
						elementCount: 1,
					},
				],
				lastStatus: {
					status: "succeeded",
					tool: "apply_edit_plan",
					revision: state.revision,
				},
			},
		});
	});

	test("validate and preview EditPlan do not mutate project revision", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		const before = await getExecutorProjectState({ projectId });
		const plan = {
			version: 1,
			projectId,
			sourceMediaId: mediaId,
			target: { durationSec: 12, aspectRatio: "9:16" },
			clips: [
				{
					id: "clip-1",
					sourceStart: 10,
					sourceEnd: 22,
					timelineStart: 0,
					reason: "Hook",
				},
			],
			captions: [{ text: "Main claim", startTime: 0, duration: 2 }],
			captionStyle: { preset: "black-bar", position: "lower-safe" },
			rationale: "Short cut",
		};

		const validateResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "validate_edit_plan",
				args: { plan },
			}),
		});
		const previewResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "preview_edit_plan",
				args: { plan },
			}),
		});
		const after = await getExecutorProjectState({ projectId });

		expect(validateResult.results[0]).toMatchObject({
			tool: "validate_edit_plan",
			success: true,
			data: {
				valid: true,
				revision: before.revision,
			},
		});
		expect(previewResult.results[0]).toMatchObject({
			tool: "preview_edit_plan",
			success: true,
			data: {
				summary: {
					clipCount: 1,
					captionCount: 1,
					audioCount: 0,
					transitionCount: 0,
					willReplaceTimeline: true,
				},
				clips: [
					{
						id: "clip-1",
						sourceStart: 10,
						sourceEnd: 22,
						timelineStart: 0,
						duration: 12,
					},
				],
			},
		});
		expect(after.revision).toBe(before.revision);
		expect(after.tracks).toEqual([]);
	});

	test("exports an applied timeline to an explicit local file", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: mediaId,
						target: { durationSec: 12, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 10,
								sourceEnd: 22,
								timelineStart: 0,
								reason: "Hook",
							},
						],
						rationale: "Short cut",
					},
				},
			}),
		});
		const state = await getExecutorProjectState({ projectId });
		const outputFile = join(stateDir, "out.mp4");

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "export_project",
				args: {
					format: "mp4",
					quality: "high",
					includeAudio: true,
					outputFile,
					overwrite: false,
				},
			}),
			exportProject: async ({ state: exportState, format, quality, includeAudio }) => {
				expect(exportState.project.id).toBe(projectId);
				expect(format).toBe("mp4");
				expect(quality).toBe("high");
				expect(includeAudio).toBe(true);
				return Buffer.from("mp4-bytes");
			},
		});

		expect(await readFile(outputFile, "utf8")).toBe("mp4-bytes");
		expect(result.results[0]).toMatchObject({
			tool: "export_project",
			success: true,
			data: {
				outputFile,
				byteLength: 9,
				format: "mp4",
				includeAudio: true,
				revision: state.revision,
				totalDuration: 12,
			},
		});
	});

	test("export fails fast for unsafe local export inputs", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const existingOutputFile = join(stateDir, "existing.mp4");
		await writeFile(existingOutputFile, "existing");

		const emptyTimeline = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "export_project",
				args: {
					format: "mp4",
					quality: "high",
					includeAudio: true,
					outputFile: join(stateDir, "empty.mp4"),
					overwrite: false,
				},
			}),
			exportProject: async () => {
				throw new Error("should not run");
			},
		});
		const relativeOutput = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "export_project",
				args: {
					format: "mp4",
					quality: "high",
					includeAudio: true,
					outputFile: "relative.mp4",
					overwrite: false,
				},
			}),
			exportProject: async () => {
				throw new Error("should not run");
			},
		});
		const existingOutput = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "export_project",
				args: {
					format: "mp4",
					quality: "high",
					includeAudio: true,
					outputFile: existingOutputFile,
					overwrite: false,
				},
			}),
			exportProject: async () => {
				throw new Error("should not run");
			},
		});
		const unsupportedFormat = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "export_project",
				args: {
					format: "gif",
					quality: "high",
					includeAudio: true,
					outputFile: join(stateDir, "out.gif"),
					overwrite: false,
				},
			}),
			exportProject: async () => {
				throw new Error("should not run");
			},
		});

		expect(emptyTimeline.results[0]).toMatchObject({
			success: false,
			message: "Cannot export an empty timeline.",
		});
		expect(relativeOutput.results[0]).toMatchObject({
			success: false,
			message: "--output-file must be an absolute path",
		});
		expect(existingOutput.results[0]).toMatchObject({
			success: false,
			message: "Output file already exists. Set overwrite=true to replace it.",
		});
		expect(unsupportedFormat.results[0]).toMatchObject({
			success: false,
			message: "--format must be mp4 or webm",
		});
	});

	test("verify_timeline returns explicit mismatch fields", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "verify_timeline",
				args: {
					verification: {
						totalDuration: 10,
						trackCount: 1,
						clipCount: 1,
						captionCount: 0,
						audioCount: 0,
						mediaIds: ["media-1"],
					},
				},
			}),
		});

		expect(result.results[0]).toMatchObject({
			tool: "verify_timeline",
			success: false,
			data: {
				failures: [
					{ field: "totalDuration", expected: 10, actual: 0 },
					{ field: "trackCount", expected: 1, actual: 0 },
					{ field: "clipCount", expected: 1, actual: 0 },
					{ field: "mediaIds", expected: ["media-1"], actual: [] },
				],
			},
		});
	});

	test("apply_edit_plan fails before mutating when executor media file is empty", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const state = await getExecutorProjectState({ projectId });
		const beforeRevision = state.revision;
		const mediaPath = join(stateDir, "projects", projectId, "media", "empty");
		await mkdir(join(stateDir, "projects", projectId, "media"), {
			recursive: true,
		});
		await writeFile(mediaPath, "");
		state.mediaAssets = [
			{
				id: "empty-video",
				name: "empty.mp4",
				type: "video",
				mimeType: "video/mp4",
				duration: 20,
				width: 1920,
				height: 1080,
				size: 0,
				lastModified: 1,
				path: mediaPath,
			},
		];
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			`${JSON.stringify(state, null, 2)}\n`,
			"utf8",
		);

		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: "empty-video",
						target: { durationSec: 5, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 0,
								sourceEnd: 5,
								timelineStart: 0,
								reason: "Hook",
							},
						],
						rationale: "Short cut",
					},
				},
			}),
		});
		const after = await getExecutorProjectState({ projectId });

		expect(applyResult.results[0]).toMatchObject({
			success: false,
			message: "Executor media asset empty-video is empty.",
		});
		expect(after.tracks).toEqual([]);
		expect(after.revision).toBe(beforeRevision);
	});

	test("readbacks EditPlan video text audio and transitions through timeline state", async () => {
		await createExecutorProject({ projectId, name: "Polished short" });
		const videoImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const bgmImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "bed.mp3",
					mimeType: "audio/mpeg",
					base64: Buffer.from("bgm").toString("base64"),
					size: 3,
					lastModified: 1,
					duration: 3,
				},
			}),
		});
		const sfxImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "hit.wav",
					mimeType: "audio/wav",
					base64: Buffer.from("sfx").toString("base64"),
					size: 3,
					lastModified: 1,
					duration: 1.25,
				},
			}),
		});
		const videoId = resultData<{ assets: Array<{ id: string }> }>(
			videoImport.results[0],
		).assets[0].id;
		const bgmId = resultData<{ assets: Array<{ id: string }> }>(
			bgmImport.results[0],
		).assets[0].id;
		const sfxId = resultData<{ assets: Array<{ id: string }> }>(
			sfxImport.results[0],
		).assets[0].id;

		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: videoId,
						target: { durationSec: 10, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 0,
								sourceEnd: 5,
								timelineStart: 0,
								fit: "cover",
								reason: "Hook",
							},
							{
								id: "clip-2",
								sourceStart: 20,
								sourceEnd: 25,
								timelineStart: 5,
								reason: "Proof",
							},
						],
						title: {
							text: "Main claim",
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
								assetId: bgmId,
								volume: 0.35,
								mode: "loop_to_timeline",
							},
							sfx: [{ assetId: sfxId, startTime: 0, volume: 0.8 }],
						},
						transitions: [
							{
								fromClipId: "clip-1",
								toClipId: "clip-2",
								type: "fade",
								duration: 0.5,
							},
						],
						rationale: "Polished state readback",
					},
				},
			}),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});

		expect(applyResult.results[0]).toMatchObject({
			success: true,
			summary: {
				clipCount: 2,
				textElementCount: 2,
				audioElementCount: 5,
				transitionCount: 1,
			},
		});
		expect(timelineResult.results[0]).toMatchObject({
			success: true,
			data: {
				totalDuration: 10,
				tracks: [
					{
						type: "text",
						elements: [
							{
								type: "text",
								content: "Main claim",
								style: {
									fontWeight: "bold",
									backgroundColor: "#000000",
									backgroundOpacity: 0.72,
								},
							},
							{
								type: "text",
								content: "资源不等于能力",
								style: {
									fontWeight: "bold",
									backgroundColor: "#000000",
									backgroundOpacity: 0.78,
									backgroundPaddingX: 24,
									backgroundPaddingY: 12,
								},
							},
						],
					},
					{
						type: "video",
						elements: [
							{
								type: "video",
								mediaId: videoId,
								trimStart: 0,
								trimEnd: 5,
								visual: {
									transform: {
										position: { x: 0, y: 0 },
										scale: 3.160493827160494,
									},
								},
							},
							{
								type: "video",
								mediaId: videoId,
								trimStart: 20,
								trimEnd: 25,
								visual: {
									transform: { position: { x: 0, y: 0 }, scale: 1 },
								},
							},
						],
						transitions: [
							{
								type: "fade",
								duration: 0.5,
							},
						],
					},
					{
						type: "audio",
						elements: [
							{
								type: "audio",
								mediaId: bgmId,
								startTime: 0,
								duration: 3,
								audio: { mediaId: bgmId, volume: 0.35 },
							},
							{
								type: "audio",
								mediaId: bgmId,
								startTime: 3,
								duration: 3,
								audio: { mediaId: bgmId, volume: 0.35 },
							},
							{
								type: "audio",
								mediaId: bgmId,
								startTime: 6,
								duration: 3,
								audio: { mediaId: bgmId, volume: 0.35 },
							},
							{
								type: "audio",
								mediaId: bgmId,
								startTime: 9,
								duration: 1,
								audio: { mediaId: bgmId, volume: 0.35 },
							},
							{
								type: "audio",
								mediaId: sfxId,
								startTime: 0,
								duration: 1.25,
								audio: { mediaId: sfxId, volume: 0.8 },
							},
						],
					},
				],
			},
		});
	});

	test("transcribes imported media through the local executor runtime", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;

		const transcribeResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "transcribe_media",
				args: {
					mediaId,
					language: "zh",
					modelId: "whisper-tiny",
				},
			}),
			transcribeMedia: async ({ mediaAsset, language, modelId }) => ({
				text: `transcribed ${mediaAsset.name}`,
				language,
				modelId,
				segments: [{ text: "hello", start: 0, end: 1.2 }],
			}),
		});

		expect(transcribeResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "transcribe_media",
			success: true,
			message: "Transcribed 'source.mp4'",
			data: {
				text: "transcribed source.mp4",
				language: "zh",
				duration: 120,
				segments: [{ text: "hello", start: 0, end: 1.2 }],
			},
		});
		expect(await getExecutorStatus({ projectId })).toMatchObject({
			status: "succeeded",
			tool: "transcribe_media",
			message: "Transcribed 'source.mp4'",
		});
	});

	test("transcribe_media rejects non-audio media before invoking the runtime", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "cover.png",
					mimeType: "image/png",
					base64: Buffer.from("image").toString("base64"),
					size: 5,
					lastModified: 1,
					width: 1000,
					height: 1000,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;

		const transcribeResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "transcribe_media",
				args: {
					mediaId,
					language: "auto",
					modelId: "whisper-tiny",
				},
			}),
			transcribeMedia: async () => {
				throw new Error("transcribeMedia should not run for image media");
			},
		});

		expect(transcribeResult.results[0]).toMatchObject({
			success: false,
			message:
				"Media asset 'cover.png' is type 'image', expected video or audio",
		});
	});

	test("builds VideoContext through the local executor", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 725,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;

		const contextResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_context",
				args: {
					mediaId,
					language: "auto",
					modelId: "whisper-tiny",
				},
			}),
			probeAudio: async () => ({ hasAudio: true }),
			transcribeMediaRange: async ({ range }) => ({
				text: `chunk ${range.start}`,
				language: "zh",
				modelId: "whisper-tiny",
				segments: [{ text: "hello", start: 1, end: 2 }],
			}),
		});

		expect(contextResult.results[0]).toMatchObject({
			tool: "build_video_context",
			success: true,
			message: "Built VideoContext for 'source.mp4'",
			data: {
				qualityLevel: "L2_transcript",
				metadata: { durationSeconds: 725, hasAudio: true },
				assetTypeGuess: "oral_candidate",
				editingHints: {
					suggestTrimFillers: false,
					hasTalkingHeadSignal: true,
					canBeBroll: false,
				},
				transcript: {
					segments: [
						{ start: 1, end: 2, text: "hello" },
						{ start: 301, end: 302, text: "hello" },
						{ start: 601, end: 602, text: "hello" },
					],
				},
			},
		});
		const data = resultData<{
			assetType?: unknown;
			assetTypeGuess?: unknown;
			suggestTrimFillers?: unknown;
			editingHints?: unknown;
		}>(contextResult.results[0]);
		expect(data.assetType).toBeUndefined();
		expect(data.suggestTrimFillers).toBeUndefined();
		expect(data.assetTypeGuess).toBe("oral_candidate");
		expect(data.editingHints).toEqual({
			suggestTrimFillers: false,
			hasTalkingHeadSignal: true,
			canBeBroll: false,
		});
	});

	test("build_video_context rejects image media without invoking transcription", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "cover.png",
					mimeType: "image/png",
					base64: Buffer.from("image").toString("base64"),
					size: 5,
					lastModified: 1,
					width: 1000,
					height: 1000,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;

		const contextResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_context",
				args: {
					mediaId,
					language: "auto",
					modelId: "whisper-tiny",
				},
			}),
			probeAudio: async () => {
				throw new Error("probeAudio should not run for image media");
			},
			transcribeMediaRange: async () => {
				throw new Error("transcribeMediaRange should not run for image media");
			},
		});

		expect(contextResult.results[0]).toMatchObject({
			success: false,
			message:
				"Media asset 'cover.png' is type 'image', expected video or audio",
		});
	});

	test("builds visual context through the local executor without mutating project state", async () => {
		await createExecutorProject({ projectId, name: "Visual proof short" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 128.4,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		const before = await getExecutorProjectState({ projectId });
		const inspectedRanges: Array<{ startSeconds: number; endSeconds: number }> =
			[];

		const visualResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_visual_context",
				args: {
					mediaId,
					targetAspectRatio: "9:16",
				},
			}),
			inspectVideoRange: async ({
				startSeconds,
				endSeconds,
				frameCount,
				outputDirectory,
			}) => {
				inspectedRanges.push({ startSeconds, endSeconds });
				expect(frameCount).toBe(6);
				expect(outputDirectory.split(/[\\/]+/).slice(-3)).toEqual([
					"projects",
					projectId,
					"visual-context",
				]);
				return {
					mediaId,
					sourceRange: {
						startSeconds,
						endSeconds,
						durationSeconds: endSeconds - startSeconds,
					},
					artifact: {
						kind: "video_range_contact_sheet",
						path: `/tmp/${startSeconds}-${endSeconds}.png`,
						mimeType: "image/png",
						width: 1936,
						height: 520,
					},
					frames: [{ timeSeconds: startSeconds }, { timeSeconds: endSeconds }],
					audio: {
						hasAudio: true,
						waveformSamples: [0.1, 0.4],
						silenceRanges: [],
					},
					warnings: [],
				};
			},
		});

		expect(inspectedRanges).toEqual([
			{ startSeconds: 0, endSeconds: 60 },
			{ startSeconds: 60, endSeconds: 120 },
			{ startSeconds: 120, endSeconds: 128.4 },
		]);
		expect(visualResult.results[0]).toMatchObject({
			tool: "build_visual_context",
			success: true,
			message: "Built VisualContext for 'source.mp4'",
			data: {
				qualityLevel: "L3_visual_evidence",
				target: { aspectRatio: "9:16" },
				metadata: {
					durationSeconds: 128.4,
					width: 1920,
					height: 1080,
					sourceOrientation: "landscape",
				},
				visualPreflight: {
					requiresReframe: true,
					reframeRisk: "needs_review",
				},
				analysisWindows: [
					{ index: 1, startSeconds: 0, endSeconds: 60 },
					{ index: 2, startSeconds: 60, endSeconds: 120 },
					{ index: 3, startSeconds: 120, endSeconds: 128.4 },
				],
			},
		});
		expect(await getExecutorProjectState({ projectId })).toEqual(before);
	});

	test("build_visual_context rejects image media before invoking inspection", async () => {
		await createExecutorProject({ projectId, name: "Visual proof short" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "cover.png",
					mimeType: "image/png",
					base64: Buffer.from("image").toString("base64"),
					size: 5,
					lastModified: 1,
					width: 1000,
					height: 1000,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;

		const visualResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_visual_context",
				args: {
					mediaId,
					targetAspectRatio: "9:16",
				},
			}),
			inspectVideoRange: async () => {
				throw new Error("inspectVideoRange should not run for image media");
			},
		});

		expect(visualResult.results[0]).toMatchObject({
			tool: "build_visual_context",
			success: false,
			message: "Media asset 'cover.png' is type 'image', expected video",
		});
	});

	test("build_visual_context rejects missing target aspect ratio", async () => {
		await createExecutorProject({ projectId, name: "Visual proof short" });

		const visualResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_visual_context",
				args: {
					mediaId: "missing-media",
				},
			}),
		});

		expect(visualResult.results[0]).toMatchObject({
			tool: "build_visual_context",
			success: false,
		});
		expect(String(visualResult.results[0].message)).toContain(
			"targetAspectRatio",
		);
	});

	test("inspects a video range through the local executor without mutating project state", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		const before = await getExecutorProjectState({ projectId });
		const inspectedRanges: Array<{ startSeconds: number; endSeconds: number }> = [];

		const inspectResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "inspect_video_range",
				args: {
					mediaId,
					startSeconds: 12.5,
					endSeconds: 18,
					frameCount: 4,
				},
			}),
			inspectVideoRange: async ({
				mediaAsset,
				startSeconds,
				endSeconds,
				frameCount,
				outputDirectory,
			}) => {
				inspectedRanges.push({ startSeconds, endSeconds });
				expect(mediaAsset.id).toBe(mediaId);
				expect(frameCount).toBe(4);
				expect(outputDirectory.split(/[\\/]+/).slice(-3)).toEqual([
					"projects",
					projectId,
					"inspect",
				]);
				return {
					mediaId,
					sourceRange: {
						startSeconds,
						endSeconds,
						durationSeconds: endSeconds - startSeconds,
					},
					artifact: {
						kind: "video_range_contact_sheet",
						path: "/tmp/source-range.png",
						mimeType: "image/png",
						width: 1280,
						height: 360,
					},
					frames: [
						{ timeSeconds: 12.5 },
						{ timeSeconds: 14.333 },
						{ timeSeconds: 16.167 },
						{ timeSeconds: 18 },
					],
					audio: {
						hasAudio: true,
						waveformSamples: [0.1, 0.5, 0.2],
						silenceRanges: [
							{
								startSeconds: 15,
								endSeconds: 16,
								durationSeconds: 1,
							},
						],
					},
					warnings: [],
				};
			},
		});

		expect(inspectedRanges).toEqual([
			{ startSeconds: 12.5, endSeconds: 18 },
		]);
		expect(inspectResult.results[0]).toMatchObject({
			tool: "inspect_video_range",
			success: true,
			message: "Inspected video range for 'source.mp4'",
			data: {
				artifact: {
					kind: "video_range_contact_sheet",
					path: "/tmp/source-range.png",
					mimeType: "image/png",
				},
				frames: [
					{ timeSeconds: 12.5 },
					{ timeSeconds: 14.333 },
					{ timeSeconds: 16.167 },
					{ timeSeconds: 18 },
				],
				audio: {
					hasAudio: true,
					waveformSamples: [0.1, 0.5, 0.2],
				},
				warnings: [],
			},
		});
		expect(await getExecutorProjectState({ projectId })).toEqual(before);
	});

	test("inspect_video_range rejects missing media before invoking inspector", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });

		const inspectResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "inspect_video_range",
				args: {
					mediaId: "missing-media",
					startSeconds: 1,
					endSeconds: 2,
				},
			}),
			inspectVideoRange: async () => {
				throw new Error("inspectVideoRange should not run for missing media");
			},
		});

		expect(inspectResult.results[0]).toMatchObject({
			tool: "inspect_video_range",
			success: false,
			message: "Media asset 'missing-media' not found",
		});
		expect(await getExecutorStatus({ projectId })).toMatchObject({
			status: "failed",
			tool: "inspect_video_range",
			message: "Media asset 'missing-media' not found",
		});
	});

	test("inspect_video_range rejects image media before invoking inspector", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "cover.png",
					mimeType: "image/png",
					base64: Buffer.from("image").toString("base64"),
					size: 5,
					lastModified: 1,
					width: 1000,
					height: 1000,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;

		const inspectResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "inspect_video_range",
				args: {
					mediaId,
					startSeconds: 1,
					endSeconds: 2,
				},
			}),
			inspectVideoRange: async () => {
				throw new Error("inspectVideoRange should not run for image media");
			},
		});

		expect(inspectResult.results[0]).toMatchObject({
			tool: "inspect_video_range",
			success: false,
			message: "Media asset 'cover.png' is type 'image', expected video",
		});
	});

	test("builds post-cut captions by transcribing edited video clip audio ranges", async () => {
		await createExecutorProject({ projectId, name: "Captioned short" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: mediaId,
						target: { durationSec: 10, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 10,
								sourceEnd: 15,
								timelineStart: 0,
								reason: "Hook",
							},
							{
								id: "clip-2",
								sourceStart: 30,
								sourceEnd: 35,
								timelineStart: 5,
								reason: "Proof",
							},
						],
						rationale: "Caption timing proof",
					},
				},
			}),
		});
		const ranges: Array<{ start: number; end: number }> = [];

		const captionsResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_post_cut_captions",
				args: {
					language: "zh",
					modelId: "whisper-base",
				},
			}),
			transcribeMediaRange: async ({ range, language, modelId }) => {
				ranges.push(range);
				if (range.start === 10) {
					return {
						text: "first caption",
						language,
						modelId,
						segments: [
							{ text: "第一句", start: 1, end: 2.25 },
							{ text: "截断句", start: 4.8, end: 5.4 },
							{ text: "越界句", start: 5.1, end: 5.4 },
						],
					};
				}
				return {
					text: "second caption",
					language,
					modelId,
					segments: [{ text: "第二句", start: 0.5, end: 1.75 }],
				};
			},
		});

		expect(ranges).toEqual([
			{ start: 10, end: 15 },
			{ start: 30, end: 35 },
		]);
		expect(captionsResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "build_post_cut_captions",
			success: true,
			message: "Built 3 post-cut caption(s) from 2 video clip(s).",
			data: {
				source: "edited_video_clip_audio",
				language: "zh",
				modelId: "whisper-base",
				captionStyle: {
					preset: "talking-head-pop",
					position: "lower-safe",
				},
				captions: [
					{ text: "第一句", startTime: 1, duration: 1.25 },
					{ text: "截断句", startTime: 4.8, duration: 0.2 },
					{ text: "第二句", startTime: 5.5, duration: 1.25 },
				],
				trace: [
					{
						mediaId,
						timelineStart: 0,
						sourceStart: 10,
						sourceEnd: 15,
						captionCount: 2,
					},
					{
						mediaId,
						timelineStart: 5,
						sourceStart: 30,
						sourceEnd: 35,
						captionCount: 1,
					},
				],
			},
		});
	});

	test("applies vertical project settings before applying and verifying an EditPlan", async () => {
		await createExecutorProject({ projectId, name: "Vertical cut" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;

		const updateResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "update_project_settings",
				args: { width: 1080, height: 1920, fps: 30 },
			}),
		});
		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: mediaId,
						target: { durationSec: 12, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 10,
								sourceEnd: 22,
								timelineStart: 0,
								reason: "Hook",
							},
						],
						rationale: "Vertical short cut",
					},
				},
			}),
		});
		const infoResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_project_info", args: {} }),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});

		expect(updateResult.results[0]).toMatchObject({
			success: true,
			message: "Project settings updated: canvasSize, fps",
		});
		expect(applyResult.results[0]).toMatchObject({
			success: true,
			summary: { clipCount: 1, totalDuration: 12 },
		});
		expect(infoResult.results[0]).toMatchObject({
			success: true,
			data: {
				canvasSize: { width: 1080, height: 1920 },
				fps: 30,
			},
		});
		expect(timelineResult.results[0]).toMatchObject({
			success: true,
			data: {
				totalDuration: 12,
				tracks: [
					{
						type: "video",
						elements: [{ type: "video", mediaId }],
					},
				],
			},
		});
	});

	test("applies a narrated remix plan through the local executor", async () => {
		await createExecutorProject({ projectId, name: "Narrated remix" });
		const videoImports = [];
		for (const [index, duration] of [12, 12, 12].entries()) {
			videoImports.push(
				await executeCodexExecutorEnvelope({
					envelope: envelope({
						tool: "import_media_file",
						args: {
							fileName: `broll-${index + 1}.mp4`,
							mimeType: "video/mp4",
							base64: Buffer.from(`video-${index + 1}`).toString("base64"),
							size: 7,
							lastModified: 1,
							duration,
							width: 1920,
							height: 1080,
						},
					}),
				}),
			);
		}
		const narrationImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "narration.mp3",
					mimeType: "audio/mpeg",
					base64: Buffer.from("narration").toString("base64"),
					size: 9,
					lastModified: 1,
					duration: 30,
				},
			}),
		});
		const videoIds = videoImports.map(
			(result) =>
				resultData<{ assets: Array<{ id: string }> }>(result.results[0])
					.assets[0].id,
		);
		const narrationId = resultData<{ assets: Array<{ id: string }> }>(
			narrationImport.results[0],
		).assets[0].id;

		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_narrated_remix_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						target: { durationSec: 30, aspectRatio: "9:16" },
						visualBeats: [
							{
								id: "beat-1",
								mediaId: videoIds[0],
								sourceStart: 0,
								sourceEnd: 10,
								timelineStart: 0,
								muted: true,
								reason: "Opening b-roll",
							},
							{
								id: "beat-2",
								mediaId: videoIds[1],
								sourceStart: 1,
								sourceEnd: 11,
								timelineStart: 10,
								muted: true,
								reason: "Middle b-roll",
							},
							{
								id: "beat-3",
								mediaId: videoIds[2],
								sourceStart: 2,
								sourceEnd: 12,
								timelineStart: 20,
								muted: true,
								reason: "Closing b-roll",
							},
						],
						narration: { mediaId: narrationId, sourceStart: 0 },
						captions: [
							{ text: "Opening line", startTime: 0, duration: 3 },
							{ text: "Closing line", startTime: 24, duration: 4 },
						],
						rationale: "Narration-led B-roll remix",
					},
				},
			}),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});

		expect(applyResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "apply_narrated_remix_plan",
			success: true,
			message: "Applied NarratedRemixPlan with 3 visual beat(s).",
			data: {
				visualBeatCount: 3,
				audioElementCount: 1,
				captionCount: 2,
				totalDuration: 30,
			},
		});
		expect(timelineResult.results[0]).toMatchObject({
			success: true,
			data: {
				totalDuration: 30,
			},
		});
		const timeline = resultData<{
			tracks: Array<{
				type: string;
				elements: Array<{
					type: string;
					mediaId?: string;
					content?: string;
					visual?: { muted?: boolean };
					audio?: { sourceType?: string; volume?: number; muted?: boolean };
				}>;
			}>;
		}>(timelineResult.results[0]);
		expect(timeline.tracks).toHaveLength(3);
		expect(timeline.tracks[0]).toMatchObject({
			type: "video",
			elements: [
				{ type: "video", mediaId: videoIds[0], visual: { muted: true } },
				{ type: "video", mediaId: videoIds[1], visual: { muted: true } },
				{ type: "video", mediaId: videoIds[2], visual: { muted: true } },
			],
		});
		expect(timeline.tracks[1]).toMatchObject({
			type: "audio",
			elements: [
				{
					type: "audio",
					mediaId: narrationId,
					audio: { sourceType: "upload", volume: 1, muted: false },
				},
			],
		});
		expect(timeline.tracks[2]).toMatchObject({
			type: "text",
			elements: [
				{ type: "text", content: "Opening line" },
				{ type: "text", content: "Closing line" },
			],
		});
	});

	test("creates a text-background masked effect from local executor state", async () => {
		await createExecutorProject({ projectId, name: "Masked cut" });
		const sourceImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("source").toString("base64"),
					size: 6,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const alphaImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "alpha.webm",
					mimeType: "video/webm",
					base64: Buffer.from("alpha").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const sourceId = resultData<{ assets: Array<{ id: string }> }>(
			sourceImport.results[0],
		).assets[0].id;
		const alphaId = resultData<{ assets: Array<{ id: string }> }>(
			alphaImport.results[0],
		).assets[0].id;
		const state = await getExecutorProjectState({ projectId });
		state.derivedAssets = [
			personMask({ sourceMediaId: sourceId, alphaMediaId: alphaId }),
		];
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			`${JSON.stringify(state, null, 2)}\n`,
			"utf8",
		);

		const effectResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "create_text_background_effect",
				args: {
					sourceMediaId: sourceId,
					derivedAssetId: "mask-1",
					content: "Behind person",
					startTime: 1,
					duration: 4,
					replaceExisting: true,
				},
			}),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});
		const snapshot = await getExecutorProjectSnapshot({ projectId });

		expect(effectResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "create_text_background_effect",
			success: true,
			message: "Created text-background effect with 3 track(s).",
			data: {
				effect: "text-background",
				trackCount: 3,
				elementCount: 3,
				totalDuration: 5,
			},
		});
		expect(timelineResult.results[0]).toMatchObject({
			success: true,
			data: {
				derivedAssets: [{ id: "mask-1", alphaMediaId: alphaId }],
			},
		});
		const timeline = resultData<{
			tracks: Array<{
				type: string;
				elements: Array<{
					type: string;
					mediaId?: string;
					visual?: { mask?: { type: string; derivedAssetId: string } };
				}>;
			}>;
		}>(timelineResult.results[0]);
		expect(timeline.tracks[0]).toMatchObject({
			type: "video",
			elements: [
				{
					type: "video",
					mediaId: sourceId,
					visual: {
						mask: { type: "person-mask", derivedAssetId: "mask-1" },
					},
				},
			],
		});
		expect(snapshot.derivedAssets).toEqual([
			personMask({ sourceMediaId: sourceId, alphaMediaId: alphaId }),
		]);
	});

	test("creates a human-pip masked effect from local executor state", async () => {
		await createExecutorProject({ projectId, name: "Human PIP cut" });
		const foregroundImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "talking-head.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("front").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const alphaImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "alpha.webm",
					mimeType: "video/webm",
					base64: Buffer.from("alpha").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const backgroundImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "background.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("background").toString("base64"),
					size: 10,
					lastModified: 1,
					duration: 12,
					width: 1080,
					height: 1920,
				},
			}),
		});
		const foregroundId = resultData<{ assets: Array<{ id: string }> }>(
			foregroundImport.results[0],
		).assets[0].id;
		const alphaId = resultData<{ assets: Array<{ id: string }> }>(
			alphaImport.results[0],
		).assets[0].id;
		const backgroundId = resultData<{ assets: Array<{ id: string }> }>(
			backgroundImport.results[0],
		).assets[0].id;
		const state = await getExecutorProjectState({ projectId });
		state.derivedAssets = [
			personMask({ sourceMediaId: foregroundId, alphaMediaId: alphaId }),
		];
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			`${JSON.stringify(state, null, 2)}\n`,
			"utf8",
		);

		const effectResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "create_human_pip_effect",
				args: {
					foregroundMediaId: foregroundId,
					backgroundMediaId: backgroundId,
					derivedAssetId: "mask-1",
					placement: "right_down",
					scale: 0.35,
					startTime: 1,
					duration: 4,
					replaceExisting: true,
				},
			}),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});

		expect(effectResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "create_human_pip_effect",
			success: true,
			message: "Created human-pip effect with 2 track(s).",
			data: {
				effect: "human-pip",
				trackCount: 2,
				elementCount: 2,
				totalDuration: 5,
			},
		});
		const timeline = resultData<{
			tracks: Array<{
				type: string;
				elements: Array<{
					type: string;
					mediaId?: string;
					visual?: { mask?: { type: string; derivedAssetId: string } };
				}>;
			}>;
		}>(timelineResult.results[0]);
		expect(timeline.tracks[0]).toMatchObject({
			type: "video",
			elements: [
				{
					type: "video",
					mediaId: foregroundId,
					visual: {
						mask: { type: "person-mask", derivedAssetId: "mask-1" },
					},
				},
			],
		});
		expect(timeline.tracks[1]).toMatchObject({
			type: "video",
			elements: [
				{
					type: "video",
					mediaId: backgroundId,
				},
			],
		});
	});

	test("create_human_pip_effect rejects unsupported placement before mutating executor timeline", async () => {
		await createExecutorProject({ projectId, name: "Human PIP cut" });
		const foregroundImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "talking-head.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("front").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const alphaImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "alpha.webm",
					mimeType: "video/webm",
					base64: Buffer.from("alpha").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const backgroundImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "background.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("background").toString("base64"),
					size: 10,
					lastModified: 1,
					duration: 12,
					width: 1080,
					height: 1920,
				},
			}),
		});
		const foregroundId = resultData<{ assets: Array<{ id: string }> }>(
			foregroundImport.results[0],
		).assets[0].id;
		const alphaId = resultData<{ assets: Array<{ id: string }> }>(
			alphaImport.results[0],
		).assets[0].id;
		const backgroundId = resultData<{ assets: Array<{ id: string }> }>(
			backgroundImport.results[0],
		).assets[0].id;
		const state = await getExecutorProjectState({ projectId });
		state.derivedAssets = [
			personMask({ sourceMediaId: foregroundId, alphaMediaId: alphaId }),
		];
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			`${JSON.stringify(state, null, 2)}\n`,
			"utf8",
		);

		const effectResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "create_human_pip_effect",
				args: {
					foregroundMediaId: foregroundId,
					backgroundMediaId: backgroundId,
					derivedAssetId: "mask-1",
					placement: "bottom_right",
					scale: 0.35,
					startTime: 1,
					duration: 4,
					replaceExisting: true,
				},
			}),
		});
		const after = await getExecutorProjectState({ projectId });

		expect(effectResult.results[0]).toMatchObject({
			success: false,
			message:
				"placement must be one of right_down, right_up, left_down, left_up, center.",
		});
		expect(after.tracks).toEqual([]);
	});
});
