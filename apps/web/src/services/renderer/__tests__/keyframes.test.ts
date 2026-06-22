import { describe, expect, test } from "bun:test";
import { applyVisualKeyframes } from "../keyframes";

const baseTransform = {
	scale: 1,
	position: { x: 0, y: 0 },
	rotate: 0,
};

describe("applyVisualKeyframes", () => {
	test("evaluates scalar and position keyframes at element-local time", () => {
		const result = applyVisualKeyframes({
			transform: baseTransform,
			opacity: 1,
			keyframes: {
				opacity: [
					{ time: 0, value: 1 },
					{ time: 2, value: 0, interpolation: "linear" },
				],
				"transform.position": [
					{ time: 0, value: { x: 0, y: 0 } },
					{ time: 2, value: { x: 100, y: 50 } },
				],
				"transform.scale": [
					{ time: 0, value: 1 },
					{ time: 2, value: 2 },
				],
				"transform.rotate": [
					{ time: 0, value: 0 },
					{ time: 2, value: 90 },
				],
			},
			localTime: 1,
		});

		expect(result.opacity).toBe(0.5);
		expect(result.transform.position).toEqual({ x: 50, y: 25 });
		expect(result.transform.scale).toBe(1.5);
		expect(result.transform.rotate).toBe(45);
	});

	test("holds values when the outgoing keyframe requests hold interpolation", () => {
		const result = applyVisualKeyframes({
			transform: baseTransform,
			opacity: 1,
			keyframes: {
				opacity: [
					{ time: 0, value: 1, interpolation: "hold" },
					{ time: 2, value: 0 },
				],
			},
			localTime: 1,
		});

		expect(result.opacity).toBe(1);
	});

	test("uses endpoint values outside the keyed range", () => {
		expect(
			applyVisualKeyframes({
				transform: baseTransform,
				opacity: 0.4,
				keyframes: {
					opacity: [
						{ time: 1, value: 0.2 },
						{ time: 2, value: 0.8 },
					],
				},
				localTime: 0,
			}).opacity,
		).toBe(0.2);

		expect(
			applyVisualKeyframes({
				transform: baseTransform,
				opacity: 0.4,
				keyframes: {
					opacity: [
						{ time: 1, value: 0.2 },
						{ time: 2, value: 0.8 },
					],
				},
				localTime: 3,
			}).opacity,
		).toBe(0.8);
	});
});
