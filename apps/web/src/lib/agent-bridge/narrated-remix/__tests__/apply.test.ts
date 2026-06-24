import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import type { TimelineTrack } from "@/types/timeline";
import { applyNarratedRemixPlanToEditor } from "../apply";

function mediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return {
		id: "video-1",
		name: "B-roll 1.mp4",
		type: "video",
		duration: 60,
		width: 1920,
		height: 1080,
		file: new File(["video"], "broll-1.mp4", { type: "video/mp4" }),
		...overrides,
	};
}

function audioAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return mediaAsset({
		id: "narration-1",
		name: "Narration.mp3",
		type: "audio",
		duration: 40,
		file: new File(["audio"], "narration.mp3", { type: "audio/mpeg" }),
		...overrides,
	});
}

function validPlan() {
	return {
		version: 1,
		projectId: "project-1",
		target: { durationSec: 30, aspectRatio: "9:16" },
		visualBeats: [
			{
				id: "beat-1",
				mediaId: "video-1",
				sourceStart: 0,
				sourceEnd: 10,
				timelineStart: 0,
				muted: true,
				reason: "Sets the scene.",
			},
			{
				id: "beat-2",
				mediaId: "video-2",
				sourceStart: 12,
				sourceEnd: 32,
				timelineStart: 10,
				muted: true,
				reason: "Shows the process.",
			},
		],
		narration: { mediaId: "narration-1", sourceStart: 2 },
		captions: [
			{ text: "The key idea", startTime: 0, duration: 3 },
			{ text: "The proof", startTime: 10, duration: 4 },
		],
		captionStyle: {
			preset: "talking-head-pop",
			position: "lower-safe",
		},
		rationale: "Uses existing narration over muted B-roll.",
	};
}

function editorWithMedia({
	mediaAssets,
	tracks = [],
	onUpdate,
}: {
	mediaAssets: MediaAsset[];
	tracks?: TimelineTrack[];
	onUpdate?: (tracks: TimelineTrack[]) => void;
}) {
	let currentTracks = tracks;
	return {
		media: {
			getAssets: () => mediaAssets,
		},
		timeline: {
			getTracks: () => currentTracks,
			updateTracks: (nextTracks: TimelineTrack[]) => {
				currentTracks = nextTracks;
				onUpdate?.(nextTracks);
			},
		},
	};
}

describe("applyNarratedRemixPlanToEditor", () => {
	test("replaces the timeline with muted B-roll, narration, and captions", () => {
		const updates: TimelineTrack[][] = [];
		const result = applyNarratedRemixPlanToEditor({
			plan: validPlan(),
			projectId: "project-1",
			replaceExisting: true,
			editor: editorWithMedia({
				mediaAssets: [
					mediaAsset(),
					mediaAsset({ id: "video-2", name: "B-roll 2.mp4" }),
					audioAsset(),
				],
				onUpdate: (tracks) => updates.push(tracks),
			}),
		});

		expect(result).toMatchObject({
			success: true,
			summary: {
				visualBeatCount: 2,
				captionCount: 2,
				totalDuration: 30,
				rationale: "Uses existing narration over muted B-roll.",
			},
		});
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatchObject([
			{
				type: "video",
				elements: [
					{
						type: "video",
						mediaId: "video-1",
						startTime: 0,
						duration: 10,
						trimStart: 0,
						trimEnd: 10,
						muted: true,
					},
					{
						type: "video",
						mediaId: "video-2",
						startTime: 10,
						duration: 20,
						trimStart: 12,
						trimEnd: 32,
						muted: true,
					},
				],
			},
			{
				type: "audio",
				elements: [
					{
						type: "audio",
						sourceType: "upload",
						mediaId: "narration-1",
						startTime: 0,
						duration: 30,
						trimStart: 2,
						trimEnd: 32,
						volume: 1,
						muted: false,
					},
				],
			},
			{
				type: "text",
				elements: [
					{
						type: "text",
						content: "The key idea",
						startTime: 0,
						duration: 3,
						fontFamily: "CodecutCJK",
						fontSize: 4.8,
						fontWeight: "bold",
						color: "#fff3b0",
						transform: { scale: 1, position: { x: 0, y: 520 }, rotate: 0 },
					},
					{ type: "text", content: "The proof", startTime: 10, duration: 4 },
				],
			},
		]);
	});

	test("does not mutate the timeline when validation fails", () => {
		let updateCount = 0;
		const result = applyNarratedRemixPlanToEditor({
			plan: { ...validPlan(), projectId: "other-project" },
			projectId: "project-1",
			replaceExisting: true,
			editor: editorWithMedia({
				mediaAssets: [
					mediaAsset(),
					mediaAsset({ id: "video-2", name: "B-roll 2.mp4" }),
					audioAsset(),
				],
				onUpdate: () => {
					updateCount += 1;
				},
			}),
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan projectId does not match the active project.",
			path: "projectId",
		});
		expect(updateCount).toBe(0);
	});
});
