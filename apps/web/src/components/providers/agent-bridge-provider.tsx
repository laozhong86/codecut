"use client";

import { useEffect, useRef } from "react";
import { executeBridgeEnvelope } from "@/lib/agent-bridge/execute";
import type {
	BridgeCommandResult,
	BridgeEnvelope,
	BridgeEnvelopeResult,
} from "@/lib/agent-bridge/schema";
import {
	executorBrowserBridgeHeaders,
	readExecutorBrowserBridgeTokenFromLocation,
} from "@/lib/codex-executor/browser-bridge-token";

interface AgentBridgeProviderProps {
	projectId: string;
}

interface PendingBridgeItem {
	id: string;
	claimToken: string;
	envelope: BridgeEnvelope;
	status: "claimed";
}

interface PendingBridgeResponse {
	items: PendingBridgeItem[];
}

type ExecuteEnvelope = typeof executeBridgeEnvelope;
type BridgeFetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

function bridgeHeaders({
	bridgeToken,
	contentType,
}: {
	bridgeToken: string;
	contentType?: string;
}): Record<string, string> {
	return executorBrowserBridgeHeaders({ bridgeToken, contentType });
}

async function postResults({
	id,
	claimToken,
	bridgeToken,
	results,
	fetchImpl,
}: {
	id: string;
	claimToken: string;
	bridgeToken: string;
	results: BridgeCommandResult[];
	fetchImpl: BridgeFetch;
}): Promise<void> {
	const response = await fetchImpl("/api/agent-bridge/results", {
		method: "POST",
		headers: bridgeHeaders({
			bridgeToken,
			contentType: "application/json",
		}),
		body: JSON.stringify({ id, claimToken, results }),
	});

	if (!response.ok) {
		throw new Error(`Failed to publish bridge results: ${response.status}`);
	}
}

async function postHeartbeat({
	projectId,
	bridgeToken,
	fetchImpl,
}: {
	projectId: string;
	bridgeToken: string;
	fetchImpl: BridgeFetch;
}): Promise<void> {
	const response = await fetchImpl("/api/agent-bridge/heartbeat", {
		method: "POST",
		headers: bridgeHeaders({
			bridgeToken,
			contentType: "application/json",
		}),
		body: JSON.stringify({ projectId }),
	});

	if (!response.ok) {
		throw new Error(`Failed to publish bridge heartbeat: ${response.status}`);
	}
}

export async function pollAgentBridgeOnce({
	projectId,
	bridgeToken,
	fetchImpl = fetch,
	executeEnvelope = executeBridgeEnvelope,
}: {
	projectId: string;
	bridgeToken: string;
	fetchImpl?: BridgeFetch;
	executeEnvelope?: ExecuteEnvelope;
}): Promise<void> {
	await postHeartbeat({ projectId, bridgeToken, fetchImpl });

	const response = await fetchImpl(
		`/api/agent-bridge/commands?projectId=${encodeURIComponent(projectId)}`,
		{ headers: bridgeHeaders({ bridgeToken }) },
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
			claimToken: item.claimToken,
			bridgeToken,
			results: execution.results,
			fetchImpl,
		});
	}
}

export function AgentBridgeProvider({ projectId }: AgentBridgeProviderProps) {
	const isPollingRef = useRef(false);

	useEffect(() => {
		const bridgeToken = readExecutorBrowserBridgeTokenFromLocation();
		if (!bridgeToken) {
			return;
		}
		const activeBridgeToken = bridgeToken;
		let cancelled = false;

		async function pollOnce() {
			if (cancelled || isPollingRef.current) {
				return;
			}

			isPollingRef.current = true;
			try {
				await pollAgentBridgeOnce({ projectId, bridgeToken: activeBridgeToken });
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
