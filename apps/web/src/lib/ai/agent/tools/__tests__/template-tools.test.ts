import { describe, expect, test } from "bun:test";
import type { StorageAdapter } from "@/services/storage/types";
import { createTemplate, TemplateService, type Template } from "@/lib/templates";
import { getToolByName } from "../index";
import {
	executeDeleteTemplateTool,
	executeGetTemplateTool,
	executeImportTemplateTool,
	executeListTemplatesTool,
	executeResolveTemplateTool,
	executeUpdateTemplateTool,
} from "../template-tools";

class MemoryAdapter<T extends { id: string }> implements StorageAdapter<T> {
	private records = new Map<string, T>();

	async get(key: string): Promise<T | null> {
		return this.records.get(key) ?? null;
	}

	async set(key: string, value: T): Promise<void> {
		this.records.set(key, { ...value, id: key });
	}

	async remove(key: string): Promise<void> {
		this.records.delete(key);
	}

	async list(): Promise<string[]> {
		return [...this.records.keys()];
	}

	async clear(): Promise<void> {
		this.records.clear();
	}
}

function buildTemplate(id = "proof-demo-cut"): Template {
	return createTemplate({
		id,
		name: "Proof demo cut",
		description: "A proof-led template.",
		source: "user",
		readOnly: false,
		trigger: {
			types: ["product-proof-ad"],
			defaultForTypes: [],
			aliases: ["proof demo"],
		},
		plan: {
			objective: "Create a proof-led product demo short.",
			steps: [
				{
					id: "open-with-proof",
					label: "Open with proof",
					instruction: "Open with visible proof before any product claim.",
				},
			],
			verification: ["Claims map to visible proof or supplied product facts."],
		},
		execution: {
			path: "edit-plan-v1",
			requiredEvidence: ["transcript", "visual-proof", "product-facts"],
			defaultStructure: ["hook", "proof", "CTA"],
			captionPreset: "product-punch",
			stopConditions: ["Product facts are missing."],
		},
		now: new Date("2026-07-01T00:00:00.000Z"),
	});
}

function buildService() {
	return new TemplateService({
		adapter: new MemoryAdapter<Template>(),
	});
}

describe("template tools", () => {
	test("registers the unified template tool names only", () => {
		expect(getToolByName({ name: "list_templates" })).toMatchObject({
			name: "list_templates",
			requiresConfirmation: false,
		});
		expect(getToolByName({ name: "get_template" })).toMatchObject({
			name: "get_template",
			requiresConfirmation: false,
		});
		expect(getToolByName({ name: "resolve_template" })).toMatchObject({
			name: "resolve_template",
			requiresConfirmation: false,
		});
		expect(getToolByName({ name: "import_template" })).toMatchObject({
			name: "import_template",
			requiresConfirmation: true,
		});
		expect(
			getToolByName({
				name: ["list", "system", "template", "scripts"].join("_"),
			}),
		).toBeUndefined();
		expect(
			getToolByName({
				name: ["import", "system", "template", "script"].join("_"),
			}),
		).toBeUndefined();
	});

	test("imports a confirmed template into the unified template library", async () => {
		const service = buildService();

		const result = await executeImportTemplateTool({
			args: { confirmedByUser: true, template: buildTemplate() },
			service,
		});

		expect(result).toEqual({
			success: true,
			message: 'Imported template "Proof demo cut" (proof-demo-cut).',
			data: {
				templateId: "proof-demo-cut",
				name: "Proof demo cut",
				source: "user",
				readOnly: false,
				triggerTypes: ["product-proof-ad"],
				defaultForTypes: [],
				aliases: ["proof demo"],
				stepCount: 1,
				verificationCount: 1,
				templateCount: 5,
				sourceOfTruth: "codecut-template-library",
				visibleInTemplatesUi: true,
			},
		});
	});

	test("lists built-in and user templates", async () => {
		const service = buildService();
		await service.registerTemplate({ template: buildTemplate() });

		const result = await executeListTemplatesTool({ args: {}, service });

		expect(result).toMatchObject({
			success: true,
			data: {
				templateCount: 5,
				sourceOfTruth: "codecut-template-library",
			},
		});
		expect(
			(result.data as { templates: Array<{ templateId: string }> }).templates.map(
				(template) => template.templateId,
			),
		).toContain("talking-head-short");
		expect(
			(result.data as { templates: Array<{ templateId: string }> }).templates.map(
				(template) => template.templateId,
			),
		).toContain("proof-demo-cut");
	});

	test("gets one complete template by ID", async () => {
		const service = buildService();
		const template = buildTemplate();
		await service.registerTemplate({ template });

		const result = await executeGetTemplateTool({
			args: { templateId: "proof-demo-cut" },
			service,
		});

		expect(result).toEqual({
			success: true,
			message: 'Read template "Proof demo cut" (proof-demo-cut).',
			data: {
				template,
				sourceOfTruth: "codecut-template-library",
			},
		});
	});

	test("resolves a template by alias or auto trigger", async () => {
		const service = buildService();
		const template = {
			...buildTemplate(),
			trigger: {
				types: ["product-proof-ad" as const],
				defaultForTypes: ["product-proof-ad" as const],
				aliases: ["proof demo"],
			},
		};
		await service.registerTemplate({ template });

		await expect(
			executeResolveTemplateTool({
				args: {
					requestedTemplate: "proof demo",
					hasTranscript: true,
					hasVisualProof: true,
					hasProductFacts: true,
				},
				service,
			}),
		).resolves.toMatchObject({
			success: true,
			data: {
				resolution: {
					template: { id: "proof-demo-cut" },
					match: { mode: "specified", requestedTemplate: "proof demo" },
				},
			},
		});

		await expect(
			executeResolveTemplateTool({
				args: {
					userIntent: "剪一个商品带货广告",
					hasTranscript: true,
					hasVisualProof: true,
					hasProductFacts: true,
				},
				service,
			}),
		).resolves.toMatchObject({
			success: true,
			data: {
				resolution: {
					template: { id: "proof-demo-cut" },
					match: { mode: "auto", triggerType: "product-proof-ad" },
				},
			},
		});
	});

	test("updates and deletes confirmed user templates", async () => {
		const service = buildService();
		await service.registerTemplate({ template: buildTemplate() });

		const updated = await executeUpdateTemplateTool({
			args: {
				confirmedByUser: true,
				template: { ...buildTemplate(), name: "Proof demo cut v2" },
			},
			service,
		});
		expect(updated).toMatchObject({
			success: true,
			message: 'Updated template "Proof demo cut v2" (proof-demo-cut).',
		});

		const deleted = await executeDeleteTemplateTool({
			args: { confirmedByUser: true, templateId: "proof-demo-cut" },
			service,
		});
		expect(deleted).toMatchObject({
			success: true,
			message: 'Deleted template "Proof demo cut v2" (proof-demo-cut).',
		});
	});
});
