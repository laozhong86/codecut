import { describe, expect, test } from "bun:test";
import type { TextElement } from "@/types/timeline";
import { getElementHalfSize } from "../element-bounds";

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

describe("getElementHalfSize", () => {
	test("uses measured text layout for CJK text bounds", () => {
		const size = getElementHalfSize({
			element: textElement(),
			transform: { scale: 2, position: { x: 0, y: 0 }, rotate: 0 },
			mediaMap: new Map(),
			canvasWidth: 160,
			canvasHeight: 90,
			measureText: measureCjkGlyphs,
		});

		expect(size?.halfWidth).toBeCloseTo(72);
		expect(size?.halfHeight).toBeCloseTo(31.2);
	});

	test("fails fast when text bounds are measured without a text measurer", () => {
		expect(() =>
			getElementHalfSize({
				element: textElement(),
				transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
				mediaMap: new Map(),
				canvasWidth: 160,
				canvasHeight: 90,
			}),
		).toThrow("Text element bounds require a text measurement function.");
	});
});
