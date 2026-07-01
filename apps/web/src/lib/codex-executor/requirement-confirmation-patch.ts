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
	titleMode: NonNullable<RequirementDraft["titlePreferences"]["mode"]>;
	titleText: string;
	titleStylePreset: NonNullable<
		RequirementDraft["titlePreferences"]["stylePreset"]
	>;
	captionEnabled: boolean;
	captionLanguage: string;
	captionSize: "small" | "medium" | "large";
	captionStylePreset: RequirementDraft["captionPreferences"]["stylePreset"];
	voiceEnabled: boolean;
	voicePackId: "none" | "podcast-female" | "podcast-male" | "custom";
	customVoiceFileName: string;
	customVoiceFileUrl: string;
	customVoiceFilePath: string;
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
		titleMode:
			draft.titlePreferences.mode ??
			(draft.titlePreferences.enabled && !draft.titlePreferences.text
				? "auto"
				: "custom"),
		titleText: draft.titlePreferences.text ?? draft.requestedProjectName,
		titleStylePreset: draft.titlePreferences.stylePreset ?? "hook_title",
		captionEnabled: draft.captionPreferences.enabled,
		captionLanguage: draft.captionPreferences.language,
		captionSize: draft.captionPreferences.size,
		captionStylePreset: draft.captionPreferences.stylePreset,
		voiceEnabled: draft.voicePreferences.enabled,
		voicePackId: draft.voicePreferences?.voicePackId ?? "none",
		customVoiceFileName: draft.voicePreferences.customVoiceFile?.name ?? "",
		customVoiceFileUrl: draft.voicePreferences.customVoiceFile?.url ?? "",
		customVoiceFilePath: draft.voicePreferences.customVoiceFile?.path ?? "",
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
		? form.titleMode === "custom"
			? {
					enabled: true,
					mode: "custom" as const,
					text: form.titleText,
					stylePreset: form.titleStylePreset,
				}
			: {
					enabled: true,
					mode: "auto" as const,
					stylePreset: form.titleStylePreset,
				}
		: { enabled: false };
	const nextTitleMode = nextTitlePreferences.enabled
		? nextTitlePreferences.mode
		: undefined;
	const nextTitleText = nextTitlePreferences.enabled
		? "text" in nextTitlePreferences
			? nextTitlePreferences.text
			: undefined
		: undefined;
	const nextTitleStylePreset = nextTitlePreferences.enabled
		? nextTitlePreferences.stylePreset
		: undefined;
	if (
		draft.titlePreferences.enabled !== nextTitlePreferences.enabled ||
		draft.titlePreferences.mode !== nextTitleMode ||
		draft.titlePreferences.text !== nextTitleText ||
		draft.titlePreferences.stylePreset !== nextTitleStylePreset
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

	const nextVoicePreferences =
		form.voiceEnabled && form.voicePackId === "custom"
			? {
					enabled: true,
					voicePackId: "custom" as const,
					customVoiceFile: {
						name: form.customVoiceFileName,
						url: form.customVoiceFileUrl,
						...(form.customVoiceFilePath
							? { path: form.customVoiceFilePath }
							: {}),
					},
				}
			: ({
					enabled: form.voiceEnabled,
					voicePackId: form.voiceEnabled ? form.voicePackId : "none",
				} as const);
	const nextCustomVoiceFile =
		nextVoicePreferences.voicePackId === "custom"
			? nextVoicePreferences.customVoiceFile
			: undefined;
	if (
		draft.voicePreferences.enabled !== nextVoicePreferences.enabled ||
		draft.voicePreferences.voicePackId !== nextVoicePreferences.voicePackId ||
		draft.voicePreferences.customVoiceFile?.name !==
			nextCustomVoiceFile?.name ||
		draft.voicePreferences.customVoiceFile?.url !==
			nextCustomVoiceFile?.url ||
		draft.voicePreferences.customVoiceFile?.path !==
			nextCustomVoiceFile?.path
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
