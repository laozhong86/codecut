import { describe, expect, test } from "bun:test";
import {
	BridgeEnvelopeSchema,
	BridgeToolNameSchema,
} from "../schema";

describe("agent bridge schema", () => {
	test("accepts a valid command envelope", () => {
		const parsed = BridgeEnvelopeSchema.parse({
			version: 1,
			projectId: "project-123",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "add_text_to_timeline",
					args: {
						content: "Hook text",
						startTime: 0,
						duration: 3,
					},
				},
			],
		});

		expect(parsed.commands[0].tool).toBe("add_text_to_timeline");
	});

	test("requires args even when the tool has no arguments", () => {
		const result = BridgeEnvelopeSchema.safeParse({
			version: 1,
			projectId: "project-123",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "get_project_info",
				},
			],
		});

		expect(result.success).toBe(false);
	});

	test("rejects unknown tools", () => {
		const result = BridgeToolNameSchema.safeParse("delete_everything");
		expect(result.success).toBe(false);
	});

	test("accepts the browser-side export tool", () => {
		const result = BridgeToolNameSchema.safeParse("export_project");
		expect(result.success).toBe(true);
	});

	test("accepts the digital human generation tool", () => {
		const result = BridgeToolNameSchema.safeParse("generate_digital_human");
		expect(result.success).toBe(true);
	});

	test("rejects non-Codex sources", () => {
		const result = BridgeEnvelopeSchema.safeParse({
			version: 1,
			projectId: "project-123",
			source: "browser",
			commands: [
				{
					id: "cmd-1",
					tool: "get_project_info",
					args: {},
				},
			],
		});

		expect(result.success).toBe(false);
	});

	test("rejects unexpected top-level envelope fields", () => {
		const result = BridgeEnvelopeSchema.safeParse({
			version: 1,
			projectId: "project-123",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "get_project_info",
					args: {},
				},
			],
			extra: true,
		});

		expect(result.success).toBe(false);
	});

	test("rejects unexpected command fields", () => {
		const result = BridgeEnvelopeSchema.safeParse({
			version: 1,
			projectId: "project-123",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "get_project_info",
					args: {},
					extra: true,
				},
			],
		});

		expect(result.success).toBe(false);
	});
});
