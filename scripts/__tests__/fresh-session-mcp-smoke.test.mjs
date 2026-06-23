import { describe, expect, test } from "bun:test";
import {
	REQUIRED_MCP_TOOLS,
	assertFreshMcpToolSurface,
	buildAudioEditPlan,
	callCodecutTool,
	loadBridgeEnv,
	summarizeTimelineV2,
} from "../fresh-session-mcp-smoke.mjs";

describe("fresh-session MCP smoke helpers", () => {
	test("requires the rich Codecut MCP tool surface and import media payloads", () => {
		const importTool = {
			name: "import_media",
			inputSchema: {
				properties: {
					projectId: {},
					filePath: {},
					url: {},
					bytes: {},
				},
			},
		};
		const templateImportTool = {
			name: "import_system_template_script",
			inputSchema: {
				properties: {
					projectId: {},
					templateJsonFile: {},
					confirmedByUser: {},
				},
			},
		};
		const tools = [
			importTool,
			templateImportTool,
			...REQUIRED_MCP_TOOLS.filter(
				(name) =>
					name !== "import_media" &&
					name !== "import_system_template_script",
			).map((name) => ({ name, inputSchema: { properties: {} } })),
		];

		expect(assertFreshMcpToolSurface({ tools })).toEqual({
			toolNames: REQUIRED_MCP_TOOLS,
			importMediaInputs: ["bytes", "filePath", "url"],
			templateImportInputs: ["confirmedByUser", "templateJsonFile"],
		});
	});

	test("builds an audio-only EditPlan instead of a black-video workaround", () => {
		const plan = buildAudioEditPlan({
			projectId: "fresh-smoke",
			mediaId: "audio-1",
			duration: 5.721813,
		});

		expect(plan).toMatchObject({
			version: 1,
			projectId: "fresh-smoke",
			sourceMediaId: "audio-1",
			target: { durationSec: 5.721, aspectRatio: "16:9" },
			clips: [
				{
					id: "spoken-audio-clip-1",
					sourceStart: 0,
					sourceEnd: 5.721,
					timelineStart: 0,
				},
			],
		});
		expect(JSON.stringify(plan)).not.toContain("black");
		expect(JSON.stringify(plan)).not.toContain("mp4");
	});

	test("summarizes text tracks and captions from timeline v2 readback", () => {
		const summary = summarizeTimelineV2({
			project: { revision: 6 },
			summary: { trackTypeCounts: { text: 1 }, elementCount: 2 },
			tracks: [
				{
					type: "text",
					elements: [
						{ id: "caption-1", type: "text", content: "Searchable phrase" },
					],
				},
				{ type: "audio", elements: [{ id: "audio-1", type: "audio" }] },
			],
		});

		expect(summary).toEqual({
			revision: 6,
			textTrackCount: 1,
			textElementCount: 1,
			captionTexts: ["Searchable phrase"],
		});
	});

	test("uses provided bridge env when the local env file is absent", async () => {
		const env = await loadBridgeEnv({
			envFile: "/tmp/codecut-missing-env-file",
			env: {
				CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
				CODECUT_AGENT_BRIDGE_TOKEN: "token",
			},
		});

		expect(env.CODECUT_AGENT_BRIDGE_URL).toBe("http://127.0.0.1:4100");
		expect(env.CODECUT_AGENT_BRIDGE_TOKEN).toBe("token");
	});

	test("uses an explicit timeout for long-running MCP calls", async () => {
		const calls = [];
		const client = {
			callTool: async (...args) => {
				calls.push(args);
				return { structuredContent: { results: [{ success: true }] } };
			},
		};

		await callCodecutTool(client, {
			name: "add_captions",
			arguments: { projectId: "fresh-smoke" },
		});

		expect(calls[0][2]).toEqual({ timeout: 180000 });
	});
});
