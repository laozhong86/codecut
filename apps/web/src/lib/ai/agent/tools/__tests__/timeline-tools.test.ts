import { beforeEach, describe, expect, test } from "bun:test";
import { EditorCore } from "@/core";
import { buildDefaultScene } from "@/lib/scenes";
import type {
	AudioElement,
	TextElement,
	TimelineTrack,
	VideoElement,
} from "@/types/timeline";
import { getTimelineStateTool } from "../timeline-tools";

const timerWindow = {
	setTimeout,
	clearTimeout,
	addEventListener: () => undefined,
	removeEventListener: () => undefined,
};

function textElementFixture(): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "Caption 1",
		content: "Visible caption",
		startTime: 1,
		duration: 3,
		trimStart: 0,
		trimEnd: 0,
		fontSize: 4,
		fontFamily: "Inter",
		color: "#ffffff",
		backgroundColor: "#000000",
		textAlign: "center",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		transform: {
			scale: 1.25,
			position: { x: 12, y: 320 },
			rotate: 0,
		},
		opacity: 0.9,
		stroke: { color: "#111111", width: 2 },
		shadow: { color: "#000000", offsetX: 1, offsetY: 2, blur: 3 },
		boxWidth: 36,
		backgroundBorderRadius: 4,
		backgroundOpacity: 0.6,
		backgroundPaddingX: 2,
		backgroundPaddingY: 1,
		richSpans: [{ start: 0, end: 7, color: "#ffd84d" }],
	};
}

function videoElementFixture(): VideoElement {
	return {
		id: "video-1",
		type: "video",
		name: "Source clip",
		mediaId: "media-1",
		startTime: 0,
		duration: 10,
		trimStart: 20,
		trimEnd: 30,
		muted: false,
		hidden: false,
		transform: {
			scale: 1.1,
			position: { x: -24, y: 16 },
			rotate: 0,
			flipX: true,
		},
		opacity: 0.8,
		playbackRate: 1.2,
		reversed: false,
	};
}

function audioElementFixture(): AudioElement {
	return {
		id: "audio-1",
		type: "audio",
		sourceType: "upload",
		name: "Music bed",
		mediaId: "audio-media-1",
		startTime: 0,
		duration: 3,
		trimStart: 0,
		trimEnd: 3,
		volume: 0.35,
		muted: false,
	};
}

function initializeTimeline({ tracks }: { tracks: TimelineTrack[] }) {
	const editor = EditorCore.getInstance();
	const scene = {
		...buildDefaultScene({ name: "Main scene", isMain: true }),
		tracks,
	};

	editor.scenes.initializeScenes({
		scenes: [scene],
		currentSceneId: scene.id,
	});
}

describe("getTimelineStateTool", () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, "window", {
			value: timerWindow,
			configurable: true,
		});
		EditorCore.reset();
	});

	test("returns whitelisted visual properties for timeline elements", async () => {
		initializeTimeline({
			tracks: [
				{
					id: "text-track",
					type: "text",
					name: "Text track",
					hidden: false,
					elements: [textElementFixture()],
				},
				{
					id: "video-track",
					type: "video",
					name: "Video track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [videoElementFixture()],
					transitions: [
						{
							id: "transition-1",
							type: "fade",
							duration: 0.5,
							fromElementId: "video-1",
							toElementId: "video-2",
						},
					],
				},
				{
					id: "audio-track",
					type: "audio",
					name: "Audio track",
					muted: false,
					elements: [audioElementFixture()],
				},
			],
		});

		const result = await getTimelineStateTool.execute({});

		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			tracks: [
				{
					id: "text-track",
					elements: [
						{
							id: "text-1",
							style: {
								fontSize: 4,
								fontFamily: "Inter",
								color: "#ffffff",
								backgroundColor: "#000000",
								textAlign: "center",
								fontWeight: "bold",
								fontStyle: "normal",
								textDecoration: "none",
								opacity: 0.9,
								transform: {
									scale: 1.25,
									position: { x: 12, y: 320 },
									rotate: 0,
								},
								stroke: { color: "#111111", width: 2 },
								shadow: {
									color: "#000000",
									offsetX: 1,
									offsetY: 2,
									blur: 3,
								},
								boxWidth: 36,
								backgroundBorderRadius: 4,
								backgroundOpacity: 0.6,
								backgroundPaddingX: 2,
								backgroundPaddingY: 1,
								richSpans: [{ start: 0, end: 7, color: "#ffd84d" }],
							},
						},
					],
				},
				{
					id: "video-track",
					transitions: [
						{
							id: "transition-1",
							type: "fade",
							duration: 0.5,
							fromElementId: "video-1",
							toElementId: "video-2",
						},
					],
					elements: [
						{
							id: "video-1",
							visual: {
								hidden: false,
								opacity: 0.8,
								transform: {
									scale: 1.1,
									position: { x: -24, y: 16 },
									rotate: 0,
									flipX: true,
								},
								playbackRate: 1.2,
								reversed: false,
							},
						},
					],
				},
				{
					id: "audio-track",
					elements: [
						{
							id: "audio-1",
							type: "audio",
							mediaId: "audio-media-1",
							audio: {
								sourceType: "upload",
								mediaId: "audio-media-1",
								volume: 0.35,
								muted: false,
							},
						},
					],
				},
			],
		});
	});
});
