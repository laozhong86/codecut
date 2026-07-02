import { EditPlanCaptionStylePresetSchema } from "@/lib/agent-bridge/edit-plan/schema";
import { NetworkMaterialPolicySchema } from "@/lib/network-materials/schema";
import { z } from "zod";

export const TemplateTriggerTypeSchema = z.enum([
	"talking-head-short",
	"talking-head-broll-split",
	"tutorial-demo",
	"product-proof-ad",
	"narrated-broll",
	"subtitle-pass",
	"timeline-inspection",
	"custom",
]);

export const TemplateExecutionPathSchema = z.enum([
	"edit-plan-v1",
	"speech-cleanup-to-edit-plan-v1",
	"narrated-remix-v1",
	"composite-layout-v1",
]);

export const TemplateRequiredEvidenceSchema = z.enum([
	"transcript",
	"visual-proof",
	"product-facts",
	"existing-narration-audio",
	"visual-broll",
]);

export const TemplateSourceSchema = z.enum(["built-in", "user"]);

export const TemplateStepSchema = z
	.object({
		id: z.string().min(1),
		label: z.string().min(1),
		instruction: z.string().min(1),
	})
	.strict();

export const TemplatePlanSchema = z
	.object({
		objective: z.string().min(1),
		steps: z.array(TemplateStepSchema).min(1),
		verification: z.array(z.string().min(1)).min(1),
	})
	.strict();

export const TemplateTriggerSchema = z
	.object({
		types: z.array(TemplateTriggerTypeSchema).min(1),
		defaultForTypes: z.array(TemplateTriggerTypeSchema).default([]),
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

export const TemplateExecutionSchema = z
	.object({
		path: TemplateExecutionPathSchema,
		requiredEvidence: z.array(TemplateRequiredEvidenceSchema).min(1),
		defaultStructure: z.array(z.string().min(1)).min(1),
		captionPreset: EditPlanCaptionStylePresetSchema.optional(),
		stopConditions: z.array(z.string().min(1)).min(1),
	})
	.strict()
	.superRefine((execution, ctx) => {
		if (execution.path === "narrated-remix-v1" && execution.captionPreset) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "narrated-remix-v1 templates must not declare captionPreset.",
				path: ["captionPreset"],
			});
		}
	});

export const TemplateSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1),
		description: z.string().optional(),
		source: TemplateSourceSchema,
		readOnly: z.boolean(),
		trigger: TemplateTriggerSchema,
		plan: TemplatePlanSchema,
		execution: TemplateExecutionSchema,
		networkMaterialPolicy: NetworkMaterialPolicySchema,
		createdAt: z.string().datetime(),
		updatedAt: z.string().datetime(),
	})
	.strict()
	.superRefine((template, ctx) => {
		if (template.source === "built-in" && template.readOnly !== true) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "built-in templates must be read-only.",
				path: ["readOnly"],
			});
		}
		if (template.source === "user" && template.readOnly !== false) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "user templates must be editable.",
				path: ["readOnly"],
			});
		}
	});

export interface TemplateMaterialFacts {
	hasTranscript?: boolean;
	hasVisualProof?: boolean;
	hasProductFacts?: boolean;
	hasExistingNarrationAudio?: boolean;
	hasVisualBroll?: boolean;
}

export type TemplateTriggerType = z.infer<typeof TemplateTriggerTypeSchema>;
export type TemplateExecutionPath = z.infer<typeof TemplateExecutionPathSchema>;
export type TemplateRequiredEvidence = z.infer<
	typeof TemplateRequiredEvidenceSchema
>;
export type TemplateSource = z.infer<typeof TemplateSourceSchema>;
export type TemplateStep = z.infer<typeof TemplateStepSchema>;
export type TemplatePlan = z.infer<typeof TemplatePlanSchema>;
export type TemplateTrigger = z.infer<typeof TemplateTriggerSchema>;
export type TemplateExecution = z.infer<typeof TemplateExecutionSchema>;
export type TemplateMaterialPolicy = z.infer<
	typeof NetworkMaterialPolicySchema
>;
export type Template = z.infer<typeof TemplateSchema>;

export type TemplateResolution =
	| {
			success: true;
			template: Template;
			match: {
				mode: "specified" | "auto";
				requestedTemplate?: string;
				triggerType?: TemplateTriggerType;
			};
	  }
	| {
			success: false;
			code:
				| "not-found"
				| "no-trigger-match"
				| "ambiguous-default"
				| "missing-evidence";
			message: string;
			triggerType?: TemplateTriggerType;
			templateId?: string;
			templateIds?: string[];
			missingEvidence?: TemplateRequiredEvidence[];
	  };
