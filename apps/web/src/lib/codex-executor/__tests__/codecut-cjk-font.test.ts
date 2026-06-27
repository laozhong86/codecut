import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	CODECUT_CJK_FONT_FAMILY,
	CODECUT_FONTSOURCE_FONTS,
	resolveCodecutCjkFontPaths,
	resolveCodecutFontFamilyPaths,
	registerCodecutCjkFont,
} from "../codecut-cjk-font";
import * as codecutFontModule from "../codecut-cjk-font";

describe("Codecut CJK font registration", () => {
	test("uses the explicit CJK font path from environment", () => {
		expect(
			resolveCodecutCjkFontPaths({
				env: {
					CODECUT_CJK_FONT_PATH: "/fonts/runtime-cjk.ttc",
				},
			}),
		).toEqual(["/fonts/runtime-cjk.ttc"]);
	});

	test("registers the first available candidate path with the Codecut CJK family", () => {
		const calls: Array<{ path: string; family: string }> = [];

		const result = registerCodecutCjkFont({
			fontPaths: ["/missing/one.ttc", "/fonts/cjk.ttc", "/fonts/other.ttc"],
			existsSync: (path) => path === "/fonts/cjk.ttc",
			globalFonts: {
				has: () => false,
				registerFromPath: (path, family) => {
					calls.push({ path, family });
					return {};
				},
			},
		});

		expect(result).toEqual({
			family: CODECUT_CJK_FONT_FAMILY,
			fontPath: "/fonts/cjk.ttc",
			registered: true,
		});
		expect(calls).toEqual([
			{ path: "/fonts/cjk.ttc", family: CODECUT_CJK_FONT_FAMILY },
		]);
	});

	test("does not register again when the Codecut CJK family already exists", () => {
		const result = registerCodecutCjkFont({
			fontPaths: ["/fonts/cjk.ttc"],
			existsSync: () => true,
			globalFonts: {
				has: () => true,
				registerFromPath: () => {
					throw new Error("must not register twice");
				},
			},
		});

		expect(result).toEqual({
			family: CODECUT_CJK_FONT_FAMILY,
			registered: false,
			reason: "already_registered",
		});
	});

	test("fails clearly when no CJK font candidate exists", () => {
		expect(() =>
			registerCodecutCjkFont({
				fontPaths: ["/missing/one.ttc", "/missing/two.ttc"],
				existsSync: () => false,
				globalFonts: {
					has: () => false,
					registerFromPath: () => {
						throw new Error("must not register missing fonts");
					},
				},
			}),
		).toThrow(
			"Codecut node renderer requires a CJK font for CodecutCJK.",
		);
	});

	test("registers an explicit curated Codecut caption font family", () => {
		const calls: Array<{ path: string; family: string }> = [];
		const registerCodecutFontFamily = (
			codecutFontModule as unknown as {
				registerCodecutFontFamily?: (input: {
					fontFamily: string;
					fontPaths?: readonly string[];
					existsSync: (path: string) => boolean;
					globalFonts: {
						has(family: string): boolean;
						registerFromPath(path: string, family: string): unknown;
					};
				}) => unknown;
			}
		).registerCodecutFontFamily;

		expect(registerCodecutFontFamily).toBeDefined();
		const result = registerCodecutFontFamily?.({
			fontFamily: "CodecutYanBoSong",
			existsSync: (path) => path.endsWith("MaoKenWangYanBoSong-M.ttf"),
			globalFonts: {
				has: () => false,
				registerFromPath: (path, family) => {
					calls.push({ path, family });
					return {};
				},
			},
		});

		expect(result).toMatchObject({
			family: "CodecutYanBoSong",
			fontPath: expect.stringContaining("MaoKenWangYanBoSong-M.ttf"),
			registered: true,
		});
		expect(calls).toEqual([
			{
				path: expect.stringContaining("MaoKenWangYanBoSong-M.ttf"),
				family: "CodecutYanBoSong",
			},
		]);
	});

	test("resolves and registers fontsource migration font families", () => {
		const inter = CODECUT_FONTSOURCE_FONTS.find(
			(font) => font.family === "Inter",
		);
		expect(inter).toBeDefined();
		if (!inter) {
			throw new Error("Missing Inter fontsource manifest entry");
		}
		const paths = resolveCodecutFontFamilyPaths({
			fontFamily: "Inter",
			cwd: "/repo",
		});

		expect(paths).toEqual([
			join(
				"/repo",
				"apps/web/node_modules",
				inter.packageName,
				"files",
				inter.fileName,
			),
			join(
				"/repo",
				"node_modules",
				inter.packageName,
				"files",
				inter.fileName,
			),
			join(
				"/repo",
				"apps/web/node_modules",
				inter.packageName,
				"files",
				"inter-latin-700-normal.woff2",
			),
			join(
				"/repo",
				"node_modules",
				inter.packageName,
				"files",
				"inter-latin-700-normal.woff2",
			),
		]);

		const calls: Array<{ path: string; family: string }> = [];
		const result = codecutFontModule.registerCodecutFontFamily({
			fontFamily: "Inter",
			existsSync: (path) =>
				path.includes("inter-latin-400-normal.woff2") ||
				path.includes("inter-latin-700-normal.woff2"),
			globalFonts: {
				has: () => false,
				registerFromPath: (path, family) => {
					calls.push({ path, family });
					return {};
				},
			},
		});

		expect(result).toMatchObject({
			family: "Inter",
			fontPath: expect.stringContaining("inter-latin-400-normal.woff2"),
			registered: true,
		});
		expect(calls).toEqual([
			{
				path: expect.stringContaining("inter-latin-400-normal.woff2"),
				family: "Inter",
			},
			{
				path: expect.stringContaining("inter-latin-700-normal.woff2"),
				family: "Inter",
			},
		]);
	});

	test("registers forced fontsource files even when the family exists globally", () => {
		const calls: Array<{ path: string; family: string }> = [];
		const result = codecutFontModule.registerCodecutFontFamily({
			fontFamily: "Inter",
			force: true,
			existsSync: (path) =>
				path.includes("inter-latin-400-normal.woff2") ||
				path.includes("inter-latin-700-normal.woff2"),
			globalFonts: {
				has: () => true,
				registerFromPath: (path, family) => {
					calls.push({ path, family });
					return {};
				},
			},
		});

		expect(result).toMatchObject({
			family: "Inter",
			fontPath: expect.stringContaining("inter-latin-400-normal.woff2"),
			registered: true,
		});
		expect(calls).toEqual([
			{
				path: expect.stringContaining("inter-latin-400-normal.woff2"),
				family: "Inter",
			},
			{
				path: expect.stringContaining("inter-latin-700-normal.woff2"),
				family: "Inter",
			},
		]);
	});

	test("fails clearly when a fontsource migration font is missing", () => {
		expect(() =>
			codecutFontModule.registerCodecutFontFamily({
				fontFamily: "Inter",
				fontPaths: ["/missing/inter.woff2"],
				existsSync: () => false,
				globalFonts: {
					has: () => false,
					registerFromPath: () => {
						throw new Error("must not register missing fonts");
					},
				},
			}),
		).toThrow("Codecut node renderer requires a registered font file for Inter.");
	});

	test("fails clearly for unknown curated Codecut caption font families", () => {
		const registerCodecutFontFamily = (
			codecutFontModule as unknown as {
				registerCodecutFontFamily?: (input: {
					fontFamily: string;
					fontPaths?: readonly string[];
					existsSync: (path: string) => boolean;
					globalFonts: {
						has(family: string): boolean;
						registerFromPath(path: string, family: string): unknown;
					};
				}) => unknown;
			}
		).registerCodecutFontFamily;

		expect(() =>
			registerCodecutFontFamily?.({
				fontFamily: "UnlistedFont",
				fontPaths: ["/fonts/unlisted.ttf"],
				existsSync: () => true,
				globalFonts: {
					has: () => false,
					registerFromPath: () => {
						throw new Error("must not register unknown fonts");
					},
				},
			}),
		).toThrow("Unsupported Codecut caption font family: UnlistedFont.");
	});
});
