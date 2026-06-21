import { describe, expect, test } from "bun:test";
import { buildCanvasFont } from "../text-node";

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
});
