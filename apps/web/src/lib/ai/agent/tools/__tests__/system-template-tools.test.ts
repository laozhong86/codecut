import { describe, expect, test } from "bun:test";
import type { StorageAdapter } from "@/services/storage/types";
import { createLocalTemplateScript } from "@/lib/template-scripts";
import {
	LocalTemplateScriptService,
	type LocalTemplateScriptRecord,
} from "@/lib/template-scripts/service";
import { getToolByName } from "../index";
import {
	executeDeleteSystemTemplateScriptTool,
	executeImportSystemTemplateScriptTool,
	executeUpdateSystemTemplateScriptTool,
} from "../system-template-tools";

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

function buildTemplate(id = "proof-demo-cut"): LocalTemplateScriptRecord {
	return createLocalTemplateScript({
		id,
		name: "Proof demo cut",
		description: "A proof-led system template script.",
		trigger: {
			types: ["product-proof-ad"],
			defaultForTypes: [],
			aliases: ["proof demo"],
		},
		script: {
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
		now: new Date("2026-06-23T00:00:00.000Z"),
	});
}

function buildUpdatedTemplate(id = "proof-demo-cut"): LocalTemplateScriptRecord {
	return createLocalTemplateScript({
		id,
		name: "Proof demo cut v2",
		description: "An updated proof-led system template script.",
		trigger: {
			types: ["product-proof-ad"],
			defaultForTypes: [],
			aliases: ["proof update"],
		},
		script: {
			objective: "Create an updated proof-led product demo short.",
			steps: [
				{
					id: "open-with-proof",
					label: "Open with proof",
					instruction: "Open with the strongest visible proof before any claim.",
				},
				{
					id: "close-with-evidence",
					label: "Close with evidence",
					instruction: "End with a visible proof recovery instead of a generic CTA.",
				},
			],
			verification: [
				"Claims map to visible proof or supplied product facts.",
				"get_timeline_state verifies the proof recovery appears before export.",
			],
		},
		now: new Date("2026-06-24T00:00:00.000Z"),
	});
}

describe("system template script tools", () => {
	test("registers the system template import tool for Codex bridge use", () => {
		const tool = getToolByName({ name: "import_system_template_script" });

		expect(tool?.name).toBe("import_system_template_script");
		expect(tool?.requiresConfirmation).toBe(true);
	});

	test("refuses to import a draft template without explicit user confirmation", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});

		const result = await executeImportSystemTemplateScriptTool({
			args: {
				confirmedByUser: false,
				template: buildTemplate(),
			},
			service,
		});

		expect(result).toEqual({
			success: false,
			message:
				"Template import requires explicit user confirmation before writing to Codecut system templates.",
		});
		expect(await service.listTemplates()).toEqual([]);
	});

	test("imports a confirmed draft into the Codecut system template library", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});

		const result = await executeImportSystemTemplateScriptTool({
			args: {
				confirmedByUser: true,
				template: buildTemplate(),
			},
			service,
		});

		expect(result).toEqual({
			success: true,
			message:
				'Imported system template script "Proof demo cut" (proof-demo-cut).',
			data: {
				templateId: "proof-demo-cut",
				name: "Proof demo cut",
				triggerTypes: ["product-proof-ad"],
				defaultForTypes: [],
				aliases: ["proof demo"],
				stepCount: 1,
				verificationCount: 1,
				templateCount: 1,
				sourceOfTruth: "codecut-system-template-library",
				visibleInTemplatesUi: true,
			},
		});
		expect((await service.listTemplates()).map((template) => template.id)).toEqual([
			"proof-demo-cut",
		]);
	});

	test("registers the system template update tool for Codex bridge use", () => {
		const tool = getToolByName({ name: "update_system_template_script" });

		expect(tool?.name).toBe("update_system_template_script");
		expect(tool?.requiresConfirmation).toBe(true);
	});

	test("refuses to update a system template without explicit user confirmation", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});
		await service.registerTemplate({ template: buildTemplate() });

		const result = await executeUpdateSystemTemplateScriptTool({
			args: {
				confirmedByUser: false,
				template: buildUpdatedTemplate(),
			},
			service,
		});

		expect(result).toEqual({
			success: false,
			message:
				"Template update requires explicit user confirmation before changing Codecut system templates.",
		});
		expect(await service.getTemplate({ id: "proof-demo-cut" })).toMatchObject({
			name: "Proof demo cut",
			script: {
				objective: "Create a proof-led product demo short.",
			},
		});
	});

	test("updates a confirmed system template in place", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});
		const original = buildTemplate();
		await service.registerTemplate({ template: original });

		const result = await executeUpdateSystemTemplateScriptTool({
			args: {
				confirmedByUser: true,
				template: buildUpdatedTemplate(),
			},
			service,
		});

		expect(result).toEqual({
			success: true,
			message:
				'Updated system template script "Proof demo cut v2" (proof-demo-cut).',
			data: {
				templateId: "proof-demo-cut",
				name: "Proof demo cut v2",
				triggerTypes: ["product-proof-ad"],
				defaultForTypes: [],
				aliases: ["proof update"],
				stepCount: 2,
				verificationCount: 2,
				templateCount: 1,
				sourceOfTruth: "codecut-system-template-library",
				visibleInTemplatesUi: true,
			},
		});
		const updated = await service.getTemplate({ id: "proof-demo-cut" });
		expect(updated).toMatchObject({
			id: "proof-demo-cut",
			name: "Proof demo cut v2",
			createdAt: original.createdAt,
			trigger: {
				aliases: ["proof update"],
			},
			script: {
				objective: "Create an updated proof-led product demo short.",
			},
		});
		expect(updated?.updatedAt).not.toBe(original.updatedAt);
	});

	test("refuses to update a missing system template", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});

		const result = await executeUpdateSystemTemplateScriptTool({
			args: {
				confirmedByUser: true,
				template: buildUpdatedTemplate(),
			},
			service,
		});

		expect(result).toEqual({
			success: false,
			message: "System template script not found: proof-demo-cut.",
		});
		expect(await service.listTemplates()).toEqual([]);
	});

	test("fails fast when updating a template would duplicate a default trigger", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});
		await service.registerTemplate({ template: buildTemplate("proof-demo-cut") });
		await service.registerTemplate({
			template: {
				...buildTemplate("default-proof-cut"),
				trigger: {
					types: ["product-proof-ad"],
					defaultForTypes: ["product-proof-ad"],
					aliases: ["default proof"],
				},
			},
		});
		const conflictingUpdate = {
			...buildUpdatedTemplate(),
			trigger: {
				types: ["product-proof-ad"],
				defaultForTypes: ["product-proof-ad"],
				aliases: ["proof update"],
			},
		};

		await expect(
			executeUpdateSystemTemplateScriptTool({
				args: {
					confirmedByUser: true,
					template: conflictingUpdate,
				},
				service,
			}),
		).rejects.toThrow(
			"Default trigger type product-proof-ad is already used by default-proof-cut.",
		);
	});

	test("registers the system template delete tool for cleanup use", () => {
		const tool = getToolByName({ name: "delete_system_template_script" });

		expect(tool?.name).toBe("delete_system_template_script");
		expect(tool?.requiresConfirmation).toBe(true);
	});

	test("refuses to delete a system template without explicit user confirmation", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});
		await service.registerTemplate({ template: buildTemplate() });

		const result = await executeDeleteSystemTemplateScriptTool({
			args: {
				confirmedByUser: false,
				templateId: "proof-demo-cut",
			},
			service,
		});

		expect(result).toEqual({
			success: false,
			message:
				"Template delete requires explicit user confirmation before removing a Codecut system template.",
		});
		expect((await service.listTemplates()).map((template) => template.id)).toEqual([
			"proof-demo-cut",
		]);
	});

	test("deletes a confirmed system template from the Codecut system template library", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});
		await service.registerTemplate({ template: buildTemplate() });

		const result = await executeDeleteSystemTemplateScriptTool({
			args: {
				confirmedByUser: true,
				templateId: "proof-demo-cut",
			},
			service,
		});

		expect(result).toEqual({
			success: true,
			message: 'Deleted system template script "Proof demo cut" (proof-demo-cut).',
			data: {
				templateId: "proof-demo-cut",
				name: "Proof demo cut",
				templateCount: 0,
				sourceOfTruth: "codecut-system-template-library",
				visibleInTemplatesUi: false,
			},
		});
		expect(await service.listTemplates()).toEqual([]);
	});
});
