import type { Template } from "../schema";
import { createTemplate } from "../registry";
import type { LegacyTemplateRecord } from "../migration";

const now = new Date("2026-07-01T00:00:00.000Z");

export function createUserTemplate(
	overrides: Partial<Template> = {},
): Template {
	return createTemplate({
		id: "user-proof",
		name: "User proof",
		description: "User template.",
		source: "user",
		readOnly: false,
		trigger: {
			types: ["product-proof-ad"],
			defaultForTypes: ["product-proof-ad"],
			aliases: ["user proof"],
		},
		plan: {
			objective: "Build a user proof short.",
			steps: [
				{
					id: "hook",
					label: "Hook",
					instruction: "Open with proof.",
				},
			],
			verification: ["Claims are evidence-backed."],
		},
		execution: {
			path: "edit-plan-v1",
			requiredEvidence: ["transcript", "visual-proof", "product-facts"],
			defaultStructure: ["hook", "proof", "CTA"],
			captionPreset: "product-punch",
			stopConditions: ["Product facts are missing."],
		},
		networkMaterialPolicy: {
			defaultEnabled: false,
			searchBasis: "voiceover_content",
			defaultPlacement: "background",
			allowedPlacements: ["background", "top", "bottom"],
		},
		now,
		...overrides,
	});
}

export function createLegacyTemplateRecord(
	overrides: Partial<LegacyTemplateRecord> = {},
): LegacyTemplateRecord {
	return {
		id: "legacy-proof",
		name: "Legacy proof",
		description: "Legacy template record.",
		trigger: {
			types: ["product-proof-ad"],
			defaultForTypes: ["product-proof-ad"],
			aliases: ["legacy proof"],
		},
		script: {
			objective: "Build a proof-led product short.",
			steps: [
				{
					id: "hook",
					label: "Hook",
					instruction: "Open with proof.",
				},
			],
			verification: ["Claims are evidence-backed."],
		},
		createdAt: "2026-06-22T00:00:00.000Z",
		updatedAt: "2026-06-22T00:00:00.000Z",
		...overrides,
	};
}
