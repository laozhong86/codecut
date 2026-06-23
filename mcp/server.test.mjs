import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	CODECUT_MCP_TOOLS,
	buildBridgeCliArgs,
	callBridgeCliTool,
	normalizeCliResult,
} from "./server.mjs";
import * as serverModule from "./server.mjs";

function setupIntent(overrides = {}) {
	return {
		projectId: "launch-cut-001",
		projectName: "Launch Cut",
		mediaSources: [{ kind: "filePath", filePath: "/tmp/source.mp4" }],
		targetAspectRatio: "9:16",
		durationGoalSeconds: 60,
		captionLanguage: "auto",
		output: {
			format: "mp4",
			quality: "high",
			includeAudio: true,
		},
		brief: "Cut a high-retention short for a product launch.",
		successCriteria: "Show a hook, proof, and CTA with readable captions.",
		...overrides,
	};
}

describe("Codecut MCP server contract", () => {
	test("exposes only the stable Codecut editing primitives", () => {
		expect(CODECUT_MCP_TOOLS.map((tool) => tool.name)).toEqual([
			"get_project_info",
			"list_media_assets",
			"import_media",
			"transcribe_media",
			"build_video_context",
			"build_visual_context",
			"inspect_video_range",
			"inspect_timeline",
			"build_video_quality_report",
			"get_transcript",
			"build_post_cut_captions",
			"list_models",
			"search_media",
			"import_system_template_script",
			"delete_system_template_script",
			"validate_edit_plan",
			"preview_edit_plan",
			"apply_edit_plan",
			"apply_narrated_remix_plan",
			"add_texts",
			"add_captions",
			"insert_clips",
			"move_clips",
			"remove_clips",
			"split_clip",
			"set_clip_properties",
			"set_keyframes",
			"ripple_delete_ranges",
			"create_text_background_effect",
			"create_human_pip_effect",
			"generate_digital_human",
			"verify_timeline",
			"export_project",
			"get_timeline_state",
			"get_timeline_state_v2",
		]);
	});

	test("uses host-compatible object ranges for ripple delete input", () => {
		const tool = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "ripple_delete_ranges",
		);

		expect(
			tool?.inputSchema.ranges.safeParse([{ startTime: 1, endTime: 3 }])
				.success,
		).toBe(true);
		expect(tool?.inputSchema.ranges.safeParse([[1, 3]]).success).toBe(false);
	});

	test("marks search and model catalog tools as read-only", () => {
		const readOnlyByTool = new Map(
			CODECUT_MCP_TOOLS.map((tool) => [tool.name, tool.readOnly]),
		);

		expect(readOnlyByTool.get("list_models")).toBe(true);
		expect(readOnlyByTool.get("search_media")).toBe(true);
		expect(readOnlyByTool.get("import_system_template_script")).toBe(false);
		expect(readOnlyByTool.get("delete_system_template_script")).toBe(false);
		expect(readOnlyByTool.get("add_texts")).toBe(false);
		expect(readOnlyByTool.get("add_captions")).toBe(false);
		expect(readOnlyByTool.get("set_keyframes")).toBe(false);
	});

	test("defines a versioned workspace widget resource and tools", async () => {
		expect(serverModule.CODECUT_WORKSPACE_RESOURCE_URI).toMatch(
			/^ui:\/\/codecut\/.+\/workspace\.html$/,
		);
		expect(
			serverModule.CODECUT_WORKSPACE_TOOLS.map((tool) => tool.name),
		).toEqual([
			"open_codecut_workspace",
			"inspect_codecut_setup",
			"submit_codecut_setup",
		]);

		const openTool = serverModule.CODECUT_WORKSPACE_TOOLS.find(
			(tool) => tool.name === "open_codecut_workspace",
		);
		expect(openTool.readOnly).toBe(true);
		expect(openTool.modelVisible).toBe(true);
		expect(openTool.description).toContain("uiLanguage");
		expect(openTool.inputSchema.projectId).toBeUndefined();
		expect(openTool.meta).toMatchObject({
			ui: { resourceUri: serverModule.CODECUT_WORKSPACE_RESOURCE_URI },
			"openai/outputTemplate": serverModule.CODECUT_WORKSPACE_RESOURCE_URI,
		});

		const html = await serverModule.readCodecutWorkspaceHtml();
		for (const marker of [
			"WORKSPACE_I18N",
			"navigator.language",
			"项目名称",
			'class="section-heading"',
			'aria-labelledby="project-section-title"',
			'id="project-name"',
			'id="media-sources"',
			'id="media-file-picker"',
			'type="file"',
			"multiple",
			'id="add-media-source-button"',
			'id="target-aspect-ratio"',
			'id="duration-goal-seconds"',
			'id="caption-language"',
			'id="brief-options"',
			'id="brief-label"',
			'aria-labelledby="brief-label"',
			'id="success-criteria-options"',
			'id="success-criteria-label"',
			'aria-labelledby="success-criteria-label"',
			'id="success-criteria"',
			"renderMediaSources",
			"renderChoiceOptions",
			"collectChoiceText",
			"handlePickedFiles",
			"appendPickedFileRows",
			'fields.mediaFilePicker.addEventListener("change", handlePickedFiles)',
			'callTool("inspect_codecut_setup"',
			'callTool("submit_codecut_setup"',
			"openExternal",
			"sendFollowUpMessage",
		]) {
			expect(html).toContain(marker);
		}
		for (const marker of [
			'data-i18n-placeholder="projectNamePlaceholder"',
			'data-i18n-placeholder="filePathPlaceholder"',
			'data-i18n-placeholder="urlPlaceholder"',
			'data-i18n-placeholder="briefCustomPlaceholder"',
			'data-i18n-placeholder="successCriteriaCustomPlaceholder"',
			'<select id="duration-goal-seconds"',
			'<select id="caption-language"',
			'data-field="mimeType"',
			'value="15"',
			'value="30"',
			'value="45"',
			'value="60"',
			'value="90"',
			'value="120"',
			'value="zh-CN"',
			'value="en"',
			"setSelectValue",
		]) {
			expect(html).toContain(marker);
		}
		expect(html).not.toContain("<legend");
		expect(html).not.toContain('id="project-id"');
		expect(html).not.toContain('data-i18n="projectId"');
		expect(html).not.toContain('id="media-file-path"');
		expect(html).not.toContain('id="media-url"');
		expect(html).not.toContain('<input id="duration-goal-seconds"');
		expect(html).not.toContain('<input id="caption-language"');
	});

	test("opens the workspace with structured defaults and widget metadata", () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "Creator Launch",
			brief: "Make a concise vertical launch cut.",
			briefOptions: ["Keep the launch hook", "Remove repeated setup"],
			successCriteriaOptions: [
				"Hook appears before 3s",
				"Captions remain readable",
			],
			mediaSources: [
				{ kind: "filePath", filePath: "/tmp/creator-launch-a.mp4" },
				{
					kind: "url",
					url: "https://cdn.example.com/creator-launch-b.mp4",
					mimeType: "video/mp4",
				},
			],
			targetAspectRatio: "9:16",
			durationGoalSeconds: 45,
		});

		expect(result.structuredContent.intentDefaults).toMatchObject({
			projectName: "Creator Launch",
			brief: "Make a concise vertical launch cut.",
			briefOptions: ["Keep the launch hook", "Remove repeated setup"],
			successCriteriaOptions: [
				"Hook appears before 3s",
				"Captions remain readable",
			],
			mediaSources: [
				{ kind: "filePath", filePath: "/tmp/creator-launch-a.mp4" },
				{
					kind: "url",
					url: "https://cdn.example.com/creator-launch-b.mp4",
					mimeType: "video/mp4",
				},
			],
			targetAspectRatio: "9:16",
			durationGoalSeconds: 45,
			captionLanguage: "auto",
			output: { format: "mp4", quality: "high", includeAudio: true },
		});
		expect(result._meta).toMatchObject({
			ui: { resourceUri: serverModule.CODECUT_WORKSPACE_RESOURCE_URI },
			"openai/outputTemplate": serverModule.CODECUT_WORKSPACE_RESOURCE_URI,
		});
	});

	test("opens the workspace with localized default reference intent", () => {
		const english = serverModule.openCodecutWorkspace({});
		expect(english.structuredContent.intentDefaults.projectName).toBe(
			"CodeCut Project",
		);
		expect(english.structuredContent.intentDefaults.projectId).toMatch(
			/^codecut-project-[a-z0-9]+$/,
		);

		const chinese = serverModule.openCodecutWorkspace({ locale: "zh-CN" });
		expect(chinese.structuredContent.intentDefaults.projectName).toBe(
			"CodeCut 项目",
		);
		expect(chinese.structuredContent.intentDefaults.projectId).toMatch(
			/^codecut-[a-z0-9]+$/,
		);
		expect(chinese.structuredContent.intentDefaults).toMatchObject({
			brief: "剪成节奏清晰的短视频，保留核心信息、可读字幕和自然音频。",
			briefOptions: [
				"剪成节奏清晰的短视频，保留核心信息、可读字幕和自然音频。",
			],
			successCriteria:
				"开头有明确信息点；主体节奏紧凑；字幕清晰；结尾适合继续编辑或导出。",
			successCriteriaOptions: [
				"开头有明确信息点；主体节奏紧凑；字幕清晰；结尾适合继续编辑或导出。",
			],
			captionLanguage: "auto",
			durationGoalSeconds: 60,
			output: { format: "mp4", quality: "high", includeAudio: true },
		});
	});

	test("keeps workspace UI language separate from caption language", () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "Creator Launch",
			locale: "zh-CN",
			captionLanguage: "auto",
		});

		expect(result.structuredContent.intentDefaults).toMatchObject({
			uiLanguage: "zh-CN",
			captionLanguage: "auto",
		});
		expect(result._meta.widgetData.intentDefaults).toMatchObject({
			uiLanguage: "zh-CN",
			captionLanguage: "auto",
		});
	});

	test("accepts mediaPath as a workspace open alias for filePath", () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "Creator Launch",
			mediaPath: "/tmp/creator-launch.mp4",
		});

		expect(result.structuredContent.intentDefaults.mediaSource).toEqual({
			kind: "filePath",
			filePath: "/tmp/creator-launch.mp4",
		});
		expect(result.structuredContent.intentDefaults.mediaSources).toEqual([
			{ kind: "filePath", filePath: "/tmp/creator-launch.mp4" },
		]);
		expect(result._meta.widgetData.intentDefaults.mediaSource).toEqual({
			kind: "filePath",
			filePath: "/tmp/creator-launch.mp4",
		});
		expect(result._meta.widgetData.intentDefaults.mediaSources).toEqual([
			{ kind: "filePath", filePath: "/tmp/creator-launch.mp4" },
		]);
	});

	test("rejects conflicting workspace open filePath aliases", () => {
		expect(() =>
			serverModule.openCodecutWorkspace({
				projectName: "Creator Launch",
				filePath: "/tmp/creator-launch.mp4",
				mediaPath: "/tmp/other-launch.mp4",
			}),
		).toThrow("filePath and mediaPath must match");
	});

	test("inspects setup inputs without mutation and reports blockers", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const filePath = join(directory, "source.mp4");
		const secondFilePath = join(directory, "second.mp4");
		await writeFile(filePath, "video");
		await writeFile(secondFilePath, "video");
		const bridgeCalls = [];
		const bridgeToolImpl = async (toolName) => {
			bridgeCalls.push(toolName);
			return {
				structuredContent: { projects: [{ projectId: "existing-cut" }] },
			};
		};

		try {
			const ready = await serverModule.inspectCodecutSetup(
				setupIntent({
					mediaSources: [
						{ kind: "filePath", filePath },
						{ kind: "filePath", filePath: secondFilePath },
						{ kind: "url", url: "https://cdn.example.com/source.mp4" },
					],
				}),
				{ bridgeToolImpl },
			);
			expect(ready.status).toBe("ready");
			expect(ready.checks.every((check) => check.ok)).toBe(true);
			expect(bridgeCalls).toEqual(["list_projects"]);

			for (const [label, intent] of [
				["invalid project id", setupIntent({ projectId: "../bad" })],
				["missing project name", setupIntent({ projectName: " " })],
				["missing brief", setupIntent({ brief: "" })],
				["missing media sources", setupIntent({ mediaSources: [] })],
				[
					"non-https url",
					setupIntent({
						mediaSources: [{ kind: "url", url: "http://example.com/a.mp4" }],
					}),
				],
				[
					"missing local file",
					setupIntent({
						mediaSources: [{ kind: "filePath", filePath: "/tmp/missing.mp4" }],
					}),
				],
				["bad aspect ratio", setupIntent({ targetAspectRatio: "4:5" })],
				["bad duration", setupIntent({ durationGoalSeconds: 0 })],
				["existing project", setupIntent({ projectId: "existing-cut" })],
			]) {
				const blocked = await serverModule.inspectCodecutSetup(intent, {
					bridgeToolImpl,
				});
				expect(blocked.status, label).toBe("blocked");
				expect(
					blocked.checks.some((check) => !check.ok),
					label,
				).toBe(true);
			}
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("submits setup by creating project, importing media, and reading latest revision", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const filePath = join(directory, "source.mp4");
		const secondFilePath = join(directory, "second.mp4");
		await writeFile(filePath, "video");
		await writeFile(secondFilePath, "video");
		const calls = [];
		const bridgeToolImpl = async (toolName, args) => {
			calls.push({ toolName, args });
			if (toolName === "list_projects") {
				return { structuredContent: { projects: [] } };
			}
			if (toolName === "create_project") {
				return {
					structuredContent: {
						projectId: "launch-cut-canonical",
						name: "Launch Cut",
						revision: 1,
						editorUrl: "http://127.0.0.1:4100/en/editor/launch-cut-canonical",
					},
				};
			}
			if (toolName === "import_media") {
				return {
					structuredContent: {
						status: "completed",
						results: [
							{
								success: true,
								data: {
									assets: [
										{
											id:
												args.filePath === secondFilePath
													? "media-2"
													: "media-1",
											name:
												args.filePath === secondFilePath
													? "second.mp4"
													: "source.mp4",
										},
									],
								},
							},
						],
					},
				};
			}
			if (toolName === "get_project_info") {
				return {
					structuredContent: {
						results: [{ success: true, data: { revision: 2 } }],
					},
				};
			}
			throw new Error(`Unexpected tool ${toolName}`);
		};

		try {
			const result = await serverModule.submitCodecutSetup(
				setupIntent({
					mediaSources: [
						{ kind: "filePath", filePath },
						{ kind: "filePath", filePath: secondFilePath },
					],
				}),
				{ bridgeToolImpl },
			);

			expect(calls.map((call) => call.toolName)).toEqual([
				"list_projects",
				"create_project",
				"import_media",
				"import_media",
				"get_project_info",
			]);
			expect(
				calls
					.filter((call) => call.toolName === "import_media")
					.map((call) => call.args),
			).toEqual([
				{ projectId: "launch-cut-canonical", filePath },
				{ projectId: "launch-cut-canonical", filePath: secondFilePath },
			]);
			expect(
				calls.find((call) => call.toolName === "get_project_info")?.args,
			).toEqual({
				projectId: "launch-cut-canonical",
			});
			expect(result.structuredContent).toMatchObject({
				status: "created",
				projectId: "launch-cut-canonical",
				projectName: "Launch Cut",
				revision: 2,
				editorUrl: "http://127.0.0.1:4100/en/editor/launch-cut-canonical",
				intent: {
					projectId: "launch-cut-canonical",
				},
				importedMedia: [
					{ id: "media-1", name: "source.mp4" },
					{ id: "media-2", name: "second.mp4" },
				],
			});
			expect(result.structuredContent.continuePrompt).toContain(
				"$codecut-jianying-editor-framework",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"get_project_info",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"list_media_assets",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"get_timeline_state_v2",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"launch-cut-canonical",
			);
			expect(result.structuredContent.continuePrompt).not.toContain(
				"launch-cut-001",
			);
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("keeps created project context visible when import fails", async () => {
		const filePath = join(
			await mkdtemp(join(tmpdir(), "codecut-widget-")),
			"source.mp4",
		);
		await writeFile(filePath, "video");
		const bridgeToolImpl = async (toolName) => {
			if (toolName === "list_projects")
				return { structuredContent: { projects: [] } };
			if (toolName === "create_project") {
				return {
					structuredContent: {
						projectId: "launch-cut-001",
						name: "Launch Cut",
						revision: 1,
						editorUrl: "http://127.0.0.1:4100/en/editor/launch-cut-001",
					},
				};
			}
			if (toolName === "import_media") {
				return {
					isError: true,
					structuredContent: { error: "media import failed" },
				};
			}
			throw new Error(`Unexpected tool ${toolName}`);
		};

		try {
			const result = await serverModule.submitCodecutSetup(
				setupIntent({ mediaSources: [{ kind: "filePath", filePath }] }),
				{ bridgeToolImpl },
			);

			expect(result.isError).toBe(true);
			expect(result.structuredContent).toMatchObject({
				status: "import_failed",
				projectId: "launch-cut-001",
				projectName: "Launch Cut",
				revision: 1,
				editorUrl: "http://127.0.0.1:4100/en/editor/launch-cut-001",
				error: "media import failed",
			});
		} finally {
			await rm(filePath.replace(/\/source\.mp4$/, ""), {
				recursive: true,
				force: true,
			});
		}
	});

	test("maps read primitives to explicit codex-bridge send commands", () => {
		expect(
			buildBridgeCliArgs("get_project_info", { projectId: "project-1" }),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"get_project_info",
			"--args-json",
			"{}",
		]);

		expect(
			buildBridgeCliArgs("list_media_assets", { projectId: "project-1" }),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"list_media_assets",
			"--args-json",
			"{}",
		]);

		expect(
			buildBridgeCliArgs("get_timeline_state", { projectId: "project-1" }),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"get_timeline_state",
			"--args-json",
			"{}",
		]);

		expect(
			buildBridgeCliArgs("get_timeline_state_v2", {
				projectId: "project-1",
				startTime: 1,
				endTime: 3,
				includeFrames: true,
				includeReferencedMedia: true,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"get_timeline_state",
			"--args-json",
			JSON.stringify({
				format: "v2",
				startTime: 1,
				endTime: 3,
				includeFrames: true,
				includeReferencedMedia: true,
			}),
		]);
	});

	test("maps write primitives to narrow codex-bridge commands", async () => {
		expect(
			buildBridgeCliArgs("import_media", {
				projectId: "project-1",
				filePath: "/tmp/source.mp4",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"import-media",
			"--project-id",
			"project-1",
			"--file-path",
			"/tmp/source.mp4",
		]);

		const bytesArgs = buildBridgeCliArgs("import_media", {
			projectId: "project-1",
			bytes: Buffer.from("png").toString("base64"),
			fileName: "source.png",
			mimeType: "image/png",
		});
		expect(bytesArgs.slice(0, 5)).toEqual([
			"scripts/codex-bridge.mjs",
			"import-media",
			"--project-id",
			"project-1",
			"--bytes-base64-file",
		]);
		expect(bytesArgs).toContain("--file-name");
		expect(bytesArgs).toContain("source.png");
		expect(bytesArgs).toContain("--mime-type");
		expect(bytesArgs).toContain("image/png");
		expect(await readFile(bytesArgs[5], "utf8")).toBe(
			Buffer.from("png").toString("base64"),
		);

		expect(
			buildBridgeCliArgs("import_media", {
				projectId: "project-1",
				url: "https://cdn.example.com/source.png",
				mimeType: "image/png",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"import-media",
			"--project-id",
			"project-1",
			"--url",
			"https://cdn.example.com/source.png",
			"--mime-type",
			"image/png",
		]);

		expect(
			buildBridgeCliArgs("apply_edit_plan", {
				projectId: "project-1",
				planJsonFile: "/tmp/edit-plan.json",
				replaceExisting: true,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"apply-plan",
			"--project-id",
			"project-1",
			"--plan-json-file",
			"/tmp/edit-plan.json",
			"--replace-existing",
			"true",
		]);

		expect(
			buildBridgeCliArgs("apply_narrated_remix_plan", {
				projectId: "project-1",
				planJsonFile: "/tmp/remix-plan.json",
				replaceExisting: false,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"apply-narrated-remix-plan",
			"--project-id",
			"project-1",
			"--plan-json-file",
			"/tmp/remix-plan.json",
			"--replace-existing",
			"false",
		]);

		expect(
			buildBridgeCliArgs("import_system_template_script", {
				projectId: "project-1",
				templateJsonFile: "/tmp/local-template-script.json",
				confirmedByUser: true,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"import-system-template-script",
			"--project-id",
			"project-1",
			"--template-json-file",
			"/tmp/local-template-script.json",
			"--confirmed-by-user",
			"true",
		]);

		expect(
			buildBridgeCliArgs("delete_system_template_script", {
				projectId: "project-1",
				templateId: "proof-demo-cut",
				confirmedByUser: true,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"delete-system-template-script",
			"--project-id",
			"project-1",
			"--template-id",
			"proof-demo-cut",
			"--confirmed-by-user",
			"true",
		]);
	});

	test("maps rich editing tools through strict send payloads", () => {
		expect(
			buildBridgeCliArgs("add_texts", {
				projectId: "project-1",
				entries: [
					{
						startTime: 0,
						duration: 2,
						content: "Hook",
						fontSize: 0.08,
					},
				],
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"add_texts",
			"--args-json",
			JSON.stringify({
				entries: [
					{
						startTime: 0,
						duration: 2,
						content: "Hook",
						fontSize: 0.08,
					},
				],
			}),
		]);

		expect(
			buildBridgeCliArgs("add_captions", {
				projectId: "project-1",
				language: "auto",
				modelId: "whisper-base",
				captionStyle: {
					preset: "talking-head-pop",
					position: "lower-safe",
				},
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"add_captions",
			"--args-json",
			JSON.stringify({
				language: "auto",
				modelId: "whisper-base",
				captionStyle: {
					preset: "talking-head-pop",
					position: "lower-safe",
				},
			}),
		]);

		expect(
			buildBridgeCliArgs("set_keyframes", {
				projectId: "project-1",
				elementId: "text-1",
				property: "opacity",
				keyframes: [
					{ time: 0, value: 1 },
					{ time: 1, value: 0.25, interpolation: "linear" },
				],
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"set_keyframes",
			"--args-json",
			JSON.stringify({
				elementId: "text-1",
				property: "opacity",
				keyframes: [
					{ time: 0, value: 1 },
					{ time: 1, value: 0.25, interpolation: "linear" },
				],
			}),
		]);

		expect(
			buildBridgeCliArgs("search_media", {
				projectId: "project-1",
				query: "intro",
				scope: "both",
				limit: 5,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"search_media",
			"--args-json",
			JSON.stringify({ query: "intro", scope: "both", limit: 5 }),
		]);
	});

	test("maps verifiable micro edit tools through strict send payloads", () => {
		expect(
			buildBridgeCliArgs("insert_clips", {
				projectId: "project-1",
				trackId: "track-1",
				atTime: 1,
				clips: [{ mediaId: "media-1", duration: 2 }],
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"insert_clips",
			"--args-json",
			JSON.stringify({
				trackId: "track-1",
				atTime: 1,
				clips: [{ mediaId: "media-1", duration: 2 }],
			}),
		]);
		expect(
			buildBridgeCliArgs("move_clips", {
				projectId: "project-1",
				moves: [{ elementId: "clip-1", toTrackId: "track-2" }],
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"move_clips",
			"--args-json",
			JSON.stringify({
				moves: [{ elementId: "clip-1", toTrackId: "track-2" }],
			}),
		]);
		expect(
			buildBridgeCliArgs("remove_clips", {
				projectId: "project-1",
				elementIds: ["clip-1"],
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"remove_clips",
			"--args-json",
			JSON.stringify({ elementIds: ["clip-1"] }),
		]);
		expect(
			buildBridgeCliArgs("split_clip", {
				projectId: "project-1",
				elementId: "clip-1",
				atTime: 4,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"split_clip",
			"--args-json",
			JSON.stringify({ elementId: "clip-1", atTime: 4 }),
		]);
		expect(
			buildBridgeCliArgs("set_clip_properties", {
				projectId: "project-1",
				elementId: "clip-1",
				properties: { duration: 3, opacity: 0.4 },
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"set_clip_properties",
			"--args-json",
			JSON.stringify({
				elementId: "clip-1",
				properties: { duration: 3, opacity: 0.4 },
			}),
		]);
		expect(
			buildBridgeCliArgs("ripple_delete_ranges", {
				projectId: "project-1",
				ranges: [{ startTime: 1, endTime: 3 }],
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"ripple_delete_ranges",
			"--args-json",
			JSON.stringify({ ranges: [[1, 3]] }),
		]);
	});

	test("maps executor analysis and generation tools to codex-bridge commands", () => {
		expect(
			buildBridgeCliArgs("transcribe_media", {
				projectId: "project-1",
				mediaId: "media-1",
				language: "auto",
				modelId: "whisper-base",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"transcribe",
			"--project-id",
			"project-1",
			"--media-id",
			"media-1",
			"--language",
			"auto",
			"--model-id",
			"whisper-base",
		]);
		expect(
			buildBridgeCliArgs("build_video_context", {
				projectId: "project-1",
				mediaId: "media-1",
				language: "auto",
				modelId: "whisper-base",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"build-video-context",
			"--project-id",
			"project-1",
			"--media-id",
			"media-1",
			"--language",
			"auto",
			"--model-id",
			"whisper-base",
		]);
		expect(
			buildBridgeCliArgs("build_visual_context", {
				projectId: "project-1",
				mediaId: "media-1",
				targetAspectRatio: "9:16",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"build-visual-context",
			"--project-id",
			"project-1",
			"--media-id",
			"media-1",
			"--target-aspect-ratio",
			"9:16",
		]);
		expect(
			buildBridgeCliArgs("inspect_video_range", {
				projectId: "project-1",
				mediaId: "media-1",
				startSeconds: 1,
				endSeconds: 3,
				frameCount: 4,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"inspect-video-range",
			"--project-id",
			"project-1",
			"--media-id",
			"media-1",
			"--start-seconds",
			"1",
			"--end-seconds",
			"3",
			"--frame-count",
			"4",
		]);
		expect(
			buildBridgeCliArgs("inspect_timeline", {
				projectId: "project-1",
				startTime: 1,
				endTime: 3,
				frameCount: 4,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"inspect_timeline",
			"--args-json",
			JSON.stringify({ startTime: 1, endTime: 3, frameCount: 4 }),
		]);
		expect(
			buildBridgeCliArgs("build_video_quality_report", {
				projectId: "project-1",
				planJsonFile: "/tmp/edit-plan.json",
				startTime: 0,
				endTime: 3,
				frameCount: 4,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"build-video-quality-report",
			"--project-id",
			"project-1",
			"--plan-json-file",
			"/tmp/edit-plan.json",
			"--start-time",
			"0",
			"--end-time",
			"3",
			"--frame-count",
			"4",
		]);
		expect(
			buildBridgeCliArgs("get_transcript", {
				projectId: "project-1",
				language: "auto",
				modelId: "whisper-base",
				startTime: 0,
				endTime: 10,
				includeFrames: true,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"get_transcript",
			"--args-json",
			JSON.stringify({
				language: "auto",
				modelId: "whisper-base",
				startTime: 0,
				endTime: 10,
				includeFrames: true,
			}),
		]);
		expect(
			buildBridgeCliArgs("build_post_cut_captions", {
				projectId: "project-1",
				language: "zh",
				modelId: "whisper-base",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"build-post-cut-captions",
			"--project-id",
			"project-1",
			"--language",
			"zh",
			"--model-id",
			"whisper-base",
		]);
		expect(
			buildBridgeCliArgs("generate_digital_human", {
				projectId: "project-1",
				imageMediaId: "image-1",
				audioMediaId: "audio-1",
				scriptText: "hello",
				motionPrompt: "natural talking",
				width: 1280,
				height: 720,
				fps: 25,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"generate-digital-human",
			"--project-id",
			"project-1",
			"--image-media-id",
			"image-1",
			"--audio-media-id",
			"audio-1",
			"--script-text",
			"hello",
			"--motion-prompt",
			"natural talking",
			"--width",
			"1280",
			"--height",
			"720",
			"--fps",
			"25",
		]);
	});

	test("maps validation verification effect and export tools without business logic", () => {
		expect(
			buildBridgeCliArgs("validate_edit_plan", {
				projectId: "project-1",
				planJsonFile: "/tmp/edit-plan.json",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"validate-edit-plan",
			"--project-id",
			"project-1",
			"--plan-json-file",
			"/tmp/edit-plan.json",
		]);
		expect(
			buildBridgeCliArgs("preview_edit_plan", {
				projectId: "project-1",
				planJsonFile: "/tmp/edit-plan.json",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"preview-edit-plan",
			"--project-id",
			"project-1",
			"--plan-json-file",
			"/tmp/edit-plan.json",
		]);
		expect(
			buildBridgeCliArgs("verify_timeline", {
				projectId: "project-1",
				verificationJsonFile: "/tmp/verification.json",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"verify-timeline",
			"--project-id",
			"project-1",
			"--verification-json-file",
			"/tmp/verification.json",
		]);
		expect(
			buildBridgeCliArgs("create_text_background_effect", {
				projectId: "project-1",
				sourceMediaId: "media-1",
				derivedAssetId: "mask-1",
				content: "Hook",
				startTime: 0,
				duration: 5,
				replaceExisting: true,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"create_text_background_effect",
			"--args-json",
			JSON.stringify({
				sourceMediaId: "media-1",
				derivedAssetId: "mask-1",
				content: "Hook",
				startTime: 0,
				duration: 5,
				replaceExisting: true,
			}),
		]);
		expect(
			buildBridgeCliArgs("export_project", {
				projectId: "project-1",
				format: "mp4",
				quality: "high",
				includeAudio: true,
				outputFile: "/tmp/out.mp4",
				overwrite: false,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"export",
			"--project-id",
			"project-1",
			"--format",
			"mp4",
			"--quality",
			"high",
			"--include-audio",
			"true",
			"--output-file",
			"/tmp/out.mp4",
			"--overwrite",
			"false",
		]);
	});

	test("rejects unknown tools instead of forwarding arbitrary bridge commands", () => {
		expect(() =>
			buildBridgeCliArgs("add_video_to_timeline", { projectId: "project-1" }),
		).toThrow("Unsupported Codecut MCP tool: add_video_to_timeline");
	});

	test("returns parsed JSON as structured content when CLI stdout is JSON", () => {
		const result = normalizeCliResult({
			toolName: "get_project_info",
			stdout: '{"projectId":"project-1","ok":true}',
			stderr: "",
		});

		expect(result.structuredContent).toEqual({
			projectId: "project-1",
			ok: true,
		});
		expect(result.content[0].text).toContain("get_project_info completed");
	});

	test("keeps non-JSON CLI stdout visible to the model", () => {
		const result = normalizeCliResult({
			toolName: "get_timeline_state",
			stdout: "timeline ready",
			stderr: "",
		});

		expect(result.structuredContent).toEqual({ stdout: "timeline ready" });
		expect(result.content[0].text).toContain("timeline ready");
	});

	test("wraps non-object JSON stdout so structured content stays object-shaped", () => {
		const result = normalizeCliResult({
			toolName: "list_media_assets",
			stdout: '["media-1"]',
			stderr: "",
		});

		expect(result.structuredContent).toEqual({ stdout: '["media-1"]' });
	});

	test("loads bridge env from apps web env before spawning the bridge CLI", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "codecut-mcp-env-"));
		try {
			await mkdir(join(cwd, "apps/web"), { recursive: true });
			await writeFile(
				join(cwd, "apps/web/.env.local"),
				[
					"CODECUT_AGENT_BRIDGE_URL=http://127.0.0.1:4100",
					"CODECUT_AGENT_BRIDGE_TOKEN=secret-token",
					"CODECUT_AGENT_BRIDGE_TIMEOUT_MS=30000",
					"CODECUT_AGENT_BRIDGE_INTERVAL_MS=250",
				].join("\n"),
			);

			let capturedEnv;
			await callBridgeCliTool(
				"get_project_info",
				{ projectId: "project-1" },
				{
					cwd,
					env: { PATH: "/bin" },
					execFileImpl: async (_command, _args, options) => {
						capturedEnv = options.env;
						return { stdout: '{"ok":true}', stderr: "" };
					},
				},
			);

			expect(capturedEnv).toMatchObject({
				PATH: "/bin",
				CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
				CODECUT_AGENT_BRIDGE_TOKEN: "secret-token",
				CODECUT_AGENT_BRIDGE_TIMEOUT_MS: "30000",
				CODECUT_AGENT_BRIDGE_INTERVAL_MS: "250",
			});
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
