import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, test } from "bun:test";
import { CanvasRenderer } from "../../canvas-renderer";
import type { RendererCanvas } from "../../runtime";
import {
	buildCanvasFont,
	measureTextElementBounds,
	TextNode,
} from "../text-node";
import type { TextElement } from "@/types/timeline";

function createTextRenderer({
	onEnsureFontFamily,
}: {
	onEnsureFontFamily: (fontFamily: string) => void;
}): CanvasRenderer {
	return new CanvasRenderer({
		width: 200,
		height: 200,
		fps: 30,
		runtime: {
			createCanvas: ({ width, height }) =>
				createCanvas(width, height) as unknown as RendererCanvas,
			loadImage: async () => {
				throw new Error("not used");
			},
			loadSticker: async () => {
				throw new Error("not used");
			},
			getFrameAt: async () => null,
			ensureFontFamily: async ({ fontFamily }: { fontFamily: string }) => {
				onEnsureFontFamily(fontFamily);
			},
		},
	});
}

function textElement(overrides: Partial<TextElement> = {}): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "Text",
		content: "中国人",
		richSpans: [],
		fontSize: 24,
		fontFamily: "Noto Sans SC",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
		startTime: 0,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function measureCjkGlyphs({
	font,
	text,
}: {
	font: string;
	text: string;
}): number {
	const fontSize = Number(font.match(/\s(\d+(?:\.\d+)?)px\s/)?.[1]);
	return Array.from(text).length * fontSize;
}

describe("buildCanvasFont", () => {
	test("quotes font families with spaces for canvas rendering", () => {
		expect(
			buildCanvasFont({
				fontStyle: "normal",
				fontWeight: "bold",
				fontSize: 48,
				fontFamily: "Noto Serif SC",
			}),
		).toBe('normal bold 48px "Noto Serif SC"');
	});

	test("keeps single-token font families unquoted", () => {
		expect(
			buildCanvasFont({
				fontStyle: "italic",
				fontWeight: "normal",
				fontSize: 36,
				fontFamily: "Inter",
			}),
		).toBe("italic normal 36px Inter");
	});

	test("asks the renderer runtime to ensure the text font before layout", async () => {
		const ensuredFontFamilies: string[] = [];
		const node = new TextNode({
			id: "text-1",
			type: "text",
			name: "Text",
			content: "你好",
			richSpans: [],
			fontSize: 24,
			fontFamily: "CodecutCJK",
			color: "#ffffff",
			backgroundColor: "transparent",
			textAlign: "center",
			fontWeight: "bold",
			fontStyle: "normal",
			textDecoration: "none",
			transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
			opacity: 1,
			startTime: 0,
			duration: 2,
			trimStart: 0,
			trimEnd: 0,
			canvasCenter: { x: 100, y: 100 },
			canvasHeight: 200,
		});

		await node.render({
			renderer: createTextRenderer({
				onEnsureFontFamily: (fontFamily) => {
					ensuredFontFamilies.push(fontFamily);
				},
			}),
			time: 0,
		});

		expect(ensuredFontFamilies).toEqual(["CodecutCJK"]);
	});

	test("measures CJK text bounds with the same text metrics used for rendering", () => {
		const bounds = measureTextElementBounds({
			element: textElement(),
			canvasHeight: 90,
			measureText: measureCjkGlyphs,
		});

		expect(bounds.width).toBe(72);
		expect(bounds.leftOffset).toBe(-36);
	});

	test("includes visible text background padding in bounds", () => {
		const bounds = measureTextElementBounds({
			element: textElement({
				content: "中",
				backgroundColor: "#ffffff",
			}),
			canvasHeight: 90,
			measureText: measureCjkGlyphs,
			includeBackground: true,
		});

		expect(bounds.width).toBeCloseTo(47.2);
		expect(bounds.height).toBeCloseTo(39.2);
		expect(bounds.leftOffset).toBeCloseTo(-23.6);
	});
});
