import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
		| "apply_edit_plan"
		| "apply_narrated_remix_plan"
		| "create_text_background_effect"
		| "create_human_pip_effect"
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
		});
		expect(state.revision).toBeGreaterThan(1);
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
			message: "Media asset 'cover.png' is type 'image', expected video or audio",
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
				resultData<{ assets: Array<{ id: string }> }>(result.results[0]).assets[0]
					.id,
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
						narration: { mediaId: narrationId, startTime: 0 },
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
		state.derivedAssets = [personMask({ sourceMediaId: sourceId, alphaMediaId: alphaId })];
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
});
