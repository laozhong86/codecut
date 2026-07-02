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

const BgmPreferencesSchema = z
	.object({
		mode: z.enum(["none", "smart_match"]),
	})
	.strict();

const CustomVoiceFileSchema = z
	.object({
		name: z.string().trim().min(1),
		url: z.string().trim().min(1),
		path: z.string().trim().min(1).optional(),
	})
	.strict();

const VoicePreferencesBaseSchema = z
	.object({
		enabled: z.boolean(),
		voicePackId: BuiltInVoicePackIdSchema,
		customVoiceFile: CustomVoiceFileSchema.optional(),
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
		if (value.voicePackId !== "custom" && value.customVoiceFile) {
			ctx.addIssue({
				code: "custom",
				message:
					"voicePreferences.customVoiceFile is only allowed for custom voice.",
				path: ["customVoiceFile"],
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
			requestedTemplate: z.string().trim().min(1),
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
const BgmPreferencesPatchSchema = BgmPreferencesSchema.partial().strict();
const NetworkMaterialMatchingPatchSchema =
	NetworkMaterialMatchingSchema.partial().strict();

export const ConfirmedSetupPatchSchema = z
	.object({
		timelinePreferences: TimelinePreferencesPatchSchema.optional(),
		titlePreferences: TitlePreferencesPatchSchema.optional(),
		captionPreferences: CaptionPreferencesPatchSchema.optional(),
		voicePreferences: VoicePreferencesPatchSchema.optional(),
		characterPreferences: CharacterPreferencesPatchSchema.optional(),
		bgmPreferences: BgmPreferencesPatchSchema.optional(),
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
	const parsedPatch = {
		...parsedPatchInput,
		...(parsedPatchInput.voicePreferences === undefined
			? {}
			: { voicePreferences }),
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
		bgmPreferences: {
			...current.bgmPreferences,
			...(parsedPatch.bgmPreferences ?? {}),
		},
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
				"characterPreferences.characterId",
				"bgmPreferences.mode",
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
	if (value.voicePackId !== "custom") {
		return { enabled: true, voicePackId: value.voicePackId };
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
