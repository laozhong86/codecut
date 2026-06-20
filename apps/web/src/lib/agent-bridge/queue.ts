import {
	BridgeCommandResultSchema,
	BridgeEnvelopeSchema,
	type BridgeCommandResult,
	type BridgeEnvelope,
} from "./schema";

export type BridgeQueueStatus = "pending" | "claimed" | "completed";

export interface BridgeQueueItem {
	id: string;
	projectId: string;
	envelope: BridgeEnvelope;
	status: BridgeQueueStatus;
	createdAt: string;
	claimedAt?: string;
	completedAt?: string;
	results?: BridgeCommandResult[];
}

const queueItems = new Map<string, BridgeQueueItem>();
const BridgeCommandResultsSchema = BridgeCommandResultSchema.array();

function createId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}

	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function enqueueBridgeEnvelope({
	envelope,
}: {
	envelope: BridgeEnvelope;
}): BridgeQueueItem {
	const parsedEnvelope = BridgeEnvelopeSchema.parse(envelope);
	const item: BridgeQueueItem = {
		id: createId(),
		projectId: parsedEnvelope.projectId,
		envelope: parsedEnvelope,
		status: "pending",
		createdAt: new Date().toISOString(),
	};

	queueItems.set(item.id, item);
	return item;
}

export function takePendingBridgeQueueItems({
	projectId,
	limit,
}: {
	projectId: string;
	limit: number;
}): BridgeQueueItem[] {
	const claimed: BridgeQueueItem[] = [];

	for (const item of queueItems.values()) {
		if (claimed.length >= limit) {
			break;
		}
		if (item.projectId !== projectId) {
			continue;
		}
		if (item.status !== "pending") {
			continue;
		}

		item.status = "claimed";
		item.claimedAt = new Date().toISOString();
		claimed.push(item);
	}

	return claimed;
}

export function completeBridgeQueueItem({
	id,
	results,
}: {
	id: string;
	results: BridgeCommandResult[];
}): BridgeQueueItem | null {
	const item = queueItems.get(id);
	if (!item) {
		return null;
	}

	if (item.status === "pending") {
		throw new Error(`Bridge queue item "${id}" must be claimed before completion.`);
	}

	if (item.status === "completed") {
		throw new Error(`Bridge queue item "${id}" has already been completed.`);
	}

	const parsedResults = BridgeCommandResultsSchema.parse(results);
	item.status = "completed";
	item.results = parsedResults;
	item.completedAt = new Date().toISOString();
	return item;
}

export function getBridgeQueueItem({
	id,
}: {
	id: string;
}): BridgeQueueItem | null {
	return queueItems.get(id) ?? null;
}

export function clearBridgeQueueForTests(): void {
	queueItems.clear();
}
