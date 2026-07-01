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

function requirementBrowserOpenItem(url = "http://127.0.0.1:4100/en/requirements/ccreq_demo") {
	return {
		type: "mcpToolCall",
		server: "node_repl",
		tool: "js",
		arguments: {
			code: [
				'const confirmationUrl = "' + url + '";',
				"const { setupBrowserRuntime } = await import('/Users/x/.codex/plugins/cache/openai-bundled/browser/26.623.81905/scripts/browser-client.mjs');",
				"await setupBrowserRuntime({ globals: globalThis });",
				'const browser = await agent.browsers.get("iab");',
				'await (await browser.capabilities.get("visibility")).set(true);',
				"const tab = (await browser.tabs.selected()) ?? await browser.tabs.new();",
				"if ((await tab.url()) !== confirmationUrl) {",
				"  await tab.goto(confirmationUrl);",
				"}",
			].join("\n"),
		},
	};
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
			requirementBrowserOpenCallCount: 0,
			browserControlUnavailableEvidenceCount: 0,
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
							result: {
								structuredContent: {
									status: "awaiting_user_confirmation",
									draftId: "ccreq_demo",
								},
							},
						},
						requirementBrowserOpenItem(),
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
			requirementBrowserOpenCallCount: 1,
			openedRequirementDraftId: "ccreq_demo",
			confirmedRequirementDraftId: "ccreq_demo",
			requirementInlineOpenerCount: 0,
			projectSideEffectCallCount: 0,
			followUpMessageCount: 0,
		});
	});

	test("passes requirement confirmation mode with explicit browser-control failure evidence", () => {
		const report = assertWidgetIntakeThread({
			threadId: "thread-requirement-browser-unavailable",
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
								structuredContent: {
									status: "awaiting_user_confirmation",
									draftId: "ccreq_demo",
								},
							},
						},
						{
							type: "agentMessage",
							text: "node_repl browser control failed: agent.browsers is unavailable.",
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
			requirementBrowserOpenCallCount: 0,
			browserControlUnavailableEvidenceCount: 1,
		});
	});

	test("fails requirement confirmation mode when the page was only linked", () => {
		expect(() =>
			assertWidgetIntakeThread({
				threadId: "thread-requirement-link-only",
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
									structuredContent: {
										status: "awaiting_user_confirmation",
										draftId: "ccreq_demo",
									},
								},
							},
							{
								type: "agentMessage",
								text: "确认页已经生成：[打开确认页](http://127.0.0.1:4100/en/requirements/ccreq_demo)",
							},
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
			}),
		).toThrow(
			"Codecut requirement confirmation regressed: missing node_repl.js browser open after requirement draft creation.",
		);
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
							requirementBrowserOpenItem(),
						],
					},
				],
			}),
		).toThrow(
			"Codecut requirement confirmation was not proven: missing confirmed get_codecut_requirement_confirmation readback.",
		);
	});

	test("fails requirement confirmation mode when confirmed readback uses a different draft", () => {
		expect(() =>
			assertWidgetIntakeThread({
				threadId: "thread-requirement-reused-old-draft",
				requireConfirmedRequirement: true,
				records: [
					{
						type: "turn",
						items: [
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "open_codecut_requirement_confirmation",
								structuredContent: {
									status: "awaiting_user_confirmation",
									draftId: "ccreq_new",
								},
							},
							requirementBrowserOpenItem(
								"http://127.0.0.1:4100/en/requirements/ccreq_new",
							),
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "get_codecut_requirement_confirmation",
								arguments: { draftId: "ccreq_old" },
								structuredContent: {
									status: "confirmed",
									draftId: "ccreq_old",
								},
							},
						],
					},
				],
			}),
		).toThrow(
			"Codecut requirement confirmation regressed: confirmed readback draftId ccreq_old does not match opened draftId ccreq_new.",
		);
	});

	test("fails requirement confirmation mode if the agent clicks the human confirmation control", () => {
		expect(() =>
			assertWidgetIntakeThread({
				threadId: "thread-requirement-agent-clicked-confirm",
				requireConfirmedRequirement: true,
				records: [
					{
						type: "turn",
						items: [
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "open_codecut_requirement_confirmation",
								structuredContent: {
									status: "awaiting_user_confirmation",
									draftId: "ccreq_demo",
								},
							},
							{
								type: "mcpToolCall",
								server: "node_repl",
								tool: "js",
								arguments: {
									code: 'var confirmButton = tab.playwright.getByRole("button", { name: "确认需求", exact: true });\nawait confirmButton.click({});',
								},
							},
							{
								type: "mcpToolCall",
								server: "codecut_mcp",
								tool: "get_codecut_requirement_confirmation",
								arguments: { draftId: "ccreq_demo" },
								structuredContent: {
									status: "confirmed",
									draftId: "ccreq_demo",
								},
							},
						],
					},
				],
			}),
		).toThrow(
			"Codecut requirement confirmation regressed: agent clicked the human confirmation control.",
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
