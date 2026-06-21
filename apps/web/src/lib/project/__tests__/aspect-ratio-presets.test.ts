import { describe, expect, test } from "bun:test";
import {
	getCanvasSizeForAspectRatioPreset,
	getProjectAspectRatioPreset,
	getProjectAspectRatioValue,
} from "../aspect-ratio-presets";

describe("project aspect ratio presets", () => {
	test("maps social aspect ratio presets to explicit canvas sizes", () => {
		expect(getProjectAspectRatioPreset({ value: "16:9" })).toMatchObject({
			value: "16:9",
			canvasSize: { width: 1920, height: 1080 },
		});
		expect(getProjectAspectRatioPreset({ value: "9:16" })).toMatchObject({
			value: "9:16",
			canvasSize: { width: 1080, height: 1920 },
		});
		expect(getProjectAspectRatioPreset({ value: "1:1" })).toMatchObject({
			value: "1:1",
			canvasSize: { width: 1080, height: 1080 },
		});
	});

	test("requires original canvas size when selecting original", () => {
		expect(() =>
			getCanvasSizeForAspectRatioPreset({ value: "original" }),
		).toThrow("Original canvas size is not available.");

		expect(
			getCanvasSizeForAspectRatioPreset({
				value: "original",
				originalCanvasSize: { width: 1440, height: 1080 },
			}),
		).toEqual({ width: 1440, height: 1080 });
	});

	test("resolves the current canvas size to original, preset, or custom", () => {
		expect(
			getProjectAspectRatioValue({
				canvasSize: { width: 1440, height: 1080 },
				originalCanvasSize: { width: 1440, height: 1080 },
			}),
		).toBe("original");

		expect(
			getProjectAspectRatioValue({
				canvasSize: { width: 1080, height: 1920 },
				originalCanvasSize: { width: 1440, height: 1080 },
			}),
		).toBe("9:16");

		expect(
			getProjectAspectRatioValue({
				canvasSize: { width: 1200, height: 1600 },
				originalCanvasSize: { width: 1440, height: 1080 },
			}),
		).toBe("custom");
	});

	test("fails fast for unknown preset values", () => {
		expect(() =>
			getCanvasSizeForAspectRatioPreset({
				value: "5.8 inch" as never,
				originalCanvasSize: { width: 1440, height: 1080 },
			}),
		).toThrow("Unsupported aspect ratio preset: 5.8 inch");
	});
});
