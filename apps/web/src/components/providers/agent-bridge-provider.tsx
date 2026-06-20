"use client";

import { useEffect, useRef } from "react";
import { executeBridgeEnvelope } from "@/lib/agent-bridge/execute";
import type {
	BridgeCommandResult,
	BridgeEnvelope,
	BridgeEnvelopeResult,
} from "@/lib/agent-bridge/schema";

interface AgentBridgeProviderProps {
	projectId: string;
}

interface PendingBridgeItem {
	id: string;
	envelope: BridgeEnvelope;
	status: "claimed";
}

interface PendingBridgeResponse {
	items: PendingBridgeItem[];
}

type ExecuteEnvelope = typeof executeBridgeEnvelope;

async function postResults({
	id,
	results,
	fetchImpl,
}: {
	id: string;
	results: BridgeCommandResult[];
	fetchImpl: typeof fetch;
}): Promise<void> {
	const response = await fetchImpl("/api/agent-bridge/results", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ id, results }),
	});

	if (!response.ok) {
		throw new Error(`Failed to publish bridge results: ${response.status}`);
	}
}

export async function pollAgentBridgeOnce({
	projectId,
	fetchImpl = fetch,
	executeEnvelope = executeBridgeEnvelope,
}: {
	projectId: string;
	fetchImpl?: typeof fetch;
	executeEnvelope?: ExecuteEnvelope;
}): Promise<void> {
	const response = await fetchImpl(
		`/api/agent-bridge/commands?projectId=${encodeURIComponent(projectId)}`,
	);
	if (!response.ok) {
		return;
	}

	const payload = (await response.json()) as PendingBridgeResponse;
	for (const item of payload.items) {
		const execution: BridgeEnvelopeResult = await executeEnvelope({
			envelope: item.envelope,
		});
		await postResults({
			id: item.id,
			results: execution.results,
			fetchImpl,
		});
	}
}

export function AgentBridgeProvider({ projectId }: AgentBridgeProviderProps) {
	const isPollingRef = useRef(false);

	useEffect(() => {
		let cancelled = false;

		async function pollOnce() {
			if (cancelled || isPollingRef.current) {
				return;
			}

			isPollingRef.current = true;
			try {
				await pollAgentBridgeOnce({ projectId });
			} catch (error) {
				console.error("Agent bridge polling failed:", error);
			} finally {
				isPollingRef.current = false;
			}
		}

		void pollOnce();
		const interval = window.setInterval(() => {
			void pollOnce();
		}, 1000);

		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [projectId]);

	return null;
}
