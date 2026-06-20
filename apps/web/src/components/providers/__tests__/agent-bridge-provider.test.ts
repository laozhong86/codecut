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

			if (url.startsWith("/api/agent-bridge/commands")) {
				return jsonResponse({
					items: [{ id: "item-1", envelope, status: "claimed" }],
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
			fetchImpl,
			executeEnvelope: async ({ envelope }) => {
				executedProjectIds.push(envelope.projectId);
				return {
					envelopeProjectId: envelope.projectId,
					results,
				} satisfies BridgeEnvelopeResult;
			},
		});

		expect(fetchCalls[0].url).toBe(
			"/api/agent-bridge/commands?projectId=project-123",
		);
		expect(executedProjectIds).toEqual(["project-123"]);
		expect(postedBodies).toEqual([{ id: "item-1", results }]);
	});

	test("does not execute commands when claim request fails", async () => {
		let executeCount = 0;

		await pollAgentBridgeOnce({
			projectId: "project-123",
			fetchImpl: async () => jsonResponse({ error: "Forbidden" }, 403),
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
