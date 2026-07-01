import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";
import type { StorageAdapter } from "@/services/storage/types";
import {
	migrateLegacyTemplateRecord,
	type LegacyTemplateRecord,
} from "./migration";
import {
	TemplateSchema,
	type Template,
	type TemplateMaterialFacts,
	type TemplateTriggerType,
} from "./schema";
import {
	builtInTemplates,
	getBuiltInTemplate,
	resolveTemplate,
} from "./registry";

export class TemplateService {
	constructor(
		private readonly options: {
			adapter: StorageAdapter<Template>;
			legacyAdapter?: StorageAdapter<LegacyTemplateRecord>;
		},
	) {}

	private async migrateLegacyTemplates(): Promise<void> {
		if (!this.options.legacyAdapter) return;

		const legacyIds = await this.options.legacyAdapter.list();
		if (legacyIds.length === 0) return;

		const existingIds = new Set(await this.options.adapter.list());
		const migratedTemplates: Template[] = [];
		const failures: string[] = [];

		for (const id of legacyIds) {
			if (existingIds.has(id)) continue;
			const legacyTemplate = await this.options.legacyAdapter.get(id);
			if (!legacyTemplate) continue;
			try {
				migratedTemplates.push(migrateLegacyTemplateRecord(legacyTemplate));
			} catch (error) {
				failures.push(
					`${id}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		if (failures.length > 0) {
			throw new Error(`Legacy template migration blocked: ${failures.join("; ")}`);
		}

		for (const template of migratedTemplates) {
			await this.options.adapter.set(template.id, template);
		}
	}

	private async assertUserDefaultTriggersAvailable({
		template,
		excludeId,
	}: {
		template: Template;
		excludeId?: string;
	}): Promise<void> {
		if (template.trigger.defaultForTypes.length === 0) return;
		const userTemplates = await this.listUserTemplates();
		for (const type of template.trigger.defaultForTypes) {
			const existing = userTemplates.find(
				(candidate) =>
					candidate.id !== excludeId &&
					candidate.trigger.defaultForTypes.includes(type),
			);
			if (existing) {
				throw new Error(
					`Default trigger type ${type} is already used by ${existing.id}.`,
				);
			}
		}
	}

	async registerTemplate({
		template,
	}: {
		template: Template;
	}): Promise<Template> {
		await this.migrateLegacyTemplates();
		const parsed = TemplateSchema.parse(template);
		if (parsed.source !== "user" || parsed.readOnly) {
			throw new Error("Only user templates can be registered.");
		}
		if (getBuiltInTemplate(parsed.id)) {
			throw new Error(`Template ID is reserved for a built-in template: ${parsed.id}`);
		}
		const existing = await this.options.adapter.get(parsed.id);
		if (existing) {
			throw new Error(`Template already exists: ${parsed.id}`);
		}
		await this.assertUserDefaultTriggersAvailable({ template: parsed });
		await this.options.adapter.set(parsed.id, parsed);
		return parsed;
	}

	async updateTemplate({
		id,
		updates,
		now = new Date(),
	}: {
		id: string;
		updates: Partial<Omit<Template, "id" | "source" | "readOnly" | "createdAt" | "updatedAt">>;
		now?: Date;
	}): Promise<Template> {
		await this.migrateLegacyTemplates();
		const template = await this.options.adapter.get(id);
		if (!template) {
			if (getBuiltInTemplate(id)) {
				throw new Error(`Built-in template cannot be updated: ${id}`);
			}
			throw new Error(`Template not found: ${id}`);
		}
		const updatedTemplate = TemplateSchema.parse({
			...template,
			...updates,
			id: template.id,
			source: "user",
			readOnly: false,
			createdAt: template.createdAt,
			updatedAt: now.toISOString(),
		});
		await this.assertUserDefaultTriggersAvailable({
			template: updatedTemplate,
			excludeId: id,
		});
		await this.options.adapter.set(id, updatedTemplate);
		return updatedTemplate;
	}

	async getTemplate({ id }: { id: string }): Promise<Template | null> {
		await this.migrateLegacyTemplates();
		const builtIn = getBuiltInTemplate(id);
		if (builtIn) return builtIn;
		const template = await this.options.adapter.get(id);
		return template ? TemplateSchema.parse(template) : null;
	}

	async listUserTemplates(): Promise<Template[]> {
		await this.migrateLegacyTemplates();
		const ids = await this.options.adapter.list();
		const templates = await Promise.all(
			ids.map((id) => this.options.adapter.get(id)),
		);
		return templates
			.filter((template): template is Template => Boolean(template))
			.map((template) => TemplateSchema.parse(template))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	async listTemplates(): Promise<Template[]> {
		return [...builtInTemplates, ...(await this.listUserTemplates())];
	}

	async deleteTemplate({ id }: { id: string }): Promise<void> {
		await this.migrateLegacyTemplates();
		if (getBuiltInTemplate(id)) {
			throw new Error(`Built-in template cannot be deleted: ${id}`);
		}
		await this.options.adapter.remove(id);
	}

	async resolveTemplate({
		requestedTemplate,
		triggerType,
		userIntent,
		platformHint,
		materialFacts,
	}: {
		requestedTemplate?: string;
		triggerType?: TemplateTriggerType;
		userIntent?: string;
		platformHint?: string;
		materialFacts: TemplateMaterialFacts;
	}) {
		return resolveTemplate({
			userTemplates: await this.listUserTemplates(),
			requestedTemplate,
			triggerType,
			userIntent,
			platformHint,
			materialFacts,
		});
	}
}

export const templateService = new TemplateService({
	adapter: new IndexedDBAdapter<Template>("video-editor-templates", "templates"),
	legacyAdapter: new IndexedDBAdapter<LegacyTemplateRecord>(
		"video-editor-template-scripts",
		"template-scripts",
	),
});
