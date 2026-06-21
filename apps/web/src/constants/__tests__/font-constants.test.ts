import { describe, expect, test } from "bun:test";
import { FONT_OPTIONS, getFontByValue } from "../font-constants";

describe("FONT_OPTIONS", () => {
	test("includes curated social caption fonts for English and Chinese content", () => {
		const englishFonts = ["Inter", "Poppins", "Montserrat", "Roboto", "Oswald"];
		const chineseFonts = [
			"Noto Sans SC",
			"Noto Serif SC",
			"LXGW WenKai",
			"Smiley Sans",
			"ZCOOL KuaiLe",
		];

		expect(englishFonts).toHaveLength(5);
		expect(chineseFonts).toHaveLength(5);

		for (const font of [...englishFonts, ...chineseFonts]) {
			expect(getFontByValue(font)).toBeDefined();
		}
	});

	test("keeps font values unique for stable editor serialization", () => {
		const values = FONT_OPTIONS.map((font) => font.value);
		expect(new Set(values).size).toBe(values.length);
	});
});
