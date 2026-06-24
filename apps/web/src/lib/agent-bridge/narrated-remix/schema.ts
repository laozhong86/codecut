import { z } from "zod";
import { EditPlanCaptionStyleSchema } from "@/lib/agent-bridge/edit-plan/schema";

export const NarratedRemixAspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);

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
		cardText: z
			.object({
				title: z.string().trim().min(1),
				info: z.string().trim().min(1),
				bottomText: z.string().trim().min(1),
			})
			.strict(),
		reason: z.string().min(1),
	})
	.strict();

export const NarratedRemixVisualBeatUnionSchema = z.union([
	NarratedRemixImageBeatSchema,
	NarratedRemixVisualBeatSchema,
]);

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
		visualBeats: z.array(NarratedRemixVisualBeatUnionSchema).min(1),
		narration: NarratedRemixNarrationSchema,
		captions: z.array(NarratedRemixCaptionSchema),
		captionStyle: EditPlanCaptionStyleSchema.optional(),
		rationale: z.string().min(1),
	})
	.strict();

export type NarratedRemixPlan = z.infer<typeof NarratedRemixPlanSchema>;
