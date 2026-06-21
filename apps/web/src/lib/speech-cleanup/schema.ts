import { EditPlanAspectRatioSchema } from "@/lib/agent-bridge/edit-plan/schema";
import { z } from "zod";

export const SpeechCleanupActionSchema = z.enum(["keep", "drop"]);

export const SpeechCleanupDropReasonSchema = z.enum([
	"filler",
	"mistake",
	"repeat",
	"restart",
	"pause",
	"other",
]);

const BaseDecisionSchema = z
	.object({
		id: z.string().min(1),
		text: z.string().min(1),
		sourceStart: z.number().min(0),
		sourceEnd: z.number().min(0),
		reason: z.string().min(1),
	})
	.strict();

export const KeepDecisionSchema = BaseDecisionSchema.extend({
	action: z.literal("keep"),
	dropReason: z.never().optional(),
}).strict();

export const DropDecisionSchema = BaseDecisionSchema.extend({
	action: z.literal("drop"),
	dropReason: SpeechCleanupDropReasonSchema,
}).strict();

export const SpeechCleanupDecisionSchema = z
	.discriminatedUnion("action", [KeepDecisionSchema, DropDecisionSchema])
	.superRefine((decision, ctx) => {
		if (decision.sourceEnd <= decision.sourceStart) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "sourceEnd must be greater than sourceStart",
				path: ["sourceEnd"],
			});
		}
	});

export const SpeechCleanupPlanSchema = z
	.object({
		version: z.literal(2),
		projectId: z.string().min(1),
		sourceMediaId: z.string().min(1),
		target: z
			.object({
				durationSec: z.number().positive(),
				aspectRatio: EditPlanAspectRatioSchema,
			})
			.strict(),
		decisions: z.array(SpeechCleanupDecisionSchema).min(1),
		rationale: z.string().min(1),
	})
	.strict()
	.superRefine((plan, ctx) => {
		let previousStart = 0;
		let previousEnd = 0;

		for (let index = 0; index < plan.decisions.length; index += 1) {
			const decision = plan.decisions[index];
			if (index > 0 && decision.sourceStart < previousStart) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "SpeechCleanup decisions must be sorted by sourceStart.",
					path: ["decisions", index, "sourceStart"],
				});
			} else if (index > 0 && decision.sourceStart < previousEnd) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "SpeechCleanup decisions must not overlap.",
					path: ["decisions", index, "sourceStart"],
				});
			}

			previousStart = decision.sourceStart;
			previousEnd = decision.sourceEnd;
		}
	});

export type SpeechCleanupAction = z.infer<typeof SpeechCleanupActionSchema>;
export type SpeechCleanupDropReason = z.infer<
	typeof SpeechCleanupDropReasonSchema
>;
export type SpeechCleanupDecision = z.infer<typeof SpeechCleanupDecisionSchema>;
export type SpeechCleanupPlan = z.infer<typeof SpeechCleanupPlanSchema>;

export interface RebuiltSpeechCaption {
	id: string;
	text: string;
	startTime: number;
	duration: number;
	sourceStart: number;
	sourceEnd: number;
}

export interface SpeechCleanupStats {
	total: number;
	keep: number;
	drop: number;
	dropReasons: Partial<Record<SpeechCleanupDropReason, number>>;
}

export interface SpeechCleanupVerification {
	timelineContiguous: boolean;
	captionsWithinTimeline: boolean;
	sourceTraceAvailable: boolean;
	warnings: string[];
}
