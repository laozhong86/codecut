import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { CODECUT_FONTSOURCE_FONTS } from "@/lib/codecut-fonts";
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
		const englishFonts = [
			"Inter",
			"Montserrat",
			"Outfit",
			"Oswald",
			"Archivo Black",
			"League Gothic",
			"Space Mono",
			"JetBrains Mono",
			"Playfair Display",
			"Poppins",
			"Roboto",
		];
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

		expect(englishFonts).toHaveLength(11);
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

	test("tracks fontsource migration fonts with license, source, checksum, and files", () => {
		const expectedFamilies = [
			"Inter",
			"Montserrat",
			"Outfit",
			"Oswald",
			"Archivo Black",
			"League Gothic",
			"Space Mono",
			"JetBrains Mono",
			"Playfair Display",
			"Poppins",
		];
		const families = CODECUT_FONTSOURCE_FONTS.map((font) => font.family);

		expect(families).toEqual(expectedFamilies);
		expect(new Set(families).size).toBe(families.length);

		let checkedFileCount = 0;
		for (const font of CODECUT_FONTSOURCE_FONTS) {
			expect(font.license).toBe("OFL-1.1");
			expect(font.sourceUrl).toStartWith("https://fontsource.org/fonts/");
			expect(font.sha256).toMatch(/^[a-f0-9]{64}$/);

			const files = [
				{ fileName: font.fileName, sha256: font.sha256 },
				...(font.additionalFiles ?? []),
			];
			for (const file of files) {
				expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
				const assetCandidates = [
					resolve(
						rootDir,
						"apps/web/node_modules",
						font.packageName,
						"files",
						file.fileName,
					),
					resolve(rootDir, "node_modules", font.packageName, "files", file.fileName),
				];
				const assetPath = assetCandidates.find((candidate) =>
					existsSync(candidate),
				);
				expect(
					assetPath !== undefined,
					`${font.family}:${file.fileName}`,
				).toBe(true);
				if (!assetPath) {
					throw new Error(`Missing fontsource asset: ${assetCandidates.join(", ")}`);
				}
				const buffer = readFileSync(assetPath);
				expect(buffer.length, `${font.family}:${file.fileName}`).toBeGreaterThan(
					0,
				);
				expect(createHash("sha256").update(buffer).digest("hex")).toBe(
					file.sha256,
				);
				checkedFileCount += 1;
			}
		}
		expect(checkedFileCount).toBe(18);
	});
});
