export const BRIDGE_HEARTBEAT_STALE_AFTER_MS = 5000;

export interface BridgeHeartbeatRecord {
	projectId: string;
	lastSeenAt: string;
	lastSeenAtMs: number;
	origin: string | null;
	userAgent: string | null;
}

export interface BridgeHeartbeatStatus {
	projectId: string;
	mounted: boolean;
	lastSeenAt: string | null;
	ageMs: number | null;
	staleAfterMs: number;
	origin: string | null;
	userAgent: string | null;
}

type AgentBridgeHeartbeatGlobal = typeof globalThis & {
	__codecutAgentBridgeHeartbeats?: Map<string, BridgeHeartbeatRecord>;
};

const bridgeGlobal = globalThis as AgentBridgeHeartbeatGlobal;
const heartbeats =
	bridgeGlobal.__codecutAgentBridgeHeartbeats ??
	new Map<string, BridgeHeartbeatRecord>();
bridgeGlobal.__codecutAgentBridgeHeartbeats = heartbeats;

export function recordBridgeHeartbeat({
	projectId,
	origin,
	userAgent,
	now = Date.now(),
}: {
	projectId: string;
	origin: string | null;
	userAgent: string | null;
	now?: number;
}): BridgeHeartbeatRecord {
	const record: BridgeHeartbeatRecord = {
		projectId,
		lastSeenAt: new Date(now).toISOString(),
		lastSeenAtMs: now,
		origin,
		userAgent,
	};
	heartbeats.set(projectId, record);
	return record;
}

export function getBridgeHeartbeatStatus({
	projectId,
	now = Date.now(),
}: {
	projectId: string;
	now?: number;
}): BridgeHeartbeatStatus {
	const record = heartbeats.get(projectId) ?? null;
	const ageMs = record ? Math.max(0, now - record.lastSeenAtMs) : null;

	return {
		projectId,
		mounted: ageMs !== null && ageMs <= BRIDGE_HEARTBEAT_STALE_AFTER_MS,
		lastSeenAt: record?.lastSeenAt ?? null,
		ageMs,
		staleAfterMs: BRIDGE_HEARTBEAT_STALE_AFTER_MS,
		origin: record?.origin ?? null,
		userAgent: record?.userAgent ?? null,
	};
}

export function clearBridgeHeartbeatsForTests(): void {
	heartbeats.clear();
}
