import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { pollAgentBridgeOnce } from "../agent-bridge-provider";
import type {
	BridgeCommandResult,
	BridgeEnvelope,
	BridgeEnvelopeResult,
} from "@/lib/agent-bridge/schema";

const envelope: BridgeEnvelope = {
	version: 1,
	projectId: "project-123",
	source: "codex",
	commands: [{ id: "cmd-1", tool: "get_project_info", args: {} }],
};

const results: BridgeCommandResult[] = [
	{
		commandId: "cmd-1",
		tool: "get_project_info",
		success: true,
		message: "ok",
	},
];

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("AgentBridgeProvider polling", () => {
	test("claims commands, executes them, and posts results", async () => {
		const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
		const postedBodies: unknown[] = [];
		const executedProjectIds: string[] = [];

		const fetchImpl = async (
			input: RequestInfo | URL,
			init?: RequestInit,
		): Promise<Response> => {
			const url = String(input);
			fetchCalls.push({ url, init });

			if (url === "/api/agent-bridge/heartbeat") {
				return jsonResponse({
					projectId: "project-123",
					lastSeenAt: "2026-06-21T00:00:00.000Z",
				});
			}

			if (url.startsWith("/api/agent-bridge/commands")) {
				return jsonResponse({
					items: [
						{
							id: "item-1",
							envelope,
							status: "claimed",
							claimToken: "claim-token-1",
						},
					],
				});
			}

			if (url === "/api/agent-bridge/results") {
				postedBodies.push(JSON.parse(String(init?.body)));
				return jsonResponse({ id: "item-1", status: "completed" });
			}

			throw new Error(`Unexpected fetch URL: ${url}`);
		};

		await pollAgentBridgeOnce({
			projectId: "project-123",
			bridgeToken: "browser-token-1",
			fetchImpl,
			executeEnvelope: async ({ envelope }) => {
				executedProjectIds.push(envelope.projectId);
				return {
					envelopeProjectId: envelope.projectId,
					results,
				} satisfies BridgeEnvelopeResult;
				},
			});

			expect(fetchCalls[0].url).toBe("/api/agent-bridge/heartbeat");
			expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({
				projectId: "project-123",
			});
			expect(fetchCalls[0].init?.headers).toMatchObject({
				"x-codecut-editor-bridge-token": "browser-token-1",
			});
			expect(fetchCalls[1].url).toBe(
				"/api/agent-bridge/commands?projectId=project-123",
			);
			expect(fetchCalls[1].init?.headers).toMatchObject({
				"x-codecut-editor-bridge-token": "browser-token-1",
			});
			expect(executedProjectIds).toEqual(["project-123"]);
		expect(fetchCalls[2].init?.headers).toMatchObject({
			"x-codecut-editor-bridge-token": "browser-token-1",
		});
		expect(postedBodies).toEqual([
			{ id: "item-1", claimToken: "claim-token-1", results },
		]);
	});

	test("does not execute commands when claim request fails", async () => {
		let executeCount = 0;
		let fetchCount = 0;

		await pollAgentBridgeOnce({
			projectId: "project-123",
			bridgeToken: "browser-token-1",
			fetchImpl: async () => {
				fetchCount += 1;
				if (fetchCount === 1) {
					return jsonResponse({
						projectId: "project-123",
						lastSeenAt: "2026-06-21T00:00:00.000Z",
					});
				}

				return jsonResponse({ error: "Forbidden" }, 403);
			},
			executeEnvelope: async ({ envelope }) => {
				executeCount += 1;
				return {
					envelopeProjectId: envelope.projectId,
					results: [],
				};
			},
		});

		expect(executeCount).toBe(0);
	});

	test("editor runtime mounts the bridge provider for the active project", () => {
		const editorProviderSource = readFileSync(
			new URL("../editor-provider.tsx", import.meta.url),
			"utf8",
		);

		expect(editorProviderSource).toContain("AgentBridgeProvider");
		expect(editorProviderSource).toContain(
			"<AgentBridgeProvider projectId={projectId} />",
		);
	});
});
