import { describe, expect, test } from "bun:test";
import {
	CODECUT_CJK_FONT_FAMILY,
	resolveCodecutCjkFontPaths,
	registerCodecutCjkFont,
} from "../codecut-cjk-font";

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
});
