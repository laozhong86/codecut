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
			size: "medium",
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

	test("accepts an introCover image before the first video clip", () => {
		const plan = structuredClone(validPlan());
		plan.target.durationSec = 31.2;
		plan.introCover = {
			mediaId: "cover-1",
			duration: 1.2,
			fit: "cover",
			reason: "Opening image generated from the selected first frame.",
		};
		plan.clips = plan.clips.map((clip) => ({
			...clip,
			timelineStart: clip.timelineStart + 1.2,
		}));
		plan.title = undefined;
		plan.captions = undefined;
		plan.captionStyle = undefined;

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset(), imageAsset()],
		});

		expect(result).toMatchObject({
			success: true,
			normalizedPlan: {
				introCover: {
					mediaId: "cover-1",
					duration: 1.2,
					fit: "cover",
				},
			},
		});
	});

	test("rejects introCover when the image asset is missing", () => {
		const plan = structuredClone(validPlan());
		plan.target.durationSec = 31.2;
		plan.introCover = {
			mediaId: "missing-cover",
			duration: 1.2,
			fit: "cover",
			reason: "Generated cover should lead the edit.",
		};
		plan.clips = plan.clips.map((clip) => ({
			...clip,
			timelineStart: clip.timelineStart + 1.2,
		}));

		expect(
			validateEditPlan({
				plan,
				projectId: "project-1",
				mediaAssets: [mediaAsset()],
			}),
		).toEqual({
			success: false,
			message:
				"EditPlan introCover mediaId was not found in the project media library.",
			path: "introCover.mediaId",
		});
	});

	test("rejects introCover when the media asset is not an image", () => {
		const plan = structuredClone(validPlan());
		plan.target.durationSec = 31.2;
		plan.introCover = {
			mediaId: "media-1",
			duration: 1.2,
			fit: "cover",
			reason: "Generated cover should lead the edit.",
		};
		plan.clips = plan.clips.map((clip) => ({
			...clip,
			timelineStart: clip.timelineStart + 1.2,
		}));

		expect(
			validateEditPlan({
				plan,
				projectId: "project-1",
				mediaAssets: [mediaAsset()],
			}),
		).toEqual({
			success: false,
			message: "EditPlan introCover media asset must be image.",
			path: "introCover.mediaId",
		});
	});

	test("rejects introCover image assets without dimensions", () => {
		const plan = structuredClone(validPlan());
		plan.target.durationSec = 31.2;
		plan.introCover = {
			mediaId: "cover-1",
			duration: 1.2,
			fit: "cover",
			reason: "Generated cover should lead the edit.",
		};
		plan.clips = plan.clips.map((clip) => ({
			...clip,
			timelineStart: clip.timelineStart + 1.2,
		}));

		expect(
			validateEditPlan({
				plan,
				projectId: "project-1",
				mediaAssets: [mediaAsset(), imageAsset({ width: undefined })],
			}),
		).toEqual({
			success: false,
			message: "EditPlan introCover image dimensions are required.",
			path: "introCover.mediaId",
		});
	});

	test("rejects introCover when the first clip does not start after the cover", () => {
		const plan = structuredClone(validPlan());
		plan.target.durationSec = 31.2;
		plan.introCover = {
			mediaId: "cover-1",
			duration: 1.2,
			fit: "cover",
			reason: "Generated cover should lead the edit.",
		};

		expect(
			validateEditPlan({
				plan,
				projectId: "project-1",
				mediaAssets: [mediaAsset(), imageAsset()],
			}),
		).toEqual({
			success: false,
			message:
				"EditPlan first clip must start exactly after introCover duration.",
			path: "clips[0].timelineStart",
		});
	});

	test("counts introCover duration in target duration validation", () => {
		const plan = structuredClone(validPlan());
		plan.introCover = {
			mediaId: "cover-1",
			duration: 8,
			fit: "cover",
			reason: "Generated cover should lead the edit.",
		};
		plan.clips = plan.clips.map((clip) => ({
			...clip,
			timelineStart: clip.timelineStart + 8,
		}));

		expect(
			validateEditPlan({
				plan,
				projectId: "project-1",
				mediaAssets: [mediaAsset(), imageAsset()],
			}),
		).toEqual({
			success: false,
			message: "EditPlan clip duration total is outside the target tolerance.",
			path: "target.durationSec",
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

	test("accepts matching-ratio sourceCrop clips for video source media", () => {
		const plan = structuredClone(validPlan());
		plan.clips[0] = {
			...plan.clips[0],
			sourceCrop: { x: 690, y: 0, width: 540, height: 960 },
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.normalizedPlan.clips[0]?.sourceCrop).toEqual({
			x: 690,
			y: 0,
			width: 540,
			height: 960,
		});
	});

	test("accepts sourceCrop aspect mismatch only when cover-to-canvas is explicit", () => {
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

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.normalizedPlan.clips[0]?.sourceCrop?.fit).toBe(
			"cover-to-canvas",
		);
	});

	test("rejects sourceCrop for audio source media", () => {
		const plan = {
			...validPlan(),
			sourceMediaId: "audio-1",
			clips: [
				{
					id: "clip-1",
					sourceStart: 0,
					sourceEnd: 30,
					timelineStart: 0,
					sourceCrop: { x: 0, y: 0, width: 540, height: 960 },
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
			message: "EditPlan sourceCrop requires video source media.",
			path: "clips[0].sourceCrop",
		});
	});

	test("rejects sourceCrop outside source dimensions", () => {
		const plan = structuredClone(validPlan());
		plan.clips[0] = {
			...plan.clips[0],
			sourceCrop: { x: 1600, y: 0, width: 540, height: 960 },
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message:
				"EditPlan sourceCrop rectangle must stay within source media dimensions.",
			path: "clips[0].sourceCrop",
		});
	});

	test("rejects sourceCrop with non-positive dimensions", () => {
		const plan = structuredClone(validPlan());
		plan.clips[0] = {
			...plan.clips[0],
			sourceCrop: { x: 690, y: 0, width: 0, height: 960 },
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan sourceCrop width and height must be positive.",
			path: "clips[0].sourceCrop",
		});
	});

	test("rejects sourceCrop aspect mismatch without cover-to-canvas", () => {
		const plan = structuredClone(validPlan());
		plan.clips[0] = {
			...plan.clips[0],
			sourceCrop: { x: 0, y: 0, width: 1280, height: 720 },
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message:
				"EditPlan sourceCrop aspect ratio must match target.aspectRatio or set sourceCrop.fit to cover-to-canvas.",
			path: "clips[0].sourceCrop",
		});
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
					size: "medium",
				},
			},
		});
	});

	test("rejects captions below the readable duration contract", () => {
		const plan = validPlan();
		plan.captions = [
			{
				text: "Too fast",
				startTime: 0,
				duration: 0.25,
			},
		];

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan caption duration is below the readable minimum.",
			path: "captions[0].duration",
		});
	});

	test("rejects overlapping captions before mutation", () => {
		const plan = validPlan();
		plan.captions = [
			{ text: "First", startTime: 0, duration: 1 },
			{ text: "Second", startTime: 0.9, duration: 1 },
		];

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan captions must not overlap.",
			path: "captions[1].startTime",
		});
	});

	test("accepts implemented caption style presets for different video types", () => {
		const presets = [
			"short-form-bold",
			"creator-clean",
			"black-bar",
			"talking-head-pop",
			"tutorial-clean",
			"documentary-soft",
			"property-clean-yellow",
			"product-punch",
			"lifestyle-warm",
			"cinematic-serif",
			"social-highlight",
			"comment-bubble",
			"minimal-reel",
		];

		expect(presets).toHaveLength(13);

		for (const preset of presets) {
			const result = validateEditPlan({
				plan: {
					...validPlan(),
					captionStyle: {
						preset,
						position: "lower-safe",
						size: "medium",
					},
				},
				projectId: "project-1",
				mediaAssets: [mediaAsset()],
			});

			expect(result.success).toBe(true);
		}
	});

	test("accepts implemented short-form title style presets", () => {
		const presets = [
			"hook_title",
			"lower_title",
			"social_hook",
			"product_badge",
			"chapter_bumper",
		];

		expect(presets).toHaveLength(5);

		for (const preset of presets) {
			const result = validateEditPlan({
				plan: {
					...validPlan(),
					title: {
						text: "Stop scrolling",
						startTime: 0,
						duration: 2,
						stylePreset: preset,
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
				size: "medium",
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
				size: "medium",
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
				size: "medium",
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

	test("rejects captionStyle without explicit size", () => {
		const plan = {
			...validPlan(),
			captionStyle: {
				preset: "short-form-bold",
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
			path: "captionStyle.size",
		});
	});

	test("rejects unsupported captionStyle size", () => {
		const plan = {
			...validPlan(),
			captionStyle: {
				preset: "short-form-bold",
				position: "lower-safe",
				size: "x-large",
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
			path: "captionStyle.size",
		});
		expect(failure.message).toContain("x-large");
	});

	test("rejects arbitrary caption style fields", () => {
		const plan = {
			...validPlan(),
			captionStyle: {
				preset: "short-form-bold",
				position: "lower-safe",
				size: "medium",
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

	test("rejects arbitrary caption font fields", () => {
		const plan = {
			...validPlan(),
			captionStyle: {
				preset: "short-form-bold",
				position: "lower-safe",
				size: "medium",
				fontFamily: "Inter",
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
		expect(failure.message).toContain("fontFamily");
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

	test("accepts migration transition presets as native transitions", () => {
		const transitionTypes = [
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
				...validPlan(),
				transitions: [
					{
						fromClipId: "clip-1",
						toClipId: "clip-2",
						type,
						duration: 0.4,
					},
				],
			};

			const result = validateEditPlan({
				plan,
				projectId: "project-1",
				mediaAssets: [mediaAsset()],
			});

			expect(result.success, type).toBe(true);
		}
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

	test("accepts title and caption text motion presets", () => {
		const plan = structuredClone(validPlan());
		plan.title = {
			text: "Stop scrolling",
			startTime: 0,
			duration: 1.2,
			stylePreset: "social_hook",
			motionPreset: "slam-in",
		};
		plan.captionStyle = {
			preset: "product-punch",
			position: "lower-safe",
			size: "medium",
			motionPreset: "pop-bounce",
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toMatchObject({
			success: true,
			normalizedPlan: {
				title: {
					motionPreset: "slam-in",
				},
				captionStyle: {
					motionPreset: "pop-bounce",
				},
			},
		});
	});

	test("rejects unsupported text motion presets", () => {
		const plan = {
			...validPlan(),
			title: {
				text: "Stop scrolling",
				startTime: 0,
				duration: 1.2,
				motionPreset: "random-css-slide",
			},
		};

		const result = expectValidationFailure(
			validateEditPlan({
				plan,
				projectId: "project-1",
				mediaAssets: [mediaAsset()],
			}),
		);

		expect(result.path).toBe("title.motionPreset");
	});

	test("rejects captionStyle motionPreset when captions are omitted", () => {
		const plan = validPlan();
		plan.captions = undefined;
		plan.captionStyle = {
			preset: "product-punch",
			position: "lower-safe",
			size: "medium",
			motionPreset: "pop-bounce",
		};

		expect(
			validateEditPlan({
				plan,
				projectId: "project-1",
				mediaAssets: [mediaAsset()],
			}),
		).toEqual({
			success: false,
			message: "EditPlan captionStyle requires captions.",
			path: "captionStyle",
		});
	});

	test("rejects title motion when title duration is below the motion minimum", () => {
		const plan = validPlan();
		plan.title = {
			text: "Too fast",
			startTime: 0,
			duration: 0.49,
			motionPreset: "slam-in",
		};

		expect(
			validateEditPlan({
				plan,
				projectId: "project-1",
				mediaAssets: [mediaAsset()],
			}),
		).toEqual({
			success: false,
			message: "EditPlan text motion requires at least 0.5s duration.",
			path: "title.motionPreset",
		});
	});
});
