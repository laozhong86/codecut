import { z } from "zod";
import { VideoTemplateIdSchema } from "@/lib/video-templates/schema";

export const LocalTemplateTriggerTypeSchema = z.union([
	VideoTemplateIdSchema,
	z.enum(["subtitle-pass", "timeline-inspection", "custom"]),
]);

export const LocalTemplateScriptStepSchema = z
	.object({
		id: z.string().min(1),
		label: z.string().min(1),
		instruction: z.string().min(1),
	})
	.strict();

export const LocalTemplateScriptBodySchema = z
	.object({
		objective: z.string().min(1),
		steps: z.array(LocalTemplateScriptStepSchema).min(1),
		verification: z.array(z.string().min(1)).min(1),
	})
	.strict();

export const LocalTemplateScriptTriggerSchema = z
	.object({
		types: z.array(LocalTemplateTriggerTypeSchema).default([]),
		defaultForTypes: z.array(LocalTemplateTriggerTypeSchema).default([]),
		aliases: z.array(z.string().min(1)).default([]),
	})
	.strict()
	.superRefine((trigger, ctx) => {
		const triggerTypes = new Set(trigger.types);
		for (const type of trigger.defaultForTypes) {
			if (!triggerTypes.has(type)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "defaultForTypes must be declared in trigger.types.",
					path: ["defaultForTypes"],
				});
			}
		}
	});

export const LocalTemplateScriptSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1),
		description: z.string().optional(),
		trigger: LocalTemplateScriptTriggerSchema,
		script: LocalTemplateScriptBodySchema,
		createdAt: z.string().datetime(),
		updatedAt: z.string().datetime(),
	})
	.strict();

export type LocalTemplateTriggerType = z.infer<
	typeof LocalTemplateTriggerTypeSchema
>;
export type LocalTemplateScriptStep = z.infer<
	typeof LocalTemplateScriptStepSchema
>;
export type LocalTemplateScriptBody = z.infer<
	typeof LocalTemplateScriptBodySchema
>;
export type LocalTemplateScriptTrigger = z.infer<
	typeof LocalTemplateScriptTriggerSchema
>;
export type LocalTemplateScript = z.infer<typeof LocalTemplateScriptSchema>;
