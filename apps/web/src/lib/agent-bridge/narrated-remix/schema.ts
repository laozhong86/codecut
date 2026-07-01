import { z } from "zod";
import {
	EditPlanCaptionStyleSchema,
	EditPlanTextRichSpanSchema,
} from "@/lib/agent-bridge/edit-plan/schema";

export const NarratedRemixAspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);
const HexColorSchema = z
	.string()
	.trim()
	.regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
const TextOverlayCoordinateSchema = z.number().min(-960).max(960);
const TextOverlayBackgroundShapeSchema = z.number().min(0).max(100);

function requireBackgroundColorForBackgroundStyle(
	overlay: {
		backgroundColor?: string;
		backgroundOpacity?: number;
		backgroundPaddingX?: number;
		backgroundPaddingY?: number;
		backgroundBorderRadius?: number;
	},
	context: z.RefinementCtx,
): void {
	const hasBackgroundStyle =
		overlay.backgroundOpacity !== undefined ||
		overlay.backgroundPaddingX !== undefined ||
		overlay.backgroundPaddingY !== undefined ||
		overlay.backgroundBorderRadius !== undefined;
	if (hasBackgroundStyle && overlay.backgroundColor === undefined) {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			message: "backgroundColor is required when background styling is present.",
			path: ["backgroundColor"],
		});
	}
}

const NarratedRemixTextOverlayBaseSchema = z
	.object({
		name: z.string().trim().min(1).max(80),
		text: z.string().trim().min(1).max(240),
		fontSize: z.number().min(1).max(38),
		color: HexColorSchema,
		backgroundColor: HexColorSchema.optional(),
		backgroundOpacity: z.number().min(0).max(1).optional(),
		backgroundPaddingX: TextOverlayBackgroundShapeSchema.optional(),
		backgroundPaddingY: TextOverlayBackgroundShapeSchema.optional(),
		backgroundBorderRadius: TextOverlayBackgroundShapeSchema.optional(),
		boxWidth: z.number().min(1).max(100),
		position: z
			.object({
				x: TextOverlayCoordinateSchema,
				y: TextOverlayCoordinateSchema,
			})
			.strict(),
		textAlign: z.enum(["left", "center", "right"]),
		fontWeight: z.enum(["normal", "bold"]),
		richSpans: z.array(EditPlanTextRichSpanSchema).optional(),
	})
	.strict();

export const NarratedRemixTextOverlaySchema =
	NarratedRemixTextOverlayBaseSchema.superRefine(
		requireBackgroundColorForBackgroundStyle,
	);

export const NarratedRemixVisualBeatSchema = z
	.object({
		mediaType: z.literal("video").optional(),
		id: z.string().min(1),
		mediaId: z.string().min(1),
		sourceStart: z.number().min(0),
		sourceEnd: z.number().min(0),
		timelineStart: z.number().min(0),
		muted: z.literal(true),
		reason: z.string().min(1),
	})
	.strict();

export const NarratedRemixImageBeatSchema = z
	.object({
		mediaType: z.literal("image"),
		id: z.string().min(1),
		mediaId: z.string().min(1),
		timelineStart: z.number().min(0),
		duration: z.number().positive(),
		fit: z.literal("cover"),
		reason: z.string().min(1),
	})
	.strict();

export const NarratedRemixTimedTextOverlaySchema =
	NarratedRemixTextOverlayBaseSchema.extend({
		startTime: z.number().min(0),
		duration: z.number().positive(),
	})
		.strict()
		.superRefine(requireBackgroundColorForBackgroundStyle);

export const NarratedRemixVisualBeatUnionSchema = z.union([
	NarratedRemixImageBeatSchema,
	NarratedRemixVisualBeatSchema,
]);

export const NarratedRemixNarrationSchema = z
	.object({
		mediaId: z.string().min(1),
		sourceStart: z.number().min(0),
		timelineStart: z.number().min(0).optional(),
		durationSec: z.number().positive().optional(),
	})
	.strict();

export const NarratedRemixCaptionSchema = z
	.object({
		text: z.string().min(1),
		startTime: z.number().min(0),
		duration: z.number().positive(),
	})
	.strict();

export const NarratedRemixCaptionSourceSchema = z
	.object({
		type: z.literal("post-cut-audio"),
		tool: z.literal("build-post-cut-captions"),
		source: z.enum([
			"edited_video_clip_audio",
			"edited_timeline_audio",
			"scripted_tts_audio",
		]),
		trace: z
			.array(
				z
					.object({
						mediaId: z.string().min(1),
						timelineStart: z.number().min(0),
						sourceStart: z.number().min(0),
						sourceEnd: z.number().min(0),
						captionCount: z.number().int().min(0),
					})
					.strict(),
			)
			.min(1),
		voiceConsistency: z
			.object({
				provider: z.enum([
					"imported-tts",
					"runninghub-voice-design",
					"runninghub-voice-clone",
				]),
				providerTaskId: z.string().min(1).optional(),
				alignmentMethod: z.literal("scripted_captions_to_asr_segments"),
				scriptCaptionLineCount: z.number().int().min(0),
				protectedTermCount: z.number().int().min(0),
			})
			.strict()
			.optional(),
	})
	.strict();

export const NarratedRemixPlanSchema = z
	.object({
		version: z.literal(1),
		projectId: z.string().min(1),
		target: z
			.object({
				durationSec: z.number().positive(),
				aspectRatio: NarratedRemixAspectRatioSchema,
			})
			.strict(),
		visualBeats: z.array(NarratedRemixVisualBeatUnionSchema).min(1),
		narration: NarratedRemixNarrationSchema,
		textOverlays: z
			.array(NarratedRemixTimedTextOverlaySchema)
			.max(24)
			.optional(),
		captions: z.array(NarratedRemixCaptionSchema),
		captionStyle: EditPlanCaptionStyleSchema.optional(),
		captionSource: NarratedRemixCaptionSourceSchema.optional(),
		rationale: z.string().min(1),
	})
	.strict();

export type NarratedRemixPlan = z.infer<typeof NarratedRemixPlanSchema>;
