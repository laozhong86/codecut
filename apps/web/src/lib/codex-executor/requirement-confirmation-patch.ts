import type {
	RequirementConfirmationPatch,
	RequirementDraft,
} from "./requirement-confirmation";
import type {
	NetworkMaterialPlacement,
	NetworkMaterialProvider,
} from "@/lib/network-materials/schema";

export type RequirementConfirmationFormState = {
	aspectRatio: "9:16" | "16:9" | "1:1";
	durationMode: "auto" | "preserve_source" | "custom_range";
	generateIntroCover: boolean;
	templatePreferenceMode: RequirementDraft["templatePreference"]["mode"];
	requestedTemplate: string;
	networkMaterialEnabled: boolean;
	networkMaterialPlacement: NetworkMaterialPlacement;
	networkMaterialProviders: NetworkMaterialProvider[];
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
	voicePackId: "none" | "podcast-female" | "podcast-male" | "custom";
	outputQuality: "low" | "medium" | "high" | "very_high";
	characterId: RequirementDraft["characterPreferences"]["characterId"];
	bgmMode: RequirementDraft["bgmPreferences"]["mode"];
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
		networkMaterialEnabled: draft.networkMaterialMatching.enabled,
		networkMaterialPlacement: draft.networkMaterialMatching.placement,
		networkMaterialProviders: [...draft.networkMaterialMatching.providers],
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
		voicePackId: draft.voicePreferences?.voicePackId ?? "none",
		outputQuality: draft.exportPreferences.quality,
		characterId: draft.characterPreferences.characterId,
		bgmMode: draft.bgmPreferences.mode,
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

	const nextNetworkMaterialMatching = {
		enabled: form.networkMaterialEnabled,
		placement: form.networkMaterialPlacement,
		providers: [...form.networkMaterialProviders],
		resolvedTemplateId: draft.networkMaterialMatching.resolvedTemplateId,
		decisionSource: "user" as const,
	};
	if (
		draft.networkMaterialMatching.enabled !==
			nextNetworkMaterialMatching.enabled ||
		draft.networkMaterialMatching.placement !==
			nextNetworkMaterialMatching.placement ||
		draft.networkMaterialMatching.providers.join("\0") !==
			nextNetworkMaterialMatching.providers.join("\0")
	) {
		patch.networkMaterialMatching = nextNetworkMaterialMatching;
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

	const nextVoiceEnabled = form.voicePackId !== "none";
	const nextVoicePreferences = {
		enabled: nextVoiceEnabled,
		voicePackId: nextVoiceEnabled ? form.voicePackId : "none",
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

	if (draft.characterPreferences.characterId !== form.characterId) {
		patch.characterPreferences = { characterId: form.characterId };
	}

	if (draft.bgmPreferences.mode !== form.bgmMode) {
		patch.bgmPreferences = { mode: form.bgmMode };
	}

	return patch;
}
