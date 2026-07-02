import { describe, expect, test } from "bun:test";
import { createTemplate, resolveTemplate } from "../registry";
import type { Template } from "../schema";

const now = new Date("2026-07-01T00:00:00.000Z");

function userTemplate(overrides: Partial<Template> = {}): Template {
	return createTemplate({
		id: "custom-proof",
		name: "Custom proof",
		description: "User proof template.",
		source: "user",
		readOnly: false,
		trigger: {
			types: ["product-proof-ad"],
			defaultForTypes: ["product-proof-ad"],
			aliases: ["proof alias"],
		},
		plan: {
			objective: "Build a custom proof short.",
			steps: [
				{
					id: "hook",
					label: "Hook",
					instruction: "Open with user-selected proof.",
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
		...overrides,
		networkMaterialPolicy: {
			defaultEnabled: false,
			searchBasis: "voiceover_content",
			defaultPlacement: "background",
			allowedPlacements: ["background", "top", "bottom"],
		},
		now,
	});
}

describe("resolveTemplate", () => {
	test("resolves an explicitly requested user template by alias", () => {
		const result = resolveTemplate({
			userTemplates: [userTemplate()],
			requestedTemplate: "proof alias",
			materialFacts: {
				hasTranscript: true,
				hasVisualProof: true,
				hasProductFacts: true,
			},
		});

		expect(result).toMatchObject({
			success: true,
			match: { mode: "specified", requestedTemplate: "proof alias" },
			template: { id: "custom-proof", source: "user" },
		});
	});

	test("uses a user default before a built-in default during auto matching", () => {
		const result = resolveTemplate({
			userTemplates: [userTemplate()],
			userIntent: "剪一个带货 UGC 广告",
			materialFacts: {
				hasTranscript: true,
				hasVisualProof: true,
				hasProductFacts: true,
			},
		});

		expect(result).toMatchObject({
			success: true,
			match: { mode: "auto", triggerType: "product-proof-ad" },
			template: { id: "custom-proof", source: "user" },
		});
	});

	test("falls back to the built-in default when no user default exists", () => {
		const result = resolveTemplate({
			userTemplates: [],
			userIntent: "帮我把这段口播去废话，剪得紧凑一点",
			materialFacts: { hasTranscript: true },
		});

		expect(result).toMatchObject({
			success: true,
			template: { id: "talking-head-short", source: "built-in" },
		});
	});

	test("resolves the TikTok explainer template alias to the talking-head short template", () => {
		const result = resolveTemplate({
			userTemplates: [],
			requestedTemplate: "TikTok 解说视频模板",
			materialFacts: { hasTranscript: true },
		});

		expect(result).toMatchObject({
			success: true,
			match: {
				mode: "specified",
				requestedTemplate: "TikTok 解说视频模板",
			},
			template: { id: "talking-head-short", source: "built-in" },
		});
	});

	test("fails fast when selected template evidence is missing", () => {
		const result = resolveTemplate({
			userTemplates: [userTemplate()],
			userIntent: "剪一个商品带货广告",
			materialFacts: { hasTranscript: true },
		});

		expect(result).toEqual({
			success: false,
			code: "missing-evidence",
			templateId: "custom-proof",
			message: "Template custom-proof requires visual-proof and product-facts.",
			missingEvidence: ["visual-proof", "product-facts"],
		});
	});

	test("fails when more than one user template is default for the same trigger", () => {
		const result = resolveTemplate({
			userTemplates: [
				userTemplate({ id: "first" }),
				userTemplate({ id: "second" }),
			],
			userIntent: "剪一个商品带货广告",
			materialFacts: {
				hasTranscript: true,
				hasVisualProof: true,
				hasProductFacts: true,
			},
		});

		expect(result).toEqual({
			success: false,
			code: "ambiguous-default",
			message:
				"Multiple user templates are default for trigger product-proof-ad: first, second.",
			triggerType: "product-proof-ad",
			templateIds: ["first", "second"],
		});
	});
});
