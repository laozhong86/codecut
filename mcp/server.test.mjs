import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	CODECUT_MCP_TOOLS,
	CODECUT_TOOL_GOVERNANCE_CATEGORIES,
	DESTRUCTIVE_MCP_TOOL_NAMES,
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
		durationGoalMode: "auto",
		captionLanguage: "auto",
		output: {
			format: "mp4",
			quality: "high",
			includeAudio: true,
			captionFont: "auto",
			captionSize: "medium",
			captionStylePreset: "short-form-bold",
		},
		generateIntroCover: true,
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
			"set_project_cover",
			"clear_project_cover",
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
			"update_system_template_script",
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
			"generate_runninghub_voice_design",
			"generate_runninghub_voice_clone",
			"verify_timeline",
			"export_project",
			"get_timeline_state",
			"get_timeline_state_v2",
		]);
	});

	test("requires scoped host-compatible object ranges for ripple delete input", () => {
		const tool = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "ripple_delete_ranges",
		);

		expect(tool?.description).toContain("explicit scope");
		expect(tool?.inputSchema.scope.safeParse({ type: "timeline" }).success).toBe(
			true,
		);
		expect(
			tool?.inputSchema.scope.safeParse({ type: "track", trackId: "track-1" })
				.success,
		).toBe(true);
		expect(
			tool?.inputSchema.scope.safeParse({
				type: "element",
				elementId: "clip-1",
			}).success,
		).toBe(true);
		expect(
			tool?.inputSchema.ranges.safeParse([{ startTime: 1, endTime: 3 }])
				.success,
		).toBe(true);
		expect(tool?.inputSchema.ranges.safeParse([[1, 3]]).success).toBe(false);
	});

	test("requires transcript granularity in the public MCP schema", () => {
		const tool = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "get_transcript",
		);

		expect(tool?.description).toContain("word-level");
		expect(tool?.inputSchema.granularity.safeParse("segment").success).toBe(
			true,
		);
		expect(tool?.inputSchema.granularity.safeParse("word").success).toBe(true);
	});

	test("exposes explicit quality report rubric and export probe inputs", () => {
		const tool = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "build_video_quality_report",
		);

		expect(tool?.description).toContain("title_quality");
		expect(tool?.description).toContain("export probe");
		expect(tool?.inputSchema.titleRubricJsonFile.safeParse("/tmp/title.json").success).toBe(
			true,
		);
		expect(tool?.inputSchema.outputFile.safeParse("/tmp/final.mp4").success).toBe(
			true,
		);
		expect(tool?.inputSchema.outputFormat.safeParse("mp4").success).toBe(true);
		expect(tool?.inputSchema.includeAudio.safeParse(true).success).toBe(true);
	});

	test("exposes protected terms for RunningHub voice tools", () => {
		for (const name of [
			"generate_runninghub_voice_design",
			"generate_runninghub_voice_clone",
		]) {
			const tool = CODECUT_MCP_TOOLS.find((candidate) => candidate.name === name);
			expect(tool?.inputSchema).toHaveProperty("protectedTerms");
		}
	});

	test("marks search and model catalog tools as read-only", () => {
		const readOnlyByTool = new Map(
			CODECUT_MCP_TOOLS.map((tool) => [tool.name, tool.readOnly]),
		);

		expect(readOnlyByTool.get("list_models")).toBe(true);
		expect(readOnlyByTool.get("search_media")).toBe(true);
		expect(readOnlyByTool.get("import_system_template_script")).toBe(false);
		expect(readOnlyByTool.get("update_system_template_script")).toBe(false);
		expect(readOnlyByTool.get("delete_system_template_script")).toBe(false);
		expect(readOnlyByTool.get("set_project_cover")).toBe(false);
		expect(readOnlyByTool.get("clear_project_cover")).toBe(false);
		expect(readOnlyByTool.get("add_texts")).toBe(false);
		expect(readOnlyByTool.get("add_captions")).toBe(false);
		expect(readOnlyByTool.get("set_keyframes")).toBe(false);
	});

	test("classifies MCP tools by governance surface", () => {
		const categoryByTool = new Map(
			CODECUT_MCP_TOOLS.map((tool) => [tool.name, tool.governanceCategory]),
		);

		for (const tool of CODECUT_MCP_TOOLS) {
			expect(Object.values(CODECUT_TOOL_GOVERNANCE_CATEGORIES)).toContain(
				tool.governanceCategory,
			);
		}

		for (const toolName of [
			"get_project_info",
			"list_media_assets",
			"build_video_context",
			"build_visual_context",
			"inspect_timeline",
			"get_timeline_state",
			"get_timeline_state_v2",
		]) {
			expect(categoryByTool.get(toolName)).toBe(
				CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ,
			);
		}

		for (const toolName of [
			"validate_edit_plan",
			"preview_edit_plan",
			"apply_edit_plan",
			"apply_narrated_remix_plan",
			"verify_timeline",
		]) {
			expect(categoryByTool.get(toolName)).toBe(
				CODECUT_TOOL_GOVERNANCE_CATEGORIES.PLAN_EXECUTION,
			);
		}

		for (const toolName of [
			"add_texts",
			"add_captions",
			"insert_clips",
			"move_clips",
			"remove_clips",
			"split_clip",
			"set_clip_properties",
			"set_keyframes",
			"ripple_delete_ranges",
		]) {
			expect(categoryByTool.get(toolName)).toBe(
				CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR,
			);
		}

		for (const toolName of [
			"import_media",
			"set_project_cover",
			"clear_project_cover",
			"import_system_template_script",
			"update_system_template_script",
			"delete_system_template_script",
		]) {
			expect(categoryByTool.get(toolName)).toBe(
				CODECUT_TOOL_GOVERNANCE_CATEGORIES.ASSET_SIDE_EFFECT,
			);
		}

		for (const toolName of [
			"generate_digital_human",
			"generate_runninghub_voice_design",
			"generate_runninghub_voice_clone",
			"export_project",
		]) {
			expect(categoryByTool.get(toolName)).toBe(
				CODECUT_TOOL_GOVERNANCE_CATEGORIES.EXTERNAL_SIDE_EFFECT,
			);
		}
	});

	test("marks template mutation tools as destructive in MCP annotations", () => {
		expect(DESTRUCTIVE_MCP_TOOL_NAMES.has("import_system_template_script")).toBe(
			true,
		);
		expect(DESTRUCTIVE_MCP_TOOL_NAMES.has("update_system_template_script")).toBe(
			true,
		);
		expect(DESTRUCTIVE_MCP_TOOL_NAMES.has("delete_system_template_script")).toBe(
			true,
		);
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
		const submitTool = serverModule.CODECUT_WORKSPACE_TOOLS.find(
			(tool) => tool.name === "submit_codecut_setup",
		);
		expect(openTool.readOnly).toBe(true);
		expect(openTool.modelVisible).toBe(true);
		expect(submitTool?.inputSchema.mediaSources.safeParse([]).success).toBe(
			true,
		);
		expect(openTool.description).toContain("uiLanguage");
		expect(openTool.description).toContain("mediaPaths");
		expect(openTool.description).toContain("directoryPaths");
		expect(openTool.description).toContain("web service");
		expect(openTool.inputSchema.projectId).toBeUndefined();
		expect(openTool.meta).toMatchObject({
			ui: { resourceUri: serverModule.CODECUT_WORKSPACE_RESOURCE_URI },
			"openai/outputTemplate": serverModule.CODECUT_WORKSPACE_RESOURCE_URI,
		});

		const html = await serverModule.readCodecutWorkspaceHtml();
		for (const marker of [
			"WORKSPACE_I18N",
			"--cc-foreground",
			"--cc-radius-md",
			"--cc-button-height",
			"navigator.language",
			"项目名称",
			'class="section-heading"',
			'aria-labelledby="project-section-title"',
			'id="project-name"',
			'id="media-sources"',
			"class=\"media-sources media-sources-list\"",
			"role=\"list\"",
			"--cc-media-list-max-height",
			"--cc-media-list-max-height: 192px",
			"--cc-media-thumbnail-size: 44px",
			"max-height: var(--cc-media-list-max-height)",
			"overflow-y: auto",
			"media-source-thumbnail",
			"renderMediaSourceThumbnail",
			"createPickedFilePreview",
			"URL.createObjectURL(file)",
			"revokeMediaPreviewUrl",
			"refreshMediaSourcesEmptyState",
			"noMediaSources",
			'id="media-file-picker"',
			'type="file"',
			"multiple",
			'id="media-folder-picker"',
			"webkitdirectory",
			'id="add-media-source-button"',
			'id="add-media-folder-button"',
			"appendMediaFileRow",
			"openHostFolderPicker",
			"handlePickedFolder",
			"media-source-path",
			"dataset.kind",
			"dataset.filePath",
			"dataset.directoryPath",
			'id="target-aspect-ratio"',
			'id="duration-goal-range"',
			"setDurationGoalSelection",
			"collectDurationGoal",
			'id="caption-language"',
			'id="caption-font"',
			'id="caption-size"',
			'id="caption-style-preset"',
			'id="brief-options"',
			'id="brief-label"',
			'aria-labelledby="brief-label"',
			'id="generate-intro-cover"',
			'type="checkbox"',
			"introCoverRecommended",
			"collectIntroCoverChoice",
			'id="success-criteria-options"',
			'id="success-criteria-label"',
			'aria-labelledby="success-criteria-label"',
			'id="success-criteria"',
			"renderMediaSources",
			"renderChoiceOptions",
			"appendCustomChoiceOption",
			"choice-option",
			"toggleCustomField",
			"collectChoiceText",
			"handlePickedFiles",
			"openHostFilePicker",
			"handleHostSelectedFiles",
			"selectFiles",
			"appendPickedFileRows",
			'fields.mediaFilePicker.addEventListener("change", handlePickedFiles)',
			'fields.mediaFolderPicker.addEventListener("change", handlePickedFolder)',
			'callTool("submit_codecut_setup"',
			"openExternal",
			"renderEditorOpenError",
			"await openEditor(payload.editorUrl)",
			"catch (error)",
			"sendFollowUpMessage",
		]) {
			expect(html).toContain(marker);
		}
		expect(html).toContain('row.setAttribute("role", "listitem")');
		expect(html).toContain('data-role="thumbnail"');
		expect(html).toContain('class="media-source-path"');
		expect(html).toContain('data-action="remove-source"');
		expect(html).toContain('class="media-source-remove-button"');
		expect(html).toContain('aria-label="${escapeAttribute(t("removeMediaSource"))}"');
		expect(html).toContain('title="${escapeAttribute(t("removeMediaSource"))}"');
		expect(html).toContain(">X</button>");
		expect(html).toContain(".media-source-remove-button {");
		expect(html).toContain("opacity: 0;");
		expect(html).toContain("pointer-events: none;");
		expect(html).toContain(".media-source-row:hover .media-source-remove-button,");
		expect(html).toContain(".media-source-row:focus-within .media-source-remove-button");
		expect(html).toContain("pointer-events: auto;");
		expect(html).toContain("color: var(--cc-danger);");
		expect(html).toContain("row.remove();");
		expect(html).not.toContain("fields.mediaSources.children.length > 1");
		for (const marker of [
			'data-i18n-placeholder="projectNamePlaceholder"',
			'data-i18n-placeholder="briefCustomPlaceholder"',
			'data-i18n-placeholder="successCriteriaCustomPlaceholder"',
			"durationGoalRange",
			"durationGoalAuto",
			"durationRange15To30",
			"durationRange30To60",
			"durationRange1To3Minutes",
			"自动",
			"15～30秒",
			"30～60 秒",
			"1～3 分钟",
			"customOption",
			"自定义",
			"customButton.dataset.action = \"toggle-custom\"",
			'<select id="caption-language"',
			'<select id="caption-font"',
			'<select id="caption-size"',
			'<select id="caption-style-preset"',
			'value="zh-CN"',
			'value="en"',
			'value="auto"',
			'value="medium"',
			'value="large"',
			'value="small"',
			'value="short-form-bold"',
			'value="talking-head-pop"',
			'value="product-punch"',
			"value=\"minimal-reel\"",
			"captionFont",
			"captionSize",
			"captionStylePreset",
			"captionFontAuto",
			"captionSizeMedium",
			"captionStyleShortFormBold",
			"setSelectValue",
		]) {
			expect(html).toContain(marker);
		}
		expect(html).toContain("durationGoalMode");
		expect(html).toContain("durationGoalRangeSeconds");
		expect(html).toContain('introCoverRecommended: "用AI 生成新的封面"');
		expect(html).not.toContain('id="duration-goal-auto"');
		expect(html).not.toContain('id="duration-goal-custom"');
		expect(html).not.toContain('id="duration-range-options"');
		expect(html).not.toContain('id="duration-range-min-seconds"');
		expect(html).not.toContain('id="duration-range-max-seconds"');
		expect(html).not.toContain("durationGoalRangeOptions");
		expect(html).not.toContain("durationGoalAutoHelp");
		expect(html).not.toContain('data-i18n="introCoverHelp"');
		expect(html).not.toContain("生成时间线开头图");
		expect(html).not.toContain("项目封面使用 set_project_cover");
		expect(html).not.toContain("<legend");
		expect(html).not.toContain("querySelectorAll('input[type=\"checkbox\"]:checked')");
		expect(html).not.toContain("#315cec");
		expect(html).not.toContain('id="project-id"');
		expect(html).not.toContain('data-i18n="projectId"');
		expect(html).not.toContain('id="media-file-path"');
		expect(html).not.toContain('id="media-url"');
		expect(html).not.toContain('class="status"');
		expect(html).not.toContain('id="status-title"');
		expect(html).not.toContain('id="status-message"');
		expect(html).not.toContain('id="checks"');
		expect(html).not.toContain("readyToCreate");
		expect(html).not.toContain("defaultsReady");
		expect(html).not.toContain('id="media-file-picker-button"');
		expect(html).not.toContain('data-i18n="chooseFiles"');
		expect(html).not.toContain("chooseFiles");
		expect(html).not.toContain('data-i18n="mediaSource"');
		expect(html).not.toContain('t("mediaSource")');
		expect(html).not.toContain('mediaSource: "Media source"');
		expect(html).not.toContain('mediaSource: "素材来源"');
		expect(html).not.toContain("localFilePath");
		expect(html).not.toContain("httpsUrl");
		expect(html).not.toContain("urlPlaceholder");
		expect(html).not.toContain("mimeType");
		expect(html).not.toContain('data-field="kind"');
		expect(html).not.toContain('data-field="url"');
		expect(html).not.toContain('data-field="mimeType"');
		expect(html).not.toContain('data-role="url"');
		expect(html).not.toContain("updateMediaSourceRow");
		expect(html).not.toContain("getFileDownloadUrl");
		expect(html).not.toContain('<select id="duration-goal-seconds"');
		expect(html).not.toContain('<input id="duration-goal-seconds"');
		for (const removedDurationOption of [
			'<option value="15">15</option>',
			'<option value="30">30</option>',
			'<option value="45">45</option>',
			'<option value="60">60</option>',
			'<option value="90">90</option>',
			'<option value="120">120</option>',
		]) {
			expect(html).not.toContain(removedDurationOption);
		}
		expect(html).not.toContain('<input id="caption-language"');
		expect(html).not.toContain('id="inspect-button"');
		expect(html).not.toContain('id="brief-custom-toggle"');
		expect(html).not.toContain('id="success-criteria-custom-toggle"');
		expect(html).not.toContain("custom-toggle");
		expect(html).not.toContain('callTool("inspect_codecut_setup"');
		expect(html).not.toContain("lastInspectionReady");
		expect(html).not.toContain("Run inspection before submitting.");
		expect(html).not.toContain("检查设置");
		expect(html).not.toContain("创建项目前需要先检查。");
		expect(html).toContain(
			'<button id="submit-button" class="create-project-cta" type="submit" data-i18n="createProject">Create project</button>',
		);
		expect(html).toContain(".create-project-cta");
		expect(html).toContain("--cc-create-cta-background");
	});

	test("blocks workspace widget rendering when the CodeCut web service is unreachable", async () => {
		const result = await serverModule.callCodecutWorkspaceTool(
			"open_codecut_workspace",
			{ projectName: "Creator Launch" },
			{
				env: {
					CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
				},
				fetchImpl: async () => {
					throw new Error("fetch failed");
				},
			},
		);

		expect(result.isError).toBe(true);
		expect(result.structuredContent).toMatchObject({
			status: "service_unavailable",
			nextAction: "start_codecut_web_service",
			startCommand: "bun run dev:web",
			verifyCommand:
				"curl -fsS -o /dev/null http://127.0.0.1:4100/en/projects",
			readinessUrl: "http://127.0.0.1:4100/en/projects",
			error: "Codecut web service is not reachable: fetch failed",
		});
		expect(result.structuredContent).not.toHaveProperty(
			"pendingConfirmationId",
		);
		expect(result._meta).toBeUndefined();
	});

	test("blocks workspace widget rendering when the CodeCut web service returns a non-2xx response", async () => {
		const result = await serverModule.callCodecutWorkspaceTool(
			"open_codecut_workspace",
			{ projectName: "Creator Launch" },
			{
				env: {
					CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
				},
				fetchImpl: async () => ({ ok: false, status: 503 }),
			},
		);

		expect(result.isError).toBe(true);
		expect(result.structuredContent).toMatchObject({
			status: "service_unavailable",
			nextAction: "start_codecut_web_service",
			readinessUrl: "http://127.0.0.1:4100/en/projects",
			error: "Codecut web service returned 503",
		});
		expect(result._meta).toBeUndefined();
	});

	test("blocks workspace widget rendering when CODECUT_AGENT_BRIDGE_URL is missing", async () => {
		const isolatedCwd = await mkdtemp(
			join(tmpdir(), "codecut-no-bridge-url-"),
		);
		try {
			const result = await serverModule.callCodecutWorkspaceTool(
				"open_codecut_workspace",
				{ projectName: "Creator Launch" },
				{
					cwd: isolatedCwd,
					env: {},
					fetchImpl: async () => {
						throw new Error("fetch must not run without bridge url");
					},
				},
			);

			expect(result.isError).toBe(true);
			expect(result.structuredContent).toMatchObject({
				status: "service_unavailable",
				nextAction: "start_codecut_web_service",
				readinessUrl: "http://127.0.0.1:4100/en/projects",
				error:
					"CODECUT_AGENT_BRIDGE_URL is required before opening CodeCut workspace.",
			});
			expect(result._meta).toBeUndefined();
		} finally {
			await rm(isolatedCwd, { recursive: true, force: true });
		}
	});

	test("renders the workspace widget only after the CodeCut web service is reachable", async () => {
		const result = await serverModule.callCodecutWorkspaceTool(
			"open_codecut_workspace",
			{ projectName: "Creator Launch" },
			{
				env: {
					CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
				},
				fetchImpl: async () => ({ ok: true, status: 200 }),
			},
		);

		expect(result.structuredContent).toMatchObject({
			status: "awaiting_user_confirmation",
			nextAction: "wait_for_widget_submission",
			intentDefaults: { projectName: "Creator Launch" },
		});
		expect(result.structuredContent.pendingConfirmationId).toMatch(
			/^ccpending_[a-f0-9]{24}$/,
		);
		expect(result._meta).toMatchObject({
			ui: { resourceUri: serverModule.CODECUT_WORKSPACE_RESOURCE_URI },
			"openai/outputTemplate": serverModule.CODECUT_WORKSPACE_RESOURCE_URI,
		});
	});

	test("workspace widget reads Codex host metadata defaults", async () => {
		const html = await serverModule.readCodecutWorkspaceHtml();

		expect(html).toContain("api.toolResponseMetadata?.widgetData");
		expect(html).toContain("api.toolOutput?.intentDefaults");
		expect(html).toContain("api.toolResponseMetadata?.widgetData?.pendingConfirmationId");
		expect(html).toContain("pendingConfirmationId: currentPendingConfirmationId");
	});

	test("workspace widget selects recommended choice options only by default", async () => {
		const html = await serverModule.readCodecutWorkspaceHtml();
		const compactHtml = html.replace(/\s+/g, " ");

		expect(compactHtml).toContain(
			"renderChoiceOptions(fields.briefOptions, defaults.briefOptions || [defaults.brief || t(\"briefPlaceholder\")], defaults.brief, fields.brief)",
		);
		expect(compactHtml).toContain(
			"renderChoiceOptions( fields.successCriteriaOptions, defaults.successCriteriaOptions || [defaults.successCriteria || t(\"successCriteriaPlaceholder\")], defaults.successCriteria, fields.successCriteria",
		);
		expect(html).toContain(
			"button.className = isRecommendedChoice ? \"choice-option is-active\" : \"choice-option\"",
		);
		expect(html).toContain(
			"button.setAttribute(\"aria-pressed\", isRecommendedChoice ? \"true\" : \"false\")",
		);
		expect(html).toContain(
			"appendCustomChoiceOption(container, customField)",
		);
		expect(html).toContain(
			"container.querySelectorAll(\".choice-option[aria-pressed='true']\")",
		);
		expect(html).not.toContain('button.className = "choice-option is-active";');
		expect(html).not.toContain('button.setAttribute("aria-pressed", "true");');
		expect(html).not.toContain('customButton.setAttribute("aria-pressed"');
		expect(html).not.toContain("customButton.dataset.choiceOption");
		expect(html).not.toContain("fields.briefCustomToggle.addEventListener");
		expect(html).not.toContain(
			"fields.successCriteriaCustomToggle.addEventListener",
		);
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
		});

		expect(result.structuredContent.intentDefaults).toMatchObject({
			projectName: "Creator Launch",
			generateIntroCover: true,
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
			durationGoalMode: "auto",
			captionLanguage: "auto",
			output: { format: "mp4", quality: "high", includeAudio: true },
		});
		expect(result.structuredContent).toMatchObject({
			status: "awaiting_user_confirmation",
			nextAction: "wait_for_widget_submission",
		});
		expect(result.structuredContent.pendingConfirmationId).toMatch(
			/^ccpending_[a-f0-9]{24}$/,
		);
		expect(result._meta.widgetData.pendingConfirmationId).toBe(
			result.structuredContent.pendingConfirmationId,
		);
		expect(result.content[0].text).toContain("Wait for the user to submit");
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
		expect(english.structuredContent.intentDefaults.durationGoalMode).toBe(
			"auto",
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
				"剪成节奏清晰",
				"保留核心信息",
				"字幕清晰可读",
				"自然音频",
			],
			successCriteria:
				"开头有明确信息点；主体节奏紧凑；字幕清晰；结尾适合继续编辑或导出。",
			successCriteriaOptions: [
				"开头有明确信息点",
				"主体节奏紧凑",
				"字幕清晰",
				"结尾适合继续编辑或导出",
			],
			captionLanguage: "auto",
			generateIntroCover: true,
			output: {
				format: "mp4",
				quality: "high",
				includeAudio: true,
				captionFont: "auto",
				captionSize: "medium",
				captionStylePreset: "short-form-bold",
			},
		});
	});

	test("opens the workspace with caption output preferences", () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "Caption Controls",
			output: {
				captionFont: "serif",
				captionSize: "large",
				captionStylePreset: "product-punch",
			},
		});

		expect(result.structuredContent.intentDefaults.output).toMatchObject({
			format: "mp4",
			quality: "high",
			includeAudio: true,
			captionFont: "serif",
			captionSize: "large",
			captionStylePreset: "product-punch",
		});
		expect(result._meta.widgetData.intentDefaults.output).toMatchObject({
			captionFont: "serif",
			captionSize: "large",
			captionStylePreset: "product-punch",
		});
	});

	test("opens the workspace with intro cover disabled when explicitly requested", () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "No Cover Cut",
			generateIntroCover: false,
		});

		expect(result.structuredContent.intentDefaults).toMatchObject({
			projectName: "No Cover Cut",
			generateIntroCover: false,
		});
		expect(result._meta.widgetData.intentDefaults).toMatchObject({
			generateIntroCover: false,
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

	test("accepts mediaPaths as workspace open aliases for multiple local files", () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "Creator Launch",
			mediaPaths: ["/tmp/creator-launch-a.mp4", "/tmp/creator-launch-b.mp4"],
		});

		expect(result.structuredContent.intentDefaults.mediaSource).toEqual({
			kind: "filePath",
			filePath: "/tmp/creator-launch-a.mp4",
		});
		expect(result.structuredContent.intentDefaults.mediaSources).toEqual([
			{ kind: "filePath", filePath: "/tmp/creator-launch-a.mp4" },
			{ kind: "filePath", filePath: "/tmp/creator-launch-b.mp4" },
		]);
		expect(result._meta.widgetData.intentDefaults.mediaSources).toEqual([
			{ kind: "filePath", filePath: "/tmp/creator-launch-a.mp4" },
			{ kind: "filePath", filePath: "/tmp/creator-launch-b.mp4" },
		]);
	});

	test("accepts directoryPath aliases as optional workspace source context", () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "Creator Launch",
			directoryPaths: ["/tmp/creator-launch-assets", "/tmp/creator-b-roll"],
		});

		expect(result.structuredContent.intentDefaults.mediaSource).toEqual({
			kind: "directoryPath",
			directoryPath: "/tmp/creator-launch-assets",
		});
		expect(result.structuredContent.intentDefaults.mediaSources).toEqual([
			{ kind: "directoryPath", directoryPath: "/tmp/creator-launch-assets" },
			{ kind: "directoryPath", directoryPath: "/tmp/creator-b-roll" },
		]);
		expect(result._meta.widgetData.intentDefaults.mediaSources).toEqual([
			{ kind: "directoryPath", directoryPath: "/tmp/creator-launch-assets" },
			{ kind: "directoryPath", directoryPath: "/tmp/creator-b-roll" },
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

	test("inspects setup inputs without bridge preflight and reports local blockers", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const filePath = join(directory, "source.mp4");
		const secondFilePath = join(directory, "second.mp4");
		await writeFile(filePath, "video");
		await writeFile(secondFilePath, "video");
		const bridgeCalls = [];
		const bridgeToolImpl = async (toolName) => {
			bridgeCalls.push(toolName);
			throw new Error(`Unexpected bridge call ${toolName}`);
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
			expect(bridgeCalls).toEqual([]);

			const automaticDuration = await serverModule.inspectCodecutSetup(
				setupIntent({ durationGoalMode: "auto" }),
				{ bridgeToolImpl },
			);
			expect(automaticDuration.status).toBe("ready");
			expect(automaticDuration.intent.durationGoalMode).toBe("auto");

			const customDurationRange = await serverModule.inspectCodecutSetup(
				setupIntent({
					durationGoalMode: "custom",
					durationGoalRangeSeconds: { minSeconds: 15, maxSeconds: 30 },
				}),
				{ bridgeToolImpl },
			);
			expect(customDurationRange.status).toBe("ready");
			expect(customDurationRange.intent.durationGoalRangeSeconds).toEqual({
				minSeconds: 15,
				maxSeconds: 30,
			});

			for (const [label, intent] of [
				["invalid project id", setupIntent({ projectId: "../bad" })],
				["missing project name", setupIntent({ projectName: " " })],
				["missing brief", setupIntent({ brief: "" })],
				[
					"non-https url",
					setupIntent({
						mediaSources: [{ kind: "url", url: "http://example.com/a.mp4" }],
					}),
				],
				["bad aspect ratio", setupIntent({ targetAspectRatio: "4:5" })],
				[
					"bad duration range",
					setupIntent({
						durationGoalMode: "custom",
						durationGoalRangeSeconds: { minSeconds: 60, maxSeconds: 30 },
					}),
				],
				[
					"bad caption font",
					setupIntent({
						mediaSources: [{ kind: "filePath", filePath }],
						output: { ...setupIntent().output, captionFont: "papyrus" },
					}),
				],
				[
					"bad caption size",
					setupIntent({
						mediaSources: [{ kind: "filePath", filePath }],
						output: { ...setupIntent().output, captionSize: "huge" },
					}),
				],
				[
					"bad caption style preset",
					setupIntent({
						mediaSources: [{ kind: "filePath", filePath }],
						output: {
							...setupIntent().output,
							captionStylePreset: "keyword-highlight",
						},
					}),
				],
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

			const missingIntroCoverChoice = await serverModule.inspectCodecutSetup(
				setupIntent({ generateIntroCover: undefined }),
				{ bridgeToolImpl },
			);
			expect(missingIntroCoverChoice.status).toBe("blocked");
			expect(missingIntroCoverChoice.checks).toContainEqual({
				id: "generate-intro-cover",
				label: "Intro cover",
				ok: false,
				detail: "Choose whether CodeCut should generate an opening cover image.",
			});

			for (const [label, intent] of [
				["missing media sources", setupIntent({ mediaSources: [] })],
				[
					"empty local media path",
					setupIntent({ mediaSources: [{ kind: "filePath", filePath: "" }] }),
				],
				[
					"relative local media path",
					setupIntent({
						mediaSources: [{ kind: "filePath", filePath: "source.mp4" }],
					}),
				],
				[
					"missing local file",
					setupIntent({
						mediaSources: [{ kind: "filePath", filePath: "/tmp/missing.mp4" }],
					}),
				],
				[
					"directory path",
					setupIntent({
						mediaSources: [
							{
								kind: "directoryPath",
								directoryPath: "/tmp/source-folder",
							},
						],
					}),
				],
			]) {
				const ready = await serverModule.inspectCodecutSetup(intent, {
					bridgeToolImpl,
				});
				expect(ready.status, label).toBe("ready");
				expect(ready.checks).toContainEqual({
					id: "media-sources",
					label: "Media sources",
					ok: true,
				});
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
		const pendingConfirmationId =
			serverModule.openCodecutWorkspace(
				setupIntent({
					mediaSources: [
						{ kind: "filePath", filePath },
						{ kind: "filePath", filePath: secondFilePath },
					],
				}),
			).structuredContent.pendingConfirmationId;
		const calls = [];
		const bridgeToolImpl = async (toolName, args) => {
			calls.push({ toolName, args });
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
					pendingConfirmationId,
					mediaSources: [
						{ kind: "filePath", filePath },
						{ kind: "filePath", filePath: secondFilePath },
					],
				}),
				{ bridgeToolImpl, confirmationRoot: directory },
			);

			expect(calls.map((call) => call.toolName)).toEqual([
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
				{
					projectId: "launch-cut-canonical",
					filePath,
					confirmationToken: result.structuredContent.confirmationToken,
				},
				{
					projectId: "launch-cut-canonical",
					filePath: secondFilePath,
					confirmationToken: result.structuredContent.confirmationToken,
				},
			]);
			expect(
				calls.find((call) => call.toolName === "create_project")?.args,
			).toEqual({
				projectId: "launch-cut-001",
				name: "Launch Cut",
				confirmationToken: result.structuredContent.confirmationToken,
			});
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
					generateIntroCover: true,
					output: {
						captionFont: "auto",
						captionSize: "medium",
						captionStylePreset: "short-form-bold",
					},
				},
				importedMedia: [
					{ id: "media-1", name: "source.mp4" },
					{ id: "media-2", name: "second.mp4" },
				],
			});
			expect(result.content[0].text).toContain(
				"[Open CodeCut editor](http://127.0.0.1:4100/en/editor/launch-cut-canonical)",
			);
			const confirmationToken = result.structuredContent.confirmationToken;
			expect(confirmationToken).toMatch(/^ccconfirmed_[a-f0-9]{32}$/);
			expect(result.structuredContent.continuePrompt).toContain(
				"$codecut",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"$browser:control-in-app-browser",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"make the Codex in-app browser visible",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"open the editor URL",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"http://127.0.0.1:4100/en/editor/launch-cut-canonical",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"[Open CodeCut editor](http://127.0.0.1:4100/en/editor/launch-cut-canonical)",
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
			expect(result.structuredContent.continuePrompt).toContain(
				"--confirmation-token",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				confirmationToken,
			);
			expect(result.structuredContent.continuePrompt).toContain(
				'"generateIntroCover":true',
			);
			expect(result.structuredContent.continuePrompt).toContain(
				'"captionStylePreset":"short-form-bold"',
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

	test("creates project without importing optional local media paths that are missing or not import-ready", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const pendingConfirmationId =
			serverModule.openCodecutWorkspace(
				setupIntent({ mediaSources: [{ kind: "filePath", filePath: "" }] }),
			).structuredContent.pendingConfirmationId;
		const calls = [];
		const bridgeToolImpl = async (toolName, args) => {
			calls.push({ toolName, args });
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
			if (toolName === "get_project_info") {
				return {
					structuredContent: {
						results: [{ success: true, data: { revision: 1 } }],
					},
				};
			}
			throw new Error(`Unexpected tool ${toolName}`);
		};

		try {
			const result = await serverModule.submitCodecutSetup(
				setupIntent({
					pendingConfirmationId,
					mediaSources: [
						{ kind: "filePath", filePath: "" },
						{ kind: "filePath", filePath: "source.mp4" },
						{ kind: "filePath", filePath: "/tmp/missing.mp4" },
					],
				}),
				{ bridgeToolImpl, confirmationRoot: directory },
			);

			expect(calls.map((call) => call.toolName)).toEqual([
				"create_project",
				"get_project_info",
			]);
			expect(result.structuredContent).toMatchObject({
				status: "created",
				projectId: "launch-cut-canonical",
				importedMedia: [],
				deferredMediaSources: [
					{ index: 0, kind: "filePath", reason: "missing_file_path" },
					{ index: 1, kind: "filePath", reason: "file_path_not_absolute" },
					{ index: 2, kind: "filePath", reason: "file_not_found" },
				],
			});
			expect(result.structuredContent.continuePrompt).toContain(
				"Deferred media sources",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"source.mp4",
			);
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("creates project when setup intent omits media sources", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const pendingConfirmationId =
			serverModule.openCodecutWorkspace(
				setupIntent({ mediaSources: [{ kind: "filePath", filePath: "" }] }),
			).structuredContent.pendingConfirmationId;
		const calls = [];
		const bridgeToolImpl = async (toolName, args) => {
			calls.push({ toolName, args });
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
			if (toolName === "get_project_info") {
				return {
					structuredContent: {
						results: [{ success: true, data: { revision: 1 } }],
					},
				};
			}
			throw new Error(`Unexpected tool ${toolName}`);
		};

		try {
			const result = await serverModule.submitCodecutSetup(
				setupIntent({
					pendingConfirmationId,
					mediaSources: undefined,
				}),
				{ bridgeToolImpl, confirmationRoot: directory },
			);

			expect(calls.map((call) => call.toolName)).toEqual([
				"create_project",
				"get_project_info",
			]);
			expect(result.structuredContent).toMatchObject({
				status: "created",
				importedMedia: [],
				deferredMediaSources: [
					{ index: 0, kind: "filePath", reason: "missing_file_path" },
				],
			});
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("creates project without importing directory sources", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const pendingConfirmationId =
			serverModule.openCodecutWorkspace(
				setupIntent({
					mediaSources: [
						{ kind: "directoryPath", directoryPath: "/tmp/source-folder" },
					],
				}),
			).structuredContent.pendingConfirmationId;
		const calls = [];
		const bridgeToolImpl = async (toolName, args) => {
			calls.push({ toolName, args });
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
			if (toolName === "get_project_info") {
				return {
					structuredContent: {
						results: [{ success: true, data: { revision: 1 } }],
					},
				};
			}
			throw new Error(`Unexpected tool ${toolName}`);
		};

		try {
			const result = await serverModule.submitCodecutSetup(
				setupIntent({
					pendingConfirmationId,
					mediaSources: [
						{ kind: "directoryPath", directoryPath: "/tmp/source-folder" },
					],
				}),
				{ bridgeToolImpl, confirmationRoot: directory },
			);

			expect(calls.map((call) => call.toolName)).toEqual([
				"create_project",
				"get_project_info",
			]);
			expect(result.structuredContent).toMatchObject({
				status: "created",
				importedMedia: [],
				deferredMediaSources: [
					{
						index: 0,
						kind: "directoryPath",
						directoryPath: "/tmp/source-folder",
						reason: "directory_input",
					},
				],
			});
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("blocks setup submission without the pending confirmation id from the widget", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const filePath = join(directory, "source.mp4");
		await writeFile(filePath, "video");
		const calls = [];

		try {
			const result = await serverModule.submitCodecutSetup(
				setupIntent({ mediaSources: [{ kind: "filePath", filePath }] }),
				{
					confirmationRoot: directory,
					bridgeToolImpl: async (toolName, args) => {
						calls.push({ toolName, args });
						throw new Error("bridge must not run before widget confirmation");
					},
				},
			);

			expect(result.isError).toBe(true);
			expect(result.structuredContent).toMatchObject({
				status: "confirmation_required",
				nextAction: "open_codecut_workspace",
			});
			expect(calls).toEqual([]);
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("keeps created project context visible when import fails", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const filePath = join(directory, "source.mp4");
		await writeFile(filePath, "video");
		const pendingConfirmationId =
			serverModule.openCodecutWorkspace(
				setupIntent({ mediaSources: [{ kind: "filePath", filePath }] }),
			).structuredContent.pendingConfirmationId;
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
				setupIntent({
					pendingConfirmationId,
					mediaSources: [{ kind: "filePath", filePath }],
				}),
				{
					bridgeToolImpl,
					confirmationRoot: directory,
				},
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
			await rm(directory, {
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
		const confirmationToken = "ccconfirmed_test";
		expect(
			buildBridgeCliArgs("import_media", {
				projectId: "project-1",
				filePath: "/tmp/source.mp4",
				confirmationToken,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"import-media",
			"--project-id",
			"project-1",
			"--file-path",
			"/tmp/source.mp4",
			"--confirmation-token",
			confirmationToken,
		]);

		const bytesArgs = buildBridgeCliArgs("import_media", {
			projectId: "project-1",
			bytes: Buffer.from("png").toString("base64"),
			fileName: "source.png",
			mimeType: "image/png",
			confirmationToken,
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
		expect(bytesArgs).toContain("--confirmation-token");
		expect(bytesArgs).toContain(confirmationToken);
		expect(await readFile(bytesArgs[5], "utf8")).toBe(
			Buffer.from("png").toString("base64"),
		);

		expect(
			buildBridgeCliArgs("import_media", {
				projectId: "project-1",
				url: "https://cdn.example.com/source.png",
				mimeType: "image/png",
				confirmationToken,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"import-media",
			"--project-id",
			"project-1",
			"--url",
			"https://cdn.example.com/source.png",
			"--confirmation-token",
			confirmationToken,
			"--mime-type",
			"image/png",
		]);

		expect(
			buildBridgeCliArgs("set_project_cover", {
				projectId: "project-1",
				mediaId: "cover-1",
				title: "别乱花钱",
				prompt: "竖版 9:16 短视频封面，标题设计是画面核心",
				stylePreset: "viral_chinese_title_cover",
				confirmationToken,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"set_project_cover",
			"--args-json",
			JSON.stringify({
				mediaId: "cover-1",
				title: "别乱花钱",
				prompt: "竖版 9:16 短视频封面，标题设计是画面核心",
				stylePreset: "viral_chinese_title_cover",
			}),
			"--confirmation-token",
			confirmationToken,
		]);

		expect(
			buildBridgeCliArgs("clear_project_cover", {
				projectId: "project-1",
				confirmationToken,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"clear_project_cover",
			"--args-json",
			"{}",
			"--confirmation-token",
			confirmationToken,
		]);

		expect(
			buildBridgeCliArgs("apply_edit_plan", {
				projectId: "project-1",
				planJsonFile: "/tmp/edit-plan.json",
				replaceExisting: true,
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
		]);

		expect(
			buildBridgeCliArgs("apply_narrated_remix_plan", {
				projectId: "project-1",
				planJsonFile: "/tmp/remix-plan.json",
				replaceExisting: false,
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
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
			buildBridgeCliArgs("update_system_template_script", {
				projectId: "project-1",
				templateJsonFile: "/tmp/local-template-script.json",
				confirmedByUser: true,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"update-system-template-script",
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
		const confirmationToken = "ccconfirmed_test";
		expect(
			buildBridgeCliArgs("add_texts", {
				projectId: "project-1",
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
		]);

		expect(
			buildBridgeCliArgs("add_captions", {
				projectId: "project-1",
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
		]);

		expect(
			buildBridgeCliArgs("generate_runninghub_voice_design", {
				projectId: "project-1",
				confirmationToken,
				text: "欢迎来到今天的测试",
				emotionPrompt: "温柔、稳定的中文播客女声",
				protectedTerms: ["今天的测试", "Codex"],
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"generate-runninghub-voice-design",
			"--project-id",
			"project-1",
			"--text",
			"欢迎来到今天的测试",
			"--emotion-prompt",
			"温柔、稳定的中文播客女声",
			"--protected-term",
			"今天的测试",
			"--protected-term",
			"Codex",
			"--confirmation-token",
			confirmationToken,
		]);

		expect(
			buildBridgeCliArgs("set_keyframes", {
				projectId: "project-1",
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
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
		const confirmationToken = "ccconfirmed_test";
		expect(
			buildBridgeCliArgs("insert_clips", {
				projectId: "project-1",
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
		]);
		expect(
			buildBridgeCliArgs("move_clips", {
				projectId: "project-1",
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
		]);
		expect(
			buildBridgeCliArgs("remove_clips", {
				projectId: "project-1",
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
		]);
		expect(
			buildBridgeCliArgs("split_clip", {
				projectId: "project-1",
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
		]);
		expect(
			buildBridgeCliArgs("set_clip_properties", {
				projectId: "project-1",
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
		]);
		expect(
			buildBridgeCliArgs("ripple_delete_ranges", {
				projectId: "project-1",
				confirmationToken,
				scope: { type: "track", trackId: "track-1" },
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
			JSON.stringify({
				scope: { type: "track", trackId: "track-1" },
				ranges: [[1, 3]],
			}),
			"--confirmation-token",
			confirmationToken,
		]);
	});

	test("maps executor analysis and generation tools to codex-bridge commands", () => {
		const confirmationToken = "ccconfirmed_test";
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
				titleRubricJsonFile: "/tmp/title-rubric.json",
				outputFile: "/tmp/final.mp4",
				outputFormat: "mp4",
				includeAudio: true,
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
			"--title-rubric-json-file",
			"/tmp/title-rubric.json",
			"--output-file",
			"/tmp/final.mp4",
			"--format",
			"mp4",
			"--include-audio",
			"true",
		]);
		expect(
			buildBridgeCliArgs("get_transcript", {
				projectId: "project-1",
				granularity: "word",
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
				granularity: "word",
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
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
		]);
		expect(
			buildBridgeCliArgs("generate_runninghub_voice_design", {
				projectId: "project-1",
				confirmationToken,
				text: "hello",
				emotionPrompt: "warm narrator",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"generate-runninghub-voice-design",
			"--project-id",
			"project-1",
			"--text",
			"hello",
			"--emotion-prompt",
			"warm narrator",
			"--confirmation-token",
			confirmationToken,
		]);
		expect(
			buildBridgeCliArgs("generate_runninghub_voice_clone", {
				projectId: "project-1",
				confirmationToken,
				audioPath: "/tmp/reference.wav",
				text: "hello",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"generate-runninghub-voice-clone",
			"--project-id",
			"project-1",
			"--audio-path",
			"/tmp/reference.wav",
			"--text",
			"hello",
			"--confirmation-token",
			confirmationToken,
		]);
	});

	test("maps validation verification effect and export tools without business logic", () => {
		const confirmationToken = "ccconfirmed_test";
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
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
		]);
		expect(
			buildBridgeCliArgs("export_project", {
				projectId: "project-1",
				confirmationToken,
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
			"--confirmation-token",
			confirmationToken,
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
					"RUNNINGHUB_API_KEY=runninghub-secret",
					"UNRELATED_SECRET=must-not-leak",
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
				RUNNINGHUB_API_KEY: "runninghub-secret",
			});
			expect(capturedEnv).not.toHaveProperty("UNRELATED_SECRET");
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
