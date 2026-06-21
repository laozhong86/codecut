import { describe, expect, test } from "bun:test";
import { SpeechCleanupPlanSchema } from "../schema";

function validPlan() {
	return {
		version: 2,
		projectId: "project-1",
		sourceMediaId: "media-1",
		target: {
			durationSec: 8,
			aspectRatio: "16:9",
		},
		decisions: [
			{
				id: "seg-1",
				text: "嗯我重新说一下",
				sourceStart: 0,
				sourceEnd: 1.2,
				action: "drop",
				dropReason: "restart",
				reason: "Speaker restarts the sentence.",
			},
			{
				id: "seg-2",
				text: "平台红利不等于个人实力",
				sourceStart: 1.2,
				sourceEnd: 4.2,
				action: "keep",
				reason: "Core claim.",
			},
		],
		rationale: "Remove restart and keep the core claim.",
	};
}

describe("SpeechCleanupPlanSchema", () => {
	test("accepts a valid speech cleanup plan", () => {
		const result = SpeechCleanupPlanSchema.safeParse(validPlan());

		expect(result.success).toBe(true);
	});

	test("rejects a drop decision without dropReason", () => {
		const plan = validPlan();
		delete plan.decisions[0].dropReason;

		const result = SpeechCleanupPlanSchema.safeParse(plan);

		expect(result.success).toBe(false);
	});

	test("rejects a keep decision with dropReason", () => {
		const plan = validPlan();
		plan.decisions[1] = {
			...plan.decisions[1],
			dropReason: "filler",
		};

		const result = SpeechCleanupPlanSchema.safeParse(plan);

		expect(result.success).toBe(false);
	});

	test("rejects reversed source ranges", () => {
		const plan = validPlan();
		plan.decisions[1] = {
			...plan.decisions[1],
			sourceStart: 4.2,
			sourceEnd: 1.2,
		};

		const result = SpeechCleanupPlanSchema.safeParse(plan);

		expect(result.success).toBe(false);
	});

	test("rejects overlapping source ranges", () => {
		const plan = validPlan();
		plan.decisions = [
			{
				id: "seg-1",
				text: "第一段保留",
				sourceStart: 0,
				sourceEnd: 2,
				action: "keep",
				reason: "First claim.",
			},
			{
				id: "seg-2",
				text: "第二段保留",
				sourceStart: 1,
				sourceEnd: 3,
				action: "keep",
				reason: "Second claim.",
			},
		];

		const result = SpeechCleanupPlanSchema.safeParse(plan);

		expect(result.success).toBe(false);
	});
});
