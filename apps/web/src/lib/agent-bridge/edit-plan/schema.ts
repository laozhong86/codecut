import { z } from "zod";

export const EditPlanAspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);

export const EditPlanCaptionStylePresetSchema = z.enum([
	"short-form-bold",
	"black-bar",
	"talking-head-pop",
	"tutorial-clean",
	"documentary-soft",
	"product-punch",
	"lifestyle-warm",
	"cinematic-serif",
	"social-highlight",
	"comment-bubble",
	"minimal-reel",
]);

export const EditPlanCaptionPositionSchema = z.enum(["lower-safe", "center"]);

export const EditPlanTextStylePresetSchema = z.enum([
	"hook_title",
	"lower_title",
	"social_hook",
	"product_badge",
	"chapter_bumper",
]);

export const EditPlanAudioModeSchema = z.enum(["loop_to_timeline"]);

export const EditPlanTransitionTypeSchema = z.enum([
	"fade",
	"dissolve",
	"wipe-left",
	"wipe-right",
	"wipe-up",
	"wipe-down",
	"slide-left",
	"slide-right",
	"slide-up",
	"slide-down",
	"zoom-in",
	"zoom-out",
]);

export const EditPlanClipFitSchema = z.enum(["cover"]);

export const EditPlanSourceCropFitSchema = z.enum(["cover-to-canvas"]);

export const EditPlanSourceCropSchema = z
	.object({
		x: z.number(),
		y: z.number(),
		width: z.number(),
		height: z.number(),
		fit: EditPlanSourceCropFitSchema.optional(),
	})
	.strict();

export const EditPlanTextRichSpanSchema = z
	.object({
		start: z.number().int().min(0),
		end: z.number().int().min(0),
		color: z.string().min(1).optional(),
		fontScale: z.number().positive().optional(),
		fontWeight: z.enum(["normal", "bold"]).optional(),
		fontStyle: z.enum(["normal", "italic"]).optional(),
		stroke: z
			.object({
				color: z.string().min(1),
				width: z.number().positive(),
			})
			.strict()
			.optional(),
	})
	.strict();

export const EditPlanCaptionStyleSchema = z
	.object({
		preset: EditPlanCaptionStylePresetSchema,
		position: EditPlanCaptionPositionSchema,
	})
	.strict();

export const EditPlanClipSchema = z
	.object({
		id: z.string().min(1),
		sourceStart: z.number().min(0),
		sourceEnd: z.number().min(0),
		timelineStart: z.number().min(0),
		fit: EditPlanClipFitSchema.optional(),
		sourceCrop: EditPlanSourceCropSchema.optional(),
		reason: z.string().min(1),
	})
	.strict();

const EditPlanBaseTimedTextSchema = z.object({
	text: z.string().min(1),
	startTime: z.number().min(0),
	duration: z.number().positive(),
});

export const EditPlanTitleSchema = EditPlanBaseTimedTextSchema.extend({
	stylePreset: EditPlanTextStylePresetSchema.optional(),
	richSpans: z.array(EditPlanTextRichSpanSchema).optional(),
}).strict();

export const EditPlanCaptionSchema = EditPlanBaseTimedTextSchema.extend({
	richSpans: z.array(EditPlanTextRichSpanSchema).optional(),
}).strict();

export const EditPlanAudioSchema = z
	.object({
		bgm: z
			.object({
				assetId: z.string().min(1),
				volume: z.number().min(0).max(1),
				mode: EditPlanAudioModeSchema,
			})
			.strict()
			.optional(),
		sfx: z
			.array(
				z
					.object({
						assetId: z.string().min(1),
						startTime: z.number().min(0),
						volume: z.number().min(0).max(1),
					})
					.strict(),
			)
			.optional(),
	})
	.strict();

export const EditPlanTransitionSchema = z
	.object({
		fromClipId: z.string().min(1),
		toClipId: z.string().min(1),
		type: EditPlanTransitionTypeSchema,
		duration: z.number().positive(),
	})
	.strict();

export const EditPlanSchema = z
	.object({
		version: z.literal(1),
		projectId: z.string().min(1),
		sourceMediaId: z.string().min(1),
		target: z
			.object({
				durationSec: z.number().positive(),
				aspectRatio: EditPlanAspectRatioSchema,
			})
			.strict(),
		clips: z.array(EditPlanClipSchema).min(1),
		title: EditPlanTitleSchema.optional(),
		captions: z.array(EditPlanCaptionSchema).optional(),
		captionStyle: EditPlanCaptionStyleSchema.optional(),
		audio: EditPlanAudioSchema.optional(),
		transitions: z.array(EditPlanTransitionSchema).optional(),
		rationale: z.string().min(1),
	})
	.strict();

export type EditPlan = z.infer<typeof EditPlanSchema>;
export type EditPlanClip = z.infer<typeof EditPlanClipSchema>;
export type EditPlanTitle = z.infer<typeof EditPlanTitleSchema>;
export type EditPlanCaption = z.infer<typeof EditPlanCaptionSchema>;
export type EditPlanCaptionStyle = z.infer<typeof EditPlanCaptionStyleSchema>;
export type EditPlanTextStylePreset = z.infer<
	typeof EditPlanTextStylePresetSchema
>;
export type EditPlanAudio = z.infer<typeof EditPlanAudioSchema>;
export type EditPlanTransition = z.infer<typeof EditPlanTransitionSchema>;
export type EditPlanTextRichSpan = z.infer<typeof EditPlanTextRichSpanSchema>;
export type EditPlanClipFit = z.infer<typeof EditPlanClipFitSchema>;
export type EditPlanSourceCrop = z.infer<typeof EditPlanSourceCropSchema>;
export type EditPlanSourceCropFit = z.infer<
	typeof EditPlanSourceCropFitSchema
>;
