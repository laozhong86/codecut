import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";
import type { StorageAdapter } from "@/services/storage/types";
import type { LocalTemplateScript, LocalTemplateTriggerType } from "./schema";
import {
	resolveLocalTemplateScript,
	updateLocalTemplateScript,
} from "./registry";
import { LocalTemplateScriptSchema } from "./schema";

export type LocalTemplateScriptRecord = LocalTemplateScript;

export class LocalTemplateScriptService {
	constructor(
		private readonly options: {
			adapter: StorageAdapter<LocalTemplateScriptRecord>;
		},
	) {}

	private async assertDefaultTriggerTypesAvailable({
		template,
		excludeId,
	}: {
		template: LocalTemplateScriptRecord;
		excludeId?: string;
	}): Promise<void> {
		if (template.trigger.defaultForTypes.length === 0) return;
		const templates = await this.listTemplates();
		for (const type of template.trigger.defaultForTypes) {
			const existing = templates.find(
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
		template: LocalTemplateScriptRecord;
	}): Promise<LocalTemplateScriptRecord> {
		const parsed = LocalTemplateScriptSchema.parse(template);
		const existing = await this.options.adapter.get(parsed.id);
		if (existing) {
			throw new Error(`Local template script already exists: ${parsed.id}`);
		}
		await this.assertDefaultTriggerTypesAvailable({ template: parsed });
		await this.options.adapter.set(parsed.id, parsed);
		return parsed;
	}

	async updateTemplate({
		id,
		updates,
		now = new Date(),
	}: {
		id: string;
		updates: Partial<
			Omit<LocalTemplateScriptRecord, "id" | "createdAt" | "updatedAt">
		>;
		now?: Date;
	}): Promise<LocalTemplateScriptRecord> {
		const template = await this.options.adapter.get(id);
		if (!template) {
			throw new Error(`Local template script not found: ${id}`);
		}
		const updatedTemplate = updateLocalTemplateScript({
			template,
			updates,
			now,
		});
		await this.assertDefaultTriggerTypesAvailable({
			template: updatedTemplate,
			excludeId: id,
		});
		await this.options.adapter.set(id, updatedTemplate);
		return updatedTemplate;
	}

	async getTemplate({
		id,
	}: {
		id: string;
	}): Promise<LocalTemplateScriptRecord | null> {
		const template = await this.options.adapter.get(id);
		return template ? LocalTemplateScriptSchema.parse(template) : null;
	}

	async listTemplates(): Promise<LocalTemplateScriptRecord[]> {
		const ids = await this.options.adapter.list();
		const templates = await Promise.all(
			ids.map((id) => this.options.adapter.get(id)),
		);
		return templates
			.filter((template): template is LocalTemplateScriptRecord =>
				Boolean(template),
			)
			.map((template) => LocalTemplateScriptSchema.parse(template))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	async deleteTemplate({ id }: { id: string }): Promise<void> {
		await this.options.adapter.remove(id);
	}

	async resolveTemplate({
		requestedTemplate,
		triggerType,
	}: {
		requestedTemplate?: string;
		triggerType?: LocalTemplateTriggerType;
	}): Promise<LocalTemplateScriptRecord> {
		return resolveLocalTemplateScript({
			templates: await this.listTemplates(),
			requestedTemplate,
			triggerType,
		});
	}
}

export const localTemplateScriptService = new LocalTemplateScriptService({
	adapter: new IndexedDBAdapter<LocalTemplateScriptRecord>(
		"video-editor-template-scripts",
		"template-scripts",
	),
});
