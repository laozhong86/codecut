import { z } from "zod";

export const NarratedRemixAspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);

export const NarratedRemixVisualBeatSchema = z
	.object({
		id: z.string().min(1),
		mediaId: z.string().min(1),
		sourceStart: z.number().min(0),
		sourceEnd: z.number().min(0),
		timelineStart: z.number().min(0),
		muted: z.literal(true),
		reason: z.string().min(1),
	})
	.strict();

export const NarratedRemixNarrationSchema = z
	.object({
		mediaId: z.string().min(1),
		sourceStart: z.number().min(0),
	})
	.strict();

export const NarratedRemixCaptionSchema = z
	.object({
		text: z.string().min(1),
		startTime: z.number().min(0),
		duration: z.number().positive(),
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
		visualBeats: z.array(NarratedRemixVisualBeatSchema).min(1),
		narration: NarratedRemixNarrationSchema,
		captions: z.array(NarratedRemixCaptionSchema),
		rationale: z.string().min(1),
	})
	.strict();

export type NarratedRemixPlan = z.infer<typeof NarratedRemixPlanSchema>;
