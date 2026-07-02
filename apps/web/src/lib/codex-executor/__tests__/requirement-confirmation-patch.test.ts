import { describe, expect, test } from "bun:test";
import {
	buildRequirementConfirmationPatch,
	formStateFromRequirementDraft,
} from "../requirement-confirmation-patch";
import type { RequirementDraft } from "../requirement-confirmation";
import type { RequirementConfirmationFormState } from "../requirement-confirmation-patch";

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
		titlePreferences: { enabled: false },
		captionPreferences: {
			enabled: true,
			language: "zh-CN",
			font: "auto",
			size: "medium",
			stylePreset: "short-form-bold",
		},
		voicePreferences: { enabled: false, voicePackId: "none" },
		templatePreference: {
			mode: "specified",
			requestedTemplate: "TikTok 解说视频模板",
		},
		networkMaterialMatching: {
			enabled: true,
			placement: "top",
			providers: ["pexels", "pixabay", "coverr"],
			resolvedTemplateId: "talking-head-broll-split",
			decisionSource: "template",
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

	test("reads the video cover toggle from the requirement draft", () => {
		const draft = requirementDraftFixture();

		expect(formStateFromRequirementDraft(draft).generateIntroCover).toBe(false);
	});

	test("reads agent selected template preference from the requirement draft", () => {
		const draft = requirementDraftFixture();
		const form = formStateFromRequirementDraft(draft);

		expect(form.templatePreferenceMode).toBe("specified");
		expect(form.requestedTemplate).toBe("TikTok 解说视频模板");
	});

	test("reads network material matching from the requirement draft", () => {
		const draft = requirementDraftFixture();
		const form = formStateFromRequirementDraft(draft);

		expect(form.networkMaterialEnabled).toBe(true);
		expect(form.networkMaterialPlacement).toBe("top");
		expect(form.networkMaterialProviders).toEqual([
			"pexels",
			"pixabay",
			"coverr",
		]);
	});

	test("submits voice preferences only when the user changes voice selection", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			voiceEnabled: true,
			voicePackId: "podcast-female" as const,
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			voicePreferences: { enabled: true, voicePackId: "podcast-female" },
		});
	});

	test("defaults to a real voice when the user enables voiceover from none", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			voiceEnabled: true,
			voicePackId: "podcast-female" as const,
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			voicePreferences: { enabled: true, voicePackId: "podcast-female" },
		});
	});

	test("submits custom voice file metadata", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			voiceEnabled: true,
			voicePackId: "custom" as const,
			customVoiceFileName: "voice.wav",
			customVoiceFileUrl: "blob:voice",
			customVoiceFilePath: "voice.wav",
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			voicePreferences: {
				enabled: true,
				voicePackId: "custom",
				customVoiceFile: {
					name: "voice.wav",
					url: "blob:voice",
					path: "voice.wav",
				},
			},
		});
	});

	test("submits title and caption enablement changes", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			titleEnabled: true,
			titleMode: "custom" as const,
			titleText: "别乱花钱",
			titleStylePreset: "hook_title" as const,
			captionEnabled: false,
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			titlePreferences: {
				enabled: true,
				mode: "custom",
				text: "别乱花钱",
				stylePreset: "hook_title",
			},
			captionPreferences: {
				enabled: false,
				language: "zh-CN",
				font: "auto",
				size: "medium",
				stylePreset: "short-form-bold",
			},
		});
	});

	test("submits automatic title mode without fixed title text", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			titleEnabled: true,
			titleMode: "auto" as const,
			titleStylePreset: "hook_title" as const,
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			titlePreferences: {
				enabled: true,
				mode: "auto",
				stylePreset: "hook_title",
			},
		});
	});

	test("submits video cover changes through timeline preferences", () => {
		const draft: RequirementDraft = {
			...requirementDraftFixture(),
			timelinePreferences: {
				...requirementDraftFixture().timelinePreferences,
				durationContract: {
					totalDurationMode: "auto",
					sourceCoverageMode: "selected_segments",
					toleranceSeconds: 0.25,
				},
				generateIntroCover: true,
			},
		};
		const form = {
			...formStateFromRequirementDraft(draft),
			generateIntroCover: false,
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			timelinePreferences: {
				...draft.timelinePreferences,
				generateIntroCover: false,
			},
		});
	});

	test("submits template preference changes when the user switches to automatic matching", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			templatePreferenceMode: "auto" as const,
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			templatePreference: { mode: "auto" },
		});
	});

	test("submits network material matching changes when the user overrides template defaults", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			networkMaterialEnabled: false,
			networkMaterialPlacement: "bottom" as const,
			networkMaterialProviders: [
				"pexels",
			] as RequirementConfirmationFormState["networkMaterialProviders"],
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			networkMaterialMatching: {
				enabled: false,
				placement: "bottom",
				providers: ["pexels"],
				resolvedTemplateId: "talking-head-broll-split",
				decisionSource: "user",
			},
		});
	});
});
