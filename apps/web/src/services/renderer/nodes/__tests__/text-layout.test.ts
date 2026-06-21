import { describe, expect, test } from "bun:test";
import {
	createTextLayout,
	sanitizeTextRichSpansForContent,
	validateTextRichSpans,
} from "../text-layout";

function measureText(text: string) {
	return text.length;
}

function measureTextWithScale(
	text: string,
	style: { fontScale?: number },
) {
	return text.length * (style.fontScale ?? 1);
}

describe("text rich span layout", () => {
	test("returns one plain run when richSpans is empty", () => {
		const layout = createTextLayout({
			content: "hello",
			richSpans: [],
			maxWidth: undefined,
			measureText,
		});

		expect(layout.lines).toEqual([
			{
				width: 5,
				runs: [{ text: "hello", style: {} }],
			},
		]);
	});

	test("applies span style to the matching code point range", () => {
		const layout = createTextLayout({
			content: "资源不等于能力",
			richSpans: [
				{
					start: 0,
					end: 2,
					color: "#ffd84d",
					fontScale: 1.2,
					fontWeight: "bold",
					stroke: { color: "#000000", width: 2 },
				},
			],
			maxWidth: undefined,
			measureText,
		});

		expect(layout.lines[0].runs).toEqual([
			{
				text: "资源",
				style: {
					color: "#ffd84d",
					fontScale: 1.2,
					fontWeight: "bold",
					stroke: { color: "#000000", width: 2 },
				},
			},
			{
				text: "不等于能力",
				style: {},
			},
		]);
	});

	test("keeps rich span style when wrapping into multiple lines", () => {
		const layout = createTextLayout({
			content: "abcd",
			richSpans: [{ start: 1, end: 3, color: "#ff0000" }],
			maxWidth: 2,
			measureText,
		});

		expect(layout.lines).toEqual([
			{
				width: 2,
				runs: [
					{ text: "a", style: {} },
					{ text: "b", style: { color: "#ff0000" } },
				],
			},
			{
				width: 2,
				runs: [
					{ text: "c", style: { color: "#ff0000" } },
					{ text: "d", style: {} },
				],
			},
		]);
	});

	test("rejects overlapping spans", () => {
		expect(() =>
			validateTextRichSpans({
				content: "abcd",
				richSpans: [
					{ start: 0, end: 2, color: "#ff0000" },
					{ start: 1, end: 3, color: "#00ff00" },
				],
			}),
		).toThrow("Text rich spans must be sorted and non-overlapping.");
	});

	test("wraps lines using rich span fontScale width", () => {
		const layout = createTextLayout({
			content: "ab",
			richSpans: [{ start: 0, end: 1, fontScale: 2 }],
			maxWidth: 2,
			measureText: measureTextWithScale,
		});

		expect(layout.lines).toEqual([
			{
				width: 2,
				runs: [{ text: "a", style: { fontScale: 2 } }],
			},
			{
				width: 1,
				runs: [{ text: "b", style: {} }],
			},
		]);
	});

	test("sanitizes spans when content becomes shorter", () => {
		const result = sanitizeTextRichSpansForContent({
			content: "ab",
			richSpans: [
				{ start: 0, end: 1, color: "#ff0000" },
				{ start: 2, end: 4, color: "#00ff00" },
			],
		});

		expect(result).toEqual([{ start: 0, end: 1, color: "#ff0000" }]);
	});
});
