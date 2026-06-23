import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import {
	GET as getCommands,
	POST as postCommands,
} from "../commands/route";
import {
	GET as getHeartbeat,
	POST as postHeartbeat,
} from "../heartbeat/route";
import { GET as getResults, POST as postResults } from "../results/route";
import { POST as postExecutorProjects } from "@/app/api/codex-executor/projects/route";
import { clearBridgeHeartbeatsForTests } from "@/lib/agent-bridge/heartbeat";
import { clearBridgeQueueForTests } from "@/lib/agent-bridge/queue";

const token = "local-dev-bridge";
const origin = "http://localhost:4100";
let bridgeToken = "";
let stateDir = "";
let previousStateDir: string | undefined;

const envelope = {
	version: 1 as const,
	projectId: "project-123",
	source: "codex" as const,
	commands: [{ id: "cmd-1", tool: "get_project_info" as const, args: {} }],
};

function request({
	url,
	method = "GET",
	headers,
	body,
}: {
	url: string;
	method?: "GET" | "POST";
	headers?: Record<string, string>;
	body?: unknown;
}): NextRequest {
	return new NextRequest(url, {
		method,
		headers: {
			...(body ? { "content-type": "application/json" } : {}),
			...headers,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
}

async function enqueueCommand(): Promise<string> {
	const response = await postCommands(
		request({
			url: `${origin}/api/agent-bridge/commands`,
			method: "POST",
			headers: { authorization: `Bearer ${token}` },
			body: { envelope },
		}),
	);
	const payload = await response.json();
	return payload.id as string;
}

describe("agent bridge API routes", () => {
	beforeEach(async () => {
		clearBridgeQueueForTests();
		clearBridgeHeartbeatsForTests();
		previousStateDir = process.env.CODECUT_EXECUTOR_STATE_DIR;
		stateDir = await mkdtemp(join(tmpdir(), "codecut-agent-bridge-routes-"));
		process.env.CODECUT_EXECUTOR_STATE_DIR = stateDir;
		process.env.CODECUT_AGENT_BRIDGE_TOKEN = token;
		const response = await postExecutorProjects(
			request({
				url: `${origin}/api/codex-executor/projects`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: { projectId: "project-123", name: "Codex cut" },
			}),
		);
		const payload = await response.json();
		bridgeToken =
			new URL(payload.editorUrl).hash.replace(/^#bridgeToken=/, "") || "";
	});

	afterEach(async () => {
		if (previousStateDir === undefined) {
			delete process.env.CODECUT_EXECUTOR_STATE_DIR;
		} else {
			process.env.CODECUT_EXECUTOR_STATE_DIR = previousStateDir;
		}
		await rm(stateDir, { recursive: true, force: true });
	});

	test("rejects external command submission without the bearer token", async () => {
		const response = await postCommands(
			request({
				url: `${origin}/api/agent-bridge/commands`,
				method: "POST",
				body: { envelope },
			}),
		);

		expect(response.status).toBe(401);
	});

	test("enqueues commands and lets the editor claim them by project", async () => {
		const id = await enqueueCommand();

		const response = await getCommands(
			request({
				url: `${origin}/api/agent-bridge/commands?projectId=project-123`,
				headers: {
					origin,
					"x-codecut-editor-bridge-token": bridgeToken,
				},
			}),
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.items).toHaveLength(1);
		expect(payload.items[0]).toMatchObject({
			id,
			status: "claimed",
			envelope: { projectId: "project-123" },
		});
		expect(payload.items[0].claimToken).toEqual(expect.any(String));
	});

	test("rejects browser command claims without origin evidence", async () => {
		await enqueueCommand();

		const response = await getCommands(
			request({
				url: `${origin}/api/agent-bridge/commands?projectId=project-123`,
			}),
		);

		expect(response.status).toBe(403);
	});

	test("rejects browser command claims without the editor bridge token", async () => {
		await enqueueCommand();

		const response = await getCommands(
			request({
				url: `${origin}/api/agent-bridge/commands?projectId=project-123`,
				headers: { origin },
			}),
		);

		expect(response.status).toBe(401);
	});

	test("stores browser results and lets Codex read them", async () => {
		const id = await enqueueCommand();
		const claimResponse = await getCommands(
			request({
				url: `${origin}/api/agent-bridge/commands?projectId=project-123`,
				headers: {
					origin,
					"x-codecut-editor-bridge-token": bridgeToken,
				},
			}),
		);
		const claimPayload = await claimResponse.json();
		const claimToken = claimPayload.items[0].claimToken;

		const resultResponse = await postResults(
			request({
				url: `${origin}/api/agent-bridge/results`,
				method: "POST",
				headers: {
					origin,
					"x-codecut-editor-bridge-token": bridgeToken,
				},
				body: {
					id,
					claimToken,
					results: [
						{
							commandId: "cmd-1",
							tool: "get_project_info",
							success: true,
							message: "ok",
						},
					],
				},
			}),
		);

		const readResponse = await getResults(
			request({
				url: `${origin}/api/agent-bridge/results?id=${id}`,
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		const payload = await readResponse.json();

		expect(resultResponse.status).toBe(200);
		expect(readResponse.status).toBe(200);
		expect(payload).toMatchObject({
			id,
			status: "completed",
			projectId: "project-123",
			results: [{ commandId: "cmd-1", success: true, message: "ok" }],
		});
	});

	test("rejects browser results without the claim token", async () => {
		const id = await enqueueCommand();
		await getCommands(
			request({
				url: `${origin}/api/agent-bridge/commands?projectId=project-123`,
				headers: {
					origin,
					"x-codecut-editor-bridge-token": bridgeToken,
				},
			}),
		);

		const resultResponse = await postResults(
			request({
				url: `${origin}/api/agent-bridge/results`,
				method: "POST",
				headers: {
					origin,
					"x-codecut-editor-bridge-token": bridgeToken,
				},
				body: {
					id,
					results: [
						{
							commandId: "cmd-1",
							tool: "get_project_info",
							success: true,
							message: "forged",
						},
					],
				},
			}),
		);

		expect(resultResponse.status).toBe(400);
	});

	test("rejects browser results without the editor bridge token", async () => {
		const id = await enqueueCommand();
		const claimResponse = await getCommands(
			request({
				url: `${origin}/api/agent-bridge/commands?projectId=project-123`,
				headers: {
					origin,
					"x-codecut-editor-bridge-token": bridgeToken,
				},
			}),
		);
		const claimPayload = await claimResponse.json();
		const claimToken = claimPayload.items[0].claimToken;

		const resultResponse = await postResults(
			request({
				url: `${origin}/api/agent-bridge/results`,
				method: "POST",
				headers: { origin },
				body: {
					id,
					claimToken,
					results: [
						{
							commandId: "cmd-1",
							tool: "get_project_info",
							success: true,
							message: "forged",
						},
					],
				},
			}),
		);

		expect(resultResponse.status).toBe(401);
	});

	test("rejects cross-origin browser command claims", async () => {
		const response = await getCommands(
			request({
				url: `${origin}/api/agent-bridge/commands?projectId=project-123`,
				headers: { origin: "http://evil.test" },
			}),
		);

		expect(response.status).toBe(403);
	});

	test("records editor bridge heartbeat and exposes mount status to Codex", async () => {
		const postResponse = await postHeartbeat(
			request({
				url: `${origin}/api/agent-bridge/heartbeat`,
				method: "POST",
				headers: {
					origin,
					"user-agent": "codecut-test",
					"x-codecut-editor-bridge-token": bridgeToken,
				},
				body: { projectId: "project-123" },
			}),
		);

		const getResponse = await getHeartbeat(
			request({
				url: `${origin}/api/agent-bridge/heartbeat?projectId=project-123`,
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		const payload = await getResponse.json();

		expect(postResponse.status).toBe(200);
		expect(getResponse.status).toBe(200);
		expect(payload).toMatchObject({
			projectId: "project-123",
			mounted: true,
			origin,
			userAgent: "codecut-test",
		});
		expect(typeof payload.ageMs).toBe("number");
		expect(typeof payload.lastSeenAt).toBe("string");
	});

	test("accepts browser heartbeat when the forwarded host matches the browser origin", async () => {
		const response = await postHeartbeat(
			request({
				url: `${origin}/api/agent-bridge/heartbeat`,
				method: "POST",
				headers: {
					host: "127.0.0.1:4100",
					origin: "http://127.0.0.1:4100",
					referer: "http://127.0.0.1:4100/en/editor/project-123",
					"x-codecut-editor-bridge-token": bridgeToken,
				},
				body: { projectId: "project-123" },
			}),
		);

		expect(response.status).toBe(200);
	});
});
