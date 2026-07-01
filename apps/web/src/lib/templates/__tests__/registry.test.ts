import { describe, expect, test } from "bun:test";
import {
	BUILT_IN_TEMPLATE_IDS,
	builtInTemplates,
	getBuiltInTemplate,
} from "../registry";

describe("builtInTemplates", () => {
	test("registers the four built-in templates as read-only templates", () => {
		expect(BUILT_IN_TEMPLATE_IDS).toEqual([
			"talking-head-short",
			"tutorial-demo",
			"product-proof-ad",
			"narrated-broll",
		]);
		expect(builtInTemplates).toHaveLength(4);
		expect(builtInTemplates.every((template) => template.readOnly)).toBe(true);
		expect(builtInTemplates.every((template) => template.source === "built-in"))
			.toBe(true);
	});

	test("uses each built-in template as the default for its own trigger", () => {
		for (const template of builtInTemplates) {
			const triggerType =
				template.id as (typeof BUILT_IN_TEMPLATE_IDS)[number];
			expect(template.trigger.defaultForTypes).toHaveLength(1);
			expect(template.trigger.defaultForTypes[0]).toBe(triggerType);
			expect(template.trigger.types).toContain(triggerType);
		}
	});

	test("keeps narrated-broll on the narrated remix execution path", () => {
		expect(getBuiltInTemplate("narrated-broll")?.execution.path).toBe(
			"narrated-remix-v1",
		);
		expect(getBuiltInTemplate("narrated-broll")?.execution.captionPreset)
			.toBeUndefined();
	});
});
