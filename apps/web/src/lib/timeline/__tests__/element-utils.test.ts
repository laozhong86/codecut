import { describe, expect, test } from "bun:test";
import { buildTextElement } from "../element-utils";

describe("buildTextElement", () => {
	test("preserves caption box background fields", () => {
		const element = buildTextElement({
			raw: {
				content: "Readable caption",
				duration: 2,
				boxWidth: 42,
				backgroundColor: "#000000",
				backgroundOpacity: 0.78,
				backgroundPaddingX: 24,
				backgroundPaddingY: 12,
				backgroundBorderRadius: 8,
			},
			startTime: 1,
		});

		expect(element).toMatchObject({
			type: "text",
			content: "Readable caption",
			startTime: 1,
			duration: 2,
			boxWidth: 42,
			backgroundColor: "#000000",
			backgroundOpacity: 0.78,
			backgroundPaddingX: 24,
			backgroundPaddingY: 12,
			backgroundBorderRadius: 8,
		});
	});
});
