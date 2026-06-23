import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, test } from "bun:test";
import { CanvasRenderer } from "../../canvas-renderer";
import type { RendererCanvas } from "../../runtime";
import { buildCanvasFont, TextNode } from "../text-node";

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
});
