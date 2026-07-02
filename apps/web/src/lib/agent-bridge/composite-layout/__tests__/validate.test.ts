import { describe, expect, test } from "bun:test";
import {
	resolveCompositeLayoutSlots,
	validateCompositeLayoutPlan,
} from "../validate";

function basePlan(overrides: Record<string, unknown> = {}) {
	return {
		version: 1,
		projectId: "project-1",
		target: {
			aspectRatio: "9:16",
			durationSec: 10,
		},
		placement: "top",
		presenter: {
			mediaId: "presenter-video",
			sourceStart: 0,
			sourceEnd: 10,
		},
		networkMaterialBeats: [
			{
				id: "beat-1",
				mediaId: "network-video",
				provider: "pexels",
				searchTerm: "startup office",
				sourceUrl: "https://example.com/video.mp4",
				license: {
					label: "Pexels License",
					url: "https://www.pexels.com/license/",
				},
				sourceStart: 0,
				sourceEnd: 5,
				timelineStart: 0,
				cropMode: "cover-slot",
			},
		],
		rationale: "Match B-roll to the opening voiceover beat.",
		...overrides,
	};
}

describe("CompositeLayoutPlan", () => {
	test("uses 45/55 split slots for top and bottom network material placements", () => {
		expect(
			resolveCompositeLayoutSlots({ aspectRatio: "9:16", placement: "top" }),
		).toEqual({
			networkMaterial: { x: 0, y: 0, width: 1, height: 0.45 },
			presenter: { x: 0, y: 0.45, width: 1, height: 0.55 },
		});
		expect(
			resolveCompositeLayoutSlots({ aspectRatio: "9:16", placement: "bottom" }),
		).toEqual({
			presenter: { x: 0, y: 0, width: 1, height: 0.55 },
			networkMaterial: { x: 0, y: 0.55, width: 1, height: 0.45 },
		});
	});

	test("rejects split-screen placements outside 9:16", () => {
		const result = validateCompositeLayoutPlan({
			plan: basePlan({
				target: { aspectRatio: "16:9", durationSec: 10 },
			}),
		});

		expect(result).toEqual({
			success: false,
			message: "CompositeLayoutPlan split placements require a 9:16 target.",
			path: "target.aspectRatio",
		});
	});

	test("rejects background presenter composition without mask evidence", () => {
		const result = validateCompositeLayoutPlan({
			plan: basePlan({ placement: "background" }),
		});

		expect(result).toEqual({
			success: false,
			message:
				"CompositeLayoutPlan background placement with presenter media requires presenter.maskMediaId.",
			path: "presenter.maskMediaId",
		});
	});
});
