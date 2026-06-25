import { describe, expect, test } from "bun:test";
import type { TextElement } from "@/types/timeline";
import {
	getVisualKeyframeTimes,
	hasVisualKeyframeAtTime,
	setVisualPositionAxisKeyframeValue,
	toggleVisualKeyframe,
} from "../keyframe-values";

function textElement(overrides: Partial<TextElement> = {}): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "Title",
		content: "Animated",
		richSpans: [],
		fontSize: 48,
		fontFamily: "Inter",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		transform: { scale: 1, position: { x: 10, y: 20 }, rotate: 0 },
		opacity: 0.75,
		startTime: 1,
		duration: 4,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

describe("visual keyframe values", () => {
	test("toggles a scalar keyframe at the rounded element-local playhead time", () => {
		const inserted = toggleVisualKeyframe({
			element: textElement(),
			property: "opacity",
			currentTime: 2.23456,
		});

		expect(inserted).toEqual({
			opacity: [{ time: 1.235, value: 0.75, interpolation: "linear" }],
		});
		expect(
			hasVisualKeyframeAtTime({
				element: textElement({ keyframes: inserted }),
				property: "opacity",
				currentTime: 2.23456,
			}),
		).toBe(true);
	});

	test("toggles an existing keyframe off and removes the empty keyframe object", () => {
		const element = textElement({
			keyframes: {
				opacity: [{ time: 1.235, value: 0.5, interpolation: "linear" }],
			},
		});

		expect(
			toggleVisualKeyframe({
				element,
				property: "opacity",
				currentTime: 2.23456,
			}),
		).toBeUndefined();
	});

	test("preserves the other position axis when editing one axis at the playhead", () => {
		const element = textElement({
			keyframes: {
				"transform.position": [
					{ time: 0, value: { x: 10, y: 20 }, interpolation: "linear" },
					{ time: 2, value: { x: 30, y: 60 }, interpolation: "linear" },
				],
			},
		});

		const next = setVisualPositionAxisKeyframeValue({
			element,
			currentTime: 2,
			axis: "x",
			value: 99,
		});

		expect(next?.["transform.position"]).toEqual([
			{ time: 0, value: { x: 10, y: 20 }, interpolation: "linear" },
			{ time: 1, value: { x: 99, y: 40 }, interpolation: "linear" },
			{ time: 2, value: { x: 30, y: 60 }, interpolation: "linear" },
		]);
	});

	test("collects unique marker times across visual keyframe properties", () => {
		expect(
			getVisualKeyframeTimes(
				textElement({
					keyframes: {
						opacity: [{ time: 1, value: 1, interpolation: "linear" }],
						"transform.scale": [
							{ time: 1, value: 1.2, interpolation: "linear" },
							{ time: 2, value: 1.5, interpolation: "linear" },
						],
					},
				}),
			),
		).toEqual([1, 2]);
	});
});
