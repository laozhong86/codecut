import { describe, expect, test } from "bun:test";
import {
	createLocalTemplateScript,
	resolveLocalTemplateScript,
} from "../registry";

const now = new Date("2026-06-22T00:00:00.000Z");

function template(overrides = {}) {
	return createLocalTemplateScript({
		id: "ugc-proof",
		name: "UGC proof script",
		trigger: {
			types: ["product-proof-ad"],
			defaultForTypes: ["product-proof-ad"],
			aliases: ["ugc proof"],
		},
		script: {
			objective: "Build a proof-led product short.",
			steps: [
				{
					id: "hook",
					label: "Hook",
					instruction: "Open with the strongest visible product proof.",
				},
			],
			verification: ["Every claim maps to visible or supplied evidence."],
		},
		now,
		...overrides,
	});
}

describe("local template script registry", () => {
	test("creates a strict local template script with timestamps", () => {
		expect(template()).toMatchObject({
			id: "ugc-proof",
			name: "UGC proof script",
			trigger: {
				types: ["product-proof-ad"],
				defaultForTypes: ["product-proof-ad"],
				aliases: ["ugc proof"],
			},
			createdAt: "2026-06-22T00:00:00.000Z",
			updatedAt: "2026-06-22T00:00:00.000Z",
		});
	});

	test("rejects default trigger types not declared on the template", () => {
		expect(() =>
			template({
				trigger: {
					types: ["tutorial-demo"],
					defaultForTypes: ["product-proof-ad"],
					aliases: [],
				},
			}),
		).toThrow("defaultForTypes must be declared in trigger.types");
	});

	test("resolves an explicitly requested template before trigger defaults", () => {
		const requested = template({
			id: "requested-template",
			trigger: {
				types: ["tutorial-demo"],
				defaultForTypes: [],
				aliases: ["requested alias"],
			},
		});
		const defaultTemplate = template();

		expect(
			resolveLocalTemplateScript({
				templates: [defaultTemplate, requested],
				requestedTemplate: "requested alias",
				triggerType: "product-proof-ad",
			}).id,
		).toBe("requested-template");
	});

	test("resolves a single default template for a trigger type", () => {
		expect(
			resolveLocalTemplateScript({
				templates: [template()],
				triggerType: "product-proof-ad",
			}).id,
		).toBe("ugc-proof");
	});

	test("fails fast when trigger resolution is ambiguous", () => {
		const first = template({ id: "first" });
		const second = template({ id: "second" });

		expect(() =>
			resolveLocalTemplateScript({
				templates: [first, second],
				triggerType: "product-proof-ad",
			}),
		).toThrow("Multiple local template scripts match trigger type");
	});
});
