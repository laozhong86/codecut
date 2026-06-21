import { EditPlanCaptionStylePresetSchema } from "@/lib/agent-bridge/edit-plan/schema";
import { z } from "zod";

export const VideoTemplateIdSchema = z.enum([
	"talking-head-short",
	"tutorial-demo",
	"product-proof-ad",
	"narrated-broll",
]);

export const VideoTemplateExecutionPathSchema = z.enum([
	"edit-plan-v1",
	"speech-cleanup-to-edit-plan-v1",
	"narrated-remix-v1",
]);

export const VideoTemplateRequiredEvidenceSchema = z.enum([
	"transcript",
	"visual-proof",
	"product-facts",
	"existing-narration-audio",
	"video-broll",
]);

export const VideoTemplateManifestSchema = z
	.object({
		id: VideoTemplateIdSchema,
		label: z.string().min(1),
		intent: z.string().min(1),
		requiredEvidence: z.array(VideoTemplateRequiredEvidenceSchema).min(1),
		defaultStructure: z.array(z.string().min(1)).min(1),
		captionPreset: EditPlanCaptionStylePresetSchema.optional(),
		executionPath: VideoTemplateExecutionPathSchema,
		stopConditions: z.array(z.string().min(1)).min(1),
		verification: z.array(z.string().min(1)).min(1),
	})
	.strict()
	.superRefine((template, ctx) => {
		if (template.id === "product-proof-ad") {
			for (const evidence of ["visual-proof", "product-facts"] as const) {
				if (!template.requiredEvidence.includes(evidence)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `product-proof-ad requires ${evidence}.`,
						path: ["requiredEvidence"],
					});
				}
			}
		}

		if (template.id === "narrated-broll") {
			if (template.executionPath !== "narrated-remix-v1") {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "narrated-broll must use narrated-remix-v1.",
					path: ["executionPath"],
				});
			}
			if (template.captionPreset) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "narrated-broll must not declare captionPreset.",
					path: ["captionPreset"],
				});
			}
		}
	});

export type VideoTemplateId = z.infer<typeof VideoTemplateIdSchema>;
export type VideoTemplateExecutionPath = z.infer<
	typeof VideoTemplateExecutionPathSchema
>;
export type VideoTemplateRequiredEvidence = z.infer<
	typeof VideoTemplateRequiredEvidenceSchema
>;
export type VideoTemplateManifest = z.infer<typeof VideoTemplateManifestSchema>;
