import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import type {
	CreateTimelineElement,
	TimelineElement,
	TimelineTrack,
	TrackType,
} from "@/types/timeline";
import { applyEditPlanToEditor } from "../apply";
import type { EditPlan } from "../schema";

type InsertParams = {
	element: CreateTimelineElement;
	placement: { mode: "explicit"; trackId: string } | { mode: "auto" };
};

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

type VideoTrack = Extract<TimelineTrack, { type: "video" }>;
type TextTrack = Extract<TimelineTrack, { type: "text" }>;
type AudioTrack = Extract<TimelineTrack, { type: "audio" }>;
type StickerTrack = Extract<TimelineTrack, { type: "sticker" }>;

function videoTrack(overrides: Partial<VideoTrack> = {}): VideoTrack {
	return {
		id: "video-track-1",
		type: "video",
		name: "Main Track",
		isMain: true,
		muted: false,
		hidden: false,
		elements: [],
		...overrides,
	};
}

function textTrack(overrides: Partial<TextTrack> = {}): TextTrack {
	return {
		id: "text-track-1",
		type: "text",
		name: "Text Track",
		hidden: false,
		elements: [],
		...overrides,
	};
}

function audioTrack(overrides: Partial<AudioTrack> = {}): AudioTrack {
	return {
		id: "audio-track-1",
		type: "audio",
		name: "Audio Track",
		muted: false,
		elements: [],
		...overrides,
	};
}

function stickerTrack(overrides: Partial<StickerTrack> = {}): StickerTrack {
	return {
		id: "sticker-track-1",
		type: "sticker",
		name: "Sticker Track",
		hidden: false,
		elements: [],
		...overrides,
	};
}

function validPlan(): EditPlan {
	return {
		version: 1,
		projectId: "project-1",
		sourceMediaId: "media-1",
		target: { durationSec: 30, aspectRatio: "9:16" },
		clips: [
			{
				id: "clip-1",
				sourceStart: 10,
				sourceEnd: 25,
				timelineStart: 0,
				reason: "Sets up the core point.",
			},
			{
				id: "clip-2",
				sourceStart: 50,
				sourceEnd: 65,
				timelineStart: 15,
				reason: "Gives the concrete example.",
			},
		],
		title: { text: "The key insight", startTime: 0, duration: 3 },
		captions: [{ text: "This is the key insight.", startTime: 0, duration: 2 }],
		rationale: "Combines setup and proof into a short clip.",
	};
}

function fakeEditor({
	tracks = [videoTrack()],
	mediaAssets = [mediaAsset()],
}: {
	tracks?: TimelineTrack[];
	mediaAssets?: MediaAsset[];
} = {}) {
	let nextElementId = 1;
	let nextTrackId = 1;
	let currentTracks = structuredClone(tracks) as TimelineTrack[];

	return {
		media: {
			getAssets: () => mediaAssets,
		},
		timeline: {
			getTracks: () => currentTracks,
			updateTracks: (tracks: TimelineTrack[]) => {
				currentTracks = structuredClone(tracks) as TimelineTrack[];
			},
			addTrack: ({ type }: { type: TrackType }) => {
				const id = `${type}-track-${nextTrackId}`;
				nextTrackId += 1;
				currentTracks = [
					...currentTracks,
					type === "video"
						? videoTrack({ id })
						: type === "text"
							? textTrack({ id })
							: type === "audio"
								? audioTrack({ id })
								: stickerTrack({ id }),
				];
				return id;
			},
			insertElement: ({ element, placement }: InsertParams) => {
				const elementWithId = {
					...element,
					id: `element-${nextElementId}`,
				} as TimelineElement;
				nextElementId += 1;

				const targetTrackId =
					placement.mode === "explicit"
						? placement.trackId
						: currentTracks.find((track) => track.type === element.type)?.id;
				if (!targetTrackId) {
					throw new Error(`No ${element.type} track`);
				}

				currentTracks = currentTracks.map((track) =>
					track.id === targetTrackId
						? ({
								...track,
								elements: [...track.elements, elementWithId],
							} as TimelineTrack)
						: track,
				);
			},
		},
	};
}

describe("applyEditPlanToEditor", () => {
	test("inserts clips with source trims and returns an execution summary", () => {
		const editor = fakeEditor();
		const result = applyEditPlanToEditor({
			plan: validPlan(),
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const tracks = editor.timeline.getTracks();
		const videoElements = tracks.flatMap((track) =>
			track.type === "video" ? track.elements : [],
		);

		expect(result).toMatchObject({
			success: true,
			summary: {
				clipCount: 2,
				totalDuration: 30,
				appliedElementIds: ["element-1", "element-2", "element-3", "element-4"],
				rationale: "Combines setup and proof into a short clip.",
			},
		});
		expect(videoElements).toMatchObject([
			{
				type: "video",
				mediaId: "media-1",
				startTime: 0,
				duration: 15,
				trimStart: 10,
				trimEnd: 25,
			},
			{
				type: "video",
				mediaId: "media-1",
				startTime: 15,
				duration: 15,
				trimStart: 50,
				trimEnd: 65,
			},
		]);
	});

	test("inserts title and captions on a text track", () => {
		const editor = fakeEditor();

		applyEditPlanToEditor({
			plan: validPlan(),
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const textElements = editor.timeline.getTracks().flatMap((track) =>
			track.type === "text" ? track.elements : [],
		);

		expect(textElements).toMatchObject([
			{
				type: "text",
				content: "The key insight",
				startTime: 0,
				duration: 3,
			},
			{
				type: "text",
				content: "This is the key insight.",
				startTime: 0,
				duration: 2,
			},
		]);
	});

	test("does not modify a non-empty timeline unless replaceExisting is true", () => {
		const existingElement = {
			id: "existing-element",
			type: "video",
			mediaId: "media-1",
			name: "Existing",
			startTime: 0,
			duration: 5,
			trimStart: 0,
			trimEnd: 5,
			muted: false,
			hidden: false,
			transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
			opacity: 1,
		} satisfies TimelineElement;
		const editor = fakeEditor({
			tracks: [videoTrack({ elements: [existingElement] })],
		});

		const result = applyEditPlanToEditor({
			plan: validPlan(),
			projectId: "project-1",
			replaceExisting: false,
			editor,
		});

		expect(result).toEqual({
			success: false,
			message:
				"Timeline is not empty. Pass replaceExisting=true to apply an EditPlan.",
		});
		expect(editor.timeline.getTracks()[0].elements).toEqual([existingElement]);
	});

	test("does not modify the timeline when validation fails", () => {
		const editor = fakeEditor();
		const plan = { ...validPlan(), projectId: "other-project" };

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan projectId does not match the active project.",
			path: "projectId",
		});
		expect(editor.timeline.getTracks()).toEqual([videoTrack()]);
	});
});
