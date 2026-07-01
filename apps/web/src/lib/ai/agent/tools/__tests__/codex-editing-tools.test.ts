import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import type { SpokenScriptData } from "@/services/storage/types";
import type { DerivedAsset } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import { BridgeToolNameSchema } from "@/lib/agent-bridge/schema";
import {
	cloneLocalSegmentAsrCapabilities,
	cloneLocalSegmentAsrQuality,
} from "@/lib/transcription/asr-provider-contract";
import { getToolByName } from "../index";
import { executeApplyEditPlanTool } from "../edit-plan-tools";
import { executeImportMediaFileTool } from "../media-tools";
import {
	executeCreateHumanPipEffectTool,
	executeCreateTextBackgroundEffectTool,
} from "../masked-effect-tools";
import { executeApplyNarratedRemixPlanTool } from "../narrated-remix-tools";
import { executeTranscribeMediaTool } from "../transcription-tools";
import { executeBuildPostCutCaptionsTool } from "../caption-tools";

function mediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return {
		id: "media-1",
		name: "Long interview.mp4",
		type: "video",
		duration: 120,
		width: 1920,
		height: 1080,
		file: new File(["video"], "long-interview.mp4", { type: "video/mp4" }),
		...overrides,
	};
}

function personMask(overrides: Partial<DerivedAsset> = {}): DerivedAsset {
	return {
		id: "mask-1",
		type: "person-mask",
		sourceMediaId: "media-1",
		alphaMediaId: "alpha-1",
		duration: 120,
		width: 1920,
		height: 1080,
		fps: 30,
		confidence: 0.8,
		createdAt: "2026-06-21T00:00:00.000Z",
		...overrides,
	};
}

function editorWithMedia({
	mediaAssets = [mediaAsset()],
	tracks = [],
	derivedAssets = [],
}: {
	mediaAssets?: MediaAsset[];
	tracks?: TimelineTrack[];
	derivedAssets?: DerivedAsset[];
} = {}) {
	return {
		project: {
			getDerivedAssets: () => derivedAssets,
		},
		media: {
			getAssets: () => mediaAssets,
		},
		timeline: {
			getTracks: () => tracks,
			updateTracks: () => undefined,
			addTrack: () => "track-1",
			insertElement: () => undefined,
		},
	};
}

function asrContractFields() {
	return {
		capabilities: cloneLocalSegmentAsrCapabilities(),
		quality: cloneLocalSegmentAsrQuality(),
	};
}

describe("Codex deterministic editing tools", () => {
	test("registers bridge tools for transcription and edit plan application", () => {
		expect(getToolByName({ name: "import_media_file" })?.name).toBe(
			"import_media_file",
		);
		expect(getToolByName({ name: "transcribe_media" })?.name).toBe(
			"transcribe_media",
		);
		expect(getToolByName({ name: "build_post_cut_captions" })?.name).toBe(
			"build_post_cut_captions",
		);
		expect(getToolByName({ name: "apply_edit_plan" })?.name).toBe(
			"apply_edit_plan",
		);
		expect(getToolByName({ name: "create_text_background_effect" })?.name).toBe(
			"create_text_background_effect",
		);
		expect(getToolByName({ name: "create_human_pip_effect" })?.name).toBe(
			"create_human_pip_effect",
		);
		expect(getToolByName({ name: "apply_narrated_remix_plan" })?.name).toBe(
			"apply_narrated_remix_plan",
		);
		expect(BridgeToolNameSchema.safeParse("import_media_file").success).toBe(
			true,
		);
		expect(BridgeToolNameSchema.safeParse("transcribe_media").success).toBe(
			true,
		);
		expect(BridgeToolNameSchema.safeParse("apply_edit_plan").success).toBe(
			true,
		);
		expect(
			BridgeToolNameSchema.safeParse("build_post_cut_captions").success,
		).toBe(true);
		expect(
			BridgeToolNameSchema.safeParse("create_text_background_effect").success,
		).toBe(true);
		expect(
			BridgeToolNameSchema.safeParse("create_human_pip_effect").success,
		).toBe(true);
		expect(
			BridgeToolNameSchema.safeParse("apply_narrated_remix_plan").success,
		).toBe(true);
	});

	test("tool descriptions expose the template contract", () => {
		const descriptions = [
			getToolByName({ name: "apply_edit_plan" })?.description ?? "",
			getToolByName({ name: "apply_narrated_remix_plan" })?.description ?? "",
		].join("\n");

		expect(descriptions).toContain("talking-head-short");
		expect(descriptions).toContain("tutorial-demo");
		expect(descriptions).toContain("product-proof-ad");
		expect(descriptions).toContain("narrated-broll");
		expect(descriptions).not.toContain(["P0", "video", "template"].join(" "));
		expect(descriptions).toContain("does not support TTS");
		expect(descriptions).toContain("BGM");
		expect(descriptions).toContain("SFX");
		expect(descriptions).toContain("video or image B-roll");
		expect(descriptions).toContain("independent controlled text overlays");
		expect(descriptions).not.toContain(
			"does not support TTS, BGM, SFX, image B-roll",
		);
	});

	test("apply_edit_plan returns validation failures without mutating the timeline", () => {
		let updateCount = 0;
		const editor = {
			...editorWithMedia(),
			timeline: {
				getTracks: () => [],
				updateTracks: () => {
					updateCount += 1;
				},
				addTrack: () => "track-1",
				insertElement: () => undefined,
				addTransition: () => null,
			},
		};

		const result = executeApplyEditPlanTool({
			args: {
				replaceExisting: true,
				plan: {
					version: 1,
					projectId: "other-project",
					sourceMediaId: "media-1",
					target: { durationSec: 30, aspectRatio: "9:16" },
					clips: [
						{
							id: "clip-1",
							sourceStart: 0,
							sourceEnd: 30,
							timelineStart: 0,
							reason: "Example",
						},
					],
					rationale: "Example",
				},
			},
			projectId: "project-1",
			editor,
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan projectId does not match the active project.",
			data: { path: "projectId" },
		});
		expect(updateCount).toBe(0);
	});

	test("import_media_file decodes a local file payload and adds it to the media library", async () => {
		const addedAssets: Array<{
			projectId: string;
			asset: Omit<MediaAsset, "id">;
		}> = [];
		const editor = {
			project: {
				getActive: () => ({ metadata: { id: "project-123" } }),
			},
			media: {
				addMediaAsset: async ({
					projectId,
					asset,
				}: {
					projectId: string;
					asset: Omit<MediaAsset, "id">;
				}) => {
					addedAssets.push({ projectId, asset });
					return "media-imported-1";
				},
			},
		};

		const result = await executeImportMediaFileTool({
			args: {
				fileName: "intro.mp4",
				mimeType: "video/mp4",
				base64: Buffer.from("video-bytes").toString("base64"),
				size: 11,
				lastModified: 123,
			},
			editor,
			processFiles: async ({ files }) => {
				const [file] = Array.from(files);
				expect(file.name).toBe("intro.mp4");
				expect(file.type).toBe("video/mp4");
				expect(file.size).toBe(11);
				return [
					{
						name: file.name,
						type: "video",
						file,
						duration: 42,
						width: 1920,
						height: 1080,
						fps: 30,
						url: "blob:imported",
					},
				];
			},
		});

		expect(result).toEqual({
			success: true,
			message: "Imported 1 media asset(s)",
			data: {
				assets: [
					{
						id: "media-imported-1",
						name: "intro.mp4",
						type: "video",
						duration: 42,
						width: 1920,
						height: 1080,
						size: 11,
					},
				],
			},
		});
		expect(addedAssets).toHaveLength(1);
		expect(addedAssets[0].projectId).toBe("project-123");
		expect(addedAssets[0].asset.name).toBe("intro.mp4");
	});

	test("import_media_file preserves explicit scripted TTS metadata for audio assets", async () => {
		const addedAssets: Array<{
			projectId: string;
			asset: Omit<MediaAsset, "id">;
		}> = [];
		const editor = {
			project: {
				getActive: () => ({ metadata: { id: "project-123" } }),
			},
			media: {
				addMediaAsset: async ({
					projectId,
					asset,
				}: {
					projectId: string;
					asset: Omit<MediaAsset, "id">;
				}) => {
					addedAssets.push({ projectId, asset });
					return "media-imported-1";
				},
			},
		};
		const spokenScript: SpokenScriptData = {
			source: "tts",
			text: "A pizza portion costs $2.34. Venmo that ASAP.",
			captions: ["A pizza portion costs $2.34.", "Venmo that ASAP."],
			protectedTerms: ["$2.34", "Venmo"],
		};

		const result = await executeImportMediaFileTool({
			args: {
				fileName: "tts.mp3",
				mimeType: "audio/mpeg",
				base64: Buffer.from("audio-bytes").toString("base64"),
				size: 11,
				lastModified: 123,
				spokenScript,
			},
			editor,
			processFiles: async ({ files }) => {
				const [file] = Array.from(files);
				return [
					{
						name: file.name,
						type: "audio",
						file,
						duration: 8,
						url: "blob:imported",
					},
				];
			},
		});

		expect(result).toMatchObject({
			success: true,
			data: { assets: [{ id: "media-imported-1", type: "audio" }] },
		});
		expect(addedAssets[0].asset.spokenScript).toEqual(spokenScript);
	});

	test("import_media_file rejects scripted TTS metadata for non-audio assets before mutating media", async () => {
		let addCount = 0;
		const editor = {
			project: {
				getActive: () => ({ metadata: { id: "project-123" } }),
			},
			media: {
				addMediaAsset: async () => {
					addCount += 1;
					return "media-imported-1";
				},
			},
		};

		const result = await executeImportMediaFileTool({
			args: {
				fileName: "source.mp4",
				mimeType: "video/mp4",
				base64: Buffer.from("video-bytes").toString("base64"),
				size: 11,
				lastModified: 123,
				spokenScript: {
					source: "tts",
					text: "This should only attach to audio.",
					captions: ["This should only attach to audio."],
				},
			},
			editor,
			processFiles: async ({ files }) => {
				const [file] = Array.from(files);
				return [
					{
						name: file.name,
						type: "video",
						file,
						duration: 42,
						width: 1920,
						height: 1080,
						fps: 30,
						url: "blob:imported",
					},
				];
			},
		});

		expect(result).toEqual({
			success: false,
			message: "spokenScript can only be attached to imported audio assets.",
		});
		expect(addCount).toBe(0);
	});

	test("import_media_file fails before mutating media when payload size is invalid", async () => {
		let addCount = 0;
		const editor = {
			project: {
				getActive: () => ({ metadata: { id: "project-123" } }),
			},
			media: {
				addMediaAsset: async () => {
					addCount += 1;
					return "media-imported-1";
				},
			},
		};

		const result = await executeImportMediaFileTool({
			args: {
				fileName: "intro.mp4",
				mimeType: "video/mp4",
				base64: Buffer.from("video-bytes").toString("base64"),
				size: 999,
				lastModified: 123,
			},
			editor,
			processFiles: async () => {
				throw new Error("processFiles should not be called");
			},
		});

		expect(result).toEqual({
			success: false,
			message: "Imported file size does not match payload size.",
		});
		expect(addCount).toBe(0);
	});

	test("create_text_background_effect replaces the timeline with masked effect layers", async () => {
		const updatedTrackBatches: TimelineTrack[][] = [];
		const result = executeCreateTextBackgroundEffectTool({
			args: {
				sourceMediaId: "media-1",
				derivedAssetId: "mask-1",
				content: "Core claim",
				startTime: 2,
				duration: 6,
				replaceExisting: true,
			},
			editor: {
				...editorWithMedia({
					mediaAssets: [
						mediaAsset(),
						mediaAsset({ id: "alpha-1", name: "Mask alpha.webm" }),
					],
					derivedAssets: [personMask()],
				}),
				timeline: {
					getTracks: () => [],
					updateTracks: (tracks) => {
						updatedTrackBatches.push(tracks);
					},
				},
			},
		});

		expect(result).toMatchObject({
			success: true,
			message: "Created text-background effect with 3 track(s).",
			data: {
				effect: "text-background",
				trackCount: 3,
				elementCount: 3,
				totalDuration: 8,
			},
		});
		expect(updatedTrackBatches).toHaveLength(1);
		const tracks = updatedTrackBatches[0];
		expect(tracks[0].elements[0]).toMatchObject({
			type: "video",
			mediaId: "media-1",
			mask: { type: "person-mask", derivedAssetId: "mask-1" },
		});
	});

	test("create_text_background_effect refuses to overwrite an existing timeline without replaceExisting", async () => {
		let updateCount = 0;
		const result = executeCreateTextBackgroundEffectTool({
			args: {
				sourceMediaId: "media-1",
				derivedAssetId: "mask-1",
				content: "Core claim",
				startTime: 2,
				duration: 6,
				replaceExisting: false,
			},
			editor: {
				...editorWithMedia({
					mediaAssets: [
						mediaAsset(),
						mediaAsset({ id: "alpha-1", name: "Mask alpha.webm" }),
					],
					derivedAssets: [personMask()],
					tracks: [
						{
							id: "track-1",
							name: "Existing",
							type: "video",
							isMain: true,
							muted: false,
							hidden: false,
							elements: [],
						},
					],
				}),
				timeline: {
					getTracks: () => [
						{
							id: "track-1",
							name: "Existing",
							type: "video",
							isMain: true,
							muted: false,
							hidden: false,
							elements: [],
						},
					],
					updateTracks: () => {
						updateCount += 1;
					},
				},
			},
		});

		expect(result).toEqual({
			success: false,
			message: "Timeline is not empty. Set replaceExisting=true to replace it.",
		});
		expect(updateCount).toBe(0);
	});

	test("create_human_pip_effect rejects unsupported placement before mutating timeline", () => {
		let updateCount = 0;
		const result = executeCreateHumanPipEffectTool({
			args: {
				foregroundMediaId: "media-1",
				backgroundMediaId: "background-1",
				derivedAssetId: "mask-1",
				placement: "bottom_right",
				scale: 0.35,
				startTime: 2,
				duration: 6,
				replaceExisting: true,
			},
			editor: {
				...editorWithMedia({
					mediaAssets: [
						mediaAsset(),
						mediaAsset({ id: "alpha-1", name: "Mask alpha.webm" }),
						mediaAsset({ id: "background-1", name: "Background.mp4" }),
					],
					derivedAssets: [personMask()],
				}),
				timeline: {
					getTracks: () => [],
					updateTracks: () => {
						updateCount += 1;
					},
				},
			},
		});

		expect(result).toEqual({
			success: false,
			message:
				"placement must be one of right_down, right_up, left_down, left_up, center.",
		});
		expect(updateCount).toBe(0);
	});

	test("apply_narrated_remix_plan returns validation failures without mutating the timeline", () => {
		let updateCount = 0;
		const result = executeApplyNarratedRemixPlanTool({
			args: {
				replaceExisting: true,
				plan: {
					version: 1,
					projectId: "other-project",
					target: { durationSec: 10, aspectRatio: "9:16" },
					visualBeats: [
						{
							id: "beat-1",
							mediaId: "media-1",
							sourceStart: 0,
							sourceEnd: 10,
							timelineStart: 0,
							muted: true,
							reason: "Example",
						},
					],
					narration: { mediaId: "audio-1", sourceStart: 0 },
					captions: [],
					rationale: "Example",
				},
			},
			projectId: "project-1",
			editor: {
				...editorWithMedia({
					mediaAssets: [
						mediaAsset(),
						mediaAsset({
							id: "audio-1",
							name: "Narration.mp3",
							type: "audio",
							duration: 10,
						}),
					],
				}),
				timeline: {
					getTracks: () => [],
					updateTracks: () => {
						updateCount += 1;
					},
				},
			},
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan projectId does not match the active project.",
			data: { path: "projectId" },
		});
		expect(updateCount).toBe(0);
	});

	test("transcribe_media fails when the media asset does not exist", async () => {
		const result = await executeTranscribeMediaTool({
			args: {
				mediaId: "missing-media",
				language: "auto",
				modelId: "whisper-tiny",
			},
			editor: editorWithMedia(),
			transcribeMedia: async () => {
				throw new Error("transcribeMedia should not be called");
			},
		});

		expect(result).toEqual({
			success: false,
			message: "Media asset 'missing-media' not found",
		});
	});

	test("transcribe_media rejects image media without touching transcription runtime", async () => {
		const result = await executeTranscribeMediaTool({
			args: {
				mediaId: "media-1",
				language: "auto",
				modelId: "whisper-tiny",
			},
			editor: editorWithMedia({
				mediaAssets: [mediaAsset({ type: "image", duration: 120 })],
			}),
			transcribeMedia: async () => {
				throw new Error("transcribeMedia should not be called");
			},
		});

		expect(result).toEqual({
			success: false,
			message:
				"Media asset 'Long interview.mp4' is type 'image', expected video or audio",
		});
	});

	test("build_post_cut_captions transcribes edited clip ranges without mutating the timeline", async () => {
		let updateCount = 0;
		const tracks: TimelineTrack[] = [
			{
				id: "video-track-1",
				type: "video",
				name: "Main video",
				isMain: true,
				muted: false,
				hidden: false,
				elements: [
					{
						id: "clip-1",
						type: "video",
						mediaId: "media-1",
						name: "Hook",
						duration: 3,
						startTime: 0,
						trimStart: 10,
						trimEnd: 13,
						transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
						opacity: 1,
					},
				],
			},
		];
		const editor = {
			...editorWithMedia({ tracks }),
			timeline: {
				getTracks: () => tracks,
				updateTracks: () => {
					updateCount += 1;
				},
			},
		};
		const ranges: Array<{ start: number; end: number }> = [];

		const result = await executeBuildPostCutCaptionsTool({
			args: {
				language: "zh",
				modelId: "whisper-base",
			},
			editor,
			transcribeMediaRange: async ({ range, language, modelId }) => {
				ranges.push(range);
				return {
					text: "第一句",
					language,
					modelId,
					segments: [{ text: "第一句", start: 0.5, end: 1.25 }],
					...asrContractFields(),
				};
			},
		});

		expect(ranges).toEqual([{ start: 10, end: 13 }]);
		expect(result).toEqual({
			success: true,
			message: "Built 1 post-cut caption(s) from 1 video clip(s).",
			data: {
				source: "edited_video_clip_audio",
				language: "zh",
				modelId: "whisper-base",
				captionStyle: {
					preset: "talking-head-pop",
					position: "lower-safe",
					size: "medium",
				},
				captions: [{ text: "第一句", startTime: 0.5, duration: 0.75 }],
				trace: [
					{
						mediaId: "media-1",
						timelineStart: 0,
						sourceStart: 10,
						sourceEnd: 13,
						captionCount: 1,
					},
				],
			},
		});
		expect(updateCount).toBe(0);
	});
});
