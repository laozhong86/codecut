import { describe, expect, test } from "bun:test";
import type { StorageAdapter } from "@/services/storage/types";
import { createLocalTemplateScript } from "../registry";
import {
	LocalTemplateScriptService,
	type LocalTemplateScriptRecord,
} from "../service";

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

const createdAt = new Date("2026-06-22T00:00:00.000Z");
const updatedAt = new Date("2026-06-23T00:00:00.000Z");

function buildRecord(id = "ugc-proof"): LocalTemplateScriptRecord {
	return createLocalTemplateScript({
		id,
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
					instruction: "Open with visible proof.",
				},
			],
			verification: ["Claims are evidence-backed."],
		},
		now: createdAt,
	});
}

describe("LocalTemplateScriptService", () => {
	test("registers and reads local template scripts from persistent storage", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});

		await service.registerTemplate({ template: buildRecord() });

		expect(await service.getTemplate({ id: "ugc-proof" })).toMatchObject({
			id: "ugc-proof",
			name: "UGC proof script",
		});
		expect(await service.listTemplates()).toHaveLength(1);
	});

	test("edits a registered template while preserving identity and createdAt", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});
		await service.registerTemplate({ template: buildRecord() });

		const edited = await service.updateTemplate({
			id: "ugc-proof",
			updates: {
				name: "Updated UGC proof script",
				script: {
					objective: "Updated objective.",
					steps: [
						{
							id: "proof",
							label: "Proof",
							instruction: "Keep only proof-backed product beats.",
						},
					],
					verification: ["Updated verification."],
				},
			},
			now: updatedAt,
		});

		expect(edited).toMatchObject({
			id: "ugc-proof",
			name: "Updated UGC proof script",
			createdAt: "2026-06-22T00:00:00.000Z",
			updatedAt: "2026-06-23T00:00:00.000Z",
		});
	});

	test("resolves persisted templates by requested alias or default trigger", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});
		await service.registerTemplate({ template: buildRecord("default-proof") });
		await service.registerTemplate({
			template: createLocalTemplateScript({
				id: "named-proof",
				name: "Named proof script",
				trigger: {
					types: ["tutorial-demo"],
					defaultForTypes: [],
					aliases: ["named script"],
				},
				script: {
					objective: "Named script objective.",
					steps: [
						{
							id: "named",
							label: "Named",
							instruction: "Use this script only when requested.",
						},
					],
					verification: ["Named verification."],
				},
				now: createdAt,
			}),
		});

		expect(
			(
				await service.resolveTemplate({
					requestedTemplate: "named script",
					triggerType: "product-proof-ad",
				})
			).id,
		).toBe("named-proof");
		expect(
			(await service.resolveTemplate({ triggerType: "product-proof-ad" })).id,
		).toBe("default-proof");
	});

	test("rejects duplicate default trigger registration", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});
		await service.registerTemplate({ template: buildRecord("first") });

		await expect(
			service.registerTemplate({ template: buildRecord("second") }),
		).rejects.toThrow(
			"Default trigger type product-proof-ad is already used by first.",
		);
	});

	test("deletes registered templates", async () => {
		const service = new LocalTemplateScriptService({
			adapter: new MemoryAdapter<LocalTemplateScriptRecord>(),
		});
		await service.registerTemplate({ template: buildRecord() });

		await service.deleteTemplate({ id: "ugc-proof" });

		expect(await service.getTemplate({ id: "ugc-proof" })).toBeNull();
	});
});
