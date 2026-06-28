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
			source: "edited_timeline_audio",
			trace: [
				{
					mediaId: "narration-1",
					timelineStart: 0,
					sourceStart: 0,
					sourceEnd: 30,
					captionCount: 2,
				},
			],
		},
		rationale: "Uses existing narration over muted B-roll.",
	};
}

const validAssets = [
	mediaAsset(),
	mediaAsset({ id: "video-2", name: "B-roll 2.mp4" }),
	audioAsset(),
];

function validTextOverlay(overrides: Record<string, unknown> = {}) {
	return {
		name: "Overlay",
		text: "Readable overlay",
		startTime: 0,
		duration: 3,
		fontSize: 4.8,
		color: "#ffffff",
		boxWidth: 52,
		position: { x: 0, y: -240 },
		textAlign: "center",
		fontWeight: "bold",
		...overrides,
	};
}

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

	test("rejects a plan that shortens a preserve-source duration contract", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				target: { durationSec: 16.8, aspectRatio: "9:16" },
				visualBeats: [
					{
						id: "beat-1",
						mediaId: "video-1",
						sourceStart: 0,
						sourceEnd: 16.8,
						timelineStart: 0,
						muted: true,
						reason: "Compressed source video.",
					},
				],
				narration: { mediaId: "narration-1", sourceStart: 0 },
				captions: [{ text: "Compressed cut", startTime: 0, duration: 3 }],
			},
			projectId: "project-1",
			mediaAssets: [
				mediaAsset({ duration: 28.866667 }),
				audioAsset({ duration: 16.8 }),
			],
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "selected_segments",
				sourceDurationSeconds: 28.866667,
				toleranceSeconds: 0.2,
			},
		});

		expect(result).toMatchObject({
			success: false,
			message: "NarratedRemixPlan violates preserve_source duration contract.",
			path: "target.durationSec",
		});
	});

	test("rejects a full-source contract when visual beats skip source ranges", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				target: { durationSec: 28.866667, aspectRatio: "9:16" },
				visualBeats: [
					{
						id: "beat-1",
						mediaId: "video-1",
						sourceStart: 0,
						sourceEnd: 12,
						timelineStart: 0,
						muted: true,
						reason: "Opening source range.",
					},
					{
						id: "beat-2",
						mediaId: "video-1",
						sourceStart: 20,
						sourceEnd: 36.866667,
						timelineStart: 12,
						muted: true,
						reason: "Skipped middle source range.",
					},
				],
				narration: { mediaId: "narration-1", sourceStart: 0 },
			},
			projectId: "project-1",
			mediaAssets: [
				mediaAsset({ duration: 60 }),
				audioAsset({ duration: 28.866667 }),
			],
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
				toleranceSeconds: 0.2,
			},
		});

		expect(result).toMatchObject({
			success: false,
			message: "NarratedRemixPlan violates full_source coverage contract.",
			path: "visualBeats",
		});
	});

	test("accepts full-source coverage when visual beats cover the source continuously", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				target: { durationSec: 28.866667, aspectRatio: "9:16" },
				visualBeats: [
					{
						id: "beat-1",
						mediaId: "video-1",
						sourceStart: 0,
						sourceEnd: 12,
						timelineStart: 0,
						muted: true,
						reason: "Opening source range.",
					},
					{
						id: "beat-2",
						mediaId: "video-1",
						sourceStart: 12,
						sourceEnd: 28.866667,
						timelineStart: 12,
						muted: true,
						reason: "Closing source range.",
					},
				],
				narration: { mediaId: "narration-1", sourceStart: 0 },
			},
			projectId: "project-1",
			mediaAssets: [
				mediaAsset({ duration: 28.866667 }),
				audioAsset({ duration: 28.866667 }),
			],
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
				toleranceSeconds: 0.2,
			},
		});

		expect(result.success).toBe(true);
	});

	test("accepts narration that is shorter than a preserve-source timeline", () => {
		const result = validateNarratedRemixPlan({
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
			mediaAssets: [
				mediaAsset({ duration: 28.866667 }),
				audioAsset({ duration: 28.8 }),
			],
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
				toleranceSeconds: 0.25,
			},
		});

		expect(result.success).toBe(true);
	});

	test("accepts explicitly offset narration inside the target timeline", () => {
		const result = validateNarratedRemixPlan({
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
			mediaAssets: [
				mediaAsset({ duration: 28.866667 }),
				audioAsset({ duration: 20 }),
			],
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
				toleranceSeconds: 0.25,
			},
		});

		expect(result.success).toBe(true);
	});

	test("normalizes overlong narrated remix captions into readable chunks", () => {
		const result = validateNarratedRemixPlan({
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
				captions: [
					{
						text: "Bosuya 遮盖梳，是更轻的替代方案。",
						startTime: 11.9,
						duration: 4.2,
					},
					{
						text: "包装、刷头、100% 植物萃取补可信度。",
						startTime: 16.1,
						duration: 4.5,
					},
				],
				captionStyle: {
					preset: "talking-head-pop",
					position: "lower-safe",
					size: "medium",
				},
				captionSource: {
					type: "post-cut-audio",
					tool: "build-post-cut-captions",
					source: "edited_timeline_audio",
					trace: [
						{
							mediaId: "narration-1",
							timelineStart: 0,
							sourceStart: 0,
							sourceEnd: 28.866667,
							captionCount: 2,
						},
					],
				},
			},
			projectId: "project-1",
			mediaAssets: [
				mediaAsset({ duration: 28.866667 }),
				audioAsset({ duration: 28.866667 }),
			],
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
				toleranceSeconds: 0.25,
			},
		});

		expect(result.success).toBe(true);
		if (!result.success) throw new Error(result.message);
		expect(result.normalizedPlan.captions.length).toBeGreaterThan(2);
		expect(
			result.normalizedPlan.captions.every((caption) => caption.duration <= 4),
		).toBe(true);
	});

	test("accepts visual beats with multiple independent text overlays", () => {
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
						reason: "Property image with explicit editable overlays.",
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
				textOverlays: [
					{
						name: "Property title",
						text: "天府新区双华麓港",
						startTime: 0,
						duration: 10,
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
						startTime: 0,
						duration: 10,
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
						startTime: 0,
						duration: 10,
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
			},
			projectId: "project-1",
			mediaAssets: [imageAsset(), mediaAsset({ id: "video-2" }), audioAsset()],
		});

		expect(result.success).toBe(true);
		if (!result.success) throw new Error(result.message);
		expect(result.normalizedPlan.visualBeats[0]).toMatchObject({
			mediaType: "image",
			mediaId: "image-1",
		});
		expect(result.normalizedPlan.textOverlays).toMatchObject([
			{ name: "Property title", text: "天府新区双华麓港" },
			{ name: "Property info", text: "117.55㎡ 套三双卫 总价186万" },
			{ name: "Property selling point", text: "地铁口商圈边" },
		]);
	});

	test("accepts independent text overlays during a video beat", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				target: { durationSec: 30, aspectRatio: "9:16" },
				visualBeats: [
					{
						mediaType: "image",
						id: "property-visual",
						mediaId: "image-1",
						timelineStart: 0,
						duration: 10,
						fit: "cover",
						reason: "Plain image B-roll.",
					},
					{
						id: "beat-2",
						mediaId: "video-2",
						sourceStart: 12,
						sourceEnd: 32,
						timelineStart: 10,
						muted: true,
						reason: "Video beat.",
					},
				],
				textOverlays: [
					{
						name: "Video beat callout",
						text: "这段文字不绑定图片",
						startTime: 12,
						duration: 4,
						fontSize: 4.8,
						color: "#ffffff",
						boxWidth: 52,
						position: { x: 0, y: -240 },
						textAlign: "center",
						fontWeight: "bold",
					},
				],
			},
			projectId: "project-1",
			mediaAssets: [imageAsset(), mediaAsset({ id: "video-2" }), audioAsset()],
		});

		expect(result.success).toBe(true);
		if (!result.success) throw new Error(result.message);
		expect(result.normalizedPlan.textOverlays).toMatchObject([
			{
				name: "Video beat callout",
				startTime: 12,
				duration: 4,
			},
		]);
	});

	test("accepts image beats and separately timed text overlays", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				target: { durationSec: 30, aspectRatio: "9:16" },
				visualBeats: [
					{
						mediaType: "image",
						id: "property-visual",
						mediaId: "image-1",
						timelineStart: 0,
						duration: 10,
						fit: "cover",
						reason: "Image B-roll with separately timed text overlay.",
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
				textOverlays: [
					{
						name: "Property price",
						text: "117.55㎡ 套三双卫 总价186万",
						startTime: 0,
						duration: 10,
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
			},
			projectId: "project-1",
			mediaAssets: [imageAsset(), mediaAsset({ id: "video-2" }), audioAsset()],
		});

		expect(result.success).toBe(true);
		if (!result.success) throw new Error(result.message);
		expect(result.normalizedPlan.visualBeats[0]).toMatchObject({
			mediaType: "image",
			mediaId: "image-1",
		});
		expect(result.normalizedPlan.textOverlays).toMatchObject([
			{
				name: "Property price",
				text: "117.55㎡ 套三双卫 总价186万",
				startTime: 0,
				duration: 10,
				position: { x: 0, y: -710 },
			},
		]);
	});

	test("accepts plain image beats without text overlays", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				target: { durationSec: 30, aspectRatio: "9:16" },
				visualBeats: [
					{
						mediaType: "image",
						id: "image-broll",
						mediaId: "image-1",
						timelineStart: 0,
						duration: 10,
						fit: "cover",
						reason: "Plain image B-roll with no extra on-screen text.",
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
			duration: 10,
		});
	});

	test("rejects text overlays beyond target duration", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				textOverlays: [
					{
						name: "Late overlay",
						text: "Too late",
						startTime: 29,
						duration: 2,
						fontSize: 4.8,
						color: "#ffffff",
						boxWidth: 52,
						position: { x: 0, y: -240 },
						textAlign: "center",
						fontWeight: "bold",
					},
				],
			},
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan textOverlay exceeds target duration.",
			path: "textOverlays[0]",
		});
	});

	test("rejects invalid text overlay color hex values", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				textOverlays: [validTextOverlay({ color: "#12345" })],
			},
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan schema is invalid.",
			path: "textOverlays[0].color",
		});
	});

	test("rejects renderer-hostile text overlay geometry", () => {
		for (const [field, overlay] of [
			["fontSize", validTextOverlay({ fontSize: 39 })],
			["boxWidth", validTextOverlay({ boxWidth: 101 })],
			["position.x", validTextOverlay({ position: { x: 961, y: -240 } })],
			["backgroundPaddingX", validTextOverlay({ backgroundPaddingX: 101 })],
		] as const) {
			const result = validateNarratedRemixPlan({
				plan: {
					...validPlan(),
					textOverlays: [overlay],
				},
				projectId: "project-1",
				mediaAssets: validAssets,
			});

			expect(result).toEqual({
				success: false,
				message: "NarratedRemixPlan schema is invalid.",
				path: `textOverlays[0].${field}`,
			});
		}
	});

	test("rejects background styling without a background color", () => {
		const result = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				textOverlays: [validTextOverlay({ backgroundOpacity: 0.5 })],
			},
			projectId: "project-1",
			mediaAssets: validAssets,
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan schema is invalid.",
			path: "textOverlays[0].backgroundColor",
		});
	});

	test("rejects excessive text overlays and overlong overlay text", () => {
		const tooManyOverlays = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				textOverlays: Array.from({ length: 25 }, (_, index) =>
					validTextOverlay({ name: `Overlay ${index}` }),
				),
			},
			projectId: "project-1",
			mediaAssets: validAssets,
		});
		expect(tooManyOverlays).toEqual({
			success: false,
			message: "NarratedRemixPlan schema is invalid.",
			path: "textOverlays",
		});

		const overlongText = validateNarratedRemixPlan({
			plan: {
				...validPlan(),
				textOverlays: [validTextOverlay({ text: "字".repeat(241) })],
			},
			projectId: "project-1",
			mediaAssets: validAssets,
		});
		expect(overlongText).toEqual({
			success: false,
			message: "NarratedRemixPlan schema is invalid.",
			path: "textOverlays[0].text",
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

	test("rejects image beats that reference video assets", () => {
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
						reason: "Image beat pointing at the wrong media type.",
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

	test("rejects text overlays missing text", () => {
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
						reason: "Image B-roll.",
					},
				],
				textOverlays: [
					{
						name: "Property info",
						text: "",
						startTime: 0,
						duration: 30,
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
			},
			projectId: "project-1",
			mediaAssets: [imageAsset(), audioAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "NarratedRemixPlan schema is invalid.",
			path: "textOverlays[0].text",
		});
	});

	test("accepts generic image beats outside 9:16", () => {
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
						reason: "Plain widescreen image B-roll.",
					},
				],
			},
			projectId: "project-1",
			mediaAssets: [imageAsset(), audioAsset()],
		});

		expect(result.success).toBe(true);
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
