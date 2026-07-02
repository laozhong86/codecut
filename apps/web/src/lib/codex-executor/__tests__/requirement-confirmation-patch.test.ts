import { describe, expect, test } from "bun:test";
import {
	buildRequirementConfirmationPatch,
	formStateFromRequirementDraft,
} from "../requirement-confirmation-patch";
import type { RequirementDraft } from "../requirement-confirmation";
import type { RequirementConfirmationFormState } from "../requirement-confirmation-patch";
import type { BgmCandidate, BgmPreferences } from "../setup-contract";

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
		characterPreferences: { characterId: "none" },
		bgmPreferences: { mode: "none" },
		templatePreference: {
			mode: "specified",
			requestedTemplate: "talking-head-broll-split",
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

function bgmCandidate(overrides: Partial<BgmCandidate> = {}): BgmCandidate {
	return {
		id: "internet-archive:safe-lofi:safe-lofi.mp3",
		sourceId: "internet-archive:safe-lofi:safe-lofi.mp3",
		title: "Safe Lofi Beat",
		creator: "Open Artist",
		source: "internet_archive",
		sourceUrl: "https://archive.org/details/safe-lofi",
		licenseLabel: "CC BY 4.0",
		licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
		commercialUseAllowed: true,
		attributionRequired: true,
		previewUrl: "https://archive.org/download/safe-lofi/safe-lofi.mp3",
		downloadUrl: "https://archive.org/download/safe-lofi/safe-lofi.mp3",
		durationSeconds: 91.2,
		fileSizeBytes: 1234,
		...overrides,
	};
}

function smartBgmPreferences(
	overrides: Partial<BgmPreferences> = {},
): BgmPreferences {
	const selectedCandidate = bgmCandidate();
	return {
		mode: "smart_match",
		searchQuery: "bright lofi product demo",
		candidates: [selectedCandidate],
		selectedCandidate,
		...overrides,
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
		expect(form.requestedTemplate).toBe("talking-head-broll-split");
		expect(form.draftTemplateName).toBe("");
	});

	test("reads create template preference from the requirement draft", () => {
		const draft: RequirementDraft = {
			...requirementDraftFixture(),
			templatePreference: {
				mode: "create",
				draftTemplateName: "TikTok 解说模板草稿",
			},
		};
		const form = formStateFromRequirementDraft(draft);

		expect(form.templatePreferenceMode).toBe("create");
		expect(form.requestedTemplate).toBe("");
		expect(form.draftTemplateName).toBe("TikTok 解说模板草稿");
	});

	test("reads character and BGM preferences from the requirement draft", () => {
		const draft: RequirementDraft = {
			...requirementDraftFixture(),
			characterPreferences: { characterId: "ugc-female-host" },
			bgmPreferences: smartBgmPreferences(),
		};
		const form = formStateFromRequirementDraft(draft);

		expect(form.characterId).toBe("ugc-female-host");
		expect(form.bgmMode).toBe("smart_match");
		expect(form.bgmSearchQuery).toBe("bright lofi product demo");
		expect(form.bgmCandidates).toEqual([bgmCandidate()]);
		expect(form.selectedBgmCandidateId).toBe(
			"internet-archive:safe-lofi:safe-lofi.mp3",
		);
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
			voicePackId: "podcast-female" as const,
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			voicePreferences: { enabled: true, voicePackId: "podcast-female" },
		});
	});

	test("submits custom voiceover file preferences", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			voicePackId: "custom" as const,
			customVoiceFileName: "voice.wav",
			customVoiceFileUrl: "blob:voice",
			customVoiceFilePath: "/tmp/voice.wav",
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			voicePreferences: {
				enabled: true,
				voicePackId: "custom",
				customVoiceFile: {
					name: "voice.wav",
					url: "blob:voice",
					path: "/tmp/voice.wav",
				},
			},
		});
	});

	test("submits voice clone source audio preferences", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			voicePackId: "voice_clone" as const,
			voiceCloneSourceFileName: "reference.wav",
			voiceCloneSourceFileUrl: "blob:reference",
			voiceCloneSourceFilePath: "/tmp/reference.wav",
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			voicePreferences: {
				enabled: true,
				voicePackId: "voice_clone",
				voiceCloneSourceFile: {
					name: "reference.wav",
					url: "blob:reference",
					path: "/tmp/reference.wav",
				},
			},
		});
	});

	test("reads custom and cloned voice file preferences from the requirement draft", () => {
		const customDraft: RequirementDraft = {
			...requirementDraftFixture(),
			voicePreferences: {
				enabled: true,
				voicePackId: "custom",
				customVoiceFile: {
					name: "voice.wav",
					url: "blob:voice",
					path: "/tmp/voice.wav",
				},
			},
		};
		expect(formStateFromRequirementDraft(customDraft)).toMatchObject({
			voicePackId: "custom",
			customVoiceFileName: "voice.wav",
			customVoiceFileUrl: "blob:voice",
			customVoiceFilePath: "/tmp/voice.wav",
		});

		const cloneDraft: RequirementDraft = {
			...requirementDraftFixture(),
			voicePreferences: {
				enabled: true,
				voicePackId: "voice_clone",
				voiceCloneSourceFile: {
					name: "reference.wav",
					url: "blob:reference",
					path: "/tmp/reference.wav",
				},
			},
		};
		expect(formStateFromRequirementDraft(cloneDraft)).toMatchObject({
			voicePackId: "voice_clone",
			voiceCloneSourceFileName: "reference.wav",
			voiceCloneSourceFileUrl: "blob:reference",
			voiceCloneSourceFilePath: "/tmp/reference.wav",
		});
	});

	test("defaults to a real voice when the user enables voiceover from none", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			voicePackId: "podcast-female" as const,
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			voicePreferences: { enabled: true, voicePackId: "podcast-female" },
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

	test("submits character and BGM preference changes", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			characterId: "ugc-female-host",
			bgmMode: "smart_match" as const,
			bgmSearchQuery: "bright lofi product demo",
			bgmCandidates: [bgmCandidate()],
			selectedBgmCandidateId: "internet-archive:safe-lofi:safe-lofi.mp3",
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			characterPreferences: { characterId: "ugc-female-host" },
			bgmPreferences: {
				mode: "smart_match",
				selectedCandidateId: "internet-archive:safe-lofi:safe-lofi.mp3",
			},
		});
	});

	test("submits the switched BGM candidate selection", () => {
		const firstCandidate = bgmCandidate();
		const secondCandidate = bgmCandidate({
			id: "internet-archive:uplift:uplift.mp3",
			sourceId: "internet-archive:uplift:uplift.mp3",
			title: "Uplift Beat",
			creator: "Second Artist",
			sourceUrl: "https://archive.org/details/uplift",
			previewUrl: "https://archive.org/download/uplift/uplift.mp3",
			downloadUrl: "https://archive.org/download/uplift/uplift.mp3",
			durationSeconds: 73,
			fileSizeBytes: 2345,
		});
		const draft: RequirementDraft = {
			...requirementDraftFixture(),
			bgmPreferences: {
				mode: "smart_match",
				searchQuery: "bright lofi product demo",
				candidates: [firstCandidate, secondCandidate],
				selectedCandidate: firstCandidate,
			},
		};
		const form = {
			...formStateFromRequirementDraft(draft),
			selectedBgmCandidateId: "internet-archive:uplift:uplift.mp3",
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			bgmPreferences: {
				mode: "smart_match",
				selectedCandidateId: "internet-archive:uplift:uplift.mp3",
			},
		});
	});

	test("submits only the selected BGM candidate id even if form candidates are changed", () => {
		const draft: RequirementDraft = {
			...requirementDraftFixture(),
			bgmPreferences: smartBgmPreferences(),
		};
		const form = {
			...formStateFromRequirementDraft(draft),
			bgmCandidates: [
				bgmCandidate({
					title: "Tampered Commercial",
					licenseLabel: "CC0",
					licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
					attributionRequired: false,
					fileSizeBytes: 1,
				}),
			],
			selectedBgmCandidateId: "internet-archive:safe-lofi:safe-lofi.mp3",
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({});
	});

	test("submits template preference changes when the user selects a built-in template", () => {
		const draft: RequirementDraft = {
			...requirementDraftFixture(),
			templatePreference: { mode: "auto" },
		};
		const form = {
			...formStateFromRequirementDraft(draft),
			templatePreferenceMode: "specified" as const,
			requestedTemplate: "narrated-broll" as const,
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			templatePreference: {
				mode: "specified",
				requestedTemplate: "narrated-broll",
			},
		});
	});

	test("submits template preference changes when the user asks to create a template", () => {
		const draft = requirementDraftFixture();
		const form = {
			...formStateFromRequirementDraft(draft),
			templatePreferenceMode: "create" as const,
			draftTemplateName: "TikTok 解说模板草稿",
		};

		expect(buildRequirementConfirmationPatch({ draft, form })).toEqual({
			templatePreference: {
				mode: "create",
				draftTemplateName: "TikTok 解说模板草稿",
			},
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
