import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import type { TimelineTrack } from "@/types/timeline";
import { BridgeToolNameSchema } from "@/lib/agent-bridge/schema";
import { getToolByName } from "../index";
import { executeApplyEditPlanTool } from "../edit-plan-tools";
import { executeTranscribeMediaTool } from "../transcription-tools";

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

function editorWithMedia({
	mediaAssets = [mediaAsset()],
	tracks = [],
}: {
	mediaAssets?: MediaAsset[];
	tracks?: TimelineTrack[];
} = {}) {
	return {
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

describe("Codex deterministic editing tools", () => {
	test("registers bridge tools for transcription and edit plan application", () => {
		expect(getToolByName({ name: "transcribe_media" })?.name).toBe(
			"transcribe_media",
		);
		expect(getToolByName({ name: "apply_edit_plan" })?.name).toBe(
			"apply_edit_plan",
		);
		expect(BridgeToolNameSchema.safeParse("transcribe_media").success).toBe(
			true,
		);
		expect(BridgeToolNameSchema.safeParse("apply_edit_plan").success).toBe(true);
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
			message: "Media asset 'Long interview.mp4' is type 'image', expected video or audio",
		});
	});
});
