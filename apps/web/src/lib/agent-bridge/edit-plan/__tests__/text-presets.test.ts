import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, test } from "bun:test";
import {
	buildCanvasFont,
	scaleBoxWidth,
} from "@/services/renderer/nodes/text-node";
import { createTextLayout } from "@/services/renderer/nodes/text-layout";
import { CODECUT_CJK_FONT_FAMILY } from "@/lib/codecut-fonts";
import type { EditPlanCaptionStyle } from "../schema";
import { resolveCaptionStylePreset } from "../text-presets";

const verticalCanvas = {
	width: 1080,
	height: 1920,
};

const horizontalCanvas = {
	width: 1920,
	height: 1080,
};

const CODECUT_YAN_BO_SONG_FONT_FAMILY = "CodecutYanBoSong";
const CODECUT_WEN_KAI_FONT_FAMILY = "CodecutWenKai";
const CODECUT_SMILEY_SANS_FONT_FAMILY = "CodecutSmileySans";

const implementedCaptionPresets: EditPlanCaptionStyle["preset"][] = [
	"creator-clean" as EditPlanCaptionStyle["preset"],
	"short-form-bold",
	"black-bar",
	"talking-head-pop",
	"tutorial-clean",
	"documentary-soft",
	"property-clean-yellow",
	"product-punch",
	"lifestyle-warm",
	"cinematic-serif",
	"social-highlight" as EditPlanCaptionStyle["preset"],
	"comment-bubble" as EditPlanCaptionStyle["preset"],
	"minimal-reel" as EditPlanCaptionStyle["preset"],
];

function layoutPresetCaption({
	content,
	preset,
	aspectRatio = "9:16",
	canvasSize = verticalCanvas,
}: {
	content: string;
	preset: EditPlanCaptionStyle["preset"];
	aspectRatio?: "9:16" | "16:9" | "1:1";
	canvasSize?: { width: number; height: number };
}) {
	const canvas = createCanvas(canvasSize.width, canvasSize.height);
	const context = canvas.getContext("2d");
	const raw = resolveCaptionStylePreset({
		captionStyle: { preset, position: "lower-safe", size: "medium" },
		aspectRatio,
	});
	if (raw.fontSize === undefined) {
		throw new Error("Caption preset must define fontSize.");
	}
	const scaledFontSize = raw.fontSize * (canvasSize.height / 90);
	const scaledBoxWidth =
		raw.boxWidth === undefined
			? undefined
			: scaleBoxWidth({
					boxWidth: raw.boxWidth,
					canvasHeight: canvasSize.height,
				});
	const layout = createTextLayout({
		content,
		richSpans: [],
		maxWidth: scaledBoxWidth,
		measureText: (text, style) => {
			context.font = buildCanvasFont({
				fontStyle: "normal",
				fontWeight: raw.fontWeight ?? "normal",
				fontSize: scaledFontSize * (style.fontScale ?? 1),
				fontFamily: raw.fontFamily ?? "Arial",
			});
			return context.measureText(text).width;
		},
	});

	return { raw, scaledFontSize, layout };
}

function captionCanvasBounds({
	content,
	preset,
	aspectRatio,
	canvasSize,
}: {
	content: string;
	preset: EditPlanCaptionStyle["preset"];
	aspectRatio: "9:16" | "16:9" | "1:1";
	canvasSize: { width: number; height: number };
}) {
	const { raw, scaledFontSize, layout } = layoutPresetCaption({
		content,
		preset,
		aspectRatio,
		canvasSize,
	});
	const totalHeight = layout.lines.length * scaledFontSize * 1.3;
	const centerY = canvasSize.height / 2 + (raw.transform?.position.y ?? 0);
	return {
		lines: layout.lines.map((line) =>
			line.runs.map((run) => run.text).join(""),
		),
		minY: centerY - totalHeight / 2,
		maxY: centerY + totalHeight / 2,
	};
}

describe("caption style presets", () => {
	test("talking-head-pop keeps Chinese subtitles in a conventional lower-third two-line box", () => {
		const { raw, layout } = layoutPresetCaption({
			content: "如果你和公司坐在一张桌子上",
			preset: "talking-head-pop",
		});
		const lines = layout.lines.map((line) =>
			line.runs.map((run) => run.text).join(""),
		);
		const captionBottomY =
			verticalCanvas.height / 2 + (raw.transform?.position.y ?? 0);

		expect(lines.length).toBeLessThanOrEqual(2);
		expect(lines.at(-1)?.length).toBeGreaterThan(1);
		expect(captionBottomY).toBeGreaterThanOrEqual(1440);
		expect(captionBottomY).toBeLessThanOrEqual(1600);
	});

	test("talking-head-pop keeps common Chinese opinion captions out of three-line layouts", () => {
		const samples = [
			"你连议价权都没有",
			"平台越大你输得越惨",
			"你在平台上认识的资源是冲着平台来的",
			"另一种是掌握客户资产、口碑和经验",
			"不能做成漂亮履历的项目不是项目",
		];

		for (const content of samples) {
			const { layout } = layoutPresetCaption({
				content,
				preset: "talking-head-pop",
			});
			const lines = layout.lines.map((line) =>
				line.runs.map((run) => run.text).join(""),
			);
			const lastLineLength = Array.from(lines.at(-1) ?? "").length;

			expect(lines.length, content).toBeLessThanOrEqual(2);
			expect(lastLineLength, content).toBeGreaterThan(2);
		}
	});

	test("all caption presets keep Chinese subtitles in a conventional lower-third layout", () => {
		expect(implementedCaptionPresets).toHaveLength(13);

		for (const preset of implementedCaptionPresets) {
			const { raw, scaledFontSize, layout } = layoutPresetCaption({
				content: "如果你和公司坐在一张桌子上",
				preset,
			});
			const lines = layout.lines.map((line) =>
				line.runs.map((run) => run.text).join(""),
			);
			const captionBottomY =
				verticalCanvas.height / 2 + (raw.transform?.position.y ?? 0);

			expect({ preset, lines }).toEqual({
				preset,
				lines: expect.arrayContaining([expect.any(String)]),
			});
			expect(lines.length, `${preset} line count`).toBeLessThanOrEqual(2);
			expect(lines.at(-1)?.length, `${preset} orphan line`).toBeGreaterThan(1);
			expect(
				captionBottomY,
				`${preset} lower-third bottom`,
			).toBeGreaterThanOrEqual(1440);
			expect(
				captionBottomY,
				`${preset} lower-third bottom`,
			).toBeLessThanOrEqual(1600);
			expect(scaledFontSize, `${preset} scaled font size`).toBeLessThanOrEqual(
				128,
			);
		}
	});

	test("all caption presets use controlled local renderer font families", () => {
		const controlledFontFamilies = new Set([
			CODECUT_CJK_FONT_FAMILY,
			CODECUT_SMILEY_SANS_FONT_FAMILY,
			CODECUT_WEN_KAI_FONT_FAMILY,
			CODECUT_YAN_BO_SONG_FONT_FAMILY,
		]);

		for (const preset of implementedCaptionPresets) {
			const raw = resolveCaptionStylePreset({
				captionStyle: { preset, position: "lower-safe", size: "medium" },
				aspectRatio: "9:16",
			});

			expect(controlledFontFamilies.has(raw.fontFamily ?? ""), preset).toBe(
				true,
			);
		}
	});

	test("creator-clean is the default polished Chinese caption treatment", () => {
		const creatorClean = resolveCaptionStylePreset({
			captionStyle: {
				preset: "creator-clean" as EditPlanCaptionStyle["preset"],
				position: "lower-safe",
				size: "medium",
			},
			aspectRatio: "9:16",
		});

		expect(creatorClean).toMatchObject({
			fontFamily: CODECUT_YAN_BO_SONG_FONT_FAMILY,
			fontSize: 5.2,
			fontWeight: "normal",
			color: "#ffffff",
			backgroundColor: "transparent",
			shadow: { color: "rgba(0,0,0,0.42)", offsetX: 0, offsetY: 2, blur: 6 },
			boxWidth: 44,
			transform: {
				scale: 1,
				position: { x: 0, y: 520 },
				rotate: 0,
			},
		});
		expect(creatorClean.stroke).toBeUndefined();
	});

	test("talking-head-pop lower-safe captions stay inside a horizontal 1080p canvas", () => {
		const bounds = captionCanvasBounds({
			content:
				"This is the exact kind of long interview subtitle that used to sit below the canvas.",
			preset: "talking-head-pop",
			aspectRatio: "16:9",
			canvasSize: horizontalCanvas,
		});

		expect(bounds.lines.length).toBeGreaterThan(1);
		expect(bounds.minY).toBeGreaterThanOrEqual(0);
		expect(bounds.maxY).toBeLessThanOrEqual(horizontalCanvas.height);
	});

	test("social media caption presets provide distinct readable treatments", () => {
		const socialHighlight = resolveCaptionStylePreset({
			captionStyle: {
				preset: "social-highlight" as EditPlanCaptionStyle["preset"],
				position: "lower-safe",
				size: "medium",
			},
			aspectRatio: "9:16",
		});
		const commentBubble = resolveCaptionStylePreset({
			captionStyle: {
				preset: "comment-bubble" as EditPlanCaptionStyle["preset"],
				position: "lower-safe",
				size: "medium",
			},
			aspectRatio: "9:16",
		});
		const minimalReel = resolveCaptionStylePreset({
			captionStyle: {
				preset: "minimal-reel" as EditPlanCaptionStyle["preset"],
				position: "lower-safe",
				size: "medium",
			},
			aspectRatio: "9:16",
		});

		expect(socialHighlight).toMatchObject({
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 5.6,
			fontWeight: "bold",
			color: "#ffffff",
			backgroundColor: "#2563eb",
			backgroundOpacity: 0.86,
			backgroundBorderRadius: 10,
		});
		expect(commentBubble).toMatchObject({
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 5.2,
			fontWeight: "bold",
			color: "#111827",
			backgroundColor: "#ffffff",
			backgroundOpacity: 0.92,
			backgroundBorderRadius: 12,
		});
		expect(minimalReel).toMatchObject({
			fontFamily: CODECUT_SMILEY_SANS_FONT_FAMILY,
			fontSize: 4.6,
			fontWeight: "normal",
			color: "#f8fafc",
			backgroundColor: "transparent",
		});
	});

	test("real estate clean yellow preset keeps yellow captions readable without product-punch footprint", () => {
		const raw = resolveCaptionStylePreset({
			captionStyle: {
				preset: "property-clean-yellow",
				position: "lower-safe",
				size: "medium",
			},
			aspectRatio: "9:16",
		});

		expect(raw).toMatchObject({
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 4.8,
			fontWeight: "bold",
			color: "#ffe45c",
			backgroundColor: "transparent",
			stroke: { color: "#111111", width: 2 },
		});
		expect(raw.shadow).toEqual({
			color: "#000000",
			offsetX: 0,
			offsetY: 2,
			blur: 4,
		});
	});

	test("marketing product-punch preset is capped for 9:16 exports", () => {
		const raw = resolveCaptionStylePreset({
			captionStyle: {
				preset: "product-punch",
				position: "lower-safe",
				size: "medium",
			},
			aspectRatio: "9:16",
		});
		const fontPx = (raw.fontSize ?? 0) * (verticalCanvas.height / 90);
		const strokePx = (raw.stroke?.width ?? 0) * 2;

		expect(fontPx).toBeLessThanOrEqual(111);
		expect(strokePx).toBeLessThanOrEqual(6);
	});

	test("property clean yellow medium preset uses a compact 9:16 footprint", () => {
		const raw = resolveCaptionStylePreset({
			captionStyle: {
				preset: "property-clean-yellow",
				position: "lower-safe",
				size: "medium",
			},
			aspectRatio: "9:16",
		});
		const fontPx = (raw.fontSize ?? 0) * (verticalCanvas.height / 90);
		const strokePx = (raw.stroke?.width ?? 0) * 2;

		expect(fontPx).toBeGreaterThanOrEqual(101);
		expect(fontPx).toBeLessThanOrEqual(103);
		expect(strokePx).toBe(4);
	});

	test("caption size changes only the controlled font multiplier", () => {
		const small = resolveCaptionStylePreset({
			captionStyle: {
				preset: "property-clean-yellow",
				position: "lower-safe",
				size: "small",
				motionPreset: "soft-reveal",
			},
			aspectRatio: "9:16",
		});
		const medium = resolveCaptionStylePreset({
			captionStyle: {
				preset: "property-clean-yellow",
				position: "lower-safe",
				size: "medium",
				motionPreset: "soft-reveal",
			},
			aspectRatio: "9:16",
		});
		const large = resolveCaptionStylePreset({
			captionStyle: {
				preset: "property-clean-yellow",
				position: "lower-safe",
				size: "large",
				motionPreset: "soft-reveal",
			},
			aspectRatio: "9:16",
		});

		expect(small.fontSize).toBeCloseTo(4.32);
		expect(medium.fontSize).toBe(4.8);
		expect(large.fontSize).toBeCloseTo(5.28);
		expect(small.color).toBe(medium.color);
		expect(large.color).toBe(medium.color);
		expect(small.stroke).toEqual(medium.stroke);
		expect(large.transform).toEqual(medium.transform);
	});
});
