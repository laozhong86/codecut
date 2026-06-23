import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, test } from "bun:test";
import {
	buildCanvasFont,
	scaleBoxWidth,
} from "@/services/renderer/nodes/text-node";
import { createTextLayout } from "@/services/renderer/nodes/text-layout";
import { resolveCaptionStylePreset } from "../text-presets";

const verticalCanvas = {
	width: 1080,
	height: 1920,
};

function layoutPresetCaption({ content }: { content: string }) {
	const canvas = createCanvas(verticalCanvas.width, verticalCanvas.height);
	const context = canvas.getContext("2d");
	const raw = resolveCaptionStylePreset({
		captionStyle: { preset: "talking-head-pop", position: "lower-safe" },
		aspectRatio: "9:16",
	});
	if (raw.fontSize === undefined) {
		throw new Error("Caption preset must define fontSize.");
	}
	const scaledFontSize = raw.fontSize * (verticalCanvas.height / 90);
	const scaledBoxWidth =
		raw.boxWidth === undefined
			? undefined
			: scaleBoxWidth({
					boxWidth: raw.boxWidth,
					canvasHeight: verticalCanvas.height,
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

	return { raw, layout };
}

describe("caption style presets", () => {
	test("talking-head-pop keeps Chinese subtitles in a conventional lower-third two-line box", () => {
		const { raw, layout } = layoutPresetCaption({
			content: "如果你和公司坐在一张桌子上",
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
});
