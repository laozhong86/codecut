import { describe, expect, test } from "bun:test";
import { TemplateSchema } from "../schema";

function validTemplate() {
	return {
		id: "ugc-proof",
		name: "UGC proof",
		description: "Proof-led UGC template.",
		source: "user",
		readOnly: false,
		trigger: {
			types: ["product-proof-ad"],
			defaultForTypes: ["product-proof-ad"],
			aliases: ["ugc proof"],
		},
		plan: {
			objective: "Build a proof-led product short.",
			steps: [
				{
					id: "hook",
					label: "Hook",
					instruction: "Open with visible product proof.",
				},
			],
			verification: ["Every claim maps to supplied evidence."],
		},
		execution: {
			path: "edit-plan-v1",
			requiredEvidence: ["transcript", "visual-proof", "product-facts"],
			defaultStructure: ["hook", "proof", "CTA"],
			captionPreset: "product-punch",
			stopConditions: ["Product facts are missing."],
		},
		createdAt: "2026-07-01T00:00:00.000Z",
		updatedAt: "2026-07-01T00:00:00.000Z",
	};
}

describe("TemplateSchema", () => {
	test("accepts a unified user template with an execution profile", () => {
		const result = TemplateSchema.safeParse(validTemplate());

		expect(result.success).toBe(true);
	});

	test("rejects templates without an execution profile", () => {
		const { execution: _execution, ...template } = validTemplate();
		const result = TemplateSchema.safeParse(template);

		expect(result.success).toBe(false);
	});

	test("rejects default trigger types not declared on the template", () => {
		const result = TemplateSchema.safeParse({
			...validTemplate(),
			trigger: {
				types: ["tutorial-demo"],
				defaultForTypes: ["product-proof-ad"],
				aliases: [],
			},
		});

		expect(result.success).toBe(false);
	});
});
