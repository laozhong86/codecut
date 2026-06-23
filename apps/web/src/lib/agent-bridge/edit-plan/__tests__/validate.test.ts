import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import { EditPlanSchema, type EditPlan } from "../schema";
import { validateEditPlan } from "../validate";

type ValidationFailure = Extract<
	ReturnType<typeof validateEditPlan>,
	{ success: false }
>;

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

function validPlan(): EditPlan {
	return {
		version: 1,
		projectId: "project-1",
		sourceMediaId: "media-1",
		target: {
			durationSec: 30,
			aspectRatio: "9:16",
		},
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
		title: {
			text: "The key insight",
			startTime: 0,
			duration: 3,
		},
		captions: [
			{
				text: "This is the key insight.",
				startTime: 0,
				duration: 2,
			},
		],
		captionStyle: {
			preset: "short-form-bold",
			position: "lower-safe",
		},
		rationale: "Combines setup and proof into a short clip.",
	};
}

function audioAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return mediaAsset({
		id: "audio-1",
		name: "Music bed.mp3",
		type: "audio",
		duration: 8,
		file: new File(["audio"], "music-bed.mp3", { type: "audio/mpeg" }),
		...overrides,
	});
}

function expectValidationFailure(
	result: ReturnType<typeof validateEditPlan>,
): ValidationFailure {
	expect(result.success).toBe(false);
	if (result.success) {
		throw new Error("Expected EditPlan validation to fail.");
	}
	return result;
}

describe("validateEditPlan", () => {
	test("accepts a valid Codex edit plan", () => {
		const result = validateEditPlan({
			plan: validPlan(),
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toMatchObject({
			success: true,
			normalizedPlan: {
				projectId: "project-1",
				sourceMediaId: "media-1",
			},
		});
	});

	test("accepts cover fit clips for video source media with dimensions", () => {
		const plan = validPlan();
		plan.clips[0] = {
			...plan.clips[0],
			fit: "cover",
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.normalizedPlan.clips[0]?.fit).toBe("cover");
	});

	test("rejects cover fit when source video dimensions are missing", () => {
		const plan = validPlan();
		plan.clips[0] = {
			...plan.clips[0],
			fit: "cover",
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset({ width: undefined, height: undefined })],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan cover fit requires source media dimensions.",
			path: "sourceMediaId",
		});
	});

	test("rejects cover fit for audio source media", () => {
		const plan = {
			...validPlan(),
			sourceMediaId: "audio-1",
			clips: [
				{
					id: "clip-1",
					sourceStart: 0,
					sourceEnd: 30,
					timelineStart: 0,
					fit: "cover",
					reason: "Audio excerpt.",
				},
			],
			captions: undefined,
			captionStyle: undefined,
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [audioAsset({ duration: 120 })],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan cover fit requires video source media.",
			path: "clips[0].fit",
		});
	});

	test("rejects a plan for another project", () => {
		const result = validateEditPlan({
			plan: { ...validPlan(), projectId: "other-project" },
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan projectId does not match the active project.",
			path: "projectId",
		});
	});

	test("rejects a missing source media asset", () => {
		const result = validateEditPlan({
			plan: validPlan(),
			projectId: "project-1",
			mediaAssets: [],
		});

		expect(result).toEqual({
			success: false,
			message:
				"EditPlan sourceMediaId was not found in the project media library.",
			path: "sourceMediaId",
		});
	});

	test("rejects image media as an edit source", () => {
		const result = validateEditPlan({
			plan: validPlan(),
			projectId: "project-1",
			mediaAssets: [mediaAsset({ type: "image", duration: 120 })],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan source media must be video or audio.",
			path: "sourceMediaId",
		});
	});

	test("rejects clip ranges with sourceEnd before sourceStart", () => {
		const plan = validPlan();
		plan.clips[0] = {
			...plan.clips[0],
			sourceStart: 25,
			sourceEnd: 10,
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan clip sourceEnd must be greater than sourceStart.",
			path: "clips[0]",
		});
	});

	test("rejects clip ranges beyond the source media duration", () => {
		const plan = validPlan();
		plan.clips[1] = {
			...plan.clips[1],
			sourceEnd: 130,
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan clip sourceEnd exceeds source media duration.",
			path: "clips[1].sourceEnd",
		});
	});

	test("rejects clip totals that miss target duration tolerance", () => {
		const plan = {
			...validPlan(),
			target: { durationSec: 60, aspectRatio: "9:16" },
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan clip duration total is outside the target tolerance.",
			path: "target.durationSec",
		});
	});

	test("rejects captions that exceed the generated timeline", () => {
		const plan = validPlan();
		plan.captions = [
			{
				text: "This caption is outside the edited timeline.",
				startTime: 29,
				duration: 4,
			},
		];

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan caption exceeds the generated timeline duration.",
			path: "captions[0]",
		});
	});

	test("accepts captions with a required local captionStyle", () => {
		const result = validateEditPlan({
			plan: validPlan(),
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toMatchObject({
			success: true,
			normalizedPlan: {
				captionStyle: {
					preset: "short-form-bold",
					position: "lower-safe",
				},
			},
		});
	});

	test("accepts implemented caption style presets for different video types", () => {
		const presets = [
			"short-form-bold",
			"black-bar",
			"talking-head-pop",
			"tutorial-clean",
			"documentary-soft",
			"product-punch",
			"lifestyle-warm",
			"cinematic-serif",
		];

		expect(presets).toHaveLength(8);

		for (const preset of presets) {
			const result = validateEditPlan({
				plan: {
					...validPlan(),
					captionStyle: {
						preset,
						position: "lower-safe",
					},
				},
				projectId: "project-1",
				mediaAssets: [mediaAsset()],
			});

			expect(result.success).toBe(true);
		}
	});

	test("rejects captions without captionStyle", () => {
		const { captionStyle: _captionStyle, ...plan } = validPlan();

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan captions require captionStyle.",
			path: "captionStyle",
		});
	});

	test("rejects captionStyle without captions", () => {
		const { captions: _captions, ...plan } = validPlan();

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan captionStyle requires captions.",
			path: "captionStyle",
		});
	});

	test("rejects unsupported captionStyle preset", () => {
		const plan = {
			...validPlan(),
			captionStyle: {
				preset: "keyword-highlight",
				position: "lower-safe",
			},
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		const failure = expectValidationFailure(result);
		expect(failure).toMatchObject({
			success: false,
			path: "captionStyle.preset",
		});
		expect(failure.message).toContain("captionStyle.preset");
		expect(failure.message).toContain("keyword-highlight");
	});

	test("rejects bold_caption captionStyle preset", () => {
		const plan = {
			...validPlan(),
			captionStyle: {
				preset: "bold_caption",
				position: "lower-safe",
			},
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		const failure = expectValidationFailure(result);
		expect(failure).toMatchObject({
			success: false,
			path: "captionStyle.preset",
		});
		expect(failure.message).toContain("bold_caption");
	});

	test("rejects keyword_caption captionStyle preset", () => {
		const plan = {
			...validPlan(),
			captionStyle: {
				preset: "keyword_caption",
				position: "lower-safe",
			},
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		const failure = expectValidationFailure(result);
		expect(failure).toMatchObject({
			success: false,
			path: "captionStyle.preset",
		});
		expect(failure.message).toContain("keyword_caption");
	});

	test("rejects arbitrary caption style fields", () => {
		const plan = {
			...validPlan(),
			captionStyle: {
				preset: "short-form-bold",
				position: "lower-safe",
				css: "color: red",
			},
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		const failure = expectValidationFailure(result);
		expect(failure).toMatchObject({
			success: false,
			path: "captionStyle",
		});
		expect(failure.message).toContain("css");
	});

	test("rejects overlapping title richSpans", () => {
		const plan = {
			...validPlan(),
			title: {
				text: "Rich title",
				startTime: 0,
				duration: 3,
				richSpans: [
					{ start: 0, end: 4, color: "#ffd84d" },
					{ start: 3, end: 8, color: "#ffffff" },
				],
			},
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan title richSpans must be sorted and non-overlapping.",
			path: "title.richSpans",
		});
	});

	test("rejects per-caption stylePreset through the schema", () => {
		const plan = {
			...validPlan(),
			captions: [
				{
					text: "This caption tries to bypass the captionStyle contract.",
					startTime: 0,
					duration: 2,
					stylePreset: "lower_title",
				},
			],
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		const failure = expectValidationFailure(result);
		expect(failure).toMatchObject({
			success: false,
			path: "captions[0]",
		});
		expect(failure.message).toContain("stylePreset");
	});

	test("schema rejects per-caption stylePreset", () => {
		const plan = {
			...validPlan(),
			captions: [
				{
					text: "This caption should use the top-level captionStyle.",
					startTime: 0,
					duration: 2,
					stylePreset: "lower_title",
				},
			],
		};

		const result = EditPlanSchema.safeParse(plan);

		expect(result.success).toBe(false);
	});

	test("schema rejects top-level style objects", () => {
		const plan = {
			...validPlan(),
			style: {
				preset: "short-form-bold",
			},
		};

		const result = EditPlanSchema.safeParse(plan);

		expect(result.success).toBe(false);
	});

	test("schema rejects top-level css strings", () => {
		const plan = {
			...validPlan(),
			css: "font-size: 48px",
		};

		const result = EditPlanSchema.safeParse(plan);

		expect(result.success).toBe(false);
	});

	test("schema rejects per-caption style objects", () => {
		const plan = {
			...validPlan(),
			captions: [
				{
					text: "This caption should use the top-level captionStyle.",
					startTime: 0,
					duration: 2,
					style: {
						preset: "short-form-bold",
					},
				},
			],
		};

		const result = EditPlanSchema.safeParse(plan);

		expect(result.success).toBe(false);
	});

	test("schema rejects per-caption css strings", () => {
		const plan = {
			...validPlan(),
			captions: [
				{
					text: "This caption should use the top-level captionStyle.",
					startTime: 0,
					duration: 2,
					css: "font-size: 48px",
				},
			],
		};

		const result = EditPlanSchema.safeParse(plan);

		expect(result.success).toBe(false);
	});

	test("accepts imported audio assets and adjacent transitions", () => {
		const plan = {
			...validPlan(),
			audio: {
				bgm: {
					assetId: "audio-1",
					volume: 0.35,
					mode: "loop_to_timeline",
				},
				sfx: [{ assetId: "sfx-1", startTime: 0, volume: 0.8 }],
			},
			transitions: [
				{
					fromClipId: "clip-1",
					toClipId: "clip-2",
					type: "fade",
					duration: 0.5,
				},
			],
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [
				mediaAsset(),
				audioAsset(),
				audioAsset({ id: "sfx-1", name: "Hit.wav", duration: 1 }),
			],
		});

		expect(result).toMatchObject({
			success: true,
			normalizedPlan: {
				audio: {
					bgm: {
						assetId: "audio-1",
						volume: 0.35,
						mode: "loop_to_timeline",
					},
					sfx: [{ assetId: "sfx-1", startTime: 0, volume: 0.8 }],
				},
				transitions: [
					{
						fromClipId: "clip-1",
						toClipId: "clip-2",
						type: "fade",
						duration: 0.5,
					},
				],
			},
		});
	});

	test("rejects missing bgm audio assets", () => {
		const plan = {
			...validPlan(),
			audio: {
				bgm: {
					assetId: "missing-audio",
					volume: 0.35,
					mode: "loop_to_timeline",
				},
			},
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message:
				"EditPlan bgm assetId was not found in the project media library.",
			path: "audio.bgm.assetId",
		});
	});

	test("rejects bgm assets that are not audio", () => {
		const plan = {
			...validPlan(),
			audio: {
				bgm: {
					assetId: "media-1",
					volume: 0.35,
					mode: "loop_to_timeline",
				},
			},
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan bgm asset must be audio.",
			path: "audio.bgm.assetId",
		});
	});

	test("rejects sfx start times outside the generated timeline", () => {
		const plan = {
			...validPlan(),
			audio: {
				sfx: [{ assetId: "sfx-1", startTime: 31, volume: 0.8 }],
			},
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset(), audioAsset({ id: "sfx-1" })],
		});

		expect(result).toEqual({
			success: false,
			message:
				"EditPlan sfx startTime exceeds the generated timeline duration.",
			path: "audio.sfx[0].startTime",
		});
	});

	test("rejects sfx start times at the generated timeline end", () => {
		const plan = {
			...validPlan(),
			audio: {
				sfx: [{ assetId: "sfx-1", startTime: 30, volume: 0.8 }],
			},
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset(), audioAsset({ id: "sfx-1" })],
		});

		expect(result).toEqual({
			success: false,
			message:
				"EditPlan sfx startTime exceeds the generated timeline duration.",
			path: "audio.sfx[0].startTime",
		});
	});

	test("rejects transitions that reference missing clips", () => {
		const plan = {
			...validPlan(),
			transitions: [
				{
					fromClipId: "clip-1",
					toClipId: "missing-clip",
					type: "fade",
					duration: 0.5,
				},
			],
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan transition toClipId does not reference a clip.",
			path: "transitions[0].toClipId",
		});
	});

	test("rejects transitions between non-adjacent clips", () => {
		const plan = validPlan();
		plan.clips[1] = {
			...plan.clips[1],
			timelineStart: 18,
		};
		const planWithTransition = {
			...plan,
			target: {
				...plan.target,
				durationSec: 33,
			},
			transitions: [
				{
					fromClipId: "clip-1",
					toClipId: "clip-2",
					type: "fade",
					duration: 0.5,
				},
			],
		};

		const result = validateEditPlan({
			plan: planWithTransition,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan transition clips must be adjacent on the timeline.",
			path: "transitions[0]",
		});
	});

	test("rejects transitions across a 0.05 second timeline gap", () => {
		const plan = validPlan();
		plan.target = { ...plan.target, durationSec: 20 };
		plan.clips[0] = {
			...plan.clips[0],
			sourceStart: 10,
			sourceEnd: 15,
			timelineStart: 0,
		};
		plan.clips[1] = {
			...plan.clips[1],
			timelineStart: 5.05,
		};
		const planWithTransition = {
			...plan,
			transitions: [
				{
					fromClipId: "clip-1",
					toClipId: "clip-2",
					type: "fade",
					duration: 0.5,
				},
			],
		};

		const result = validateEditPlan({
			plan: planWithTransition,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan transition clips must be adjacent on the timeline.",
			path: "transitions[0]",
		});
	});

	test("rejects duplicate clip ids", () => {
		const plan = validPlan();
		plan.clips[1] = {
			...plan.clips[1],
			id: "clip-1",
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan clip ids must be unique.",
			path: "clips[1].id",
		});
	});

	test("rejects transition durations longer than neighboring clips", () => {
		const plan = {
			...validPlan(),
			transitions: [
				{
					fromClipId: "clip-1",
					toClipId: "clip-2",
					type: "fade",
					duration: 16,
				},
			],
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message:
				"EditPlan transition duration exceeds neighboring clip duration.",
			path: "transitions[0].duration",
		});
	});
});
