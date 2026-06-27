import { describe, expect, test } from "bun:test";
import { ConfirmedSetupSchema } from "../setup-contract";

function confirmedSetup(overrides: Record<string, unknown> = {}) {
	return {
		version: 1,
		taskType: "edit_execution",
		confirmedAt: "2026-06-27T00:00:00.000Z",
		source: "codecut_setup_confirmation",
		timelinePreferences: {
			aspectRatio: "9:16",
			durationGoal: { mode: "auto" },
			durationContract: {
				totalDurationMode: "auto",
				sourceCoverageMode: "selected_segments",
			},
			transitionPreference: "auto",
			generateIntroCover: true,
			requirements: "Create a clear short video.",
		},
		captionPreferences: {
			language: "auto",
			font: "auto",
			size: "medium",
			stylePreset: "creator-clean",
		},
		exportPreferences: {
			format: "mp4",
			quality: "high",
			includeAudio: true,
		},
		changes: [],
		...overrides,
	};
}

describe("ConfirmedSetup durationContract", () => {
	test("accepts the default selected-segment duration contract and fills tolerance", () => {
		const parsed = ConfirmedSetupSchema.parse(confirmedSetup());

		expect(parsed.timelinePreferences.durationContract).toEqual({
			totalDurationMode: "auto",
			sourceCoverageMode: "selected_segments",
			toleranceSeconds: 0.2,
		});
	});

	test("requires source duration when preserving total duration", () => {
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					timelinePreferences: {
						aspectRatio: "9:16",
						durationGoal: { mode: "auto" },
						durationContract: {
							totalDurationMode: "preserve_source",
							sourceCoverageMode: "selected_segments",
						},
						transitionPreference: "auto",
						generateIntroCover: true,
						requirements: "Keep the full source duration.",
					},
				}),
			),
		).toThrow("durationContract.sourceDurationSeconds is required");
	});

	test("requires a custom duration range when the contract uses custom_range", () => {
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					timelinePreferences: {
						aspectRatio: "9:16",
						durationGoal: { mode: "auto" },
						durationContract: {
							totalDurationMode: "custom_range",
							sourceCoverageMode: "selected_segments",
						},
						transitionPreference: "auto",
						generateIntroCover: true,
						requirements: "Cut to a custom range.",
					},
				}),
			),
		).toThrow("durationGoal.mode must be custom");
	});
});
