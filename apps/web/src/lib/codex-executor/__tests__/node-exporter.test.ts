import { describe, expect, test } from "bun:test";
import { rgbaToI420 } from "../node-exporter";

describe("node exporter", () => {
	test("converts RGBA canvas pixels to I420 video samples", () => {
		const rgba = new Uint8ClampedArray([
			255, 0, 0, 255,
			0, 255, 0, 255,
			0, 0, 255, 255,
			255, 255, 255, 255,
		]);

		const i420 = rgbaToI420({ rgba, width: 2, height: 2 });

		expect(i420).toHaveLength(6);
		expect(Array.from(i420.slice(0, 4))).toEqual([82, 145, 41, 235]);
		expect(i420[4]).toBe(128);
		expect(i420[5]).toBe(128);
	});
});
