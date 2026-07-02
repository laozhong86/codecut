import type {
	RequirementConfirmationPatch,
	RequirementDraft,
} from "./requirement-confirmation";
import type {
	NetworkMaterialPlacement,
	NetworkMaterialProvider,
} from "@/lib/network-materials/schema";
import type { BuiltInTemplateId } from "@/lib/templates/registry";
import type { BgmCandidate } from "./setup-contract";

export type RequirementConfirmationFormState = {
	aspectRatio: "9:16" | "16:9" | "1:1";
	durationMode: "auto" | "preserve_source" | "custom_range";
	generateIntroCover: boolean;
	templatePreferenceMode: RequirementDraft["templatePreference"]["mode"];
	requestedTemplate: BuiltInTemplateId | "";
	draftTemplateName: string;
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
	voicePackId:
		| "none"
		| "podcast-female"
		| "podcast-male"
		| "custom"
		| "voice_clone";
	customVoiceFileName: string;
	customVoiceFileUrl: string;
	customVoiceFilePath: string;
	voiceCloneSourceFileName: string;
	voiceCloneSourceFileUrl: string;
	voiceCloneSourceFilePath: string;
	outputQuality: "low" | "medium" | "high" | "very_high";
	characterId: RequirementDraft["characterPreferences"]["characterId"];
	bgmMode: RequirementDraft["bgmPreferences"]["mode"];
	bgmSearchQuery: string;
	bgmCandidates: BgmCandidate[];
	selectedBgmCandidateId: string;
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
		draftTemplateName:
			draft.templatePreference.mode === "create"
				? draft.templatePreference.draftTemplateName
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
		customVoiceFileName: draft.voicePreferences?.customVoiceFile?.name ?? "",
		customVoiceFileUrl: draft.voicePreferences?.customVoiceFile?.url ?? "",
		customVoiceFilePath: draft.voicePreferences?.customVoiceFile?.path ?? "",
		voiceCloneSourceFileName:
			draft.voicePreferences?.voiceCloneSourceFile?.name ?? "",
		voiceCloneSourceFileUrl:
			draft.voicePreferences?.voiceCloneSourceFile?.url ?? "",
		voiceCloneSourceFilePath:
			draft.voicePreferences?.voiceCloneSourceFile?.path ?? "",
		outputQuality: draft.exportPreferences.quality,
		characterId: draft.characterPreferences.characterId,
		bgmMode: draft.bgmPreferences.mode,
		bgmSearchQuery:
			draft.bgmPreferences.mode === "smart_match"
				? (draft.bgmPreferences.searchQuery ?? "")
				: "",
		bgmCandidates:
			draft.bgmPreferences.mode === "smart_match"
				? [...(draft.bgmPreferences.candidates ?? [])]
				: [],
		selectedBgmCandidateId:
			draft.bgmPreferences.mode === "smart_match"
				? (draft.bgmPreferences.selectedCandidate?.id ?? "")
				: "",
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
					requestedTemplate: form.requestedTemplate as BuiltInTemplateId,
				}
			: form.templatePreferenceMode === "create"
				? {
						mode: "create" as const,
						draftTemplateName: form.draftTemplateName.trim(),
					}
				: { mode: "auto" as const };
	if (
		templatePreferenceChanged(draft.templatePreference, nextTemplatePreference)
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

	const nextVoicePreferences = buildVoicePreferencesFromForm(form);
	if (
		JSON.stringify(draft.voicePreferences) !==
		JSON.stringify(nextVoicePreferences)
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

	const bgmPreferencesPatch = buildBgmPreferencesPatchFromForm({
		draft,
		form,
	});
	if (bgmPreferencesPatch) {
		patch.bgmPreferences = bgmPreferencesPatch;
	}

	return patch;
}

function templatePreferenceChanged(
	before: RequirementDraft["templatePreference"],
	after: NonNullable<RequirementConfirmationPatch["templatePreference"]>,
) {
	if (before.mode !== after.mode) return true;
	if (before.mode === "specified" && after.mode === "specified") {
		return before.requestedTemplate !== after.requestedTemplate;
	}
	if (before.mode === "create" && after.mode === "create") {
		return before.draftTemplateName !== after.draftTemplateName;
	}
	return false;
}

function buildBgmPreferencesPatchFromForm({
	draft,
	form,
}: {
	draft: RequirementDraft;
	form: RequirementConfirmationFormState;
}): RequirementConfirmationPatch["bgmPreferences"] | undefined {
	if (form.bgmMode === "none") {
		return draft.bgmPreferences.mode === "none" ? undefined : { mode: "none" };
	}
	if (
		draft.bgmPreferences.mode === "smart_match" &&
		draft.bgmPreferences.selectedCandidate?.id === form.selectedBgmCandidateId
	) {
		return undefined;
	}
	return {
		mode: "smart_match",
		selectedCandidateId: form.selectedBgmCandidateId,
	};
}

function buildVoicePreferencesFromForm(
	form: RequirementConfirmationFormState,
): RequirementDraft["voicePreferences"] {
	if (form.voicePackId === "none") {
		return { enabled: false, voicePackId: "none" };
	}
	if (form.voicePackId === "custom") {
		return {
			enabled: true,
			voicePackId: "custom",
			customVoiceFile: buildVoiceAudioFile({
				name: form.customVoiceFileName,
				url: form.customVoiceFileUrl,
				path: form.customVoiceFilePath,
			}),
		};
	}
	if (form.voicePackId === "voice_clone") {
		return {
			enabled: true,
			voicePackId: "voice_clone",
			voiceCloneSourceFile: buildVoiceAudioFile({
				name: form.voiceCloneSourceFileName,
				url: form.voiceCloneSourceFileUrl,
				path: form.voiceCloneSourceFilePath,
			}),
		};
	}
	return { enabled: true, voicePackId: form.voicePackId };
}

function buildVoiceAudioFile({
	name,
	url,
	path,
}: {
	name: string;
	url: string;
	path: string;
}) {
	const normalizedUrl = url.trim();
	const normalizedPath = path.trim();
	return {
		name: name.trim() || inferFileName(normalizedPath || normalizedUrl),
		...(normalizedUrl ? { url: normalizedUrl } : {}),
		...(normalizedPath ? { path: normalizedPath } : {}),
	};
}

function inferFileName(value: string) {
	const normalized = value.trim();
	if (!normalized) return "";
	return normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? normalized;
}
