import type {
	RequirementConfirmationPatch,
	RequirementDraft,
} from "./requirement-confirmation";

export type RequirementConfirmationFormState = {
	aspectRatio: "9:16" | "16:9" | "1:1";
	durationMode: "auto" | "preserve_source" | "custom_range";
	generateIntroCover: boolean;
	templatePreferenceMode: RequirementDraft["templatePreference"]["mode"];
	requestedTemplate: string;
	titleEnabled: boolean;
	titleText: string;
	titleStylePreset: NonNullable<
		RequirementDraft["titlePreferences"]["stylePreset"]
	>;
	captionEnabled: boolean;
	captionLanguage: string;
	captionSize: "small" | "medium" | "large";
	captionStylePreset: RequirementDraft["captionPreferences"]["stylePreset"];
	voiceEnabled: boolean;
	voicePackId: "none" | "podcast-female" | "podcast-male";
	outputQuality: "low" | "medium" | "high" | "very_high";
	requirements: string;
};

export function formStateFromRequirementDraft(
	draft: RequirementDraft,
): RequirementConfirmationFormState {
	return {
		aspectRatio: draft.timelinePreferences.aspectRatio,
		durationMode: draft.timelinePreferences.durationContract.totalDurationMode,
		generateIntroCover: draft.timelinePreferences.generateIntroCover,
		templatePreferenceMode: draft.templatePreference.mode,
		requestedTemplate:
			draft.templatePreference.mode === "specified"
				? draft.templatePreference.requestedTemplate
				: "",
		titleEnabled: draft.titlePreferences.enabled,
		titleText: draft.titlePreferences.text ?? draft.requestedProjectName,
		titleStylePreset: draft.titlePreferences.stylePreset ?? "hook_title",
		captionEnabled: draft.captionPreferences.enabled,
		captionLanguage: draft.captionPreferences.language,
		captionSize: draft.captionPreferences.size,
		captionStylePreset: draft.captionPreferences.stylePreset,
		voiceEnabled: draft.voicePreferences.enabled,
		voicePackId: draft.voicePreferences?.voicePackId ?? "none",
		outputQuality: draft.exportPreferences.quality,
		requirements: draft.timelinePreferences.requirements,
	};
}

export function buildRequirementConfirmationPatch({
	draft,
	form,
}: {
	draft: RequirementDraft;
	form: RequirementConfirmationFormState;
}): RequirementConfirmationPatch {
	const patch: RequirementConfirmationPatch = {};

	if (
		draft.timelinePreferences.aspectRatio !== form.aspectRatio ||
		draft.timelinePreferences.durationContract.totalDurationMode !==
			form.durationMode ||
		draft.timelinePreferences.generateIntroCover !== form.generateIntroCover ||
		draft.timelinePreferences.requirements !== form.requirements
	) {
		patch.timelinePreferences = {
			...draft.timelinePreferences,
			aspectRatio: form.aspectRatio,
			durationContract: {
				...draft.timelinePreferences.durationContract,
				totalDurationMode: form.durationMode,
			},
			generateIntroCover: form.generateIntroCover,
			requirements: form.requirements,
		};
	}

	const nextTemplatePreference =
		form.templatePreferenceMode === "specified"
			? {
					mode: "specified" as const,
					requestedTemplate: form.requestedTemplate,
				}
			: { mode: "auto" as const };
	if (
		draft.templatePreference.mode !== nextTemplatePreference.mode ||
		(draft.templatePreference.mode === "specified" &&
			nextTemplatePreference.mode === "specified" &&
			draft.templatePreference.requestedTemplate !==
				nextTemplatePreference.requestedTemplate)
	) {
		patch.templatePreference = nextTemplatePreference;
	}

	const nextTitlePreferences = form.titleEnabled
		? {
				enabled: true,
				text: form.titleText,
				stylePreset: form.titleStylePreset,
			}
		: { enabled: false };
	if (
		draft.titlePreferences.enabled !== nextTitlePreferences.enabled ||
		draft.titlePreferences.text !== nextTitlePreferences.text ||
		draft.titlePreferences.stylePreset !== nextTitlePreferences.stylePreset
	) {
		patch.titlePreferences = nextTitlePreferences;
	}

	if (
		draft.captionPreferences.enabled !== form.captionEnabled ||
		draft.captionPreferences.language !== form.captionLanguage ||
		draft.captionPreferences.size !== form.captionSize ||
		draft.captionPreferences.stylePreset !== form.captionStylePreset
	) {
		patch.captionPreferences = {
			...draft.captionPreferences,
			enabled: form.captionEnabled,
			language: form.captionLanguage,
			size: form.captionSize,
			stylePreset: form.captionStylePreset,
		};
	}

	const nextVoicePreferences = {
		enabled: form.voiceEnabled,
		voicePackId: form.voiceEnabled ? form.voicePackId : "none",
	} as const;
	if (
		draft.voicePreferences.enabled !== nextVoicePreferences.enabled ||
		draft.voicePreferences.voicePackId !== nextVoicePreferences.voicePackId
	) {
		patch.voicePreferences = nextVoicePreferences;
	}

	if (draft.exportPreferences.quality !== form.outputQuality) {
		patch.exportPreferences = {
			...draft.exportPreferences,
			quality: form.outputQuality,
		};
	}

	return patch;
}
