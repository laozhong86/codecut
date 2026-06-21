import { describe, expect, test } from "bun:test";
import {
	VIDEO_TEMPLATE_IDS,
	getVideoTemplate,
	videoTemplateRegistry,
} from "../registry";

describe("videoTemplateRegistry", () => {
	test("registers exactly the four P0 video templates", () => {
		expect(VIDEO_TEMPLATE_IDS).toEqual([
			"talking-head-short",
			"tutorial-demo",
			"product-proof-ad",
			"narrated-broll",
		]);
		expect(videoTemplateRegistry).toHaveLength(4);
	});

	test("keeps template ids unique and retrievable", () => {
		const ids = videoTemplateRegistry.map((template) => template.id);

		expect(new Set(ids).size).toBe(ids.length);
		expect(getVideoTemplate("product-proof-ad")?.captionPreset).toBe(
			"product-punch",
		);
	});

	test("defines stop conditions and verification for every template", () => {
		for (const template of videoTemplateRegistry) {
			expect(template.stopConditions.length).toBeGreaterThan(0);
			expect(template.verification.length).toBeGreaterThan(0);
		}
	});

	test("uses NarratedRemixPlan only for narrated-broll", () => {
		expect(getVideoTemplate("narrated-broll")?.executionPath).toBe(
			"narrated-remix-v1",
		);
		expect(getVideoTemplate("narrated-broll")?.captionPreset).toBeUndefined();
	});
});
