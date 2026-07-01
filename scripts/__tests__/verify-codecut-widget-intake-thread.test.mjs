import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	assertWidgetIntakeThread,
	findThreadSessionFile,
	parseWidgetIntakeFlags,
	readThreadRecordFile,
} from "../verify-codecut-widget-intake-thread.mjs";

function jsonlLine(payload) {
	return JSON.stringify({ timestamp: "2026-06-24T00:00:00.000Z", payload });
}

describe("verify Codecut widget intake thread", () => {
	test("passes when a fresh thread called the Codecut workspace widget without shell or file writes", () => {
		const report = assertWidgetIntakeThread({
			threadId: "thread-ok",
			records: [
				{
					type: "turn",
					items: [
						{
							type: "mcpToolCall",
							server: "codecut_mcp",
							tool: "open_codecut_workspace",
							arguments: { durationGoalMode: "auto" },
						},
					],
				},
			],
		});

		expect(report).toEqual({
			status: "passed",
			threadId: "thread-ok",
			widgetCallCount: 1,
			requirementOpenCallCount: 0,
			requirementConfirmedReadbackCount: 0,
			requirementInlineOpenerCount: 0,
			projectSideEffectCallCount: 0,
			disallowedShellCallCount: 0,
			disallowedFileChangeCount: 0,
			textFallbackCount: 0,
			followUpMessageCount: 0,
		});
	});

	test("passes requirement confirmation mode without visible follow-up", () => {
		const report = assertWidgetIntakeThread({
			threadId: "thread-requirement-confirmed",
			requireConfirmedRequirement: true,
			records: [
				{
					type: "turn",
					items: [
						{
							type: "mcpToolCall",
							server: "codecut_mcp",
							tool: "open_codecut_requirement_confirmation",
						},
					],
				},
				{
					type: "turn",
					items: [
						{
							type: "mcpToolCall",
							server: "codecut_mcp",
							tool: "get_codecut_requirement_confirmation",
							result: {
								structuredContent: {
									status: "confirmed",
									draftId: "ccreq_demo",
								},
							},
						},
					],
				},
			],
		});

		expect(report).toMatchObject({
			status: "passed",
			widgetCallCount: 0,
			requirementOpenCallCount: 1,
			requirementConfirmedReadbackCount: 1,
			requirementInlineOpenerCount: 0,
			projectSideEffectCallCount: 0,
			followUpMessageCount: 0,
		});
	});

	test("fails requirement confirmation mode if inline opener metadata returns", () => {
		expect(() =>
			assertWidgetIntakeThread({
				threadId: "thread-requirement-inline-opener",
				requireConfirmedRequirement: true,
				records: [
					{
						type: "turn",
						items: [
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "open_codecut_requirement_confirmation",
								result: {
									_meta: {
										"openai/outputTemplate":
											"ui://codecut/0.1.1/requirement-confirmation-deadbeefcafe.html",
									},
								},
							},
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "get_codecut_requirement_confirmation",
								result: {
									structuredContent: {
										status: "confirmed",
									},
								},
							},
						],
					},
				],
			}),
		).toThrow(
			"Codecut requirement confirmation regressed: found inline MCP App opener metadata.",
		);
	});

	test("fails requirement confirmation mode without confirmed readback", () => {
		expect(() =>
			assertWidgetIntakeThread({
				threadId: "thread-requirement-pending",
				requireConfirmedRequirement: true,
				records: [
					{
						type: "turn",
						items: [
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "open_codecut_requirement_confirmation",
							},
						],
					},
				],
			}),
		).toThrow(
			"Codecut requirement confirmation was not proven: missing confirmed get_codecut_requirement_confirmation readback.",
		);
	});

	test("fails requirement confirmation mode if project creation ran during intake", () => {
		expect(() =>
			assertWidgetIntakeThread({
				threadId: "thread-requirement-side-effect",
				requireConfirmedRequirement: true,
				records: [
					{
						type: "turn",
						items: [
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "open_codecut_requirement_confirmation",
							},
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "submit_codecut_setup",
							},
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "get_codecut_requirement_confirmation",
								structuredContent: { status: "confirmed" },
							},
						],
					},
				],
			}),
		).toThrow(
			"Codecut requirement confirmation regressed: project creation ran during intake validation.",
		);
	});

	test("fails when the thread asked text fallback questions instead of opening the widget", () => {
		expect(() =>
			assertWidgetIntakeThread({
				threadId: "thread-text",
				records: [
					{
						type: "turn",
						items: [
							{
								type: "agentMessage",
								text: "剪辑前请确认 5 项，直接回复例如 `C/A/A/A/A` 即可。",
							},
						],
					},
				],
			}),
		).toThrow(
			"Codecut widget intake was not proven: missing codecut_mcp.open_codecut_workspace mcpToolCall; found text fallback prompt.",
		);
	});

	test("fails when a validation prompt ran shell or wrote files", () => {
		expect(() =>
			assertWidgetIntakeThread({
				threadId: "thread-shell",
				records: [
					{
						type: "response_item",
						payload: {
							type: "function_call",
							name: "exec_command",
						},
					},
					{
						type: "response_item",
						payload: {
							type: "mcpToolCall",
							server: "codecut_mcp",
							tool: "open_codecut_workspace",
						},
					},
				],
			}),
		).toThrow("Fresh widget validation thread must not run shell commands.");
	});

	test("fails when a fresh thread opens the Codecut workspace widget more than once", () => {
		expect(() =>
			assertWidgetIntakeThread({
				threadId: "thread-duplicate-widget",
				records: [
					{
						type: "turn",
						items: [
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "open_codecut_workspace",
							},
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "open_codecut_workspace",
							},
						],
					},
				],
			}),
		).toThrow(
			"Codecut widget intake regressed: expected exactly one open_codecut_workspace call, found 2.",
		);
	});

	test("fails when setup follow-up is required but no continuation message is visible", () => {
		expect(() =>
			assertWidgetIntakeThread({
				threadId: "thread-missing-follow-up",
				requireFollowUp: true,
				records: [
					{
						type: "turn",
						items: [
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "open_codecut_workspace",
							},
						],
					},
				],
			}),
		).toThrow(
			"Codecut setup follow-up was not proven: missing visible continuation user message.",
		);
	});

	test("passes when setup follow-up is required and a continuation message is visible", () => {
		const report = assertWidgetIntakeThread({
			threadId: "thread-follow-up",
			requireFollowUp: true,
			records: [
				{
					type: "turn",
					items: [
						{
							type: "mcpToolCall",
							server: "codecut_mcp",
							tool: "open_codecut_workspace",
						},
					],
				},
				{
					type: "turn",
					items: [
						{
							type: "userMessage",
							content: [
								{
									type: "text",
									text: "Use $codecut to continue the real CodeCut editing chain for project demo. Use --confirmation-token ccconfirmed_demo.",
								},
							],
						},
					],
				},
			],
		});

		expect(report.followUpMessageCount).toBe(1);
	});

	test("reads Codex JSONL records and finds a thread session file", async () => {
		const root = await mkdtemp(join(tmpdir(), "codecut-widget-thread-"));
		const sessionsRoot = join(root, "sessions/2026/06/24");
		const sessionFile = join(
			sessionsRoot,
			"rollout-2026-06-24T00-00-00-thread-abc.jsonl",
		);
		await mkdir(sessionsRoot, { recursive: true });
		await writeFile(
			sessionFile,
			[
				jsonlLine({
					type: "session_meta",
					payload: { id: "thread-abc" },
				}),
				jsonlLine({
					type: "mcpToolCall",
					server: "codecut_mcp",
					tool: "open_codecut_workspace",
				}),
			].join("\n"),
			"utf8",
		);

		try {
			expect(await findThreadSessionFile({ sessionsRoot, threadId: "thread-abc" })).toBe(
				sessionFile,
			);
			expect(await readThreadRecordFile({ filePath: sessionFile })).toHaveLength(2);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("reads read_thread JSON exports with nested turn items", async () => {
		const root = await mkdtemp(join(tmpdir(), "codecut-widget-thread-json-"));
		const file = join(root, "read-thread.json");
		await writeFile(
			file,
			JSON.stringify(
				{
					thread: { id: "thread-json" },
					turns: [
						{
							items: [
								{
									type: "mcpToolCall",
									server: "codecut_mcp",
									tool: "open_codecut_workspace",
								},
							],
						},
					],
				},
				null,
				2,
			),
			"utf8",
		);

		try {
			const records = await readThreadRecordFile({ filePath: file });
			expect(
				assertWidgetIntakeThread({ threadId: "thread-json", records }).status,
			).toBe("passed");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("parses CLI flags for thread id and explicit session file", () => {
		expect(
			parseWidgetIntakeFlags([
				"--thread-id",
				"thread-abc",
				"--session-file",
				"/tmp/thread.jsonl",
				"--require-follow-up",
				"true",
				"--require-confirmed-requirement",
				"true",
			]),
		).toEqual({
			threadId: "thread-abc",
			sessionFile: "/tmp/thread.jsonl",
			requireFollowUp: "true",
			requireConfirmedRequirement: "true",
		});
	});
});
