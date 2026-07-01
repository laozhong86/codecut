import { describe, expect, test } from "bun:test";
import type { StorageAdapter } from "@/services/storage/types";
import { TemplateService } from "../service";
import type { Template } from "../schema";
import { createLegacyTemplateRecord, createUserTemplate } from "./test-helpers";

class MemoryAdapter<T extends { id: string }> implements StorageAdapter<T> {
	private records = new Map<string, T>();

	constructor(initial: T[] = []) {
		for (const record of initial) {
			this.records.set(record.id, record);
		}
	}

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

describe("TemplateService", () => {
	test("lists built-in and user templates from the unified template library", async () => {
		const service = new TemplateService({
			adapter: new MemoryAdapter<Template>([createUserTemplate()]),
		});

		const templates = await service.listTemplates();

		expect(templates.map((template) => template.id)).toContain(
			"talking-head-short",
		);
		expect(templates.map((template) => template.id)).toContain("user-proof");
	});

	test("migrates legacy template records before listing templates", async () => {
		const service = new TemplateService({
			adapter: new MemoryAdapter<Template>(),
			legacyAdapter: new MemoryAdapter([
				createLegacyTemplateRecord({ id: "legacy-proof" }),
			]),
		});

		const templates = await service.listUserTemplates();

		expect(templates.map((template) => template.id)).toEqual(["legacy-proof"]);
		expect(templates[0]?.execution.requiredEvidence).toEqual([
			"transcript",
			"visual-proof",
			"product-facts",
		]);
	});

	test("blocks listing when a legacy template cannot be migrated", async () => {
		const service = new TemplateService({
			adapter: new MemoryAdapter<Template>(),
			legacyAdapter: new MemoryAdapter([
				createLegacyTemplateRecord({
					id: "legacy-custom",
					trigger: { types: ["custom"], defaultForTypes: [], aliases: [] },
				}),
			]),
		});

		await expect(service.listUserTemplates()).rejects.toThrow(
			"Legacy template migration blocked: legacy-custom:",
		);
	});
});
