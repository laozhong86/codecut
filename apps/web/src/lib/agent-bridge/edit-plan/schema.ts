import { z } from "zod";

export const EditPlanAspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);

export const EditPlanCaptionStylePresetSchema = z.enum([
	"short-form-bold",
	"black-bar",
]);

export const EditPlanCaptionPositionSchema = z.enum(["lower-safe", "center"]);

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
		reason: z.string().min(1),
	})
	.strict();

export const EditPlanTimedTextSchema = z
	.object({
		text: z.string().min(1),
		startTime: z.number().min(0),
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
		title: EditPlanTimedTextSchema.optional(),
		captions: z.array(EditPlanTimedTextSchema).optional(),
		captionStyle: EditPlanCaptionStyleSchema.optional(),
		rationale: z.string().min(1),
	})
	.strict();

export type EditPlan = z.infer<typeof EditPlanSchema>;
export type EditPlanClip = z.infer<typeof EditPlanClipSchema>;
export type EditPlanTimedText = z.infer<typeof EditPlanTimedTextSchema>;
export type EditPlanCaptionStyle = z.infer<typeof EditPlanCaptionStyleSchema>;
