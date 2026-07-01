import { describe, expect, test } from "bun:test";
import { BridgeEnvelopeSchema, BridgeToolNameSchema } from "../schema";

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

	test("accepts the independent RunningHub voice generation tools", () => {
		expect(
			BridgeToolNameSchema.safeParse("generate_runninghub_voice_design")
				.success,
		).toBe(true);
		expect(
			BridgeToolNameSchema.safeParse("generate_runninghub_voice_clone").success,
		).toBe(true);
	});

	test("accepts the Volcengine OpenSpeech tools", () => {
		expect(
			BridgeToolNameSchema.safeParse("generate_volcengine_cloned_voice")
				.success,
		).toBe(true);
		expect(
			BridgeToolNameSchema.safeParse("transcribe_volcengine_url").success,
		).toBe(true);
		expect(
			BridgeToolNameSchema.safeParse("build_volcengine_url_captions").success,
		).toBe(true);
		expect(
			BridgeToolNameSchema.safeParse("transcribe_volcengine_media").success,
		).toBe(true);
		expect(
			BridgeToolNameSchema.safeParse("build_volcengine_media_captions").success,
		).toBe(true);
	});

	test("accepts the template import tool", () => {
		const result = BridgeToolNameSchema.safeParse(
			"import_template",
		);
		expect(result.success).toBe(true);
	});

	test("accepts the template update tool", () => {
		const result = BridgeToolNameSchema.safeParse(
			"update_template",
		);
		expect(result.success).toBe(true);
	});

	test("accepts the template delete tool", () => {
		const result = BridgeToolNameSchema.safeParse(
			"delete_template",
		);
		expect(result.success).toBe(true);
	});

	test("accepts the template query tools", () => {
		expect(
			BridgeToolNameSchema.safeParse("list_templates").success,
		).toBe(true);
		expect(
			BridgeToolNameSchema.safeParse("get_template").success,
		).toBe(true);
		expect(
			BridgeToolNameSchema.safeParse("resolve_template").success,
		).toBe(true);
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
