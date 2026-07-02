import { describe, expect, test } from "bun:test";
import { resolveLayoutSlotRect } from "../visual-node";

describe("resolveLayoutSlotRect", () => {
	test("maps normalized split-screen slots to canvas pixels", () => {
		expect(
			resolveLayoutSlotRect({
				layoutSlot: {
					x: 0,
					y: 0,
					width: 1,
					height: 0.45,
					cropMode: "cover-slot",
				},
				canvasWidth: 1080,
				canvasHeight: 1920,
			}),
		).toEqual({
			x: 0,
			y: 0,
			width: 1080,
			height: 864,
		});
	});

	test("rejects slots outside the canvas", () => {
		expect(() =>
			resolveLayoutSlotRect({
				layoutSlot: {
					x: 0,
					y: 0.8,
					width: 1,
					height: 0.45,
					cropMode: "cover-slot",
				},
				canvasWidth: 1080,
				canvasHeight: 1920,
			}),
		).toThrow("Timeline layoutSlot must be a valid cover-slot rectangle.");
	});
});
