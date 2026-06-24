import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import { validateNarratedRemixPlan } from "../validate";

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
		duration: 30,
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
		narration: { mediaId: "narration-1", sourceStart: 0 },
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

const validAssets = [
	mediaAsset(),
	mediaAsset({ id: "video-2", name: "B-roll 2.mp4" }),
	audioAsset(),
];

describe("validateNarratedRemixPlan", () => {
	test("accepts an existing-audio narrated remix plan", () => {
		const result = validateNarratedRemixPlan({
			plan: validPlan(),
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toMatchObject({
			success: true,
			normalizedPlan: {
				projectId: "project-1",
				target: { durationSec: 30 },
				narration: { mediaId: "narration-1" },
			},
		});
	});

	test("rejects captions without an explicit captionStyle", () => {
		const { captionStyle: _captionStyle, ...plan } = validPlan();

		const result = validateNarratedRemixPlan({
			plan,
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan captions require captionStyle.",
			path: "captionStyle",
		});
	});

	test("rejects TTS fields in narration", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				narration: {
					mediaId: "narration-1",
					sourceStart: 0,
					generateSpeech: true,
					text: "Generate this.",
					voiceId: "voice-1",
				},
			},
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan schema is invalid.",
			path: "narration",
		});
	});

	test("rejects legacy narration startTime", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				narration: { mediaId: "narration-1", startTime: 0 },
			},
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan schema is invalid.",
			path: "narration.sourceStart",
		});
	});

	test("rejects image B-roll assets", () => {
		const result = validateNarratedRemixPlan({
			plan: validPlan(),
			projectId: "project-1",
			mediaAssets: [
				mediaAsset({ type: "image", duration: 60 }),
				mediaAsset({ id: "video-2", name: "B-roll 2.mp4" }),
				audioAsset(),
			],
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan visualBeat media must be video.",
			path: "visualBeats[0].mediaId",
		});
	});

	test("rejects visual beat gaps", () => {
		const plan = validPlan();
		plan.visualBeats[1] = {
			...plan.visualBeats[1],
			timelineStart: 11,
		};

		const result = validateNarratedRemixPlan({
			plan,
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan visualBeats must be continuous.",
			path: "visualBeats[1].timelineStart",
		});
	});

	test("rejects captions beyond target duration", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				captions: [{ text: "Too late", startTime: 29, duration: 2 }],
			},
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan caption exceeds target duration.",
			path: "captions[0]",
		});
	});
});
