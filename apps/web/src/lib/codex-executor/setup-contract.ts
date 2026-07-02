import { z } from "zod";
import {
	EditPlanAspectRatioSchema,
	EditPlanCaptionStylePresetSchema,
	EditPlanTextStylePresetSchema,
	EditPlanTransitionTypeSchema,
	type EditPlanCaptionStyle,
} from "@/lib/agent-bridge/edit-plan/schema";
import type { buildTextElement } from "@/lib/timeline/element-utils";
import { isCodecutLocalFontFamily } from "@/lib/codecut-fonts";
import builtinCharacterOptions from "./builtin-character-options.json";
import { NetworkMaterialMatchingSchema } from "@/lib/network-materials/schema";
import { BUILT_IN_TEMPLATE_IDS } from "@/lib/templates/registry";
import { isCommercialVideoSafeLicense } from "@/lib/sounds/internet-archive-search.mjs";

type TextElementRaw = Parameters<typeof buildTextElement>[0]["raw"];

export const CAPTION_SIZE_SCALE = {
	small: 0.9,
	medium: 1,
	large: 1.15,
} as const;

export const CaptionSizeSchema = z.enum(["small", "medium", "large"]);

const CaptionFontSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => value === "auto" || isCodecutLocalFontFamily(value), {
		message: "captionFont must be auto or a CodeCut local font.",
	});

const DurationGoalSchema = z
	.object({
		mode: z.enum(["auto", "custom"]),
		rangeSeconds: z
			.object({
				minSeconds: z.number().positive(),
				maxSeconds: z.number().positive(),
			})
			.strict()
			.optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (value.mode === "auto" && value.rangeSeconds !== undefined) {
			ctx.addIssue({
				code: "custom",
				message: "durationGoal.rangeSeconds is only allowed in custom mode.",
				path: ["rangeSeconds"],
			});
		}
		if (value.mode === "custom") {
			if (!value.rangeSeconds) {
				ctx.addIssue({
					code: "custom",
					message: "durationGoal.rangeSeconds is required in custom mode.",
					path: ["rangeSeconds"],
				});
				return;
			}
			if (value.rangeSeconds.maxSeconds < value.rangeSeconds.minSeconds) {
				ctx.addIssue({
					code: "custom",
					message:
						"durationGoal.rangeSeconds.maxSeconds must be greater than or equal to minSeconds.",
					path: ["rangeSeconds", "maxSeconds"],
				});
			}
		}
	});

export const DurationContractSchema = z
	.object({
		totalDurationMode: z.enum(["auto", "preserve_source", "custom_range"]),
		sourceCoverageMode: z.enum(["selected_segments", "full_source"]),
		sourceDurationSeconds: z.number().positive().optional(),
		toleranceSeconds: z.number().positive().default(0.2),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (
			(value.totalDurationMode === "preserve_source" ||
				value.sourceCoverageMode === "full_source") &&
			value.sourceDurationSeconds === undefined
		) {
			ctx.addIssue({
				code: "custom",
				message:
					"durationContract.sourceDurationSeconds is required for preserve_source or full_source.",
				path: ["sourceDurationSeconds"],
			});
		}
	});

const TimelinePreferencesBaseSchema = z
	.object({
		aspectRatio: EditPlanAspectRatioSchema,
		durationGoal: DurationGoalSchema,
		durationContract: DurationContractSchema,
		transitionPreference: z.union([
			z.literal("auto"),
			z.literal("none"),
			EditPlanTransitionTypeSchema,
		]),
		generateIntroCover: z.boolean(),
		requirements: z.string().trim().min(1),
	})
	.strict();

const TimelinePreferencesSchema = TimelinePreferencesBaseSchema.superRefine(
	(value, ctx) => {
		if (
			value.durationContract.totalDurationMode === "custom_range" &&
			value.durationGoal.mode !== "custom"
		) {
			ctx.addIssue({
				code: "custom",
				message:
					"durationGoal.mode must be custom when durationContract.totalDurationMode is custom_range.",
				path: ["durationGoal", "mode"],
			});
		}
		if (
			value.generateIntroCover &&
			value.durationContract.totalDurationMode === "preserve_source" &&
			value.durationContract.sourceCoverageMode === "full_source"
		) {
			ctx.addIssue({
				code: "custom",
				message:
					"generateIntroCover must be false when preserving the full source duration and full source coverage.",
				path: ["generateIntroCover"],
			});
		}
	},
);

const CaptionPreferencesSchema = z
	.object({
		enabled: z.boolean(),
		language: z.string().trim().min(1),
		font: CaptionFontSchema,
		size: CaptionSizeSchema,
		stylePreset: EditPlanCaptionStylePresetSchema,
	})
	.strict();

const ExportPreferencesSchema = z
	.object({
		format: z.enum(["mp4", "webm"]),
		quality: z.enum(["low", "medium", "high", "very_high"]),
		includeAudio: z.boolean(),
	})
	.strict();

export const BuiltInVoicePackIdSchema = z.enum([
	"none",
	"podcast-female",
	"podcast-male",
	"custom",
	"voice_clone",
]);

const builtInCharacterIds = new Set([
	"none",
	...builtinCharacterOptions.map((character) => character.id),
]);

export const BuiltInCharacterIdSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => builtInCharacterIds.has(value), {
		message:
			"characterPreferences.characterId must be none or a built-in role.",
	});

const CharacterPreferencesSchema = z
	.object({
		characterId: BuiltInCharacterIdSchema,
	})
	.strict();

const MAX_BGM_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const INTERNET_ARCHIVE_BGM_HOST = "archive.org";
const INTERNET_ARCHIVE_BGM_SOURCE_PREFIX = "internet-archive:";
const BGM_AUDIO_FILE_EXTENSIONS = new Set([
	".mp3",
	".m4a",
	".ogg",
	".flac",
	".wav",
]);

function decodeUrlPathSegments(pathname: string): string[] {
	return pathname
		.split("/")
		.filter(Boolean)
		.map((segment) => decodeURIComponent(segment));
}

function readInternetArchiveBgmCandidateParts(value: {
	source: string;
	sourceId: string;
	sourceUrl: string;
	downloadUrl: string;
}): { identifier: string; fileName: string } {
	if (value.source !== "internet_archive") {
		throw new Error("BGM source must be internet_archive.");
	}
	if (!value.sourceId.startsWith(INTERNET_ARCHIVE_BGM_SOURCE_PREFIX)) {
		throw new Error("BGM sourceId must use the internet-archive prefix.");
	}
	const sourceUrl = new URL(value.sourceUrl);
	if (
		sourceUrl.protocol !== "https:" ||
		sourceUrl.hostname !== INTERNET_ARCHIVE_BGM_HOST
	) {
		throw new Error("BGM sourceUrl must be an archive.org details URL.");
	}
	const sourceSegments = decodeUrlPathSegments(sourceUrl.pathname);
	if (sourceSegments[0] !== "details" || !sourceSegments[1]) {
		throw new Error("BGM sourceUrl must be an archive.org details URL.");
	}
	const downloadUrl = new URL(value.downloadUrl);
	if (
		downloadUrl.protocol !== "https:" ||
		downloadUrl.hostname !== INTERNET_ARCHIVE_BGM_HOST
	) {
		throw new Error("BGM downloadUrl must be an archive.org download URL.");
	}
	const downloadSegments = decodeUrlPathSegments(downloadUrl.pathname);
	if (
		downloadSegments[0] !== "download" ||
		!downloadSegments[1] ||
		downloadSegments.length < 3
	) {
		throw new Error("BGM downloadUrl must be an archive.org download URL.");
	}
	const identifier = sourceSegments[1];
	const downloadIdentifier = downloadSegments[1];
	const fileName = downloadSegments.slice(2).join("/");
	if (identifier !== downloadIdentifier) {
		throw new Error("BGM sourceUrl and downloadUrl must use the same item.");
	}
	if (
		value.sourceId !==
		`${INTERNET_ARCHIVE_BGM_SOURCE_PREFIX}${identifier}:${fileName}`
	) {
		throw new Error("BGM sourceId must match the Internet Archive download file.");
	}
	const extensionMatch = fileName.match(/\.[^./\\]+$/);
	const extension = extensionMatch?.[0]?.toLowerCase() ?? "";
	if (!BGM_AUDIO_FILE_EXTENSIONS.has(extension)) {
		throw new Error("BGM downloadUrl must point to a supported audio file.");
	}
	return { identifier, fileName };
}

function validateInternetArchiveBgmCandidate(
	value: {
		source: string;
		sourceId: string;
		sourceUrl: string;
		downloadUrl: string;
		licenseUrl: string;
		commercialUseAllowed: boolean;
	},
	ctx: z.RefinementCtx,
) {
	try {
		readInternetArchiveBgmCandidateParts(value);
	} catch (error) {
		ctx.addIssue({
			code: "custom",
			message:
				error instanceof Error
					? error.message
					: "BGM candidate must point to Internet Archive audio.",
			path: ["downloadUrl"],
		});
	}
	if (!isCommercialVideoSafeLicense(value.licenseUrl)) {
		ctx.addIssue({
			code: "custom",
			message: "BGM licenseUrl must allow commercial video use.",
			path: ["licenseUrl"],
		});
	}
	if (isCommercialVideoSafeLicense(value.licenseUrl) !== value.commercialUseAllowed) {
		ctx.addIssue({
			code: "custom",
			message:
				"BGM commercialUseAllowed must match the selected licenseUrl policy.",
			path: ["commercialUseAllowed"],
		});
	}
}

const BgmCandidateSchema = z
	.object({
		id: z.string().trim().min(1),
		sourceId: z.string().trim().min(1),
		title: z.string().trim().min(1),
		creator: z.string().trim().min(1),
		source: z.literal("internet_archive"),
		sourceUrl: z.string().trim().url(),
		licenseLabel: z.string().trim().min(1),
		licenseUrl: z.string().trim().url(),
		commercialUseAllowed: z.boolean(),
		attributionRequired: z.boolean(),
		previewUrl: z.string().trim().url().optional(),
		downloadUrl: z.string().trim().url(),
		durationSeconds: z.number().nonnegative(),
		fileSizeBytes: z
			.number()
			.int()
			.positive()
			.max(MAX_BGM_DOWNLOAD_BYTES, "BGM fileSizeBytes exceeds the limit."),
	})
	.strict()
	.superRefine(validateInternetArchiveBgmCandidate);

function isSameBgmCandidateIdentity(
	candidate: z.infer<typeof BgmCandidateSchema>,
	selectedCandidate: z.infer<typeof BgmCandidateSchema>,
) {
	return (
		candidate.id === selectedCandidate.id &&
		candidate.sourceId === selectedCandidate.sourceId &&
		candidate.title === selectedCandidate.title &&
		candidate.creator === selectedCandidate.creator &&
		candidate.source === selectedCandidate.source &&
		candidate.sourceUrl === selectedCandidate.sourceUrl &&
		candidate.licenseLabel === selectedCandidate.licenseLabel &&
		candidate.licenseUrl === selectedCandidate.licenseUrl &&
		candidate.commercialUseAllowed === selectedCandidate.commercialUseAllowed &&
		candidate.attributionRequired === selectedCandidate.attributionRequired &&
		candidate.previewUrl === selectedCandidate.previewUrl &&
		candidate.downloadUrl === selectedCandidate.downloadUrl &&
		candidate.durationSeconds === selectedCandidate.durationSeconds &&
		candidate.fileSizeBytes === selectedCandidate.fileSizeBytes
	);
}

const BgmPreferencesSchema = z
	.object({
		mode: z.enum(["none", "smart_match"]),
		searchQuery: z.string().trim().min(1).optional(),
		candidates: z.array(BgmCandidateSchema).max(10).optional(),
		selectedCandidate: BgmCandidateSchema.optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (value.mode === "none") {
			if (
				value.searchQuery !== undefined ||
				value.candidates !== undefined ||
				value.selectedCandidate !== undefined
			) {
				ctx.addIssue({
					code: "custom",
					message: "bgmPreferences.mode none cannot include matched music.",
					path: ["mode"],
				});
			}
			return;
		}

		if (!value.searchQuery) {
			ctx.addIssue({
				code: "custom",
				message: "bgmPreferences.searchQuery is required for smart_match.",
				path: ["searchQuery"],
			});
		}
		if (!value.candidates || value.candidates.length === 0) {
			ctx.addIssue({
				code: "custom",
				message:
					"bgmPreferences.candidates must include at least one candidate.",
				path: ["candidates"],
			});
		}
		if (!value.selectedCandidate) {
			ctx.addIssue({
				code: "custom",
				message:
					"bgmPreferences.selectedCandidate is required for smart_match.",
				path: ["selectedCandidate"],
			});
		}
		const candidates = value.candidates ?? [];
		if (
			candidates.some((candidate) => !candidate.commercialUseAllowed) ||
			value.selectedCandidate?.commercialUseAllowed === false
		) {
			ctx.addIssue({
				code: "custom",
				message: "BGM candidates must allow commercial use.",
				path: ["candidates"],
			});
		}
		const selectedCandidate = value.selectedCandidate;
		if (
			selectedCandidate &&
			candidates.length > 0 &&
			!candidates.some((candidate) =>
				isSameBgmCandidateIdentity(candidate, selectedCandidate),
			)
		) {
			ctx.addIssue({
				code: "custom",
				message: "bgmPreferences.selectedCandidate must be one of candidates.",
				path: ["selectedCandidate"],
			});
		}
	});

const VoiceAudioFileSchema = z
	.object({
		name: z.string().trim().min(1),
		url: z.string().trim().min(1).optional(),
		path: z.string().trim().min(1).optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (!value.url && !value.path) {
			ctx.addIssue({
				code: "custom",
				message: "voice file requires url or path.",
				path: ["url"],
			});
		}
	});

const VoicePreferencesBaseSchema = z
	.object({
		enabled: z.boolean(),
		voicePackId: BuiltInVoicePackIdSchema,
		customVoiceFile: VoiceAudioFileSchema.optional(),
		voiceCloneSourceFile: VoiceAudioFileSchema.optional(),
	})
	.strict();

const VoicePreferencesSchema = VoicePreferencesBaseSchema.superRefine(
	(value, ctx) => {
		if (value.enabled && value.voicePackId === "none") {
			ctx.addIssue({
				code: "custom",
				message:
					"voicePreferences.voicePackId must be a voice when voice is enabled.",
				path: ["voicePackId"],
			});
		}
		if (
			value.enabled &&
			value.voicePackId === "custom" &&
			!value.customVoiceFile
		) {
			ctx.addIssue({
				code: "custom",
				message:
					"voicePreferences.customVoiceFile is required when custom voice is enabled.",
				path: ["customVoiceFile"],
			});
		}
		if (
			value.enabled &&
			value.voicePackId === "voice_clone" &&
			!value.voiceCloneSourceFile
		) {
			ctx.addIssue({
				code: "custom",
				message:
					"voicePreferences.voiceCloneSourceFile is required when voice clone is enabled.",
				path: ["voiceCloneSourceFile"],
			});
		}
		if (value.voicePackId !== "custom" && value.customVoiceFile) {
			ctx.addIssue({
				code: "custom",
				message:
					"voicePreferences.customVoiceFile is only allowed for custom voice.",
				path: ["customVoiceFile"],
			});
		}
		if (
			value.voicePackId !== "voice_clone" &&
			value.voiceCloneSourceFile
		) {
			ctx.addIssue({
				code: "custom",
				message:
					"voicePreferences.voiceCloneSourceFile is only allowed for voice clone.",
				path: ["voiceCloneSourceFile"],
			});
		}
		if (!value.enabled && value.voicePackId !== "none") {
			ctx.addIssue({
				code: "custom",
				message:
					"voicePreferences.voicePackId must be none when voice is disabled.",
				path: ["voicePackId"],
			});
		}
	},
);

export const TemplatePreferenceSchema = z.discriminatedUnion("mode", [
	z
		.object({
			mode: z.literal("auto"),
		})
		.strict(),
	z
		.object({
			mode: z.literal("specified"),
			requestedTemplate: z.enum(BUILT_IN_TEMPLATE_IDS),
		})
		.strict(),
	z
		.object({
			mode: z.literal("create"),
			draftTemplateName: z.string().trim().min(1),
		})
		.strict(),
]);

const TitlePreferencesBaseSchema = z
	.object({
		enabled: z.boolean(),
		mode: z.enum(["auto", "custom"]).optional(),
		text: z.string().trim().min(1).optional(),
		stylePreset: EditPlanTextStylePresetSchema.optional(),
	})
	.strict();

const TitlePreferencesSchema = TitlePreferencesBaseSchema.superRefine(
	(value, ctx) => {
		if (!value.enabled) return;
		if (!value.mode) {
			ctx.addIssue({
				code: "custom",
				message: "titlePreferences.mode is required when title is enabled.",
				path: ["mode"],
			});
		}
		if (!value.text) {
			if (value.mode === "custom") {
				ctx.addIssue({
					code: "custom",
					message:
						"titlePreferences.text is required when custom title is enabled.",
					path: ["text"],
				});
			}
		}
		if (!value.stylePreset) {
			ctx.addIssue({
				code: "custom",
				message:
					"titlePreferences.stylePreset is required when title is enabled.",
				path: ["stylePreset"],
			});
		}
	},
);

export const ConfirmedSetupTaskTypeSchema = z.enum([
	"template_draft",
	"template_import",
	"template_apply_sample",
	"edit_execution",
]);

const ConfirmedSetupChangeSchema = z
	.object({
		changedAt: z.string().trim().min(1),
		field: z.string().trim().min(1),
		oldValue: z.unknown().optional(),
		newValue: z.unknown().optional(),
		reason: z.string().trim().min(1),
	})
	.strict();

export const ConfirmedSetupSchema = z
	.object({
		version: z.literal(1),
		taskType: ConfirmedSetupTaskTypeSchema,
		confirmedAt: z.string().trim().min(1),
		source: z.literal("codecut_setup_confirmation"),
		timelinePreferences: TimelinePreferencesSchema,
		titlePreferences: TitlePreferencesSchema,
		captionPreferences: CaptionPreferencesSchema,
		voicePreferences: VoicePreferencesSchema,
		characterPreferences: CharacterPreferencesSchema.default({
			characterId: "none",
		}),
		bgmPreferences: BgmPreferencesSchema.default({ mode: "none" }),
		templatePreference: TemplatePreferenceSchema.default({ mode: "auto" }),
		networkMaterialMatching: NetworkMaterialMatchingSchema,
		exportPreferences: ExportPreferencesSchema,
		changes: z.array(ConfirmedSetupChangeSchema),
	})
	.strict();

const TimelinePreferencesPatchSchema =
	TimelinePreferencesBaseSchema.partial().strict();
const TitlePreferencesPatchSchema =
	TitlePreferencesBaseSchema.partial().strict();
const CaptionPreferencesPatchSchema =
	CaptionPreferencesSchema.partial().strict();
const ExportPreferencesPatchSchema = ExportPreferencesSchema.partial().strict();
const VoicePreferencesPatchSchema =
	VoicePreferencesBaseSchema.partial().strict();
const CharacterPreferencesPatchSchema =
	CharacterPreferencesSchema.partial().strict();
const NetworkMaterialMatchingPatchSchema =
	NetworkMaterialMatchingSchema.partial().strict();

export const ConfirmedSetupPatchSchema = z
	.object({
		timelinePreferences: TimelinePreferencesPatchSchema.optional(),
		titlePreferences: TitlePreferencesPatchSchema.optional(),
		captionPreferences: CaptionPreferencesPatchSchema.optional(),
		voicePreferences: VoicePreferencesPatchSchema.optional(),
		characterPreferences: CharacterPreferencesPatchSchema.optional(),
		bgmPreferences: BgmPreferencesSchema.optional(),
		templatePreference: TemplatePreferenceSchema.optional(),
		networkMaterialMatching: NetworkMaterialMatchingPatchSchema.optional(),
		exportPreferences: ExportPreferencesPatchSchema.optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (
			value.timelinePreferences === undefined &&
			value.titlePreferences === undefined &&
			value.captionPreferences === undefined &&
			value.voicePreferences === undefined &&
			value.characterPreferences === undefined &&
			value.bgmPreferences === undefined &&
			value.templatePreference === undefined &&
			value.networkMaterialMatching === undefined &&
			value.exportPreferences === undefined
		) {
			ctx.addIssue({
				code: "custom",
				message: "patch must update at least one preference group.",
			});
		}
	});

export const UpdateProjectPreferencesArgsSchema = z
	.object({
		projectId: z.string().trim().min(1),
		baseRevision: z.number().int().positive(),
		confirmationToken: z.string().trim().min(1),
		patch: ConfirmedSetupPatchSchema,
		reason: z.string().trim().min(1).optional(),
	})
	.strict();

export type ConfirmedSetup = z.infer<typeof ConfirmedSetupSchema>;
export type ConfirmedSetupPatch = z.infer<typeof ConfirmedSetupPatchSchema>;
export type TitlePreferences = ConfirmedSetup["titlePreferences"];
export type CaptionPreferences = ConfirmedSetup["captionPreferences"];
export type ExportPreferences = ConfirmedSetup["exportPreferences"];
export type VoicePreferences = ConfirmedSetup["voicePreferences"];
export type CharacterPreferences = ConfirmedSetup["characterPreferences"];
export type BgmPreferences = ConfirmedSetup["bgmPreferences"];
export type BgmCandidate = z.infer<typeof BgmCandidateSchema>;
export type TemplatePreference = ConfirmedSetup["templatePreference"];
export type ConfirmedNetworkMaterialMatching =
	ConfirmedSetup["networkMaterialMatching"];
export type DurationContract = z.infer<typeof DurationContractSchema>;
export type DurationGoal = z.infer<typeof DurationGoalSchema>;

export function captionStyleFromConfirmedSetup(
	confirmedSetup: ConfirmedSetup,
): EditPlanCaptionStyle {
	assertCaptionsEnabled(confirmedSetup);
	return {
		preset: confirmedSetup.captionPreferences.stylePreset,
		position: "lower-safe",
		size: confirmedSetup.captionPreferences.size,
	};
}

type ExplicitCaptionStyleForContract = Omit<EditPlanCaptionStyle, "size"> & {
	size?: EditPlanCaptionStyle["size"];
};

export function resolveCaptionStyleForContract({
	confirmedSetup,
	explicitCaptionStyle,
}: {
	confirmedSetup?: ConfirmedSetup;
	explicitCaptionStyle?: ExplicitCaptionStyleForContract;
}): EditPlanCaptionStyle {
	if (!confirmedSetup) {
		if (!explicitCaptionStyle) {
			throw new Error(
				"captionStyle is required when the project has no confirmedSetup captionPreferences.",
			);
		}
		if (!explicitCaptionStyle.size) {
			throw new Error(
				"captionStyle.size is required when the project has no confirmedSetup captionPreferences.",
			);
		}
		return explicitCaptionStyle as EditPlanCaptionStyle;
	}

	const expected = captionStyleFromConfirmedSetup(confirmedSetup);
	if (!explicitCaptionStyle) return expected;
	if (explicitCaptionStyle.preset !== expected.preset) {
		throw new Error(
			`captionStyle.preset conflicts with confirmedSetup.captionPreferences.stylePreset: expected ${expected.preset}.`,
		);
	}
	if (explicitCaptionStyle.position !== expected.position) {
		throw new Error(
			`captionStyle.position conflicts with confirmedSetup caption position: expected ${expected.position}.`,
		);
	}
	if (
		explicitCaptionStyle.size !== undefined &&
		explicitCaptionStyle.size !== expected.size
	) {
		throw new Error(
			`captionStyle.size conflicts with confirmedSetup.captionPreferences.size: expected ${expected.size}.`,
		);
	}
	if (explicitCaptionStyle.motionPreset !== undefined) {
		throw new Error(
			"captionStyle.motionPreset conflicts with confirmedSetup because caption motion is not part of the confirmed setup contract.",
		);
	}
	return expected;
}

export function assertCaptionsEnabled(confirmedSetup?: ConfirmedSetup) {
	if (confirmedSetup?.captionPreferences.enabled === false) {
		throw new Error("Captions are disabled in confirmedSetup.");
	}
}

export function assertEditPlanTextPreferences({
	confirmedSetup,
	title,
	captionCount,
	hasCaptionStyle,
}: {
	confirmedSetup?: ConfirmedSetup;
	title?: { text: string; stylePreset?: string };
	captionCount: number;
	hasCaptionStyle: boolean;
}) {
	if (!confirmedSetup) return;
	if (!confirmedSetup.captionPreferences.enabled) {
		if (captionCount > 0 || hasCaptionStyle) {
			throw new Error("Captions are disabled in confirmedSetup.");
		}
	}
	if (!confirmedSetup.titlePreferences.enabled) {
		if (title) {
			throw new Error("Titles are disabled in confirmedSetup.");
		}
		return;
	}
	if (!title) {
		throw new Error("Title is required by confirmedSetup.");
	}
	const titleMode = confirmedSetup.titlePreferences.mode ?? "custom";
	if (
		titleMode === "custom" &&
		title.text !== confirmedSetup.titlePreferences.text
	) {
		throw new Error(
			`title.text conflicts with confirmedSetup.titlePreferences.text: expected ${confirmedSetup.titlePreferences.text}.`,
		);
	}
	if (title.stylePreset !== confirmedSetup.titlePreferences.stylePreset) {
		throw new Error(
			`title.stylePreset conflicts with confirmedSetup.titlePreferences.stylePreset: expected ${confirmedSetup.titlePreferences.stylePreset}.`,
		);
	}
}

export function resolveCaptionLanguageForContract({
	confirmedSetup,
	explicitLanguage,
}: {
	confirmedSetup?: ConfirmedSetup;
	explicitLanguage: unknown;
}): unknown {
	if (!confirmedSetup) return explicitLanguage;
	const expected = confirmedSetup.captionPreferences.language;
	if (
		explicitLanguage !== undefined &&
		normalizeCaptionLanguageForContractMatch(explicitLanguage) !==
			normalizeCaptionLanguageForContractMatch(expected)
	) {
		throw new Error(
			`language conflicts with confirmedSetup.captionPreferences.language: expected ${expected}.`,
		);
	}
	return expected;
}

function normalizeCaptionLanguageForContractMatch(value: unknown): unknown {
	if (typeof value !== "string") return value;
	const normalized = value.trim().toLowerCase();
	if (normalized === "auto") return normalized;
	return normalized.split("-")[0];
}

export function applyCaptionPreferencesToTextRaw({
	raw,
	captionPreferences,
}: {
	raw: TextElementRaw;
	captionPreferences: CaptionPreferences;
}): TextElementRaw {
	const scale = CAPTION_SIZE_SCALE[captionPreferences.size];
	return {
		...raw,
		fontSize:
			typeof raw.fontSize === "number"
				? Number((raw.fontSize * scale).toFixed(3))
				: raw.fontSize,
		...(captionPreferences.font === "auto"
			? {}
			: { fontFamily: captionPreferences.font }),
	};
}

export function resolveExportPreferencesForContract({
	confirmedSetup,
	explicitFormat,
	explicitQuality,
	explicitIncludeAudio,
}: {
	confirmedSetup?: ConfirmedSetup;
	explicitFormat?: string;
	explicitQuality?: string;
	explicitIncludeAudio?: boolean;
}): ExportPreferences {
	if (!confirmedSetup) {
		if (
			explicitFormat === undefined ||
			explicitQuality === undefined ||
			explicitIncludeAudio === undefined
		) {
			throw new Error(
				"format, quality, and includeAudio are required when the project has no confirmedSetup exportPreferences.",
			);
		}
		return {
			format: explicitFormat as ExportPreferences["format"],
			quality: explicitQuality as ExportPreferences["quality"],
			includeAudio: explicitIncludeAudio,
		};
	}

	const expected = confirmedSetup.exportPreferences;
	if (explicitFormat !== undefined && explicitFormat !== expected.format) {
		throw new Error(
			`format conflicts with confirmedSetup.exportPreferences.format: expected ${expected.format}.`,
		);
	}
	if (explicitQuality !== undefined && explicitQuality !== expected.quality) {
		throw new Error(
			`quality conflicts with confirmedSetup.exportPreferences.quality: expected ${expected.quality}.`,
		);
	}
	if (
		explicitIncludeAudio !== undefined &&
		explicitIncludeAudio !== expected.includeAudio
	) {
		throw new Error(
			`includeAudio conflicts with confirmedSetup.exportPreferences.includeAudio: expected ${expected.includeAudio}.`,
		);
	}
	return expected;
}

export function applyConfirmedSetupPatch({
	confirmedSetup,
	patch,
	reason,
	changedAt = new Date().toISOString(),
}: {
	confirmedSetup: ConfirmedSetup;
	patch: ConfirmedSetupPatch;
	reason: string;
	changedAt?: string;
}): {
	confirmedSetup: ConfirmedSetup;
	changedFields: string[];
	requiresReplan: boolean;
} {
	const current = ConfirmedSetupSchema.parse(confirmedSetup);
	const parsedPatchInput = ConfirmedSetupPatchSchema.parse(patch);
	const voicePreferences =
		parsedPatchInput.voicePreferences === undefined
			? current.voicePreferences
			: normalizePatchedVoicePreferences({
					...current.voicePreferences,
					...parsedPatchInput.voicePreferences,
				});
	const bgmPreferences =
		parsedPatchInput.bgmPreferences === undefined
			? current.bgmPreferences
			: normalizePatchedBgmPreferences(parsedPatchInput.bgmPreferences);
	const parsedPatch = {
		...parsedPatchInput,
		...(parsedPatchInput.voicePreferences === undefined
			? {}
			: { voicePreferences }),
		...(parsedPatchInput.bgmPreferences === undefined
			? {}
			: { bgmPreferences }),
	};
	const next = ConfirmedSetupSchema.parse({
		...current,
		timelinePreferences: {
			...current.timelinePreferences,
			...(parsedPatch.timelinePreferences ?? {}),
		},
		titlePreferences: {
			...current.titlePreferences,
			...(parsedPatch.titlePreferences ?? {}),
		},
		captionPreferences: {
			...current.captionPreferences,
			...(parsedPatch.captionPreferences ?? {}),
		},
		voicePreferences,
		characterPreferences: {
			...current.characterPreferences,
			...(parsedPatch.characterPreferences ?? {}),
		},
		bgmPreferences,
		templatePreference:
			parsedPatch.templatePreference ?? current.templatePreference,
		networkMaterialMatching: {
			...current.networkMaterialMatching,
			...(parsedPatch.networkMaterialMatching ?? {}),
		},
		exportPreferences: {
			...current.exportPreferences,
			...(parsedPatch.exportPreferences ?? {}),
		},
		changes: [...current.changes],
	});
	const changes = collectPatchChanges({
		before: current,
		after: next,
		patch: parsedPatch,
		reason,
		changedAt,
	});
	next.changes.push(...changes);
	return {
		confirmedSetup: ConfirmedSetupSchema.parse(next),
		changedFields: changes.map((change) => change.field),
		requiresReplan: changes.some((change) =>
			[
				"timelinePreferences.durationGoal",
				"timelinePreferences.durationContract",
				"timelinePreferences.transitionPreference",
				"timelinePreferences.generateIntroCover",
				"titlePreferences.enabled",
				"titlePreferences.mode",
				"titlePreferences.text",
				"titlePreferences.stylePreset",
				"captionPreferences.enabled",
				"voicePreferences.enabled",
				"voicePreferences.voicePackId",
				"voicePreferences.customVoiceFile",
				"voicePreferences.voiceCloneSourceFile",
				"characterPreferences.characterId",
				"bgmPreferences.mode",
				"bgmPreferences.searchQuery",
				"bgmPreferences.candidates",
				"bgmPreferences.selectedCandidate",
				"templatePreference",
				"networkMaterialMatching.enabled",
				"networkMaterialMatching.placement",
				"networkMaterialMatching.providers",
				"networkMaterialMatching.resolvedTemplateId",
				"networkMaterialMatching.decisionSource",
			].some(
				(prefix) =>
					change.field === prefix || change.field.startsWith(`${prefix}.`),
			),
		),
	};
}

function normalizePatchedVoicePreferences(
	value: VoicePreferences,
): VoicePreferences {
	if (!value.enabled) {
		return { enabled: false, voicePackId: "none" };
	}
	if (value.voicePackId === "custom") {
		return {
			enabled: true,
			voicePackId: value.voicePackId,
			customVoiceFile: value.customVoiceFile,
		};
	}
	if (value.voicePackId === "voice_clone") {
		return {
			enabled: true,
			voicePackId: value.voicePackId,
			voiceCloneSourceFile: value.voiceCloneSourceFile,
		};
	}
	return { enabled: true, voicePackId: value.voicePackId };
}

function normalizePatchedBgmPreferences(value: BgmPreferences): BgmPreferences {
	if (value.mode === "none") {
		return { mode: "none" };
	}
	return value;
}

function collectPatchChanges({
	before,
	after,
	patch,
	reason,
	changedAt,
}: {
	before: ConfirmedSetup;
	after: ConfirmedSetup;
	patch: ConfirmedSetupPatch;
	reason: string;
	changedAt: string;
}): Array<z.infer<typeof ConfirmedSetupChangeSchema>> {
	const fields = flattenPatchFields(patch);
	return fields
		.map((field) => ({
			changedAt,
			field,
			oldValue: getPathValue(before, field),
			newValue: getPathValue(after, field),
			reason,
		}))
		.filter((change) => change.oldValue !== change.newValue);
}

function flattenPatchFields(value: unknown, prefix = ""): string[] {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return prefix ? [prefix] : [];
	}
	const fields: string[] = [];
	for (const [key, child] of Object.entries(value)) {
		const childPrefix = prefix ? `${prefix}.${key}` : key;
		fields.push(...flattenPatchFields(child, childPrefix));
	}
	return fields;
}

function getPathValue(value: unknown, path: string): unknown {
	return path.split(".").reduce<unknown>((current, key) => {
		if (!current || typeof current !== "object") return undefined;
		return (current as Record<string, unknown>)[key];
	}, value);
}
