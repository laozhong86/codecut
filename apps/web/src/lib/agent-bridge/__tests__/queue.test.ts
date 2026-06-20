import { beforeEach, describe, expect, test } from "bun:test";
import {
	clearBridgeQueueForTests,
	completeBridgeQueueItem,
	enqueueBridgeEnvelope,
	getBridgeQueueItem,
	takePendingBridgeQueueItems,
} from "../queue";

const envelope = {
	version: 1 as const,
	projectId: "project-123",
	source: "codex" as const,
	commands: [{ id: "cmd-1", tool: "get_project_info" as const, args: {} }],
};

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
		completeBridgeQueueItem({
			id: item.id,
			results: [
				{
					commandId: "cmd-1",
					tool: "get_project_info",
					success: true,
					message: "ok",
				},
			],
		});

		const stored = getBridgeQueueItem({ id: item.id });
		expect(stored?.status).toBe("completed");
		expect(stored?.results?.[0].message).toBe("ok");
	});
});
