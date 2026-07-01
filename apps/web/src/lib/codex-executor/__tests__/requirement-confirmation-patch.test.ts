import { describe, expect, test } from "bun:test";
import {
	buildRequirementConfirmationPatch,
	formStateFromRequirementDraft,
} from "../requirement-confirmation-patch";
import type { RequirementDraft } from "../requirement-confirmation";

function requirementDraftFixture(): RequirementDraft {
	return {
		version: 1,
		draftId: "ccreq_22-abc123_deadbeef00",
		status: "awaiting_user_confirmation",
		createdAt: "2026-07-01T00:00:00.000Z",
		source: "codecut_requirement_confirmation",
		originalUserMessage: "保留原片完整时长，配音选择无配音。",
		requestedProjectName: "22号解说口播保留原片时长",
		requestedProjectId: "22-abc123",
		mediaSources: [
			{
				kind: "filePath",
				filePath: "/Users/x/Downloads/22.mp4",
				mimeType: "video/mp4",
			},
		],
		taskType: "edit_execution",
		timelinePreferences: {
			aspectRatio: "9:16",
			durationGoal: { mode: "auto" },
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
				toleranceSeconds: 0.25,
			},
			transitionPreference: "none",
			generateIntroCover: false,
			requirements: "保留原片完整时长，配音选择无配音。",
		},
		captionPreferences: {
			language: "zh-CN",
			font: "auto",
			size: "medium",
			stylePreset: "short-form-bold",
		},
		voicePreferences: { voicePackId: "none" },
		templatePreference: {
			mode: "specified",
			requestedTemplate: "TikTok 解说视频模板",
		},
		exportPreferences: {
			format: "mp4",
			quality: "high",
			includeAudio: true,
		},
		checks: [{ id: "setup-intent", ok: true, message: "Ready." }],
	};
}

describe("requirement confirmation patch builder", () => {
	test("omits unchanged voice preferences when confirming the draft as-is", () => {
		const draft = requirementDraftFixture();
		const form = formStateFromRequirementDraft(draft);

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({});
	});

	test("submits voice preferences only when the user changes voice selection", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			voicePackId: "podcast-female" as const,
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			voicePreferences: { voicePackId: "podcast-female" },
		});
	});
});
