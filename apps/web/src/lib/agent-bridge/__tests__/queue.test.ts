import { beforeEach, describe, expect, test } from "bun:test";
import {
	clearBridgeQueueForTests,
	completeBridgeQueueItem,
	enqueueBridgeEnvelope,
	getBridgeQueueItem,
	takePendingBridgeQueueItems,
} from "../queue";
import type { BridgeCommandResult } from "../schema";

const envelope = {
	version: 1 as const,
	projectId: "project-123",
	source: "codex" as const,
	commands: [{ id: "cmd-1", tool: "get_project_info" as const, args: {} }],
};

const validResults: BridgeCommandResult[] = [
	{
		commandId: "cmd-1",
		tool: "get_project_info",
		success: true,
		message: "ok",
	},
];

describe("agent bridge queue", () => {
	beforeEach(() => {
		clearBridgeQueueForTests();
	});

	test("enqueues and claims items by project", () => {
		const item = enqueueBridgeEnvelope({ envelope });
		const claimed = takePendingBridgeQueueItems({
			projectId: "project-123",
			limit: 5,
		});

		expect(claimed).toHaveLength(1);
		expect(claimed[0].id).toBe(item.id);
		expect(claimed[0].status).toBe("claimed");
	});

	test("claimed items are not claimed twice", () => {
		enqueueBridgeEnvelope({ envelope });

		const firstClaim = takePendingBridgeQueueItems({
			projectId: "project-123",
			limit: 5,
		});
		const secondClaim = takePendingBridgeQueueItems({
			projectId: "project-123",
			limit: 5,
		});

		expect(firstClaim).toHaveLength(1);
		expect(secondClaim).toHaveLength(0);
	});

	test("respects the claim limit", () => {
		enqueueBridgeEnvelope({ envelope });
		enqueueBridgeEnvelope({ envelope });
		enqueueBridgeEnvelope({ envelope });

		const firstClaim = takePendingBridgeQueueItems({
			projectId: "project-123",
			limit: 2,
		});
		const secondClaim = takePendingBridgeQueueItems({
			projectId: "project-123",
			limit: 2,
		});

		expect(firstClaim).toHaveLength(2);
		expect(secondClaim).toHaveLength(1);
	});

	test("does not claim commands from another project", () => {
		enqueueBridgeEnvelope({ envelope });
		const claimed = takePendingBridgeQueueItems({
			projectId: "other-project",
			limit: 5,
		});

		expect(claimed).toHaveLength(0);
	});

	test("stores command results", () => {
		const item = enqueueBridgeEnvelope({ envelope });
		takePendingBridgeQueueItems({
			projectId: "project-123",
			limit: 1,
		});

		completeBridgeQueueItem({
			id: item.id,
			results: validResults,
		});

		const stored = getBridgeQueueItem({ id: item.id });
		expect(stored?.status).toBe("completed");
		expect(stored?.results?.[0].message).toBe("ok");
	});

	test("rejects completion before an item is claimed", () => {
		const item = enqueueBridgeEnvelope({ envelope });

		expect(() =>
			completeBridgeQueueItem({
				id: item.id,
				results: validResults,
			}),
		).toThrow(`Bridge queue item "${item.id}" must be claimed before completion.`);

		const stored = getBridgeQueueItem({ id: item.id });
		expect(stored?.status).toBe("pending");
		expect(stored?.results).toBeUndefined();
	});

	test("rejects duplicate completion", () => {
		const item = enqueueBridgeEnvelope({ envelope });
		takePendingBridgeQueueItems({
			projectId: "project-123",
			limit: 1,
		});
		completeBridgeQueueItem({
			id: item.id,
			results: validResults,
		});

		expect(() =>
			completeBridgeQueueItem({
				id: item.id,
				results: validResults,
			}),
		).toThrow(`Bridge queue item "${item.id}" has already been completed.`);

		const stored = getBridgeQueueItem({ id: item.id });
		expect(stored?.status).toBe("completed");
		expect(stored?.results).toEqual(validResults);
	});

	test("rejects invalid result payloads without mutating the item", () => {
		const item = enqueueBridgeEnvelope({ envelope });
		takePendingBridgeQueueItems({
			projectId: "project-123",
			limit: 1,
		});
		const invalidResults = [
			{
				commandId: "cmd-1",
				tool: "get_project_info",
				success: true,
			},
		] as unknown as BridgeCommandResult[];

		expect(() =>
			completeBridgeQueueItem({
				id: item.id,
				results: invalidResults,
			}),
		).toThrow();

		const stored = getBridgeQueueItem({ id: item.id });
		expect(stored?.status).toBe("claimed");
		expect(stored?.results).toBeUndefined();
		expect(stored?.completedAt).toBeUndefined();
	});
});
