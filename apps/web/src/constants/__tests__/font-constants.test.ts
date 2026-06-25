import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
	FONT_OPTIONS,
	getFontByValue,
	getFontOptionsForText,
	resolveFontFamily,
} from "../font-constants";

const rootDir = resolve(import.meta.dir, "../../../../..");
const proxyPath = resolve(rootDir, "apps/web/src/proxy.ts");

describe("FONT_OPTIONS", () => {
	test("includes curated social caption fonts for English and Chinese content", () => {
		const englishFonts = ["Inter", "Poppins", "Montserrat", "Roboto", "Oswald"];
		const chineseFonts = [
			"CodecutYanBoSong",
			"CodecutWenKai",
			"CodecutSmileySans",
			"Noto Sans SC",
			"Noto Serif SC",
			"LXGW WenKai",
			"Smiley Sans",
			"ZCOOL KuaiLe",
		];

		expect(englishFonts).toHaveLength(5);
		expect(chineseFonts).toHaveLength(8);

		for (const font of [...englishFonts, ...chineseFonts]) {
			expect(getFontByValue(font)).toBeDefined();
		}
	});

	test("keeps font values unique for stable editor serialization", () => {
		const values = FONT_OPTIONS.map((font) => font.value);
		expect(new Set(values).size).toBe(values.length);
	});

	test("disables Latin-only fonts for pure Chinese text", () => {
		const options = getFontOptionsForText({ content: "中国人" });
		const roboto = options.find((font) => font.value === "Roboto");
		const notoSans = options.find((font) => font.value === "Noto Sans SC");

		expect(roboto?.disabled).toBe(true);
		expect(notoSans?.disabled).toBe(false);
		expect(options[0].value).toBe("CodecutYanBoSong");
	});

	test("keeps Latin fonts enabled for mixed text", () => {
		const options = getFontOptionsForText({ content: "China 中国" });
		const roboto = options.find((font) => font.value === "Roboto");

		expect(roboto?.disabled).toBe(false);
		expect(options[0].value).toBe("Arial");
	});

	test("resolves CJK font values to browser-renderable fallback stacks", () => {
		expect(resolveFontFamily({ fontFamily: "CodecutYanBoSong" })).toContain(
			"CodecutYanBoSong",
		);
		expect(resolveFontFamily({ fontFamily: "CodecutWenKai" })).toContain(
			"CodecutWenKai",
		);
		expect(resolveFontFamily({ fontFamily: "CodecutSmileySans" })).toContain(
			"CodecutSmileySans",
		);
		expect(resolveFontFamily({ fontFamily: "Noto Serif SC" })).toContain(
			"Songti SC",
		);
		expect(
			resolveFontFamily({ fontFamily: "Roboto", content: "中国人" }),
		).toContain("PingFang SC");
	});

	test("ships local CJK fonts through the public asset route", () => {
		const localFonts = [
			"MaoKenWangYanBoSong-M.ttf",
			"LXGWWenKai-Regular.ttf",
			"SmileySans-Oblique.ttf",
		];

		for (const fileName of localFonts) {
			const assetPath = resolve(
				rootDir,
				`apps/web/public/fonts/codecut-cjk/${fileName}`,
			);
			expect(existsSync(assetPath)).toBe(true);
			expect(statSync(assetPath).size).toBeGreaterThan(0);
		}

		const proxy = readFileSync(proxyPath, "utf8");
		expect(proxy).toContain("fonts");
	});
});
