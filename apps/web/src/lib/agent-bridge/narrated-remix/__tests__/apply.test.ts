import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import type { TimelineTrack } from "@/types/timeline";
import { CODECUT_YAN_BO_SONG_FONT_FAMILY } from "@/lib/codecut-fonts";
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

function imageAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return mediaAsset({
		id: "image-1",
		name: "Property card.jpg",
		type: "image",
		duration: undefined,
		width: 1080,
		height: 1920,
		file: new File(["image"], "property-card.jpg", { type: "image/jpeg" }),
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

function requireTrackByType({
	tracks,
	type,
}: {
	tracks: TimelineTrack[];
	type: TimelineTrack["type"];
}): TimelineTrack {
	const track = tracks.find((candidate) => candidate.type === type);
	if (!track) {
		throw new Error(`Expected ${type} track to exist.`);
	}
	return track;
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
						fontFamily: CODECUT_YAN_BO_SONG_FONT_FAMILY,
						fontSize: 5.2,
						fontWeight: "bold",
						color: "#ffffff",
						backgroundColor: "#0f172a",
						backgroundOpacity: 0.42,
						backgroundPaddingX: 24,
						backgroundPaddingY: 12,
						backgroundBorderRadius: 8,
						boxWidth: 50,
						shadow: {
							color: "rgba(0,0,0,0.72)",
							offsetX: 0,
							offsetY: 3,
							blur: 10,
						},
						transform: { scale: 1, position: { x: 0, y: 520 }, rotate: 0 },
					},
					{ type: "text", content: "The proof", startTime: 10, duration: 4 },
				],
			},
		]);
	});

	test("keeps a shorter narration clip at its real duration on a preserve-source timeline", () => {
		const updates: TimelineTrack[][] = [];
		const result = applyNarratedRemixPlanToEditor({
			plan: {
				...validPlan(),
				target: { durationSec: 28.866667, aspectRatio: "9:16" },
				visualBeats: [
					{
						id: "full-source",
						mediaId: "video-1",
						sourceStart: 0,
						sourceEnd: 28.866667,
						timelineStart: 0,
						muted: true,
						reason: "Preserve full source video.",
					},
				],
				narration: { mediaId: "narration-1", sourceStart: 0 },
				captions: [{ text: "结果先出现", startTime: 0, duration: 3 }],
			},
			projectId: "project-1",
			replaceExisting: true,
			editor: editorWithMedia({
				mediaAssets: [
					mediaAsset({ duration: 28.866667 }),
					audioAsset({ duration: 28.8 }),
				],
				onUpdate: (tracks) => updates.push(tracks),
			}),
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
				toleranceSeconds: 0.25,
			},
		});

		expect(result).toMatchObject({
			success: true,
			summary: { totalDuration: 28.866667 },
		});
		const tracks = updates[0] ?? [];
		expect(requireTrackByType({ tracks, type: "video" })).toMatchObject({
			type: "video",
			elements: [
				{
					type: "video",
					mediaId: "video-1",
					startTime: 0,
					duration: 28.866667,
					trimStart: 0,
					trimEnd: 28.866667,
				},
			],
		});
		expect(requireTrackByType({ tracks, type: "audio" })).toMatchObject({
			type: "audio",
			elements: [
				{
					type: "audio",
					mediaId: "narration-1",
					startTime: 0,
					duration: 28.8,
					trimStart: 0,
					trimEnd: 28.8,
				},
			],
		});
	});

	test("places explicitly offset narration without stretching it across the timeline", () => {
		const updates: TimelineTrack[][] = [];
		const result = applyNarratedRemixPlanToEditor({
			plan: {
				...validPlan(),
				target: { durationSec: 28.866667, aspectRatio: "9:16" },
				visualBeats: [
					{
						id: "full-source",
						mediaId: "video-1",
						sourceStart: 0,
						sourceEnd: 28.866667,
						timelineStart: 0,
						muted: true,
						reason: "Preserve full source video.",
					},
				],
				narration: {
					mediaId: "narration-1",
					sourceStart: 1,
					timelineStart: 5,
					durationSec: 18,
				},
				captions: [{ text: "结果先出现", startTime: 5, duration: 3 }],
			},
			projectId: "project-1",
			replaceExisting: true,
			editor: editorWithMedia({
				mediaAssets: [
					mediaAsset({ duration: 28.866667 }),
					audioAsset({ duration: 20 }),
				],
				onUpdate: (tracks) => updates.push(tracks),
			}),
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
				toleranceSeconds: 0.25,
			},
		});

		expect(result.success).toBe(true);
		const tracks = updates[0] ?? [];
		expect(requireTrackByType({ tracks, type: "video" })).toMatchObject({
			type: "video",
			elements: [{ type: "video", duration: 28.866667 }],
		});
		expect(requireTrackByType({ tracks, type: "audio" })).toMatchObject({
			type: "audio",
			elements: [
				{
					type: "audio",
					mediaId: "narration-1",
					startTime: 5,
					duration: 18,
					trimStart: 1,
					trimEnd: 19,
				},
			],
		});
	});

	test("projects visual beats with independent text overlays", () => {
		const updates: TimelineTrack[][] = [];
		const result = applyNarratedRemixPlanToEditor({
			plan: {
				...validPlan(),
				target: { durationSec: 30, aspectRatio: "9:16" },
				visualBeats: [
					{
						id: "opening-video",
						mediaId: "video-1",
						sourceStart: 0,
						sourceEnd: 10,
						timelineStart: 0,
						muted: true,
						reason: "Opening b-roll.",
					},
					{
						mediaType: "image",
						id: "property-card",
						mediaId: "image-1",
						timelineStart: 10,
						duration: 20,
						fit: "cover",
						reason: "Property image with explicit editable overlays.",
					},
				],
				textOverlays: [
					{
						name: "Property title",
						text: "天府新区双华麓港",
						startTime: 10,
						duration: 20,
						fontSize: 5.6,
						color: "#ffffff",
						backgroundColor: "#000000",
						backgroundOpacity: 0.86,
						backgroundPaddingX: 22,
						backgroundPaddingY: 10,
						backgroundBorderRadius: 8,
						boxWidth: 52,
						position: { x: 0, y: -780 },
						textAlign: "center",
						fontWeight: "bold",
					},
					{
						name: "Property info",
						text: "117.55㎡ 套三双卫 总价186万",
						startTime: 10,
						duration: 20,
						fontSize: 4.8,
						color: "#141414",
						backgroundColor: "#ffca21",
						backgroundOpacity: 0.92,
						backgroundPaddingX: 20,
						backgroundPaddingY: 9,
						backgroundBorderRadius: 8,
						boxWidth: 52,
						position: { x: 0, y: -710 },
						textAlign: "center",
						fontWeight: "bold",
					},
					{
						name: "Property selling point",
						text: "地铁口商圈边",
						startTime: 10,
						duration: 20,
						fontSize: 5.2,
						color: "#ffffff",
						backgroundColor: "#000000",
						backgroundOpacity: 0.84,
						backgroundPaddingX: 22,
						backgroundPaddingY: 12,
						backgroundBorderRadius: 10,
						boxWidth: 52,
						position: { x: 0, y: 430 },
						textAlign: "center",
						fontWeight: "bold",
					},
				],
				captions: [{ text: "Voiceover caption", startTime: 24, duration: 3 }],
				captionStyle: {
					preset: "talking-head-pop",
					position: "lower-safe",
				},
			},
			projectId: "project-1",
			replaceExisting: true,
			editor: editorWithMedia({
				mediaAssets: [mediaAsset(), imageAsset(), audioAsset()],
				onUpdate: (tracks) => updates.push(tracks),
			}),
		});

		expect(result).toMatchObject({
			success: true,
			summary: {
				visualBeatCount: 2,
				imageBeatCount: 1,
				textOverlayElementCount: 3,
				captionCount: 1,
				totalDuration: 30,
			},
		});
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatchObject([
			{
				type: "video",
				elements: [
					{ type: "video", mediaId: "video-1", startTime: 0, duration: 10 },
					{ type: "image", mediaId: "image-1", startTime: 10, duration: 20 },
				],
			},
			{
				type: "audio",
				elements: [{ type: "audio", mediaId: "narration-1" }],
			},
			{
				type: "text",
				name: "Text Overlays",
				elements: [
					{
						type: "text",
						name: "Property title",
						content: "天府新区双华麓港",
						startTime: 10,
						duration: 20,
						fontFamily: CODECUT_YAN_BO_SONG_FONT_FAMILY,
					},
					{
						type: "text",
						name: "Property info",
						content: "117.55㎡ 套三双卫 总价186万",
						startTime: 10,
						duration: 20,
						fontFamily: CODECUT_YAN_BO_SONG_FONT_FAMILY,
					},
					{
						type: "text",
						name: "Property selling point",
						content: "地铁口商圈边",
						startTime: 10,
						duration: 20,
						fontFamily: CODECUT_YAN_BO_SONG_FONT_FAMILY,
					},
				],
			},
			{
				type: "text",
				name: "Captions",
				elements: [
					{
						type: "text",
						content: "Voiceover caption",
						startTime: 24,
						duration: 3,
					},
				],
			},
		]);
	});

	test("projects text overlays during video beats independently from images", () => {
		const updates: TimelineTrack[][] = [];
		const result = applyNarratedRemixPlanToEditor({
			plan: {
				...validPlan(),
				textOverlays: [
					{
						name: "Video callout",
						text: "这段文字不绑定图片",
						startTime: 12,
						duration: 4,
						fontSize: 4.8,
						color: "#ffffff",
						backgroundColor: "#000000",
						backgroundOpacity: 0.8,
						backgroundPaddingX: 18,
						backgroundPaddingY: 8,
						backgroundBorderRadius: 6,
						boxWidth: 52,
						position: { x: 0, y: -240 },
						textAlign: "center",
						fontWeight: "bold",
					},
				],
			},
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
				imageBeatCount: 0,
				textOverlayElementCount: 1,
			},
		});
		const textOverlayTrack = updates[0].find(
			(track) => track.name === "Text Overlays",
		);
		expect(textOverlayTrack).toMatchObject({
			type: "text",
			elements: [
				{
					type: "text",
					name: "Video callout",
					content: "这段文字不绑定图片",
					startTime: 12,
					duration: 4,
				},
			],
		});
	});

	test("projects plain image beats without creating a text overlay track", () => {
		const updates: TimelineTrack[][] = [];
		const result = applyNarratedRemixPlanToEditor({
			plan: {
				...validPlan(),
				target: { durationSec: 30, aspectRatio: "9:16" },
				visualBeats: [
					{
						id: "opening-video",
						mediaId: "video-1",
						sourceStart: 0,
						sourceEnd: 10,
						timelineStart: 0,
						muted: true,
						reason: "Opening b-roll.",
					},
					{
						mediaType: "image",
						id: "plain-image",
						mediaId: "image-1",
						timelineStart: 10,
						duration: 20,
						fit: "cover",
						reason: "Plain image B-roll with no extra on-screen text.",
					},
				],
				captions: [{ text: "Voiceover caption", startTime: 24, duration: 3 }],
				captionStyle: {
					preset: "talking-head-pop",
					position: "lower-safe",
				},
			},
			projectId: "project-1",
			replaceExisting: true,
			editor: editorWithMedia({
				mediaAssets: [mediaAsset(), imageAsset(), audioAsset()],
				onUpdate: (tracks) => updates.push(tracks),
			}),
		});

		expect(result).toMatchObject({
			success: true,
			summary: {
				visualBeatCount: 2,
				imageBeatCount: 1,
				textOverlayElementCount: 0,
				captionCount: 1,
				totalDuration: 30,
			},
		});
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatchObject([
			{
				type: "video",
				elements: [
					{ type: "video", mediaId: "video-1", startTime: 0, duration: 10 },
					{ type: "image", mediaId: "image-1", startTime: 10, duration: 20 },
				],
			},
			{
				type: "audio",
				elements: [{ type: "audio", mediaId: "narration-1" }],
			},
			{
				type: "text",
				name: "Captions",
				elements: [
					{
						type: "text",
						content: "Voiceover caption",
						startTime: 24,
						duration: 3,
					},
				],
			},
		]);
		expect(
			updates[0].some((track) => track.name === "Text Overlays"),
		).toBe(false);
	});

	test("projects text overlays as editable text elements", () => {
		const updates: TimelineTrack[][] = [];
		const result = applyNarratedRemixPlanToEditor({
			plan: {
				...validPlan(),
				target: { durationSec: 30, aspectRatio: "9:16" },
				visualBeats: [
					{
						id: "opening-video",
						mediaId: "video-1",
						sourceStart: 0,
						sourceEnd: 10,
						timelineStart: 0,
						muted: true,
						reason: "Opening b-roll.",
					},
					{
						mediaType: "image",
						id: "property-image",
						mediaId: "image-1",
						timelineStart: 10,
						duration: 20,
						fit: "cover",
						reason: "Image B-roll with explicit editable text overlay.",
					},
				],
				textOverlays: [
					{
						name: "Property price",
						text: "117.55㎡ 套三双卫 总价186万",
						startTime: 10,
						duration: 20,
						fontSize: 4.8,
						color: "#141414",
						backgroundColor: "#ffca21",
						backgroundOpacity: 0.92,
						backgroundPaddingX: 20,
						backgroundPaddingY: 9,
						backgroundBorderRadius: 8,
						boxWidth: 52,
						position: { x: 0, y: -710 },
						textAlign: "center",
						fontWeight: "bold",
					},
				],
				captions: [{ text: "Voiceover caption", startTime: 24, duration: 3 }],
				captionStyle: {
					preset: "talking-head-pop",
					position: "lower-safe",
				},
			},
			projectId: "project-1",
			replaceExisting: true,
			editor: editorWithMedia({
				mediaAssets: [mediaAsset(), imageAsset(), audioAsset()],
				onUpdate: (tracks) => updates.push(tracks),
			}),
		});

		expect(result).toMatchObject({
			success: true,
			summary: {
				visualBeatCount: 2,
				imageBeatCount: 1,
				textOverlayElementCount: 1,
				captionCount: 1,
				totalDuration: 30,
			},
		});
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatchObject([
			{
				type: "video",
				elements: [
					{ type: "video", mediaId: "video-1", startTime: 0, duration: 10 },
					{ type: "image", mediaId: "image-1", startTime: 10, duration: 20 },
				],
			},
			{
				type: "audio",
				elements: [{ type: "audio", mediaId: "narration-1" }],
			},
			{
				type: "text",
				name: "Text Overlays",
				elements: [
					{
						type: "text",
						name: "Property price",
						content: "117.55㎡ 套三双卫 总价186万",
						startTime: 10,
						duration: 20,
						fontSize: 4.8,
						color: "#141414",
						backgroundColor: "#ffca21",
						backgroundOpacity: 0.92,
						backgroundPaddingX: 20,
						backgroundPaddingY: 9,
						backgroundBorderRadius: 8,
						boxWidth: 52,
						textAlign: "center",
						fontWeight: "bold",
						transform: {
							scale: 1,
							position: { x: 0, y: -710 },
							rotate: 0,
						},
					},
				],
			},
			{
				type: "text",
				name: "Captions",
				elements: [{ type: "text", content: "Voiceover caption" }],
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
