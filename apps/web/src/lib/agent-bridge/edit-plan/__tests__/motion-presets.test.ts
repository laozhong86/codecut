import { describe, expect, test } from "bun:test";
import { resolveTextMotionPreset } from "../motion-presets";

const baseTransform = {
	scale: 1,
	position: { x: 0, y: -420 },
	rotate: 0,
};

describe("resolveTextMotionPreset", () => {
	test("resolves slam-in to fast opacity, scale, and position entrance", () => {
		expect(
			resolveTextMotionPreset({
				preset: "slam-in",
				duration: 1.2,
				baseTransform,
			}),
		).toEqual({
			motionPreset: "slam-in",
			keyframes: {
				opacity: [
					{ time: 0, value: 0, interpolation: "ease-out" },
					{ time: 0.12, value: 1, interpolation: "linear" },
					{ time: 1.2, value: 1 },
				],
				"transform.scale": [
					{ time: 0, value: 0.86, interpolation: "ease-out" },
					{ time: 0.18, value: 1.08, interpolation: "ease-in-out" },
					{ time: 0.32, value: 1, interpolation: "linear" },
					{ time: 1.2, value: 1 },
				],
				"transform.position": [
					{
						time: 0,
						value: { x: 0, y: -366 },
						interpolation: "ease-out",
					},
					{
						time: 0.32,
						value: { x: 0, y: -420 },
						interpolation: "linear",
					},
					{ time: 1.2, value: { x: 0, y: -420 } },
				],
			},
		});
	});

	test("resolves soft-reveal to slower opacity and vertical reveal", () => {
		const result = resolveTextMotionPreset({
			preset: "soft-reveal",
			duration: 2,
			baseTransform,
		});

		expect(result.motionPreset).toBe("soft-reveal");
		expect(result.keyframes.opacity).toEqual([
			{ time: 0, value: 0, interpolation: "ease-out" },
			{ time: 0.55, value: 1, interpolation: "linear" },
			{ time: 2, value: 1 },
		]);
		expect(result.keyframes["transform.position"]).toEqual([
			{
				time: 0,
				value: { x: 0, y: -390 },
				interpolation: "ease-out",
			},
			{
				time: 0.55,
				value: { x: 0, y: -420 },
				interpolation: "linear",
			},
			{ time: 2, value: { x: 0, y: -420 } },
		]);
	});

	test("resolves pop-bounce to compact pop emphasis", () => {
		const result = resolveTextMotionPreset({
			preset: "pop-bounce",
			duration: 0.8,
			baseTransform,
		});

		expect(result.motionPreset).toBe("pop-bounce");
		expect(result.keyframes["transform.scale"]).toEqual([
			{ time: 0, value: 0.92, interpolation: "ease-out" },
			{ time: 0.14, value: 1.12, interpolation: "ease-in-out" },
			{ time: 0.26, value: 0.98, interpolation: "ease-in-out" },
			{ time: 0.38, value: 1, interpolation: "linear" },
			{ time: 0.8, value: 1 },
		]);
	});

	test("rejects text motion shorter than the readable motion minimum", () => {
		expect(() =>
			resolveTextMotionPreset({
				preset: "slam-in",
				duration: 0.49,
				baseTransform,
			}),
		).toThrow("EditPlan text motion requires at least 0.5s duration.");
	});
});
