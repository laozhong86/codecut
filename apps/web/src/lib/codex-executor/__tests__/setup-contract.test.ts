import { describe, expect, test } from "bun:test";
import {
	applyConfirmedSetupPatch,
	ConfirmedSetupSchema,
} from "../setup-contract";

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
		templatePreference: { mode: "auto" },
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
		expect(parsed.templatePreference).toEqual({ mode: "auto" });
	});

	test("accepts specified template preference with requested template", () => {
		const parsed = ConfirmedSetupSchema.parse(
			confirmedSetup({
				templatePreference: {
					mode: "specified",
					requestedTemplate: "TikTok 解说视频模板",
				},
			}),
		);

		expect(parsed.templatePreference).toEqual({
			mode: "specified",
			requestedTemplate: "TikTok 解说视频模板",
		});
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					templatePreference: { mode: "specified" },
				}),
			),
		).toThrow();
	});

	test("template preference changes require replan", () => {
		const applied = applyConfirmedSetupPatch({
			confirmedSetup: ConfirmedSetupSchema.parse(confirmedSetup()),
			patch: {
				templatePreference: {
					mode: "specified",
					requestedTemplate: "talking-head-short",
				},
			},
			reason: "user_selected_template",
			changedAt: "2026-07-01T00:00:00.000Z",
		});

		expect(applied.requiresReplan).toBe(true);
		expect(applied.changedFields).toEqual([
			"templatePreference.mode",
			"templatePreference.requestedTemplate",
		]);
		expect(applied.confirmedSetup.templatePreference).toEqual({
			mode: "specified",
			requestedTemplate: "talking-head-short",
		});
	});

	test("accepts only built-in voice pack ids in voice preferences", () => {
		const parsed = ConfirmedSetupSchema.parse(
			confirmedSetup({
				voicePreferences: {
					voicePackId: "podcast-female",
				},
			}),
		);

		expect(parsed.voicePreferences).toEqual({
			voicePackId: "podcast-female",
		});
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					voicePreferences: {
						voicePackId: "女声",
					},
				}),
			),
		).toThrow();
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

	test("rejects timeline intro cover for full-source preservation", () => {
		expect(() =>
			ConfirmedSetupSchema.parse(
				confirmedSetup({
					timelinePreferences: {
						aspectRatio: "9:16",
						durationGoal: { mode: "auto" },
						durationContract: {
							totalDurationMode: "preserve_source",
							sourceCoverageMode: "full_source",
							sourceDurationSeconds: 28.866667,
						},
						transitionPreference: "auto",
						generateIntroCover: true,
						requirements:
							"Keep the full source video and add a fixed top title.",
					},
				}),
			),
		).toThrow("generateIntroCover must be false");
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
