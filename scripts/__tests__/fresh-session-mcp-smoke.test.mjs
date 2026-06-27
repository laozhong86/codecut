import { describe, expect, test } from "bun:test";
import {
	REQUIRED_MCP_TOOLS,
	assertFreshMcpToolSurface,
	buildAudioEditPlan,
	callCodecutTool,
	loadBridgeEnv,
	parseFreshSessionFlags,
	runFreshSessionMcpSmoke,
	summarizeTimelineReadback,
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
		const templateUpdateTool = {
			name: "update_system_template_script",
			inputSchema: {
				properties: {
					projectId: {},
					templateJsonFile: {},
					confirmedByUser: {},
				},
			},
		};
		const templateDeleteTool = {
			name: "delete_system_template_script",
			inputSchema: {
				properties: {
					projectId: {},
					templateId: {},
					confirmedByUser: {},
				},
			},
		};
		const templateListTool = {
			name: "list_system_template_scripts",
			inputSchema: {
				properties: {
					projectId: {},
				},
			},
		};
		const templateGetTool = {
			name: "get_system_template_script",
			inputSchema: {
				properties: {
					projectId: {},
					templateId: {},
				},
			},
		};
		const templateResolveTool = {
			name: "resolve_system_template_script",
			inputSchema: {
				properties: {
					projectId: {},
					requestedTemplate: {},
					triggerType: {},
				},
			},
		};
		const tools = [
			importTool,
			templateListTool,
			templateGetTool,
			templateResolveTool,
			templateImportTool,
			templateUpdateTool,
			templateDeleteTool,
			...REQUIRED_MCP_TOOLS.filter(
				(name) =>
						name !== "import_media" &&
						name !== "list_system_template_scripts" &&
						name !== "get_system_template_script" &&
						name !== "resolve_system_template_script" &&
						name !== "import_system_template_script" &&
						name !== "update_system_template_script" &&
						name !== "delete_system_template_script",
			).map((name) => ({ name, inputSchema: { properties: {} } })),
		];

		expect(assertFreshMcpToolSurface({ tools })).toEqual({
			toolNames: REQUIRED_MCP_TOOLS,
			importMediaInputs: ["bytes", "filePath", "url"],
				templateDeleteInputs: ["confirmedByUser", "templateId"],
				templateGetInputs: ["templateId"],
				templateImportInputs: ["confirmedByUser", "templateJsonFile"],
				templateListInputs: [],
				templateResolveInputs: ["requestedTemplate", "triggerType"],
				templateUpdateInputs: ["confirmedByUser", "templateJsonFile"],
			});
	});

	test("parses a surface-only mode that does not require mutation inputs", () => {
		expect(parseFreshSessionFlags(["--surface-only"])).toEqual({
			surfaceOnly: true,
		});
		expect(parseFreshSessionFlags(["--project-id", "fresh-smoke"])).toEqual({
			projectId: "fresh-smoke",
		});
	});

	test("surface-only smoke lists tools without touching runtime or bridge mutations", async () => {
		const calls = [];
		const result = await runFreshSessionMcpSmoke({
			surfaceOnly: true,
			env: {},
			waitForRuntimeImpl: async () => calls.push("runtime"),
			bridgeImpl: async (...args) => calls.push(["bridge", ...args]),
			withMcpClientImpl: async (_options, callback) => {
				calls.push("mcp");
				return callback({
					listTools: async () => ({
						tools: [
							{
								name: "import_media",
								inputSchema: {
									properties: { projectId: {}, filePath: {}, url: {}, bytes: {} },
								},
							},
								{
									name: "list_system_template_scripts",
									inputSchema: {
										properties: {
											projectId: {},
										},
									},
								},
								{
									name: "get_system_template_script",
									inputSchema: {
										properties: {
											projectId: {},
											templateId: {},
										},
									},
								},
								{
									name: "resolve_system_template_script",
									inputSchema: {
										properties: {
											projectId: {},
											requestedTemplate: {},
											triggerType: {},
										},
									},
								},
								{
									name: "import_system_template_script",
									inputSchema: {
										properties: {
										projectId: {},
										templateJsonFile: {},
										confirmedByUser: {},
									},
								},
							},
							{
								name: "update_system_template_script",
								inputSchema: {
									properties: {
										projectId: {},
										templateJsonFile: {},
										confirmedByUser: {},
									},
								},
							},
							{
								name: "delete_system_template_script",
								inputSchema: {
									properties: {
										projectId: {},
										templateId: {},
										confirmedByUser: {},
									},
								},
							},
							...REQUIRED_MCP_TOOLS.filter(
									(name) =>
										name !== "import_media" &&
										name !== "list_system_template_scripts" &&
										name !== "get_system_template_script" &&
										name !== "resolve_system_template_script" &&
										name !== "import_system_template_script" &&
										name !== "update_system_template_script" &&
										name !== "delete_system_template_script",
							).map((name) => ({ name, inputSchema: { properties: {} } })),
						],
					}),
				});
			},
		});

		expect(result).toEqual({
			status: "passed",
			mode: "surface-only",
			toolSurface: {
				toolNames: REQUIRED_MCP_TOOLS,
				importMediaInputs: ["bytes", "filePath", "url"],
					templateDeleteInputs: ["confirmedByUser", "templateId"],
					templateGetInputs: ["templateId"],
					templateImportInputs: ["confirmedByUser", "templateJsonFile"],
					templateListInputs: [],
					templateResolveInputs: ["requestedTemplate", "triggerType"],
					templateUpdateInputs: ["confirmedByUser", "templateJsonFile"],
				},
			});
		expect(calls).toEqual(["mcp"]);
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

	test("summarizes text tracks and captions from canonical timeline readback", () => {
		const summary = summarizeTimelineReadback({
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
