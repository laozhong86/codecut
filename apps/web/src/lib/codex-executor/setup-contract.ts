import { z } from "zod";
import {
	EditPlanAspectRatioSchema,
	EditPlanCaptionStylePresetSchema,
	EditPlanTransitionTypeSchema,
	type EditPlanCaptionStyle,
} from "@/lib/agent-bridge/edit-plan/schema";
import type { buildTextElement } from "@/lib/timeline/element-utils";
import { isCodecutLocalFontFamily } from "@/lib/codecut-fonts";

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
]);

const VoicePreferencesSchema = z
	.object({
		voicePackId: BuiltInVoicePackIdSchema,
	})
	.strict();

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
		captionPreferences: CaptionPreferencesSchema,
		voicePreferences: VoicePreferencesSchema.optional(),
		exportPreferences: ExportPreferencesSchema,
		changes: z.array(ConfirmedSetupChangeSchema),
	})
	.strict();

const TimelinePreferencesPatchSchema =
	TimelinePreferencesBaseSchema.partial().strict();
const CaptionPreferencesPatchSchema =
	CaptionPreferencesSchema.partial().strict();
const ExportPreferencesPatchSchema = ExportPreferencesSchema.partial().strict();
const VoicePreferencesPatchSchema = VoicePreferencesSchema.partial().strict();

export const ConfirmedSetupPatchSchema = z
	.object({
		timelinePreferences: TimelinePreferencesPatchSchema.optional(),
		captionPreferences: CaptionPreferencesPatchSchema.optional(),
		voicePreferences: VoicePreferencesPatchSchema.optional(),
		exportPreferences: ExportPreferencesPatchSchema.optional(),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (
			value.timelinePreferences === undefined &&
			value.captionPreferences === undefined &&
			value.voicePreferences === undefined &&
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
export type CaptionPreferences = ConfirmedSetup["captionPreferences"];
export type ExportPreferences = ConfirmedSetup["exportPreferences"];
export type VoicePreferences = ConfirmedSetup["voicePreferences"];
export type DurationContract = z.infer<typeof DurationContractSchema>;
export type DurationGoal = z.infer<typeof DurationGoalSchema>;

export function captionStyleFromConfirmedSetup(
	confirmedSetup: ConfirmedSetup,
): EditPlanCaptionStyle {
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
	const parsedPatch = ConfirmedSetupPatchSchema.parse(patch);
	const next = ConfirmedSetupSchema.parse({
		...confirmedSetup,
		timelinePreferences: {
			...confirmedSetup.timelinePreferences,
			...(parsedPatch.timelinePreferences ?? {}),
		},
		captionPreferences: {
			...confirmedSetup.captionPreferences,
			...(parsedPatch.captionPreferences ?? {}),
		},
		voicePreferences:
			parsedPatch.voicePreferences === undefined
				? confirmedSetup.voicePreferences
				: {
						...confirmedSetup.voicePreferences,
						...parsedPatch.voicePreferences,
					},
		exportPreferences: {
			...confirmedSetup.exportPreferences,
			...(parsedPatch.exportPreferences ?? {}),
		},
		changes: [...confirmedSetup.changes],
	});
	const changes = collectPatchChanges({
		before: confirmedSetup,
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
				"voicePreferences.voicePackId",
			].some(
				(prefix) =>
					change.field === prefix || change.field.startsWith(`${prefix}.`),
			),
		),
	};
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
