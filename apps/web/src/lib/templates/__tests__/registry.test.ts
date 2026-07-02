import { describe, expect, test } from "bun:test";
import {
	BUILT_IN_TEMPLATE_IDS,
	builtInTemplates,
	getBuiltInTemplate,
} from "../registry";

describe("builtInTemplates", () => {
	test("registers the five built-in templates as read-only templates", () => {
		expect(BUILT_IN_TEMPLATE_IDS).toEqual([
			"talking-head-short",
			"talking-head-broll-split",
			"tutorial-demo",
			"product-proof-ad",
			"narrated-broll",
		]);
		expect(builtInTemplates).toHaveLength(5);
		expect(builtInTemplates.every((template) => template.readOnly)).toBe(true);
		expect(
			builtInTemplates.every((template) => template.source === "built-in"),
		).toBe(true);
	});

	test("uses each built-in template as the default for its own trigger", () => {
		for (const template of builtInTemplates) {
			const triggerType = template.id as (typeof BUILT_IN_TEMPLATE_IDS)[number];
			expect(template.trigger.defaultForTypes).toHaveLength(1);
			expect(template.trigger.defaultForTypes[0]).toBe(triggerType);
			expect(template.trigger.types).toContain(triggerType);
		}
	});

	test("keeps narrated-broll on the narrated remix execution path", () => {
		expect(getBuiltInTemplate("narrated-broll")?.execution.path).toBe(
			"narrated-remix-v1",
		);
		expect(
			getBuiltInTemplate("narrated-broll")?.execution.captionPreset,
		).toBeUndefined();
	});

	test("uses template policy to decide network material defaults", () => {
		expect(getBuiltInTemplate("narrated-broll")?.networkMaterialPolicy).toEqual(
			{
				defaultEnabled: true,
				searchBasis: "voiceover_content",
				defaultPlacement: "background",
				allowedPlacements: ["background"],
			},
		);
		expect(
			getBuiltInTemplate("talking-head-broll-split")?.networkMaterialPolicy,
		).toEqual({
			defaultEnabled: true,
			searchBasis: "voiceover_content",
			defaultPlacement: "top",
			allowedPlacements: ["top", "bottom"],
		});
		expect(
			getBuiltInTemplate("talking-head-short")?.networkMaterialPolicy
				.defaultEnabled,
		).toBe(false);
	});
});
