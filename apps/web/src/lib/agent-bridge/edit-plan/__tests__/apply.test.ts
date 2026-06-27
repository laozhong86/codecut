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
import {
	CODECUT_ARCHIVO_BLACK_FONT_FAMILY,
	CODECUT_CJK_FONT_FAMILY,
	CODECUT_JETBRAINS_MONO_FONT_FAMILY,
	CODECUT_MONTSERRAT_FONT_FAMILY,
	CODECUT_OUTFIT_FONT_FAMILY,
	CODECUT_SMILEY_SANS_FONT_FAMILY,
	CODECUT_WEN_KAI_FONT_FAMILY,
	CODECUT_YAN_BO_SONG_FONT_FAMILY,
} from "@/lib/codecut-fonts";
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

function imageAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return mediaAsset({
		id: "cover-1",
		name: "Opening cover.png",
		type: "image",
		width: 1080,
		height: 1920,
		duration: undefined,
		file: new File(["image"], "opening-cover.png", { type: "image/png" }),
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

	test("inserts an introCover image at the beginning of the main track", () => {
		const editor = fakeEditor({
			mediaAssets: [mediaAsset(), imageAsset()],
		});
		const plan = {
			...shortVideoPlan(),
			target: { durationSec: 11.2, aspectRatio: "9:16" },
			introCover: {
				mediaId: "cover-1",
				duration: 1.2,
				fit: "cover",
				reason: "Generated from the selected first frame.",
			},
			clips: shortVideoPlan().clips.map((clip) => ({
				...clip,
				timelineStart: clip.timelineStart + 1.2,
			})),
		};

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const visualElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "video" ? track.elements : []));

		expect(result).toMatchObject({
			success: true,
			summary: {
				clipCount: 2,
				introCoverCount: 1,
				totalDuration: 11.2,
				appliedElementIds: ["element-1", "element-2", "element-3"],
			},
		});
		expect(visualElements).toMatchObject([
			{
				type: "image",
				mediaId: "cover-1",
				startTime: 0,
				duration: 1.2,
				trimStart: 0,
				trimEnd: 0,
				transform: {
					scale: 1,
					position: { x: 0, y: 0 },
					rotate: 0,
				},
			},
			{
				type: "video",
				mediaId: "media-1",
				startTime: 1.2,
				duration: 5,
				trimStart: 0,
				trimEnd: 5,
			},
			{
				type: "video",
				mediaId: "media-1",
				startTime: 6.2,
				duration: 5,
				trimStart: 20,
				trimEnd: 25,
			},
		]);
	});

	test("applies cover fit as a deterministic video transform", () => {
		const editor = fakeEditor();
		const plan = validPlan();
		plan.clips[0] = {
			...plan.clips[0],
			fit: "cover",
		};

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const videoElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "video" ? track.elements : []));

		expect(result).toMatchObject({ success: true });
		expect(videoElements[0]).toMatchObject({
			type: "video",
			transform: {
				position: { x: 0, y: 0 },
				rotate: 0,
			},
		});
		expect(videoElements[0]?.transform.scale).toBeCloseTo(3.16049, 4);
		expect(videoElements[1]?.transform.scale).toBe(1);
	});

	test("applies sourceCrop as readable video state", () => {
		const editor = fakeEditor();
		const plan = structuredClone(validPlan());
		plan.clips[0] = {
			...plan.clips[0],
			sourceCrop: { x: 690, y: 0, width: 540, height: 960 },
		};

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const videoElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "video" ? track.elements : []));

		expect(result).toMatchObject({ success: true });
		expect(videoElements[0]).toMatchObject({
			type: "video",
			sourceCrop: { x: 690, y: 0, width: 540, height: 960 },
			transform: {
				scale: 1,
				position: { x: 0, y: 0 },
				rotate: 0,
			},
		});
		expect(videoElements[1]).not.toHaveProperty("sourceCrop");
	});

	test("applies sourceCrop cover-to-canvas as an explicit cover transform", () => {
		const editor = fakeEditor();
		const plan = structuredClone(validPlan());
		plan.clips[0] = {
			...plan.clips[0],
			sourceCrop: {
				x: 0,
				y: 0,
				width: 1280,
				height: 720,
				fit: "cover-to-canvas",
			},
		};

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const videoElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "video" ? track.elements : []));

		expect(result).toMatchObject({ success: true });
		expect(videoElements[0]).toMatchObject({
			type: "video",
			sourceCrop: {
				x: 0,
				y: 0,
				width: 1280,
				height: 720,
				fit: "cover-to-canvas",
			},
			transform: {
				position: { x: 0, y: 0 },
				rotate: 0,
			},
		});
		expect(videoElements[0]?.transform.scale).toBeCloseTo(3.16049, 4);
	});

	test("inserts title and captions on a text track", () => {
		const editor = fakeEditor();

		applyEditPlanToEditor({
			plan: validPlan(),
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const textElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "text" ? track.elements : []));

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

		const textElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "text" ? track.elements : []));

		expect(textElements[0]).toMatchObject({
			content: "The key insight",
			fontWeight: "normal",
			stroke: undefined,
			shadow: undefined,
		});
		expect(textElements[1]).toMatchObject({
			content: "This is the key insight.",
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 6,
			fontWeight: "bold",
			color: "#ffffff",
			stroke: { color: "#000000", width: 3 },
			shadow: { color: "#000000", offsetX: 0, offsetY: 2, blur: 4 },
			backgroundColor: "transparent",
			boxWidth: 44,
			transform: {
				scale: 1,
				position: { x: 0, y: 520 },
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

		const textElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "text" ? track.elements : []));

		expect(textElements[1]).toMatchObject({
			content: "This is the key insight.",
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 5,
			fontWeight: "bold",
			color: "#ffffff",
			stroke: undefined,
			backgroundColor: "#000000",
			backgroundOpacity: 0.78,
			backgroundPaddingX: 24,
			backgroundPaddingY: 12,
			backgroundBorderRadius: 8,
			boxWidth: 44,
			transform: {
				scale: 1,
				position: { x: 0, y: 0 },
				rotate: 0,
			},
		});
	});

	test("applies talking-head-pop caption style for vertical opinion clips", () => {
		const editor = fakeEditor();
		const plan: EditPlan = {
			...validPlan(),
			captionStyle: {
				preset: "talking-head-pop",
				position: "lower-safe",
			},
		};

		applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const textElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "text" ? track.elements : []));

		expect(textElements[1]).toMatchObject({
			content: "This is the key insight.",
			fontFamily: "CodecutCJK",
			fontSize: 5.2,
			fontWeight: "bold",
			color: "#ffffff",
			stroke: undefined,
			shadow: { color: "rgba(0,0,0,0.72)", offsetX: 0, offsetY: 3, blur: 10 },
			backgroundColor: "#0f172a",
			backgroundOpacity: 0.42,
			backgroundPaddingX: 24,
			backgroundPaddingY: 12,
			backgroundBorderRadius: 8,
			boxWidth: 50,
			transform: {
				scale: 1,
				position: { x: 0, y: 520 },
				rotate: 0,
			},
		});
	});

	test("enlarges very short talking-head captions without changing normal caption size", () => {
		const editor = fakeEditor();
		const plan: EditPlan = {
			...validPlan(),
			title: undefined,
			captions: [
				{ text: "别犹豫", startTime: 0, duration: 2 },
				{ text: "这是一个正常长度的字幕", startTime: 2, duration: 2 },
			],
			captionStyle: {
				preset: "talking-head-pop",
				position: "lower-safe",
			},
		};

		applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const textElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "text" ? track.elements : []));

		expect(textElements).toMatchObject([
			{
				content: "别犹豫",
				fontSize: 8.4,
				boxWidth: 34,
				backgroundPaddingX: 28,
				backgroundPaddingY: 14,
			},
			{
				content: "这是一个正常长度的字幕",
				fontSize: 5.2,
				boxWidth: 50,
				backgroundPaddingX: 24,
				backgroundPaddingY: 12,
			},
		]);
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

		const textElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "text" ? track.elements : []));

		expect(textElements[0]).toMatchObject({
			content: "Stop wasting effort",
			fontFamily: CODECUT_OUTFIT_FONT_FAMILY,
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

	test("applies expanded social caption presets with matching font treatments", () => {
		const cases = [
			{
				preset: "creator-clean",
				expected: {
					fontFamily: CODECUT_YAN_BO_SONG_FONT_FAMILY,
					fontSize: 5.2,
					fontWeight: "normal",
					color: "#ffffff",
					backgroundColor: "transparent",
					shadow: {
						color: "rgba(0,0,0,0.42)",
						offsetX: 0,
						offsetY: 2,
						blur: 6,
					},
					stroke: undefined,
				},
			},
			{
				preset: "short-form-bold",
				expected: {
					fontFamily: CODECUT_CJK_FONT_FAMILY,
					fontSize: 6,
					fontWeight: "bold",
					color: "#ffffff",
					stroke: { color: "#000000", width: 3 },
					backgroundColor: "transparent",
				},
			},
			{
				preset: "black-bar",
				expected: {
					fontFamily: CODECUT_CJK_FONT_FAMILY,
					fontSize: 5,
					fontWeight: "bold",
					color: "#ffffff",
					backgroundColor: "#000000",
					backgroundOpacity: 0.78,
				},
			},
			{
				preset: "talking-head-pop",
				expected: {
					fontFamily: CODECUT_CJK_FONT_FAMILY,
					fontSize: 5.2,
					fontWeight: "bold",
					color: "#ffffff",
					stroke: undefined,
					shadow: {
						color: "rgba(0,0,0,0.72)",
						offsetX: 0,
						offsetY: 3,
						blur: 10,
					},
					backgroundColor: "#0f172a",
					backgroundOpacity: 0.42,
				},
			},
			{
				preset: "tutorial-clean",
				expected: {
					fontFamily: CODECUT_CJK_FONT_FAMILY,
					fontSize: 5,
					fontWeight: "normal",
					color: "#ffffff",
					backgroundColor: "#111827",
					backgroundOpacity: 0.68,
				},
			},
			{
				preset: "documentary-soft",
				expected: {
					fontFamily: CODECUT_CJK_FONT_FAMILY,
					fontSize: 5,
					fontWeight: "bold",
					color: "#f8fafc",
					stroke: { color: "#0f172a", width: 2 },
					backgroundColor: "transparent",
				},
			},
			{
				preset: "product-punch",
				expected: {
					fontFamily: CODECUT_CJK_FONT_FAMILY,
					fontSize: 6,
					fontWeight: "bold",
					color: "#ffe45c",
					stroke: { color: "#111111", width: 4 },
					backgroundColor: "transparent",
				},
			},
			{
				preset: "lifestyle-warm",
				expected: {
					fontFamily: CODECUT_WEN_KAI_FONT_FAMILY,
					fontSize: 5.4,
					fontWeight: "normal",
					color: "#fff7ed",
					backgroundColor: "#7c2d12",
					backgroundOpacity: 0.54,
				},
			},
			{
				preset: "cinematic-serif",
				expected: {
					fontFamily: CODECUT_YAN_BO_SONG_FONT_FAMILY,
					fontSize: 5.1,
					fontWeight: "normal",
					color: "#f8fafc",
					shadow: {
						color: "rgba(0,0,0,0.58)",
						offsetX: 0,
						offsetY: 2,
						blur: 8,
					},
					stroke: undefined,
					backgroundColor: "#111827",
					backgroundOpacity: 0.32,
				},
			},
			{
				preset: "social-highlight",
				expected: {
					fontFamily: CODECUT_CJK_FONT_FAMILY,
					fontSize: 5.6,
					fontWeight: "bold",
					color: "#ffffff",
					stroke: { color: "#0f172a", width: 2 },
					backgroundColor: "#2563eb",
					backgroundOpacity: 0.86,
				},
			},
			{
				preset: "comment-bubble",
				expected: {
					fontFamily: CODECUT_CJK_FONT_FAMILY,
					fontSize: 5.2,
					fontWeight: "bold",
					color: "#111827",
					backgroundColor: "#ffffff",
					backgroundOpacity: 0.92,
				},
			},
			{
				preset: "minimal-reel",
				expected: {
					fontFamily: CODECUT_SMILEY_SANS_FONT_FAMILY,
					fontSize: 4.6,
					fontWeight: "normal",
					color: "#f8fafc",
					backgroundColor: "#0f172a",
					backgroundOpacity: 0.38,
				},
			},
		];

		expect(cases).toHaveLength(12);

		for (const captionCase of cases) {
			const editor = fakeEditor();
			const plan = {
				...validPlan(),
				captionStyle: {
					preset: captionCase.preset,
					position: "lower-safe",
				},
			} as unknown as EditPlan;

			const result = applyEditPlanToEditor({
				plan,
				projectId: "project-1",
				replaceExisting: true,
				editor,
			});

			expect(result).toMatchObject({ success: true });

			const textElements = editor.timeline
				.getTracks()
				.flatMap((track) => (track.type === "text" ? track.elements : []));

			expect(textElements[1]).toMatchObject({
				content: "This is the key insight.",
				transform: {
					scale: 1,
					position: { x: 0, y: 520 },
					rotate: 0,
				},
				...captionCase.expected,
			});
		}
	});

	test("applies short-form social title presets with distinct positions", () => {
		const cases = [
			{
				stylePreset: "social_hook",
				expected: {
					fontFamily: CODECUT_ARCHIVO_BLACK_FONT_FAMILY,
					fontSize: 11,
					fontWeight: "bold",
					color: "#ffe45c",
					stroke: { color: "#111111", width: 4 },
					backgroundColor: "transparent",
					boxWidth: 52,
					transform: {
						scale: 1,
						position: { x: 0, y: -500 },
						rotate: 0,
					},
				},
			},
			{
				stylePreset: "product_badge",
				expected: {
					fontFamily: CODECUT_MONTSERRAT_FONT_FAMILY,
					fontSize: 7,
					fontWeight: "bold",
					color: "#111827",
					backgroundColor: "#ffe45c",
					backgroundOpacity: 0.9,
					backgroundBorderRadius: 12,
					boxWidth: 52,
					transform: {
						scale: 1,
						position: { x: 0, y: -330 },
						rotate: 0,
					},
				},
			},
			{
				stylePreset: "chapter_bumper",
				expected: {
					fontFamily: CODECUT_JETBRAINS_MONO_FONT_FAMILY,
					fontSize: 8.5,
					fontWeight: "bold",
					color: "#ffffff",
					backgroundColor: "#111827",
					backgroundOpacity: 0.78,
					backgroundBorderRadius: 8,
					boxWidth: 52,
					transform: {
						scale: 1,
						position: { x: 0, y: 0 },
						rotate: 0,
					},
				},
			},
		];

		for (const titleCase of cases) {
			const editor = fakeEditor();
			const plan = {
				...validPlan(),
				title: {
					text: "Stop scrolling",
					startTime: 0,
					duration: 2,
					stylePreset: titleCase.stylePreset,
				},
			} as unknown as EditPlan;

			const result = applyEditPlanToEditor({
				plan,
				projectId: "project-1",
				replaceExisting: true,
				editor,
			});

			expect(result).toMatchObject({ success: true });

			const textElements = editor.timeline
				.getTracks()
				.flatMap((track) => (track.type === "text" ? track.elements : []));

			expect(textElements[0]).toMatchObject({
				content: "Stop scrolling",
				...titleCase.expected,
			});
		}
	});

	test("applies richSpans from title and captions", () => {
		const editor = fakeEditor();
		const plan = {
			...validPlan(),
			title: {
				text: "Rich title",
				startTime: 0,
				duration: 3,
				richSpans: [{ start: 0, end: 4, color: "#ffd84d" }],
			},
			captions: [
				{
					text: "关键词字幕",
					startTime: 0,
					duration: 2,
					richSpans: [
						{
							start: 0,
							end: 3,
							color: "#ffd84d",
							fontScale: 1.2,
							fontWeight: "bold",
						},
					],
				},
			],
		};

		applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		const textElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "text" ? track.elements : []));

		expect(textElements).toMatchObject([
			{
				content: "Rich title",
				richSpans: [{ start: 0, end: 4, color: "#ffd84d" }],
			},
			{
				content: "关键词字幕",
				richSpans: [
					{
						start: 0,
						end: 3,
						color: "#ffd84d",
						fontScale: 1.2,
						fontWeight: "bold",
					},
				],
			},
		]);
	});

	test("applies title motion preset as editable text keyframes", () => {
		const editor = fakeEditor();
		const plan = {
			...validPlan(),
			title: {
				text: "Stop scrolling",
				startTime: 0,
				duration: 1.2,
				stylePreset: "social_hook",
				motionPreset: "slam-in",
			},
		} as unknown as EditPlan;

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		expect(result).toMatchObject({ success: true });

		const titleElement = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "text" ? track.elements : []))[0];

		expect(titleElement).toMatchObject({
			type: "text",
			content: "Stop scrolling",
			motionPreset: "slam-in",
			keyframes: {
				opacity: [
					{ time: 0, value: 0, interpolation: "ease-out" },
					{ time: 0.12, value: 1, interpolation: "linear" },
					{ time: 1.2, value: 1 },
				],
			},
		});
	});

	test("applies captionStyle motion preset to every caption text element", () => {
		const editor = fakeEditor();
		const plan = {
			...validPlan(),
			captionStyle: {
				preset: "product-punch",
				position: "lower-safe",
				motionPreset: "pop-bounce",
			},
		} as unknown as EditPlan;

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		expect(result).toMatchObject({ success: true });

		const textElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "text" ? track.elements : []));
		const captionElement = textElements[1];

		expect(captionElement).toMatchObject({
			type: "text",
			content: "This is the key insight.",
			motionPreset: "pop-bounce",
			keyframes: {
				"transform.scale": [
					{ time: 0, value: 0.92, interpolation: "ease-out" },
					{ time: 0.14, value: 1.12, interpolation: "ease-in-out" },
					{ time: 0.26, value: 0.98, interpolation: "ease-in-out" },
					{ time: 0.38, value: 1, interpolation: "linear" },
					{ time: 2, value: 1 },
				],
			},
		});
	});

	test("rejects keyword_caption without mutating the timeline", () => {
		const editor = fakeEditor();
		const plan = {
			...validPlan(),
			captionStyle: {
				preset: "keyword_caption",
				position: "lower-safe",
			},
		} as unknown as EditPlan;

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		expect(result).toMatchObject({
			success: false,
			path: "captionStyle.preset",
		});
		expect(editor.timeline.getTracks()).toEqual([videoTrack()]);
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

		const audioElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "audio" ? track.elements : []));

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

	test("applies migration transition presets as native track transitions", () => {
		const transitionTypes: TransitionType[] = [
			"blur-crossfade",
			"flash-white",
			"push-soft",
			"whip-pan-left",
			"whip-pan-right",
			"cinematic-zoom",
			"chromatic-split",
		];

		for (const type of transitionTypes) {
			const plan = {
				...shortVideoPlan(),
				transitions: [
					{
						fromClipId: "clip-1",
						toClipId: "clip-2",
						type,
						duration: 0.4,
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
					type,
					duration: 0.4,
					fromElementId: "element-1",
					toElementId: "element-2",
				},
			]);
		}
	});

	test("does not modify the timeline when transition insertion fails during apply", () => {
		const originalTracks = [videoTrack()];
		const editor = fakeEditor({ tracks: originalTracks });
		editor.timeline.addTransition = () => null;
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

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan transition could not be applied.",
			path: "transitions[0]",
		});
		expect(editor.timeline.getTracks()).toEqual(originalTracks);
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

	test("does not modify the timeline when introCover validation fails", () => {
		const editor = fakeEditor({ mediaAssets: [mediaAsset()] });
		const plan = {
			...shortVideoPlan(),
			target: { durationSec: 11.2, aspectRatio: "9:16" },
			introCover: {
				mediaId: "missing-cover",
				duration: 1.2,
				fit: "cover",
				reason: "Generated from the selected first frame.",
			},
			clips: shortVideoPlan().clips.map((clip) => ({
				...clip,
				timelineStart: clip.timelineStart + 1.2,
			})),
		};

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		expect(result).toEqual({
			success: false,
			message:
				"EditPlan introCover mediaId was not found in the project media library.",
			path: "introCover.mediaId",
		});
		expect(editor.timeline.getTracks()).toEqual([videoTrack()]);
	});

	test("does not modify the timeline when sfx starts at the timeline end", () => {
		const editor = fakeEditor({
			mediaAssets: [mediaAsset(), audioAsset({ id: "sfx-1" })],
		});
		const plan: EditPlan = {
			...validPlan(),
			audio: {
				sfx: [{ assetId: "sfx-1", startTime: 30, volume: 0.8 }],
			},
		};

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		expect(result).toEqual({
			success: false,
			message:
				"EditPlan sfx startTime exceeds the generated timeline duration.",
			path: "audio.sfx[0].startTime",
		});
		expect(editor.timeline.getTracks()).toEqual([videoTrack()]);
	});
});
