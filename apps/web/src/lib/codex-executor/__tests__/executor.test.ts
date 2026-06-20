import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createExecutorProject,
	executeCodexExecutorEnvelope,
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
});
