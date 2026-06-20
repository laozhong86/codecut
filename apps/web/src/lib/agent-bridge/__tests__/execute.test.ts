import { describe, expect, test } from "bun:test";
import { executeBridgeEnvelope } from "../execute";
import type { AgentTool } from "@/lib/ai/agent/tools/types";

function tool({
	name,
	execute,
}: {
	name: string;
	execute: AgentTool["execute"];
}): AgentTool {
	return {
		name,
		description: `${name} test tool`,
		parameters: {
			type: "object",
			properties: {},
		},
		execute,
	};
}

describe("executeBridgeEnvelope", () => {
	test("executes commands sequentially", async () => {
		const calls: string[] = [];
		let resolveFirstCommand:
			| ((value: { success: boolean; message: string }) => void)
			| undefined;
		const firstCommandResult = new Promise<{ success: boolean; message: string }>(
			(resolve) => {
				resolveFirstCommand = resolve;
			},
		);
		const executionPromise = executeBridgeEnvelope({
			envelope: {
				version: 1,
				projectId: "project-123",
				source: "codex",
				commands: [
					{ id: "cmd-1", tool: "get_project_info", args: {} },
					{ id: "cmd-2", tool: "get_timeline_state", args: {} },
				],
			},
			resolveTool: ({ name }) =>
				tool({
					name,
					execute: async () => {
						calls.push(name);
						if (name === "get_project_info") {
							return firstCommandResult;
						}
						return { success: true, message: `${name} ok` };
					},
				}),
		});

		expect(calls).toEqual(["get_project_info"]);
		resolveFirstCommand?.({
			success: true,
			message: "get_project_info ok",
		});
		const result = await executionPromise;
		expect(calls).toEqual(["get_project_info", "get_timeline_state"]);
		expect(result.results.map((entry) => entry.success)).toEqual([true, true]);
	});

	test("stops after the first failed command", async () => {
		const calls: string[] = [];
		const result = await executeBridgeEnvelope({
			envelope: {
				version: 1,
				projectId: "project-123",
				source: "codex",
				commands: [
					{ id: "cmd-1", tool: "add_text_to_timeline", args: { content: "A" } },
					{
						id: "cmd-2",
						tool: "move_element",
						args: {
							sourceTrackId: "t",
							elementId: "e",
							newStartTime: 1,
						},
					},
				],
			},
			resolveTool: ({ name }) =>
				tool({
					name,
					execute: async () => {
						calls.push(name);
						return { success: false, message: `${name} failed` };
					},
				}),
		});

		expect(calls).toEqual(["add_text_to_timeline"]);
		expect(result.results[0]).toMatchObject({
			commandId: "cmd-1",
			success: false,
		});
		expect(result.results[1]).toMatchObject({
			commandId: "cmd-2",
			success: false,
			skipped: true,
		});
	});

	test("skips later commands after a bridge tool has no implementation", async () => {
		const result = await executeBridgeEnvelope({
			envelope: {
				version: 1,
				projectId: "project-123",
				source: "codex",
				commands: [
					{ id: "cmd-1", tool: "get_project_info", args: {} },
					{ id: "cmd-2", tool: "get_timeline_state", args: {} },
				],
			},
			resolveTool: () => undefined,
		});

		expect(result.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "get_project_info",
			success: false,
		});
		expect(result.results[1]).toMatchObject({
			commandId: "cmd-2",
			tool: "get_timeline_state",
			success: false,
			skipped: true,
		});
	});

	test("stops after the first tool throws an error", async () => {
		const calls: string[] = [];
		const result = await executeBridgeEnvelope({
			envelope: {
				version: 1,
				projectId: "project-123",
				source: "codex",
				commands: [
					{ id: "cmd-1", tool: "add_text_to_timeline", args: { content: "A" } },
					{ id: "cmd-2", tool: "get_timeline_state", args: {} },
				],
			},
			resolveTool: ({ name }) =>
				tool({
					name,
					execute: async () => {
						calls.push(name);
						throw new Error(`${name} exploded`);
					},
				}),
		});

		expect(calls).toEqual(["add_text_to_timeline"]);
		expect(result.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "add_text_to_timeline",
			success: false,
			message: "add_text_to_timeline exploded",
		});
		expect(result.results[1]).toMatchObject({
			commandId: "cmd-2",
			tool: "get_timeline_state",
			success: false,
			skipped: true,
		});
	});
});
