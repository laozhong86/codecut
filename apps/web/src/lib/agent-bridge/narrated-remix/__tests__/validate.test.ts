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
		narration: { mediaId: "narration-1", sourceStart: 0 },
		captions: [
			{ text: "The key idea", startTime: 0, duration: 3 },
			{ text: "The proof", startTime: 10, duration: 4 },
		],
		captionStyle: {
			preset: "talking-head-pop",
			position: "lower-safe",
			size: "medium",
		},
		captionSource: {
			type: "post-cut-audio",
			tool: "build-post-cut-captions",
			source: "scripted_tts_audio",
			trace: [
				{
					mediaId: "narration-1",
					timelineStart: 0,
					sourceStart: 0,
					sourceEnd: 30,
					captionCount: 2,
				},
			],
			voiceConsistency: {
				provider: "runninghub-voice-clone",
				providerTaskId: "voice-task-1",
				alignmentMethod: "scripted_captions_to_asr_segments",
				scriptCaptionLineCount: 2,
				protectedTermCount: 0,
			},
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

	test("accepts image card beats with editable card text", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				target: { durationSec: 30, aspectRatio: "9:16" },
				visualBeats: [
					{
						mediaType: "image",
						id: "card-1",
						mediaId: "image-1",
						timelineStart: 0,
						duration: 10,
						fit: "cover",
						cardText: {
							title: "天府新区双华麓港",
							info: "117.55㎡ 套三双卫 总价186万",
							bottomText: "地铁口商圈边",
						},
						reason: "Property qualification card.",
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
			},
			projectId: "project-1",
			mediaAssets: [imageAsset(), mediaAsset({ id: "video-2" }), audioAsset()],
		});

		expect(result.success).toBe(true);
		if (!result.success) throw new Error(result.message);
		expect(result.normalizedPlan.visualBeats[0]).toMatchObject({
			mediaType: "image",
			mediaId: "image-1",
			cardText: {
				title: "天府新区双华麓港",
				info: "117.55㎡ 套三双卫 总价186万",
				bottomText: "地铁口商圈边",
			},
		});
	});

	test("accepts a first-pass narrated remix plan without captions or caption source", () => {
		const {
			captionStyle: _captionStyle,
			captionSource: _captionSource,
			...plan
		} = validPlan();

		const result = validateNarratedRemixPlan({
			plan: { ...plan, captions: [] },
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toMatchObject({
			success: true,
			normalizedPlan: {
				captions: [],
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

	test("rejects captions without post-cut audio caption source proof", () => {
		const { captionSource: _captionSource, ...plan } = validPlan();

		const result = validateNarratedRemixPlan({
			plan,
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan captions require post-cut captionSource.",
			path: "captionSource",
		});
	});

	test("rejects caption source traces that do not cover every caption", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				captionSource: {
					...validPlan().captionSource,
					trace: [
						{
							mediaId: "narration-1",
							timelineStart: 0,
							sourceStart: 0,
							sourceEnd: 30,
							captionCount: 1,
						},
					],
				},
			},
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toEqual({
			success: false,
			message:
				"NarratedRemixPlan captionSource trace count must match captions.",
			path: "captionSource.trace",
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

	test("rejects legacy video beats that reference image assets", () => {
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

	test("rejects image card beats that reference video assets", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				visualBeats: [
					{
						mediaType: "image",
						id: "card-1",
						mediaId: "video-1",
						timelineStart: 0,
						duration: 30,
						fit: "cover",
						cardText: {
							title: "天府新区双华麓港",
							info: "117.55㎡ 套三双卫 总价186万",
							bottomText: "地铁口商圈边",
						},
						reason: "Property qualification card.",
					},
				],
			},
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan imageBeat media must be image.",
			path: "visualBeats[0].mediaId",
		});
	});

	test("rejects image card beats missing editable info text", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				visualBeats: [
					{
						mediaType: "image",
						id: "card-1",
						mediaId: "image-1",
						timelineStart: 0,
						duration: 30,
						fit: "cover",
						cardText: {
							title: "天府新区双华麓港",
							info: "",
							bottomText: "地铁口商圈边",
						},
						reason: "Property qualification card.",
					},
				],
			},
			projectId: "project-1",
			mediaAssets: [imageAsset(), audioAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan schema is invalid.",
			path: "visualBeats[0].cardText.info",
		});
	});

	test("rejects image card beats outside the 9:16 card contract", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				target: { durationSec: 30, aspectRatio: "16:9" },
				visualBeats: [
					{
						mediaType: "image",
						id: "card-1",
						mediaId: "image-1",
						timelineStart: 0,
						duration: 30,
						fit: "cover",
						cardText: {
							title: "天府新区双华麓港",
							info: "117.55㎡ 套三双卫 总价186万",
							bottomText: "地铁口商圈边",
						},
						reason: "Property qualification card.",
					},
				],
			},
			projectId: "project-1",
			mediaAssets: [imageAsset(), audioAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan image cards only support 9:16 target.",
			path: "visualBeats[0]",
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
