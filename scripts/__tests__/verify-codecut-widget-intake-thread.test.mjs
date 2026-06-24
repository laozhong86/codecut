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
			disallowedShellCallCount: 0,
			disallowedFileChangeCount: 0,
			textFallbackCount: 0,
		});
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
			]),
		).toEqual({
			threadId: "thread-abc",
			sessionFile: "/tmp/thread.jsonl",
		});
	});
});
