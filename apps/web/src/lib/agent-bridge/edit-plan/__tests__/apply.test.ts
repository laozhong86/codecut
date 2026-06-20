import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import type {
	CreateTimelineElement,
	TimelineElement,
	TimelineTrack,
	TrackType,
	TrackTransition,
	TransitionType,
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

function audioAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return mediaAsset({
		id: "audio-1",
		name: "Music bed.mp3",
		type: "audio",
		duration: 3,
		file: new File(["audio"], "music-bed.mp3", { type: "audio/mpeg" }),
		...overrides,
	});
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
		captionStyle: {
			preset: "short-form-bold",
			position: "lower-safe",
		},
		rationale: "Combines setup and proof into a short clip.",
	};
}

function shortVideoPlan(): EditPlan {
	return {
		version: 1,
		projectId: "project-1",
		sourceMediaId: "media-1",
		target: { durationSec: 10, aspectRatio: "9:16" },
		clips: [
			{
				id: "clip-1",
				sourceStart: 0,
				sourceEnd: 5,
				timelineStart: 0,
				reason: "First proof point.",
			},
			{
				id: "clip-2",
				sourceStart: 20,
				sourceEnd: 25,
				timelineStart: 5,
				reason: "Second proof point.",
			},
		],
		rationale: "Creates a compact proof sequence.",
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
			addTransition: ({
				trackId,
				fromElementId,
				toElementId,
				type,
				duration,
			}: {
				trackId: string;
				fromElementId: string;
				toElementId: string;
				type: TransitionType;
				duration: number;
			}): TrackTransition | null => {
				const transition: TrackTransition = {
					id: `transition-${nextElementId}`,
					fromElementId,
					toElementId,
					type,
					duration,
				};
				let created = false;
				currentTracks = currentTracks.map((track) => {
					if (track.id !== trackId || track.type !== "video") return track;
					const fromElement = track.elements.find(
						(element) => element.id === fromElementId,
					);
					const toElement = track.elements.find(
						(element) => element.id === toElementId,
					);
					if (!fromElement || !toElement) return track;
					created = true;
					return {
						...track,
						transitions: [...(track.transitions ?? []), transition],
					};
				});
				return created ? transition : null;
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

	test("applies short-form-bold caption style without affecting title", () => {
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

		expect(textElements[0]).toMatchObject({
			content: "The key insight",
			fontWeight: "normal",
			stroke: undefined,
			shadow: undefined,
		});
		expect(textElements[1]).toMatchObject({
			content: "This is the key insight.",
			fontFamily: "Inter",
			fontSize: 6,
			fontWeight: "bold",
			color: "#ffffff",
			stroke: { color: "#000000", width: 3 },
			shadow: { color: "#000000", offsetX: 0, offsetY: 2, blur: 4 },
			backgroundColor: "transparent",
			boxWidth: 42,
			transform: {
				scale: 1,
				position: { x: 0, y: 300 },
				rotate: 0,
			},
		});
	});

	test("applies black-bar caption style with safe box styling", () => {
		const editor = fakeEditor();
		const plan: EditPlan = {
			...validPlan(),
			captionStyle: {
				preset: "black-bar",
				position: "center",
			},
		};

		applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const textElements = editor.timeline.getTracks().flatMap((track) =>
			track.type === "text" ? track.elements : [],
		);

		expect(textElements[1]).toMatchObject({
			content: "This is the key insight.",
			fontFamily: "Inter",
			fontSize: 5,
			fontWeight: "bold",
			color: "#ffffff",
			stroke: undefined,
			backgroundColor: "#000000",
			backgroundOpacity: 0.78,
			backgroundPaddingX: 24,
			backgroundPaddingY: 12,
			backgroundBorderRadius: 8,
			boxWidth: 42,
			transform: {
				scale: 1,
				position: { x: 0, y: 0 },
				rotate: 0,
			},
		});
	});

	test("applies hook title preset without changing caption style", () => {
		const editor = fakeEditor();
		const plan = {
			...validPlan(),
			title: {
				text: "Stop wasting effort",
				startTime: 0,
				duration: 3,
				stylePreset: "hook_title",
			},
		};

		applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const textElements = editor.timeline.getTracks().flatMap((track) =>
			track.type === "text" ? track.elements : [],
		);

		expect(textElements[0]).toMatchObject({
			content: "Stop wasting effort",
			fontFamily: "Inter",
			fontSize: 10,
			fontWeight: "bold",
			color: "#ffffff",
			backgroundColor: "#000000",
			backgroundOpacity: 0.72,
			backgroundPaddingX: 28,
			backgroundPaddingY: 14,
			backgroundBorderRadius: 10,
			boxWidth: 52,
			transform: {
				scale: 1,
				position: { x: 0, y: -420 },
				rotate: 0,
			},
		});
		expect(textElements[1]).toMatchObject({
			content: "This is the key insight.",
			fontSize: 6,
			stroke: { color: "#000000", width: 3 },
		});
	});

	test("applies keyword caption style through the top-level captionStyle", () => {
		const editor = fakeEditor();
		const plan = {
			...validPlan(),
			captionStyle: {
				preset: "keyword_caption",
				position: "lower-safe",
			},
		};

		applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const textElements = editor.timeline.getTracks().flatMap((track) =>
			track.type === "text" ? track.elements : [],
		);

		expect(textElements[1]).toMatchObject({
			content: "This is the key insight.",
			fontFamily: "Inter",
			fontSize: 6,
			fontWeight: "bold",
			color: "#ffd84d",
			stroke: { color: "#000000", width: 3 },
			backgroundColor: "transparent",
			boxWidth: 42,
			transform: {
				scale: 1,
				position: { x: 0, y: 300 },
				rotate: 0,
			},
		});
	});

	test("loops bgm audio to cover the generated timeline", () => {
		const plan = {
			...shortVideoPlan(),
			audio: {
				bgm: {
					assetId: "audio-1",
					volume: 0.35,
					mode: "loop_to_timeline",
				},
			},
		};
		const editor = fakeEditor({
			mediaAssets: [mediaAsset(), audioAsset()],
		});

		applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const audioTracks = editor.timeline
			.getTracks()
			.filter((track): track is AudioTrack => track.type === "audio");

		expect(audioTracks).toHaveLength(1);
		expect(audioTracks[0].elements).toMatchObject([
			{
				type: "audio",
				sourceType: "upload",
				mediaId: "audio-1",
				startTime: 0,
				duration: 3,
				trimStart: 0,
				trimEnd: 3,
				volume: 0.35,
			},
			{
				type: "audio",
				sourceType: "upload",
				mediaId: "audio-1",
				startTime: 3,
				duration: 3,
				trimStart: 0,
				trimEnd: 3,
				volume: 0.35,
			},
			{
				type: "audio",
				sourceType: "upload",
				mediaId: "audio-1",
				startTime: 6,
				duration: 3,
				trimStart: 0,
				trimEnd: 3,
				volume: 0.35,
			},
			{
				type: "audio",
				sourceType: "upload",
				mediaId: "audio-1",
				startTime: 9,
				duration: 1,
				trimStart: 0,
				trimEnd: 1,
				volume: 0.35,
			},
		]);
	});

	test("inserts sfx audio at the requested timeline position", () => {
		const plan = {
			...shortVideoPlan(),
			audio: {
				sfx: [{ assetId: "sfx-1", startTime: 0, volume: 0.8 }],
			},
		};
		const editor = fakeEditor({
			mediaAssets: [
				mediaAsset(),
				audioAsset({ id: "sfx-1", name: "Hit.wav", duration: 1.25 }),
			],
		});

		applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const audioElements = editor.timeline.getTracks().flatMap((track) =>
			track.type === "audio" ? track.elements : [],
		);

		expect(audioElements).toMatchObject([
			{
				type: "audio",
				sourceType: "upload",
				mediaId: "sfx-1",
				startTime: 0,
				duration: 1.25,
				trimStart: 0,
				trimEnd: 1.25,
				volume: 0.8,
			},
		]);
	});

	test("applies transitions between adjacent video clips", () => {
		const plan = {
			...shortVideoPlan(),
			transitions: [
				{
					fromClipId: "clip-1",
					toClipId: "clip-2",
					type: "fade",
					duration: 0.5,
				},
			],
		};
		const editor = fakeEditor();

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const videoTracks = editor.timeline
			.getTracks()
			.filter((track): track is VideoTrack => track.type === "video");

		expect(result).toMatchObject({
			success: true,
			summary: {
				transitionCount: 1,
			},
		});
		expect(videoTracks[0].transitions).toMatchObject([
			{
				type: "fade",
				duration: 0.5,
				fromElementId: "element-1",
				toElementId: "element-2",
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
