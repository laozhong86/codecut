import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { runInNewContext } from "node:vm";

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
		confirmedByUser: true,
		taskType: "edit_execution",
		mediaSources: [{ kind: "filePath", filePath: "/tmp/source.mp4" }],
		targetAspectRatio: "9:16",
		durationGoalMode: "auto",
		captionLanguage: "auto",
		transitionPreference: "auto",
		templatePreference: { mode: "auto" },
		networkMaterialMatching: {
			enabled: false,
			placement: "background",
			providers: ["pexels"],
			resolvedTemplateId: "talking-head-short",
			decisionSource: "template",
		},
		output: {
			format: "mp4",
			quality: "high",
			includeAudio: true,
			captionEnabled: true,
			captionFont: "auto",
			captionSize: "medium",
			captionStylePreset: "creator-clean",
			voiceEnabled: false,
			voicePackId: "none",
		},
		titlePreferences: { enabled: false },
		generateIntroCover: true,
		requirements:
			"Cut a high-retention short for a product launch.\nShow a hook, proof, and CTA with readable captions.",
		...overrides,
	};
}

function slashPath(value) {
	return String(value).replaceAll("\\", "/");
}

function bgmCandidate(overrides = {}) {
	return {
		id: "internet-archive:safe-lofi:safe-lofi.mp3",
		sourceId: "internet-archive:safe-lofi:safe-lofi.mp3",
		title: "Safe Lofi Beat",
		creator: "Open Artist",
		source: "internet_archive",
		sourceUrl: "https://archive.org/details/safe-lofi",
		licenseLabel: "CC BY 4.0",
		licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
		commercialUseAllowed: true,
		attributionRequired: true,
		previewUrl: "https://archive.org/download/safe-lofi/safe-lofi.mp3",
		downloadUrl: "https://archive.org/download/safe-lofi/safe-lofi.mp3",
		durationSeconds: 91.2,
		fileSizeBytes: 1234,
		...overrides,
	};
}

function smartBgmPreferences(overrides = {}) {
	const selectedCandidate = bgmCandidate();
	return {
		mode: "smart_match",
		searchQuery: "bright lofi product demo",
		candidates: [selectedCandidate],
		selectedCandidate,
		...overrides,
	};
}

function readStyleDeclarations(html, selector) {
	const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = html.match(
		new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, "m"),
	);
	if (!match) {
		throw new Error(`Missing style rule for ${selector}`);
	}

	const declarations = new Map();
	for (const declaration of match[1].split(";")) {
		const trimmedDeclaration = declaration.trim();
		if (!trimmedDeclaration) {
			continue;
		}
		const separatorIndex = trimmedDeclaration.indexOf(":");
		if (separatorIndex === -1) {
			throw new Error(`Invalid CSS declaration: ${trimmedDeclaration}`);
		}
		declarations.set(
			trimmedDeclaration.slice(0, separatorIndex).trim(),
			trimmedDeclaration.slice(separatorIndex + 1).trim(),
		);
	}
	return declarations;
}

function stripCodecutInjectedBridge(html) {
	return html
		.replace(/<script id="codecutMcpAppsBundle">[\s\S]*?<\/script>\n?/g, "")
		.replace(/<script id="codecutMcpHostBridge">[\s\S]*?<\/script>\n?/g, "");
}

function extractScriptContentById(html, id) {
	const match = html.match(
		new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`),
	);
	if (!match) {
		throw new Error(`Missing script: ${id}`);
	}
	return match[1];
}

function evaluateWorkspaceRecommendedChoices(
	html,
	{ options, recommendedValues },
) {
	const start = html.indexOf("function recommendedChoiceSet");
	const end = html.indexOf("function collectChoiceText", start);
	if (start === -1 || end === -1) {
		throw new Error("Missing workspace choice selection functions");
	}
	const context = { options, recommendedValues, result: null };
	runInNewContext(
		`${html.slice(start, end)}
		const normalizedOptions = normalizeChoiceOptions(options);
		result = Array.from(recommendedChoiceSet(normalizedOptions, recommendedValues));`,
		context,
	);
	return context.result;
}

function evaluateWorkspaceErrorMessage(html, { value, fallback }) {
	const start = html.indexOf("function formatErrorMessage");
	const end = html.indexOf("function renderBlocked", start);
	if (start === -1 || end === -1) {
		throw new Error("Missing workspace error formatting function");
	}
	const context = { value, fallback, result: null };
	runInNewContext(
		`${html.slice(start, end)}
		result = formatErrorMessage(value, fallback);`,
		context,
	);
	return context.result;
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
			"build_caption_diagnostics",
			"build_post_cut_captions",
			"list_models",
			"search_media",
			"search_bgm_music",
			"list_templates",
			"get_template",
			"resolve_template",
			"check_template_import",
			"import_template",
			"update_template",
			"delete_template",
			"validate_edit_plan",
			"preview_edit_plan",
			"apply_edit_plan",
			"apply_narrated_remix_plan",
			"apply_composite_layout_plan",
			"add_texts",
			"add_captions",
			"import_subtitles",
			"update_project_preferences",
			"insert_clips",
			"move_clips",
			"remove_clips",
			"split_clip",
			"set_clip_properties",
			"set_keyframes",
			"add_transitions",
			"update_transition",
			"remove_transition",
			"ripple_delete_ranges",
			"create_text_background_effect",
			"create_human_pip_effect",
			"generate_digital_human",
			"generate_runninghub_voice_design",
			"generate_runninghub_voice_clone",
			"generate_volcengine_cloned_voice",
			"transcribe_volcengine_url",
			"build_volcengine_url_captions",
			"transcribe_volcengine_media",
			"build_volcengine_media_captions",
			"verify_timeline",
			"export_project",
			"export_timeline_frame",
			"get_timeline_state",
		]);
		expect(CODECUT_MCP_TOOLS.map((tool) => tool.name)).not.toContain(
			"get_timeline_state_v2",
		);
	});

	test("requires scoped host-compatible object ranges for ripple delete input", () => {
		const tool = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "ripple_delete_ranges",
		);

		expect(tool?.description).toContain("explicit scope");
		expect(
			tool?.inputSchema.scope.safeParse({ type: "timeline" }).success,
		).toBe(true);
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

	test("requires editor font options for text mutation tools", () => {
		const addTexts = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "add_texts",
		);
		const setClipProperties = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "set_clip_properties",
		);

		expect(
			addTexts?.inputSchema.entries.safeParse([
				{
					startTime: 0,
					duration: 2,
					content: "Hook",
					fontFamily: "CodecutYanBoSong",
					richSpans: [
						{
							start: 0,
							end: 4,
							color: "#ffffff",
							fontScale: 0.84,
							fontWeight: "bold",
						},
					],
				},
			]).success,
		).toBe(true);
		expect(
			addTexts?.inputSchema.entries.safeParse([
				{
					startTime: 0,
					duration: 2,
					content: "Hook",
					richSpans: [{ start: 0.5, end: 4, color: "#ffffff" }],
				},
			]).success,
		).toBe(false);
		expect(
			addTexts?.inputSchema.entries.safeParse([
				{
					startTime: 0,
					duration: 2,
					content: "Hook",
					fontFamily: "CodecutCJK",
				},
			]).success,
		).toBe(false);
		expect(
			setClipProperties?.inputSchema.properties.safeParse({
				fontFamily: "Inter",
				richSpans: [
					{
						start: 0,
						end: 4,
						color: "#ffffff",
						fontScale: 0.84,
						fontWeight: "bold",
					},
				],
			}).success,
		).toBe(true);
		expect(
			setClipProperties?.inputSchema.properties.safeParse({
				fontFamily: "CodecutCJK",
			}).success,
		).toBe(false);
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
		expect(
			tool?.inputSchema.titleRubricJsonFile.safeParse("/tmp/title.json")
				.success,
		).toBe(true);
		expect(
			tool?.inputSchema.outputFile.safeParse("/tmp/final.mp4").success,
		).toBe(true);
		expect(tool?.inputSchema.outputFormat.safeParse("mp4").success).toBe(true);
		expect(tool?.inputSchema.includeAudio.safeParse(true).success).toBe(true);
	});

	test("exposes explicit timeline frame export inputs", () => {
		const tool = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "export_timeline_frame",
		);

		expect(tool?.description).toContain("PNG");
		expect(tool?.readOnly).toBe(false);
		expect(tool?.inputSchema.timeSeconds.safeParse(1.25).success).toBe(true);
		expect(tool?.inputSchema.format.safeParse("png").success).toBe(true);
		expect(tool?.inputSchema.format.safeParse("jpg").success).toBe(false);
		expect(
			tool?.inputSchema.outputFile.safeParse("/tmp/codecut-frame.png").success,
		).toBe(true);
		expect(tool?.inputSchema.overwrite.safeParse(false).success).toBe(true);
	});

	test("exposes protected terms for RunningHub voice tools", () => {
		for (const name of [
			"generate_runninghub_voice_design",
			"generate_runninghub_voice_clone",
		]) {
			const tool = CODECUT_MCP_TOOLS.find(
				(candidate) => candidate.name === name,
			);
			expect(tool?.inputSchema).toHaveProperty("protectedTerms");
		}
	});

	test("marks search and model catalog tools as read-only", () => {
		const readOnlyByTool = new Map(
			CODECUT_MCP_TOOLS.map((tool) => [tool.name, tool.readOnly]),
		);

		expect(readOnlyByTool.get("list_models")).toBe(true);
		expect(readOnlyByTool.get("search_media")).toBe(true);
		expect(readOnlyByTool.get("search_bgm_music")).toBe(true);
		expect(readOnlyByTool.get("build_caption_diagnostics")).toBe(true);
		expect(readOnlyByTool.get("list_templates")).toBe(true);
		expect(readOnlyByTool.get("get_template")).toBe(true);
		expect(readOnlyByTool.get("resolve_template")).toBe(true);
		expect(readOnlyByTool.get("check_template_import")).toBe(true);
		expect(readOnlyByTool.get("import_template")).toBe(false);
		expect(readOnlyByTool.get("update_template")).toBe(false);
		expect(readOnlyByTool.get("delete_template")).toBe(false);
		expect(readOnlyByTool.get("set_project_cover")).toBe(false);
		expect(readOnlyByTool.get("clear_project_cover")).toBe(false);
		expect(readOnlyByTool.get("add_texts")).toBe(false);
		expect(readOnlyByTool.get("add_captions")).toBe(false);
		expect(readOnlyByTool.get("import_subtitles")).toBe(false);
		expect(readOnlyByTool.get("set_keyframes")).toBe(false);
		expect(readOnlyByTool.get("add_transitions")).toBe(false);
		expect(readOnlyByTool.get("update_transition")).toBe(false);
		expect(readOnlyByTool.get("remove_transition")).toBe(false);
	});

	test("accepts implemented migration transition types in MCP schemas", () => {
		const addTransitions = CODECUT_MCP_TOOLS.find(
			(tool) => tool.name === "add_transitions",
		);
		const updateTransition = CODECUT_MCP_TOOLS.find(
			(tool) => tool.name === "update_transition",
		);

		expect(
			addTransitions?.inputSchema.entries.safeParse([
				{
					trackId: "video-track-1",
					fromElementId: "clip-1",
					toElementId: "clip-2",
					type: "blur-crossfade",
					duration: 0.4,
				},
			]).success,
		).toBe(true);
		expect(
			updateTransition?.inputSchema.type.safeParse("blur-crossfade").success,
		).toBe(true);
		expect(
			updateTransition?.inputSchema.type.safeParse("domain-warp").success,
		).toBe(false);
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
			"build_caption_diagnostics",
			"inspect_timeline",
			"get_timeline_state",
			"search_bgm_music",
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
			"apply_composite_layout_plan",
			"verify_timeline",
		]) {
			expect(categoryByTool.get(toolName)).toBe(
				CODECUT_TOOL_GOVERNANCE_CATEGORIES.PLAN_EXECUTION,
			);
		}

		for (const toolName of [
			"add_texts",
			"add_captions",
			"import_subtitles",
			"insert_clips",
			"move_clips",
			"remove_clips",
			"split_clip",
			"set_clip_properties",
			"set_keyframes",
			"add_transitions",
			"update_transition",
			"remove_transition",
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
			"import_template",
			"update_template",
			"delete_template",
		]) {
			expect(categoryByTool.get(toolName)).toBe(
				CODECUT_TOOL_GOVERNANCE_CATEGORIES.ASSET_SIDE_EFFECT,
			);
		}

		for (const toolName of [
			"generate_digital_human",
			"generate_runninghub_voice_design",
			"generate_runninghub_voice_clone",
			"generate_volcengine_cloned_voice",
			"transcribe_volcengine_url",
			"build_volcengine_url_captions",
			"transcribe_volcengine_media",
			"build_volcengine_media_captions",
			"export_project",
			"export_timeline_frame",
		]) {
			expect(categoryByTool.get(toolName)).toBe(
				CODECUT_TOOL_GOVERNANCE_CATEGORIES.EXTERNAL_SIDE_EFFECT,
			);
		}
	});

	test("exposes caption diagnostics as an explicit read-only MCP schema", () => {
		const tool = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "build_caption_diagnostics",
		);

		expect(tool?.readOnly).toBe(true);
		expect(tool?.governanceCategory).toBe(
			CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ,
		);
		expect(tool?.description).toContain("transcription failures");
		expect(
			tool?.inputSchema.captionStyle.safeParse({
				preset: "creator-clean",
				position: "lower-safe",
				size: "medium",
				motionPreset: "soft-reveal",
			}).success,
		).toBe(true);
		expect(tool?.inputSchema.captionStyle.safeParse({}).success).toBe(false);
	});

	test("exposes search_bgm_music as a read-only Internet Archive matcher", async () => {
		const tool = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "search_bgm_music",
		);

		expect(tool?.description).toContain("Internet Archive");
		expect(tool?.readOnly).toBe(true);
		expect(tool?.governanceCategory).toBe(
			CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ,
		);
		expect(tool?.inputSchema.query.safeParse("lofi product demo").success).toBe(
			true,
		);
		expect(tool?.inputSchema.limit.safeParse(5).success).toBe(true);
		expect(tool?.inputSchema.limit.safeParse(11).success).toBe(false);
		expect(tool?.inputSchema.commercialOnly.safeParse(true).success).toBe(true);
	});

	test("searches BGM candidates and filters non-commercial Internet Archive licenses", async () => {
		const fetchedUrls = [];
		const result = await serverModule.searchBgmMusic(
			{ query: "lofi product demo", limit: 5, commercialOnly: true },
			{
				fetchImpl: async (url) => {
					fetchedUrls.push(String(url));
					if (String(url).startsWith("https://archive.org/advancedsearch.php")) {
						return {
							ok: true,
							status: 200,
							json: async () => ({
								response: {
									numFound: 3,
									docs: [
										{
											identifier: "safe-lofi",
											title: "Safe Lofi Beat",
											creator: "Open Artist",
											licenseurl:
												"https://creativecommons.org/licenses/by/4.0/",
											downloads: 12,
										},
										{
											identifier: "non-commercial",
											title: "NC Beat",
											licenseurl:
												"https://creativecommons.org/licenses/by-nc/4.0/",
										},
										{
											identifier: "no-derivatives",
											title: "ND Beat",
											licenseurl:
												"https://creativecommons.org/licenses/by-nd/4.0/",
										},
									],
								},
							}),
						};
					}
					if (String(url) === "https://archive.org/metadata/safe-lofi") {
						return {
							ok: true,
							status: 200,
							json: async () => ({
								metadata: {
									title: "Safe Lofi Beat",
									creator: "Open Artist",
									subject: "lofi; upbeat",
									licenseurl:
										"https://creativecommons.org/licenses/by/4.0/",
								},
								files: [
									{
										name: "safe-lofi.ogg",
										source: "original",
										format: "Ogg Vorbis",
										size: "100",
										length: "91.2",
									},
									{
										name: "safe-lofi.mp3",
										source: "original",
										format: "VBR MP3",
										size: "1234",
										length: "91.2",
									},
								],
							}),
						};
					}
					throw new Error(`Unexpected fetch ${url}`);
				},
			},
		);

		expect(result).toEqual({
			query: "lofi product demo",
			candidates: [bgmCandidate()],
			count: 1,
		});
		expect(fetchedUrls).not.toContain(
			"https://archive.org/metadata/non-commercial",
		);
		expect(fetchedUrls).not.toContain(
			"https://archive.org/metadata/no-derivatives",
		);
	});

	test("marks template mutation tools as destructive in MCP annotations", () => {
		expect(DESTRUCTIVE_MCP_TOOL_NAMES.has("import_template")).toBe(true);
		expect(DESTRUCTIVE_MCP_TOOL_NAMES.has("update_template")).toBe(true);
		expect(DESTRUCTIVE_MCP_TOOL_NAMES.has("delete_template")).toBe(true);
	});

	test("defines a stable workspace widget resource and tools", async () => {
		expect(serverModule.CODECUT_WORKSPACE_RESOURCE_URI).toMatch(
			/^ui:\/\/codecut\/.+\/workspace-[a-f0-9]{12}\.html$/,
		);
		expect(serverModule.CODECUT_WORKSPACE_LEGACY_RESOURCE_URI).toMatch(
			/^ui:\/\/codecut\/.+\/workspace\.html$/,
		);
		expect(serverModule.CODECUT_WORKSPACE_RESOURCE_URI).not.toBe(
			serverModule.CODECUT_WORKSPACE_LEGACY_RESOURCE_URI,
		);
		expect(serverModule.CODECUT_WORKSPACE_HASHED_RESOURCE_URI_TEMPLATE).toMatch(
			/^ui:\/\/codecut\/.+\/workspace-\{contentVersion\}\.html$/,
		);
		expect(
			serverModule.CODECUT_WORKSPACE_TOOLS.map((tool) => tool.name),
		).toEqual([
			"open_codecut_workspace",
			"open_codecut_requirement_confirmation",
			"get_codecut_requirement_confirmation",
			"create_codecut_project_from_requirement",
			"inspect_codecut_setup",
			"recover_codecut_setup",
			"list_codecut_builtin_voice_packs",
			"submit_codecut_setup",
		]);

		const openTool = serverModule.CODECUT_WORKSPACE_TOOLS.find(
			(tool) => tool.name === "open_codecut_workspace",
		);
		const submitTool = serverModule.CODECUT_WORKSPACE_TOOLS.find(
			(tool) => tool.name === "submit_codecut_setup",
		);
		const requirementOpenTool = serverModule.CODECUT_WORKSPACE_TOOLS.find(
			(tool) => tool.name === "open_codecut_requirement_confirmation",
		);
		const requirementGetTool = serverModule.CODECUT_WORKSPACE_TOOLS.find(
			(tool) => tool.name === "get_codecut_requirement_confirmation",
		);
		const requirementCreateTool = serverModule.CODECUT_WORKSPACE_TOOLS.find(
			(tool) => tool.name === "create_codecut_project_from_requirement",
		);
		const recoverTool = serverModule.CODECUT_WORKSPACE_TOOLS.find(
			(tool) => tool.name === "recover_codecut_setup",
		);
		const voiceTool = serverModule.CODECUT_WORKSPACE_TOOLS.find(
			(tool) => tool.name === "list_codecut_builtin_voice_packs",
		);
		expect(openTool.readOnly).toBe(true);
		expect(openTool.modelVisible).toBe(true);
		expect(requirementOpenTool.readOnly).toBe(false);
		expect(requirementOpenTool.modelVisible).toBe(true);
		expect(requirementGetTool.readOnly).toBe(true);
		expect(requirementGetTool.modelVisible).toBe(true);
		expect(requirementCreateTool.readOnly).toBe(false);
		expect(requirementCreateTool.modelVisible).toBe(true);
		expect(recoverTool.readOnly).toBe(true);
		expect(recoverTool.modelVisible).toBe(true);
		expect(recoverTool.meta).toBeUndefined();
		expect(submitTool.readOnly).toBe(false);
		expect(submitTool.modelVisible).toBe(true);
		expect(voiceTool.readOnly).toBe(true);
		expect(voiceTool.modelVisible).toBe(true);
		expect(submitTool.description).toContain(
			"confirmedByUser true after the user explicitly confirms",
		);
		expect(submitTool.inputSchema.confirmedByUser.safeParse(true).success).toBe(
			true,
		);
		expect(submitTool.meta).toMatchObject({
			ui: { visibility: ["model", "app"] },
			"openai/widgetAccessible": true,
		});
		expect(
			recoverTool.inputSchema.pendingConfirmationId.safeParse("").success,
		).toBe(false);
		expect(submitTool?.inputSchema.mediaSources.safeParse([]).success).toBe(
			true,
		);
		expect(
			submitTool?.inputSchema.mediaSources.safeParse([
				{
					kind: "filePath",
					filePath: "/tmp/source.mp4",
					mimeType: "video/mp4",
				},
			]).success,
		).toBe(true);
		expect(
			submitTool?.inputSchema.mediaSources.safeParse([
				{
					kind: "filePath",
					filePath: "/tmp/result.json",
					mimeType: "application/json",
				},
			]).success,
		).toBe(false);
		expect(
			z.object(submitTool.inputSchema).strict().safeParse(setupIntent())
				.success,
		).toBe(true);
		const openInputSchema = z.object(openTool.inputSchema).strict();
		const requirementOpenInputSchema = z
			.object(requirementOpenTool.inputSchema)
			.strict();
		const roleAndSoundDefaults = {
			characterPreferences: { characterId: "ugc-female-host" },
			bgmPreferences: smartBgmPreferences(),
			output: {
				voiceEnabled: true,
				voicePackId: "podcast-male",
			},
		};
		expect(openInputSchema.safeParse(roleAndSoundDefaults).success).toBe(true);
		expect(
			requirementOpenInputSchema.safeParse(roleAndSoundDefaults).success,
		).toBe(false);
		expect(
			requirementOpenInputSchema.safeParse({
				...roleAndSoundDefaults,
				bgmPreferences: {
					mode: "smart_match",
					searchQuery: "bright lofi product demo",
					selectedCandidateId: "internet-archive:safe-lofi:safe-lofi.mp3",
				},
			}).success,
		).toBe(true);
		expect(
			requirementOpenInputSchema.safeParse({
				...roleAndSoundDefaults,
				bgmPreferences: {
					mode: "smart_match",
					searchQuery: "bright lofi product demo",
					selectedCandidateId: "internet-archive:safe-lofi:safe-lofi.mp3",
					limit: 10,
					commercialOnly: false,
				},
			}).success,
		).toBe(false);
		const customVoiceDefaults = {
			output: {
				voiceEnabled: true,
				voicePackId: "custom",
				customVoiceFile: {
					url: "blob:voice",
					path: "/tmp/voice.wav",
				},
			},
		};
		expect(openInputSchema.safeParse(customVoiceDefaults).success).toBe(false);
		expect(
			requirementOpenInputSchema.safeParse(customVoiceDefaults).success,
		).toBe(true);
		expect(
			requirementOpenInputSchema.safeParse({
				output: {
					voiceEnabled: true,
					voicePackId: "custom",
				},
			}).success,
		).toBe(false);
		expect(
			requirementOpenInputSchema.safeParse({
				output: {
					voicePackId: "custom",
				},
			}).success,
		).toBe(false);
		const voiceCloneDefaults = {
			output: {
				voiceEnabled: true,
				voicePackId: "voice_clone",
				voiceCloneSourceFile: {
					path: "/tmp/reference.wav",
				},
			},
		};
		expect(openInputSchema.safeParse(voiceCloneDefaults).success).toBe(false);
		expect(
			requirementOpenInputSchema.safeParse(voiceCloneDefaults).success,
		).toBe(true);
		expect(
			requirementOpenInputSchema.safeParse({
				output: {
					voiceEnabled: true,
					voicePackId: "voice_clone",
				},
			}).success,
		).toBe(false);
		expect(
			requirementOpenInputSchema.safeParse({
				output: {
					voicePackId: "voice_clone",
				},
			}).success,
		).toBe(false);
		expect(
			openTool.inputSchema.transitionPreference.safeParse("auto").success,
		).toBe(true);
		expect(
			openTool.inputSchema.durationContract.safeParse({
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
			}).success,
		).toBe(true);
		expect(
			submitTool.inputSchema.durationContract.safeParse({
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
			}).success,
		).toBe(false);
		for (const taskType of [
			"template_draft",
			"template_import",
			"template_apply_sample",
			"edit_execution",
		]) {
			expect(openTool.inputSchema.taskType.safeParse(taskType).success).toBe(
				true,
			);
			expect(submitTool.inputSchema.taskType.safeParse(taskType).success).toBe(
				true,
			);
		}
		expect(
			openTool.inputSchema.taskType.safeParse("three_video_template").success,
		).toBe(false);
		expect(
			submitTool?.inputSchema.transitionPreference.safeParse("dissolve")
				.success,
		).toBe(true);
			expect(
				submitTool?.inputSchema.transitionPreference.safeParse("spin").success,
			).toBe(false);
			expect(
				openTool.inputSchema.templatePreference.safeParse({
					mode: "create",
					draftTemplateName: "TikTok 解说模板草稿",
				}).success,
			).toBe(true);
			expect(
				submitTool.inputSchema.templatePreference.safeParse({
					mode: "specified",
					requestedTemplate: "TikTok 解说视频模板",
				}).success,
			).toBe(true);
			expect(openTool.description).toContain("uiLanguage");
			expect(openTool.description).toContain("mediaPaths");
			expect(openTool.description).toContain("directoryPaths");
		expect(openTool.description).toContain("web service");
		expect(openTool.description).toContain(
			"Use exactly one source input style",
		);
		expect(openTool.inputSchema.projectId).toBeUndefined();
		expect(openTool.meta).toMatchObject({
			ui: { resourceUri: serverModule.CODECUT_WORKSPACE_RESOURCE_URI },
			"openai/outputTemplate": serverModule.CODECUT_WORKSPACE_RESOURCE_URI,
		});
		expect(requirementOpenTool.meta).toBeUndefined();

		const html = await serverModule.readCodecutWorkspaceHtml();
		const widgetHtml = stripCodecutInjectedBridge(html);
		expect(html).toContain('id="codecutMcpAppsBundle"');
		expect(html).toContain('id="codecutMcpHostBridge"');
		expect(html).toContain("api.callServerTool");
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
			'class="media-sources media-sources-list"',
			'role="list"',
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
			'id="task-type"',
			'id="duration-goal-range"',
			"setDurationGoalSelection",
			"collectDurationGoal",
			'id="caption-language"',
			'id="caption-font"',
			'id="caption-size"',
			'id="caption-style-preset"',
			'id="transition-preference"',
			'id="requirement-options"',
			'id="requirements-label"',
			'aria-labelledby="requirements-label"',
			'id="generate-intro-cover"',
			'type="checkbox"',
			"introCoverRecommended",
			"collectIntroCoverChoice",
			'id="requirements"',
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
			"confirmedByUser: true",
			"openExternal",
			"renderEditorOpenError",
			"await openEditor(payload.editorUrl)",
			"catch (error)",
			"sendFollowUpMessage",
		]) {
			expect(html).toContain(marker);
		}
		expect(html).not.toContain(
			"\n        height: var(--cc-media-list-max-height);\n",
		);
		expect(html).toContain('row.setAttribute("role", "listitem")');
		expect(html).toContain('data-role="thumbnail"');
		expect(html).toContain('class="media-source-path"');
		expect(html).toContain('data-action="remove-source"');
		expect(html).toContain('class="media-source-remove-button"');
		expect(html).toContain(
			'aria-label="${escapeAttribute(t("removeMediaSource"))}"',
		);
		expect(html).toContain(
			'title="${escapeAttribute(t("removeMediaSource"))}"',
		);
		expect(html).toContain(">X</button>");
		expect(html).toContain(".media-source-remove-button {");
		expect(html).toContain("opacity: 0;");
		expect(html).toContain("pointer-events: none;");
		expect(html).toContain(
			".media-source-row:hover .media-source-remove-button,",
		);
		expect(html).toContain(
			".media-source-row:focus-within .media-source-remove-button",
		);
		expect(html).toContain("pointer-events: auto;");
		expect(html).toContain("color: var(--cc-danger);");
		expect(html).toContain("row.remove();");
		expect(html).not.toContain("fields.mediaSources.children.length > 1");
		for (const marker of [
			'data-i18n-placeholder="projectNamePlaceholder"',
			'data-i18n-placeholder="requirementsCustomPlaceholder"',
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
			'customButton.dataset.action = "toggle-custom"',
			'<select id="caption-language"',
			'<select id="caption-font"',
			'<select id="caption-size"',
			'<select id="caption-style-preset"',
			'<select id="voice-pack"',
			'<select id="transition-preference"',
				'<select id="template-preference-mode"',
				'<select id="requested-template"',
				'<input id="draft-template-name"',
			'value="zh-CN"',
			'value="en"',
			'value="auto"',
			'value="none"',
			'value="podcast-female"',
			'value="podcast-male"',
			'value="CodecutYanBoSong"',
			'value="CodecutWenKai"',
			'value="CodecutSmileySans"',
			'value="dissolve"',
			'value="slide-left"',
			'value="zoom-in"',
			'value="medium"',
			'value="large"',
			'value="small"',
			'value="creator-clean"',
			'value="short-form-bold"',
			'value="talking-head-pop"',
			'value="product-punch"',
			'value="minimal-reel"',
			"captionFont",
			"captionSize",
			"captionStylePreset",
			"voiceEnabled",
			"voicePack",
			"voicePackNone",
			"voicePackPodcastFemale",
			"voicePackPodcastMale",
			"transitionPreference",
			"transitionPreferenceAuto",
			"transitionPreferenceDissolve",
			"transitionPreferenceSlideLeft",
			"transitionPreferenceZoomIn",
				"templatePreference",
				"templatePreferenceAuto",
				"templatePreferenceSpecified",
				"templatePreferenceCreate",
				"requestedTemplate",
				"draftTemplateName",
				"captionFontAuto",
				"captionSizeMedium",
			"captionStyleCreatorClean",
			"captionStyleShortFormBold",
			"setSelectValue",
		]) {
			expect(html).toContain(marker);
		}
		expect(html).not.toContain('value="serif"');
		expect(html).not.toContain('value="handwriting"');
		expect(html).not.toContain('id="brief-options"');
		expect(html).not.toContain('id="success-criteria-options"');
		expect(html).not.toContain('id="brief"');
		expect(html).not.toContain('id="success-criteria"');
		expect(html).toContain('voiceEnabled: fields.voicePack.value !== "none"');
		expect(html).toContain("captionEnabled: true");
		expect(html).toContain("titlePreferences: currentTitlePreferences");
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
		expect(html).not.toContain(
			"querySelectorAll('input[type=\"checkbox\"]:checked')",
		);
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
		expect(widgetHtml).not.toContain("mimeType");
		expect(html).not.toContain('data-field="kind"');
		expect(html).not.toContain('data-field="url"');
		expect(widgetHtml).not.toContain('data-field="mimeType"');
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

	test("opens requirement confirmation without creating a project", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-req-mcp-"));
		const calls = [];
		try {
			const result = await serverModule.callCodecutWorkspaceTool(
				"open_codecut_requirement_confirmation",
				setupIntent({
					projectName: "22号解说口播保留原片时长",
					projectId: "22-abc123",
					output: {
						...setupIntent().output,
						voiceEnabled: true,
						voicePackId: "podcast-female",
					},
				}),
				{
					cwd: directory,
					env: {
						...process.env,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
					fetchImpl: async () => ({ ok: true, status: 200 }),
					bridgeToolImpl: async (toolName, args) => {
						calls.push({ toolName, args });
						throw new Error(`Unexpected bridge tool ${toolName}`);
					},
				},
			);

			expect(calls).toEqual([]);
			expect(result.structuredContent).toMatchObject({
				status: "awaiting_user_confirmation",
				nextAction: "open_requirement_confirmation_page",
			});
			expect(result.structuredContent.draftId).toMatch(/^ccreq_/);
			expect(result.structuredContent.confirmationUrl).toContain(
				"/en/requirements/",
			);
			expect(result.structuredContent.browserOpen).toEqual({
				url: result.structuredContent.confirmationUrl,
				target: "iab",
				method: "node_repl",
				humanActionRequired: true,
			});
			expect(result.content[0].text).toContain(
				"Use node_repl.js with setupBrowserRuntime",
			);
			expect(result.content[0].text).toContain("scripts/browser-client.mjs");
			expect(result.content[0].text).toContain('agent.browsers.get("iab")');
			expect(result.content[0].text).toContain(
				"Do not click confirm or cancel",
			);
			expect(result._meta).toBeUndefined();

			const draft = JSON.parse(
				await readFile(
					join(
						directory,
						".codecut-workspace",
						"requirements",
						result.structuredContent.draftId,
						"draft.json",
					),
					"utf8",
				),
			);
			expect(draft.requestedProjectName).toBe("22号解说口播保留原片时长");
			expect(draft.titlePreferences).toEqual({ enabled: false });
			expect(draft.captionPreferences.enabled).toBe(true);
			expect(draft.voicePreferences).toEqual({
				enabled: true,
				voicePackId: "podcast-female",
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("opens requirement confirmation with server-derived BGM candidates", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-req-bgm-"));
		const fetchedUrls = [];
		try {
			const result = await serverModule.callCodecutWorkspaceTool(
				"open_codecut_requirement_confirmation",
				setupIntent({
					projectName: "Smart BGM Requirement",
					bgmPreferences: {
						mode: "smart_match",
						searchQuery: "bright lofi product demo",
						selectedCandidateId: "internet-archive:safe-lofi:safe-lofi.mp3",
					},
				}),
				{
					cwd: directory,
					env: {
						...process.env,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
					fetchImpl: async (url) => {
						fetchedUrls.push(String(url));
						if (
							String(url).startsWith(
								"https://archive.org/advancedsearch.php",
							)
						) {
							return {
								ok: true,
								status: 200,
								json: async () => ({
									response: {
										numFound: 1,
										docs: [
											{
												identifier: "safe-lofi",
												title: "Safe Lofi Beat",
												creator: "Open Artist",
												licenseurl:
													"https://creativecommons.org/licenses/by/4.0/",
												downloads: 12,
											},
										],
									},
								}),
							};
						}
						if (String(url) === "https://archive.org/metadata/safe-lofi") {
							return {
								ok: true,
								status: 200,
								json: async () => ({
									metadata: {
										title: "Safe Lofi Beat",
										creator: "Open Artist",
										subject: "lofi; upbeat",
										licenseurl:
											"https://creativecommons.org/licenses/by/4.0/",
									},
									files: [
										{
											name: "safe-lofi.mp3",
											source: "original",
											format: "VBR MP3",
											size: "1234",
											length: "91.2",
										},
									],
								}),
							};
						}
						return { ok: true, status: 200 };
					},
				},
			);

			expect(result.structuredContent.status).toBe(
				"awaiting_user_confirmation",
			);
			expect(result.structuredContent.draft.bgmPreferences).toEqual(
				smartBgmPreferences(),
			);
			expect(
				fetchedUrls.some((url) =>
					url.startsWith("https://archive.org/advancedsearch.php"),
				),
			).toBe(true);
			expect(fetchedUrls).toContain("https://archive.org/metadata/safe-lofi");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("rejects forged BGM candidates when opening requirement confirmation", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-req-bgm-forge-"));
		try {
			const result = await serverModule.callCodecutWorkspaceTool(
				"open_codecut_requirement_confirmation",
				setupIntent({
					projectName: "Forged BGM Requirement",
					bgmPreferences: smartBgmPreferences({
						candidates: [
							bgmCandidate({
								title: "Tampered Commercial",
								licenseLabel: "CC0",
								fileSizeBytes: 1,
							}),
						],
						selectedCandidate: bgmCandidate({
							title: "Tampered Commercial",
							licenseLabel: "CC0",
							fileSizeBytes: 1,
						}),
					}),
				}),
				{
					cwd: directory,
					env: {
						...process.env,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
					fetchImpl: async () => ({ ok: true, status: 200 }),
				},
			);

			expect(result.isError).toBe(true);
			expect(result.structuredContent.status).toBe("invalid_setup_request");
			expect(result.structuredContent.error).toContain("Unrecognized");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("rejects BGM candidates with forged commercial license claims", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-req-bgm-license-"));
		try {
			const result = await serverModule.callCodecutWorkspaceTool(
				"submit_codecut_setup",
				setupIntent({
					confirmedByUser: true,
					pendingConfirmationId: "ccsetup_license",
					bgmPreferences: smartBgmPreferences({
						candidates: [
							bgmCandidate({
								licenseUrl:
									"https://creativecommons.org/licenses/by-nc/4.0/",
								commercialUseAllowed: true,
							}),
						],
						selectedCandidate: bgmCandidate({
							licenseUrl:
								"https://creativecommons.org/licenses/by-nc/4.0/",
							commercialUseAllowed: true,
						}),
					}),
				}),
				{
					cwd: directory,
					env: {
						...process.env,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
					fetchImpl: async () => ({ ok: true, status: 200 }),
				},
			);

			expect(result.isError).toBe(true);
			expect(JSON.stringify(result)).toContain(
				"BGM licenseUrl must allow commercial video use.",
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("opens requirement confirmation with external voice file defaults", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-req-voice-"));
		try {
			const custom = await serverModule.openCodecutRequirementConfirmation(
				{
					projectName: "Custom Voiceover",
					output: {
						voiceEnabled: true,
						voicePackId: "custom",
						customVoiceFile: {
							name: "voice.wav",
							path: "/tmp/voice.wav",
						},
					},
				},
				{
					root: directory,
					cwd: directory,
					env: {
						...process.env,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
				},
			);
			expect(custom.structuredContent.draft.voicePreferences).toEqual({
				enabled: true,
				voicePackId: "custom",
				customVoiceFile: {
					name: "voice.wav",
					path: "/tmp/voice.wav",
				},
			});

			const cloned = await serverModule.openCodecutRequirementConfirmation(
				{
					projectName: "Clone Voice",
					output: {
						voiceEnabled: true,
						voicePackId: "voice_clone",
						voiceCloneSourceFile: {
							path: "/tmp/reference.wav",
						},
					},
				},
				{
					root: directory,
					cwd: directory,
					env: {
						...process.env,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
				},
			);
			expect(cloned.structuredContent.draft.voicePreferences).toEqual({
				enabled: true,
				voicePackId: "voice_clone",
				voiceCloneSourceFile: {
					name: "reference.wav",
					path: "/tmp/reference.wav",
				},
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("stores requirement confirmations in one shared root across plugin checkouts", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-req-mcp-root-"));
		try {
			const home = join(directory, "home");
			const sourceRoot = join(directory, "source");
			const cacheRoot = join(
				directory,
				"cache",
				"local-opc",
				"codecut",
				"0.1.1",
			);
			await mkdir(join(sourceRoot, ".codex-plugin"), { recursive: true });
			await mkdir(join(cacheRoot, ".codex-plugin"), { recursive: true });
			await writeFile(
				join(sourceRoot, ".codex-plugin", "plugin.json"),
				'{"name":"codecut"}\n',
				"utf8",
			);
			await writeFile(
				join(cacheRoot, ".codex-plugin", "plugin.json"),
				'{"name":"codecut"}\n',
				"utf8",
			);
			const env = {
				HOME: home,
				CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
			};

			const opened = await serverModule.callCodecutWorkspaceTool(
				"open_codecut_requirement_confirmation",
				setupIntent({ projectId: "shared-root-001" }),
				{
					cwd: sourceRoot,
					env,
					fetchImpl: async () => ({ ok: true, status: 200 }),
				},
			);

			const draftId = opened.structuredContent.draftId;
			const sharedDraftPath = join(
				home,
				".codex",
				"codecut",
				".codecut-workspace",
				"requirements",
				draftId,
				"draft.json",
			);
			expect(existsSync(sharedDraftPath)).toBe(true);
			expect(
				existsSync(
					join(
						sourceRoot,
						".codecut-workspace",
						"requirements",
						draftId,
						"draft.json",
					),
				),
			).toBe(false);

			const readback = await serverModule.callCodecutWorkspaceTool(
				"get_codecut_requirement_confirmation",
				{ draftId },
				{
					cwd: cacheRoot,
					env,
					bridgeToolImpl: async (toolName) => {
						throw new Error(`Unexpected bridge tool ${toolName}`);
					},
				},
			);
			expect(readback.structuredContent).toMatchObject({
				status: "awaiting_user_confirmation",
				draftId,
			});
			const draft = JSON.parse(await readFile(sharedDraftPath, "utf8"));
			expect(draft.requestedProjectId).toBe("shared-root-001");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("normalizes requirement confirmation locale to supported web routes", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-req-mcp-"));
		try {
			const result = await serverModule.callCodecutWorkspaceTool(
				"open_codecut_requirement_confirmation",
				setupIntent({
					locale: "zh-CN",
					uiLanguage: "zh-CN",
				}),
				{
					cwd: directory,
					env: {
						...process.env,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
					fetchImpl: async () => ({ ok: true, status: 200 }),
				},
			);

			expect(result.structuredContent.confirmationUrl).toContain(
				"/zh/requirements/",
			);
			expect(result.structuredContent.confirmationUrl).not.toContain(
				"/zh-CN/requirements/",
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("reads pending requirement confirmation without bridge side effects", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-req-mcp-"));
		try {
			const opened = await serverModule.callCodecutWorkspaceTool(
				"open_codecut_requirement_confirmation",
				setupIntent(),
				{
					cwd: directory,
					env: {
						...process.env,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
					fetchImpl: async () => ({ ok: true, status: 200 }),
				},
			);

			const readback = await serverModule.callCodecutWorkspaceTool(
				"get_codecut_requirement_confirmation",
				{ draftId: opened.structuredContent.draftId },
				{
					cwd: directory,
					bridgeToolImpl: async (toolName) => {
						throw new Error(`Unexpected bridge tool ${toolName}`);
					},
				},
			);

			expect(readback.structuredContent).toMatchObject({
				status: "awaiting_user_confirmation",
				draftId: opened.structuredContent.draftId,
				nextAction: "wait_for_user_confirmation",
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("blocks project creation while requirement is pending", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-req-mcp-"));
		const calls = [];
		try {
			const opened = await serverModule.callCodecutWorkspaceTool(
				"open_codecut_requirement_confirmation",
				setupIntent(),
				{
					cwd: directory,
					env: {
						...process.env,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
					fetchImpl: async () => ({ ok: true, status: 200 }),
				},
			);

			const result = await serverModule.callCodecutWorkspaceTool(
				"create_codecut_project_from_requirement",
				{ draftId: opened.structuredContent.draftId },
				{
					cwd: directory,
					env: {
						...process.env,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
					fetchImpl: async () => ({ ok: true, status: 200 }),
					bridgeToolImpl: async (toolName, args) => {
						calls.push({ toolName, args });
						throw new Error(`Unexpected bridge tool ${toolName}`);
					},
				},
			);

			expect(calls).toEqual([]);
			expect(result.structuredContent).toMatchObject({
				status: "confirmation_required",
				nextAction: "wait_for_user_confirmation",
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("creates a project from a confirmed requirement", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-req-mcp-"));
		const filePath = join(directory, "source.mp4");
		await writeFile(filePath, "video");
		const calls = [];
		const bridgeToolImpl = async (toolName, args) => {
			calls.push({ toolName, args });
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
					structuredContent: {
						status: "completed",
						results: [
							{
								success: true,
								data: {
									assets: [{ id: "media-1", name: "source.mp4" }],
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
			const opened = await serverModule.callCodecutWorkspaceTool(
				"open_codecut_requirement_confirmation",
				setupIntent({
					projectId: "launch-cut-001",
					projectName: "Launch Cut",
					mediaSources: [{ kind: "filePath", filePath }],
					output: {
						...setupIntent().output,
						voiceEnabled: true,
						voicePackId: "podcast-male",
					},
				}),
				{
					cwd: directory,
					env: {
						...process.env,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
					fetchImpl: async () => ({ ok: true, status: 200 }),
				},
			);
			const draft = opened.structuredContent.draft;
			await writeFile(
				join(
					directory,
					".codecut-workspace",
					"requirements",
					draft.draftId,
					"confirmed.json",
				),
				`${JSON.stringify(
					{
						version: 1,
						draftId: draft.draftId,
						status: "confirmed",
						confirmedAt: "2026-07-01T00:00:00.000Z",
						source: "codecut_requirement_confirmation",
						confirmedBy: "local_web_page",
						confirmedSetup: {
							version: 1,
							taskType: draft.taskType,
							confirmedAt: "2026-07-01T00:00:00.000Z",
							source: "codecut_setup_confirmation",
							timelinePreferences: draft.timelinePreferences,
							captionPreferences: draft.captionPreferences,
							voicePreferences: draft.voicePreferences,
							characterPreferences: draft.characterPreferences,
							bgmPreferences: draft.bgmPreferences,
							templatePreference: draft.templatePreference,
							exportPreferences: draft.exportPreferences,
							changes: [],
						},
					},
					null,
					2,
				)}\n`,
				"utf8",
			);

			const result = await serverModule.callCodecutWorkspaceTool(
				"create_codecut_project_from_requirement",
				{ draftId: draft.draftId },
				{
					cwd: directory,
					env: {
						...process.env,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
						CODECUT_CONFIRMATION_ROOT: directory,
					},
					fetchImpl: async () => ({ ok: true, status: 200 }),
					bridgeToolImpl,
				},
			);

			expect(calls.map((call) => call.toolName)).toEqual([
				"create_project",
				"import_media",
				"get_project_info",
			]);
			expect(calls[0].args.confirmedSetup.voicePreferences).toEqual({
				enabled: true,
				voicePackId: "podcast-male",
			});
			expect(result.structuredContent).toMatchObject({
				status: "created",
				projectId: "launch-cut-001",
				importedMedia: [{ id: "media-1", name: "source.mp4" }],
			});
			expect(result.structuredContent.confirmationToken).toMatch(
				/^ccconfirmed_/,
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("lists built-in voice packs with executable RunningHub clone paths", async () => {
		const result = await serverModule.callCodecutWorkspaceTool(
			"list_codecut_builtin_voice_packs",
			{},
		);

		expect(result.structuredContent).toMatchObject({
			status: "ready",
			defaultVoicePackId: "podcast-female",
		});
		const podcastFemale = result.structuredContent.voicePacks.find(
			(voice) => voice.id === "podcast-female",
		);
		const podcastFemaleAudioPath = podcastFemale.audioPath;
		expect(podcastFemale).toMatchObject({
			id: "podcast-female",
			name: "女声",
			provider: "runninghub-voice-clone",
			executableTool: "generate_runninghub_voice_clone",
		});
		expect(slashPath(podcastFemaleAudioPath)).toContain(
			"apps/web/public/voices/podcast-female.mp3",
		);
		expect(isAbsolute(podcastFemaleAudioPath)).toBe(true);
		expect(existsSync(podcastFemaleAudioPath)).toBe(true);
		expect(result.content[0].text).toContain("女声");
		expect(result.content[0].text).toContain("generate_runninghub_voice_clone");
	});

	test("serves the workspace widget at the legacy resource URI", async () => {
		const transport = new StdioClientTransport({
			command: "node",
			args: ["mcp/server.mjs"],
			cwd: process.cwd(),
			stderr: "pipe",
		});
		const client = new Client({
			name: "codecut-legacy-workspace-resource-test",
			version: "1.0.0",
		});

		await client.connect(transport);
		try {
			const result = await client.readResource({
				uri: serverModule.CODECUT_WORKSPACE_LEGACY_RESOURCE_URI,
			});

			expect(result.contents?.[0]?.uri).toBe(
				serverModule.CODECUT_WORKSPACE_LEGACY_RESOURCE_URI,
			);
			expect(result.contents?.[0]?.mimeType).toBe("text/html;profile=mcp-app");
			expect(result.contents?.[0]?.text).toContain("WORKSPACE_I18N");
		} finally {
			await client.close();
		}
	});

	test("exposes read-only template query schemas", () => {
		const listTool = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "list_templates",
		);
		const getTool = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "get_template",
		);
		const resolveTool = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "resolve_template",
		);
		const checkImportTool = CODECUT_MCP_TOOLS.find(
			(candidate) => candidate.name === "check_template_import",
		);

		expect(listTool?.description).toContain("List");
		expect(listTool?.readOnly).toBe(true);
		expect(
			getTool?.inputSchema.templateId.safeParse("proof-demo-cut").success,
		).toBe(true);
		expect(
			resolveTool?.inputSchema.requestedTemplate.safeParse("proof demo")
				.success,
		).toBe(true);
		expect(
			resolveTool?.inputSchema.triggerType.safeParse("product-proof-ad")
				.success,
		).toBe(true);
		expect(resolveTool?.inputSchema.userIntent.safeParse("tiktok explainer").success).toBe(
			true,
		);
		expect(resolveTool?.inputSchema.platformHint.safeParse("TikTok").success).toBe(
			true,
		);
		expect(resolveTool?.inputSchema.hasTranscript.safeParse(true).success).toBe(
			true,
		);
		expect(resolveTool?.inputSchema.hasVisualProof.safeParse(true).success).toBe(
			true,
		);
		expect(resolveTool?.inputSchema.hasProductFacts.safeParse(false).success).toBe(
			true,
		);
		expect(
			resolveTool?.inputSchema.hasExistingNarrationAudio.safeParse(false)
				.success,
		).toBe(true);
		expect(resolveTool?.inputSchema.hasVisualBroll.safeParse(false).success).toBe(
			true,
		);
		expect(
			checkImportTool?.inputSchema.templateJsonFile.safeParse(
				"/tmp/template.json",
			).success,
		).toBe(true);
	});

	test("serves the workspace widget for stale hashed resource URIs", async () => {
		const staleResourceUri =
			serverModule.CODECUT_WORKSPACE_LEGACY_RESOURCE_URI.replace(
				"/workspace.html",
				"/workspace-c5b8fafcecb0.html",
			);
		const transport = new StdioClientTransport({
			command: "node",
			args: ["mcp/server.mjs"],
			cwd: process.cwd(),
			stderr: "pipe",
		});
		const client = new Client({
			name: "codecut-stale-workspace-resource-test",
			version: "1.0.0",
		});

		await client.connect(transport);
		try {
			const result = await client.readResource({
				uri: staleResourceUri,
			});

			expect(result.contents?.[0]?.uri).toBe(staleResourceUri);
			expect(result.contents?.[0]?.mimeType).toBe("text/html;profile=mcp-app");
			expect(result.contents?.[0]?.text).toContain("WORKSPACE_I18N");
		} finally {
			await client.close();
		}
	});

	test("workspace media source list keeps only a maximum-height scroll constraint", async () => {
		const html = await readFile("mcp/codecut-workspace.html", "utf8");
		const mediaSourceDeclarations = readStyleDeclarations(
			html,
			".media-sources",
		);

		expect(mediaSourceDeclarations.get("display")).toBe("grid");
		expect(mediaSourceDeclarations.get("gap")).toBe("var(--cc-space-sm)");
		expect(mediaSourceDeclarations.has("height")).toBe(false);
		expect(mediaSourceDeclarations.has("min-height")).toBe(false);
		expect(mediaSourceDeclarations.has("block-size")).toBe(false);
		expect(mediaSourceDeclarations.has("min-block-size")).toBe(false);
		expect(mediaSourceDeclarations.get("max-height")).toBe(
			"var(--cc-media-list-max-height)",
		);
		expect(mediaSourceDeclarations.get("overflow-y")).toBe("auto");
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
			verifyCommand: "curl -fsS -o /dev/null http://127.0.0.1:4100/en/projects",
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
		const isolatedCwd = await mkdtemp(join(tmpdir(), "codecut-no-bridge-url-"));
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

	test("blocks workspace widget rendering when preserve-source setup lacks source duration", async () => {
		const result = await serverModule.callCodecutWorkspaceTool(
			"open_codecut_workspace",
			{
				projectName: "Original Duration Voiceover",
				durationContract: {
					totalDurationMode: "preserve_source",
					sourceCoverageMode: "full_source",
				},
			},
			{
				env: {
					CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
				},
				fetchImpl: async () => ({ ok: true, status: 200 }),
			},
		);

		expect(result.isError).toBe(true);
		expect(result.structuredContent).toMatchObject({
			status: "invalid_setup_request",
			nextAction: "retry_open_codecut_workspace",
			error:
				"durationContract.sourceDurationSeconds is required for preserve_source or full_source.",
		});
		expect(result.structuredContent).not.toHaveProperty(
			"pendingConfirmationId",
		);
		expect(result._meta).toBeUndefined();
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
		expect(html).toContain("function pendingConfirmationIdFromPayload");
		expect(html).toContain("payload.structuredContent?.pendingConfirmationId");
		expect(html).toContain("pendingConfirmationIdFromPayload(api.toolOutput)");
		expect(html).toContain(
			"pendingConfirmationId: currentPendingConfirmationId",
		);
	});

	test("requirement confirmation uses the real web page instead of an inline MCP opener", async () => {
		const source = await readFile(
			new URL("./server.mjs", import.meta.url),
			"utf8",
		);

		expect(source).not.toContain(
			"CODECUT_REQUIREMENT_CONFIRMATION_RESOURCE_URI",
		);
		expect(source).not.toContain("readCodecutRequirementConfirmationHtml");
		expect(source).not.toContain(
			"registerCodecutRequirementConfirmationResource",
		);
		expect(
			existsSync(
				new URL("./codecut-requirement-confirmation.html", import.meta.url),
			),
		).toBe(false);
	});

	test("workspace host bridge preserves native follow-up confirmation when available", async () => {
		const html = await serverModule.readCodecutWorkspaceHtml();
		const bridgeScript = extractScriptContentById(html, "codecutMcpHostBridge");
		const nativeSendFollowUpMessage = () => ({ status: "native" });
		const context = {
			Error,
			Promise,
			clearTimeout,
			setTimeout,
			window: {
				openai: {
					sendFollowUpMessage: nativeSendFollowUpMessage,
				},
			},
		};
		context.globalThis = context;
		context.__CODECUT_MCP_APPS__ = {
			App: class {
				connect() {
					return Promise.resolve();
				}
				sendMessage() {
					throw new Error(
						"Fallback sendMessage should not replace native follow-up.",
					);
				}
			},
		};

		runInNewContext(bridgeScript, context);

		expect(context.window.openai.sendFollowUpMessage).toBe(
			nativeSendFollowUpMessage,
		);
	});

	test("workspace host bridge preserves native server tool proxy when available", async () => {
		const html = await serverModule.readCodecutWorkspaceHtml();
		const bridgeScript = extractScriptContentById(html, "codecutMcpHostBridge");
		const nativeCallServerTool = () => ({ status: "native" });
		const context = {
			Error,
			Promise,
			clearTimeout,
			setTimeout,
			window: {
				openai: {
					callServerTool: nativeCallServerTool,
				},
			},
		};
		context.globalThis = context;
		context.__CODECUT_MCP_APPS__ = {
			App: class {
				connect() {
					return Promise.resolve();
				}
				callServerTool() {
					throw new Error(
						"Fallback callServerTool should not replace native proxy.",
					);
				}
			},
		};

		runInNewContext(bridgeScript, context);

		expect(context.window.openai.callServerTool).toBe(nativeCallServerTool);
	});

	test("workspace host bridge installs follow-up fallback only when native confirmation is missing", async () => {
		const html = await serverModule.readCodecutWorkspaceHtml();
		const bridgeScript = extractScriptContentById(html, "codecutMcpHostBridge");
		const sentMessages = [];
		const context = {
			Error,
			Promise,
			clearTimeout,
			setTimeout,
			window: {
				openai: {},
			},
		};
		context.globalThis = context;
		context.__CODECUT_MCP_APPS__ = {
			App: class {
				connect() {
					return Promise.resolve();
				}
				sendMessage(message) {
					sentMessages.push(message);
					return Promise.resolve({ status: "fallback" });
				}
			},
		};

		runInNewContext(bridgeScript, context);
		await context.window.openai.sendFollowUpMessage({
			role: "user",
			content: [{ type: "text", text: "Continue now." }],
		});

		expect(sentMessages).toEqual([
			{
				role: "user",
				content: [{ type: "text", text: "Continue now." }],
			},
		]);
	});

	test("workspace host bridge preserves native external opener when available", async () => {
		const html = await serverModule.readCodecutWorkspaceHtml();
		const bridgeScript = extractScriptContentById(html, "codecutMcpHostBridge");
		const nativeOpenExternal = () => ({ status: "native" });
		const context = {
			Error,
			Promise,
			clearTimeout,
			setTimeout,
			window: {
				openai: {
					openExternal: nativeOpenExternal,
				},
			},
		};
		context.globalThis = context;
		context.__CODECUT_MCP_APPS__ = {
			App: class {
				connect() {
					return Promise.resolve();
				}
				openLink() {
					throw new Error(
						"Fallback openExternal should not replace native opener.",
					);
				}
			},
		};

		runInNewContext(bridgeScript, context);

		expect(context.window.openai.openExternal).toBe(nativeOpenExternal);
	});

	test("workspace widget blocks the setup form without a pending confirmation id", async () => {
		const html = await serverModule.readCodecutWorkspaceHtml();

		expect(html).toContain('id="setup-unavailable"');
		expect(html).toContain("setupUnavailable");
		expect(html).toContain("if (!currentPendingConfirmationId)");
		expect(html).toContain('fields.form.classList.add("hidden")');
		expect(html).toContain(
			'fields.setupUnavailable.classList.remove("hidden")',
		);
	});

	test("workspace widget selects recommended requirement options only by default", async () => {
		const html = await serverModule.readCodecutWorkspaceHtml();
		const compactHtml = html.replace(/\s+/g, " ");

		expect(compactHtml).toContain(
			'renderChoiceOptions(fields.requirementOptions, defaults.requirementOptions || [defaults.requirements || t("requirementsPlaceholder")], defaults.recommendedRequirementOptions || [], fields.requirements)',
		);
		expect(html).toContain(
			'button.className = isRecommendedChoice ? "choice-option is-active" : "choice-option"',
		);
		expect(html).toContain(
			'button.setAttribute("aria-pressed", isRecommendedChoice ? "true" : "false")',
		);
		expect(html).toContain("appendCustomChoiceOption(container, customField)");
		expect(html).toContain(
			"container.querySelectorAll(\".choice-option[aria-pressed='true']\")",
		);
		expect(html).not.toContain('button.className = "choice-option is-active";');
		expect(html).not.toContain('button.setAttribute("aria-pressed", "true");');
		expect(html).not.toContain('customButton.setAttribute("aria-pressed"');
		expect(html).not.toContain("customButton.dataset.choiceOption");
		expect(html).not.toContain(
			"fields.requirementsCustomToggle.addEventListener",
		);
		expect(html).not.toContain("optionKey.includes(recommendedKey)");
		expect(html).not.toContain("recommendedKey.includes(optionKey)");
	});

	test("workspace widget choice logic selects exact recommended requirements", async () => {
		const html = await serverModule.readCodecutWorkspaceHtml();
		const result = evaluateWorkspaceRecommendedChoices(html, {
			options: [
				"新增字幕避开已有标题",
				"新增字幕避开已有标题和字幕区域",
				"不能重叠",
				"语气自然",
			],
			recommendedValues: ["新增字幕避开已有标题和字幕区域"],
		});

		expect(result).toEqual(["新增字幕避开已有标题和字幕区域"]);
	});

	test("workspace widget formats object errors without object placeholders", async () => {
		const html = await serverModule.readCodecutWorkspaceHtml();
		const result = evaluateWorkspaceErrorMessage(html, {
			value: {
				code: "confirmation_required",
				message:
					"pendingConfirmationId from open_codecut_workspace is required before setup submission.",
			},
			fallback: "CodeCut setup failed.",
		});

		expect(result).toBe(
			"pendingConfirmationId from open_codecut_workspace is required before setup submission.",
		);
		expect(result).not.toContain("[object Object]");
	});

	test("workspace widget choice logic leaves options unselected without explicit recommendations", async () => {
		const html = await serverModule.readCodecutWorkspaceHtml();
		const workspace = serverModule.openCodecutWorkspace({
			locale: "zh-CN",
			requirements: "新增字幕避开已有标题和字幕区域",
			requirementOptions: [
				"新增字幕避开已有标题和字幕区域",
				"新增字幕避开已有标题",
			],
		});

		const result = evaluateWorkspaceRecommendedChoices(html, {
			options: workspace.structuredContent.intentDefaults.requirementOptions,
			recommendedValues:
				workspace.structuredContent.intentDefaults
					.recommendedRequirementOptions || [],
		});

		expect(result).toEqual([]);
	});

	test("workspace defaults select fallback requirement options when only requirements are provided", async () => {
		const html = await serverModule.readCodecutWorkspaceHtml();
		const workspace = serverModule.openCodecutWorkspace({
			locale: "zh-CN",
			projectName: "验证资源别名二次",
			requirements:
				"只验证 setup 小窗能加载，不创建项目，不导入素材，不运行 shell，不写文件。",
		});
		const defaults = workspace.structuredContent.intentDefaults;

		const result = evaluateWorkspaceRecommendedChoices(html, {
			options: defaults.requirementOptions,
			recommendedValues: defaults.recommendedRequirementOptions || [],
		});

		expect(result).toEqual(defaults.requirementOptions);
	});

	test("opens the workspace with structured defaults and widget metadata", () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "Creator Launch",
			requirements:
				"Make a concise vertical launch cut.\nHook appears before 3s.",
			requirementOptions: [
				"Keep the launch hook",
				"Remove repeated setup",
				"Hook appears before 3s",
				"Captions remain readable",
			],
			recommendedRequirementOptions: [
				"Keep the launch hook",
				"Hook appears before 3s",
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
			requirements:
				"Make a concise vertical launch cut.\nHook appears before 3s.",
			requirementOptions: [
				"Keep the launch hook",
				"Remove repeated setup",
				"Hook appears before 3s",
				"Captions remain readable",
			],
			recommendedRequirementOptions: [
				"Keep the launch hook",
				"Hook appears before 3s",
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
			transitionPreference: "auto",
			templatePreference: { mode: "auto" },
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
		expect(result.content[0].text).toContain(
			"Do not call submit_codecut_setup until the user explicitly confirms",
		);
		expect(result.content[0].text).toContain("confirmedByUser true");
		expect(result._meta).toMatchObject({
			ui: { resourceUri: serverModule.CODECUT_WORKSPACE_RESOURCE_URI },
			"openai/outputTemplate": serverModule.CODECUT_WORKSPACE_RESOURCE_URI,
		});
	});

	test("defaults transition preference only when opening the workspace", async () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "Creator Launch",
		});
		expect(result.structuredContent.intentDefaults.transitionPreference).toBe(
			"auto",
		);
		expect(result._meta.widgetData.intentDefaults.transitionPreference).toBe(
			"auto",
		);

		const confirmedIntent = setupIntent();
		delete confirmedIntent.transitionPreference;
		const inspection = await serverModule.inspectCodecutSetup(confirmedIntent);
		expect(inspection.status).toBe("blocked");
		expect(inspection.checks).toContainEqual({
			id: "transition-preference",
			label: "Transition animation",
			ok: false,
			detail:
				"Transition animation must be auto, none, or a supported CodeCut transition type.",
		});
	});

	test("carries template preference through workspace setup", async () => {
			const opened = serverModule.openCodecutWorkspace({
				projectName: "Creator Launch",
				templatePreference: {
					mode: "specified",
					requestedTemplate: "product-proof-ad",
				},
			});
			expect(opened.structuredContent.intentDefaults.templatePreference).toEqual({
				mode: "specified",
				requestedTemplate: "product-proof-ad",
			});
			expect(opened._meta.widgetData.intentDefaults.templatePreference).toEqual({
				mode: "specified",
				requestedTemplate: "product-proof-ad",
			});

		const ready = await serverModule.inspectCodecutSetup(
			setupIntent({
					templatePreference: {
						mode: "specified",
						requestedTemplate: "product-proof-ad",
					},
				}),
			);
			expect(ready.status).toBe("ready");
			expect(ready.intent.templatePreference).toEqual({
				mode: "specified",
				requestedTemplate: "product-proof-ad",
			});

		const userTemplateReady = await serverModule.inspectCodecutSetup(
			setupIntent({
				templatePreference: {
					mode: "specified",
					requestedTemplate: "tiktok-viral-breakdown-voiceover",
				},
			}),
		);
		expect(userTemplateReady.status).toBe("ready");
		expect(userTemplateReady.intent.templatePreference).toEqual({
			mode: "specified",
			requestedTemplate: "tiktok-viral-breakdown-voiceover",
		});

		const blocked = await serverModule.inspectCodecutSetup(
			setupIntent({
				templatePreference: {
					mode: "specified",
					requestedTemplate: "",
				},
			}),
		);
		expect(blocked.status).toBe("blocked");
			expect(blocked.checks).toContainEqual({
				id: "template-preference",
				label: "Template preference",
				ok: false,
				detail:
					"Template preference must be auto, specified with a non-empty requestedTemplate, or create with draftTemplateName.",
			});

			const createReady = await serverModule.inspectCodecutSetup(
				setupIntent({
					templatePreference: {
						mode: "create",
						draftTemplateName: "TikTok 解说模板草稿",
					},
				}),
			);
			expect(createReady.status).toBe("ready");
			expect(createReady.intent.templatePreference).toEqual({
				mode: "create",
				draftTemplateName: "TikTok 解说模板草稿",
			});
		});

	test("carries network material matching through workspace setup", async () => {
		const networkMaterialMatching = {
			enabled: true,
			placement: "top",
			providers: ["pexels", "pixabay", "coverr"],
			resolvedTemplateId: "talking-head-broll-split",
			decisionSource: "template",
		};
		const opened = serverModule.openCodecutWorkspace({
			projectName: "Creator Launch",
			networkMaterialMatching,
		});
		expect(
			opened.structuredContent.intentDefaults.networkMaterialMatching,
		).toEqual(networkMaterialMatching);
		expect(
			opened._meta.widgetData.intentDefaults.networkMaterialMatching,
		).toEqual(networkMaterialMatching);

		const ready = await serverModule.inspectCodecutSetup(
			setupIntent({ networkMaterialMatching }),
		);
		expect(ready.status).toBe("ready");
		expect(ready.intent.networkMaterialMatching).toEqual(
			networkMaterialMatching,
		);

		const blocked = await serverModule.inspectCodecutSetup(
			setupIntent({
				networkMaterialMatching: {
					...networkMaterialMatching,
					providers: [],
				},
			}),
		);
		expect(blocked.status).toBe("blocked");
		expect(blocked.checks).toContainEqual({
			id: "network-material-matching",
			label: "Network material matching",
			ok: false,
			detail:
				"Network material matching requires enabled, placement, providers, resolvedTemplateId, and decisionSource.",
		});
	});

	test("uses template policy defaults for talking head split b-roll", () => {
		const opened = serverModule.openCodecutWorkspace({
			projectName: "口播分屏素材",
			requirements: "出镜人在下方，网络素材在上方配合口播内容。",
		});
		expect(
			opened.structuredContent.intentDefaults.networkMaterialMatching,
		).toEqual({
			enabled: true,
			placement: "top",
			providers: ["pexels", "pixabay", "coverr"],
			resolvedTemplateId: "talking-head-broll-split",
			decisionSource: "template",
		});
	});

	test("defaults task type from the user request without treating template ids as intent", () => {
		const templateDraft = serverModule.openCodecutWorkspace({
			projectName: "口播剪辑模板",
			requirements: "创建模板，提炼文案结构模板，不要直接剪辑。",
		});
		expect(templateDraft.structuredContent.intentDefaults.taskType).toBe(
			"template_draft",
		);

		const plainEdit = serverModule.openCodecutWorkspace({
			projectName: "Three Video Cut",
			requirements: "Use three_video_template assets for a normal edit.",
		});
		expect(plainEdit.structuredContent.intentDefaults.taskType).toBe(
			"edit_execution",
		);
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
			requirements:
				"剪成节奏清晰的短视频；开头有明确信息点；主体节奏紧凑；字幕清晰可读；自然音频；结尾适合继续编辑或导出。",
			requirementOptions: [
				"剪成节奏清晰",
				"保留核心信息",
				"开头有明确信息点",
				"主体节奏紧凑",
				"字幕清晰可读",
				"自然音频",
				"结尾适合继续编辑或导出",
			],
			recommendedRequirementOptions: [
				"剪成节奏清晰",
				"保留核心信息",
				"开头有明确信息点",
				"主体节奏紧凑",
				"字幕清晰可读",
				"自然音频",
				"结尾适合继续编辑或导出",
			],
			captionLanguage: "auto",
			transitionPreference: "auto",
			generateIntroCover: true,
			output: {
				format: "mp4",
				quality: "high",
				includeAudio: true,
				captionFont: "auto",
				captionSize: "medium",
				captionStylePreset: "creator-clean",
			},
		});
	});

	test("opens the workspace with Codex-generated requirement options and selected recommendations", () => {
		const result = serverModule.openCodecutWorkspace({
			locale: "zh-CN",
			requirements:
				"保留片头和片尾源视频原音\n配音要四川话，中年女性，语速较快\n新增字幕避开已有标题和字幕区域",
			requirementOptions: [
				"保留片头和片尾源视频原音",
				"不用新配音覆盖片头片尾",
				"中段使用四川话口气的房地产卖点口播",
				"语气自然",
				"销售转化导向",
				"新增字幕避开已有标题和字幕区域",
				"不能重叠",
				"时间线 readback 能看到片头",
				"片尾三段结构",
			],
			recommendedRequirementOptions: [
				"保留片头和片尾源视频原音",
				"不用新配音覆盖片头片尾",
				"中段使用四川话口气的房地产卖点口播",
				"新增字幕避开已有标题和字幕区域",
				"不能重叠",
			],
		});

		expect(result.structuredContent.intentDefaults).toMatchObject({
			requirements:
				"保留片头和片尾源视频原音\n配音要四川话，中年女性，语速较快\n新增字幕避开已有标题和字幕区域",
			requirementOptions: [
				"保留片头和片尾源视频原音",
				"不用新配音覆盖片头片尾",
				"中段使用四川话口气的房地产卖点口播",
				"语气自然",
				"销售转化导向",
				"新增字幕避开已有标题和字幕区域",
				"不能重叠",
				"时间线 readback 能看到片头",
				"片尾三段结构",
			],
			recommendedRequirementOptions: [
				"保留片头和片尾源视频原音",
				"不用新配音覆盖片头片尾",
				"中段使用四川话口气的房地产卖点口播",
				"新增字幕避开已有标题和字幕区域",
				"不能重叠",
			],
		});
	});

	test("opens the workspace with caption output preferences", () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "Caption Controls",
			output: {
				captionFont: "CodecutYanBoSong",
				captionSize: "large",
				captionStylePreset: "product-punch",
			},
		});

		expect(result.structuredContent.intentDefaults.output).toMatchObject({
			format: "mp4",
			quality: "high",
			includeAudio: true,
			captionFont: "CodecutYanBoSong",
			captionSize: "large",
			captionStylePreset: "product-punch",
		});
		expect(result._meta.widgetData.intentDefaults.output).toMatchObject({
			captionFont: "CodecutYanBoSong",
			captionSize: "large",
			captionStylePreset: "product-punch",
		});
	});

	test("opens the workspace with built-in voice selection defaulting to no voice", () => {
		const defaults = serverModule.openCodecutWorkspace({
			projectName: "Voice Controls",
		});
		expect(defaults.structuredContent.intentDefaults.output.voiceEnabled).toBe(
			false,
		);
		expect(defaults.structuredContent.intentDefaults.output.voicePackId).toBe(
			"none",
		);
		expect(defaults._meta.widgetData.intentDefaults.output.voiceEnabled).toBe(
			false,
		);
		expect(defaults._meta.widgetData.intentDefaults.output.voicePackId).toBe(
			"none",
		);

		const selected = serverModule.openCodecutWorkspace({
			projectName: "Voice Controls",
			output: {
				voiceEnabled: true,
				voicePackId: "podcast-male",
			},
		});
		expect(selected.structuredContent.intentDefaults.output).toMatchObject({
			voiceEnabled: true,
			voicePackId: "podcast-male",
		});
		expect(selected._meta.widgetData.intentDefaults.output).toMatchObject({
			voiceEnabled: true,
			voicePackId: "podcast-male",
		});

		expect(() =>
			serverModule.openCodecutWorkspace({
				projectName: "Voice Controls",
				output: {
					voiceEnabled: true,
					voicePackId: "custom",
				},
			}),
		).toThrow("voicePackId must be none, podcast-female, or podcast-male.");
		expect(() =>
			serverModule.openCodecutWorkspace({
				projectName: "Voice Controls",
				output: {
					voicePackId: "podcast-male",
					customVoiceFile: {
						name: "voice.wav",
						url: "blob:voice",
					},
				},
			}),
		).toThrow(
			"customVoiceFile is not supported by CodeCut workspace setup.",
		);
	});

	test("opens the workspace with character and BGM defaults", () => {
		const defaults = serverModule.openCodecutWorkspace({
			projectName: "Role And Sound Controls",
		});
		expect(defaults.structuredContent.intentDefaults).toMatchObject({
			characterPreferences: { characterId: "none" },
			bgmPreferences: { mode: "none" },
		});
		expect(defaults._meta.widgetData.intentDefaults).toMatchObject({
			characterPreferences: { characterId: "none" },
			bgmPreferences: { mode: "none" },
		});

		const selected = serverModule.openCodecutWorkspace({
			projectName: "Role And Sound Controls",
			characterPreferences: { characterId: "ugc-female-host" },
			bgmPreferences: smartBgmPreferences(),
		});
		expect(selected.structuredContent.intentDefaults).toMatchObject({
			characterPreferences: { characterId: "ugc-female-host" },
			bgmPreferences: smartBgmPreferences(),
		});
		expect(selected._meta.widgetData.intentDefaults).toMatchObject({
			characterPreferences: { characterId: "ugc-female-host" },
			bgmPreferences: smartBgmPreferences(),
		});
	});

	test("opens the workspace with title and caption enablement defaults", () => {
		const defaults = serverModule.openCodecutWorkspace({
			projectName: "Grouped Controls",
		});
		expect(defaults.structuredContent.intentDefaults).toMatchObject({
			titlePreferences: { enabled: false },
			output: { captionEnabled: true },
		});
		expect(defaults._meta.widgetData.intentDefaults).toMatchObject({
			titlePreferences: { enabled: false },
			output: { captionEnabled: true },
		});

		const selected = serverModule.openCodecutWorkspace({
			projectName: "Grouped Controls",
			titlePreferences: {
				enabled: true,
				mode: "custom",
				text: "固定标题",
				stylePreset: "hook_title",
			},
			output: {
				captionEnabled: false,
			},
		});
		expect(selected.structuredContent.intentDefaults).toMatchObject({
			titlePreferences: {
				enabled: true,
				mode: "custom",
				text: "固定标题",
				stylePreset: "hook_title",
			},
			output: { captionEnabled: false },
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

	test("disables intro cover by default for full-source duration preservation", () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "Preserve Source Cut",
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
			},
		});

		expect(result.structuredContent.intentDefaults).toMatchObject({
			projectName: "Preserve Source Cut",
			generateIntroCover: false,
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
			},
		});
		expect(result._meta.widgetData.intentDefaults).toMatchObject({
			generateIntroCover: false,
		});
	});

	test("rejects explicit intro cover for full-source preservation", () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "Preserve Source With Cover",
			generateIntroCover: true,
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
			},
		});

		expect(result).toMatchObject({
			isError: true,
			structuredContent: {
				status: "invalid_setup_request",
				nextAction: "retry_open_codecut_workspace",
				error:
					"Timeline intro cover cannot be enabled when preserving the full source duration and full source coverage. Use a fixed title or project cover instead.",
			},
		});
	});

	test("opens the workspace with a manual transition animation preference", () => {
		const result = serverModule.openCodecutWorkspace({
			projectName: "Transition Cut",
			transitionPreference: "dissolve",
		});

		expect(result.structuredContent.intentDefaults).toMatchObject({
			projectName: "Transition Cut",
			transitionPreference: "dissolve",
		});
		expect(result._meta.widgetData.intentDefaults).toMatchObject({
			transitionPreference: "dissolve",
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

	test("rejects stale workspace open intent fields instead of dropping them", () => {
		expect(() =>
			serverModule.openCodecutWorkspace({
				projectName: "Creator Launch",
				brief: "保留片头片尾原音",
				successCriteria: "新增字幕不能重叠",
			}),
		).toThrow("stale CodeCut workspace schema");
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
			expect(automaticDuration.intent.durationContract).toEqual({
				totalDurationMode: "auto",
				sourceCoverageMode: "selected_segments",
				toleranceSeconds: 0.2,
			});

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
			expect(customDurationRange.intent.durationContract).toEqual({
				totalDurationMode: "custom_range",
				sourceCoverageMode: "selected_segments",
				toleranceSeconds: 0.2,
			});

			const preserveFullSource = await serverModule.inspectCodecutSetup(
				setupIntent({
					durationContract: {
						totalDurationMode: "preserve_source",
						sourceCoverageMode: "full_source",
						sourceDurationSeconds: 28.866667,
					},
					generateIntroCover: false,
				}),
				{ bridgeToolImpl },
			);
			expect(preserveFullSource.status).toBe("ready");
			expect(preserveFullSource.intent.durationContract).toEqual({
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
				toleranceSeconds: 0.2,
			});

			const manualTransition = await serverModule.inspectCodecutSetup(
				setupIntent({ transitionPreference: "slide-left" }),
				{ bridgeToolImpl },
			);
			expect(manualTransition.status).toBe("ready");
			expect(manualTransition.intent.transitionPreference).toBe("slide-left");

			const builtInVoice = await serverModule.inspectCodecutSetup(
				setupIntent({
					output: {
						...setupIntent().output,
						voiceEnabled: true,
						voicePackId: "podcast-female",
					},
				}),
				{ bridgeToolImpl },
			);
			expect(builtInVoice.status).toBe("ready");
			expect(builtInVoice.intent.output.voiceEnabled).toBe(true);
			expect(builtInVoice.intent.output.voicePackId).toBe("podcast-female");

			const voiceClone = await serverModule.inspectCodecutSetup(
				setupIntent({
					output: {
						...setupIntent().output,
						voiceEnabled: true,
						voicePackId: "voice_clone",
						voiceCloneSourceFile: {
							path: "/tmp/reference.wav",
						},
					},
				}),
				{ bridgeToolImpl },
			);
			expect(voiceClone.status).toBe("ready");
			expect(voiceClone.intent.output.voicePackId).toBe("voice_clone");
			expect(voiceClone.intent.output.voiceCloneSourceFile).toEqual({
				name: "reference.wav",
				path: "/tmp/reference.wav",
			});

			for (const [label, intent] of [
				["invalid project id", setupIntent({ projectId: "../bad" })],
				["missing project name", setupIntent({ projectName: " " })],
				["missing task type", setupIntent({ taskType: undefined })],
				["bad task type", setupIntent({ taskType: "three_video_template" })],
				["missing requirements", setupIntent({ requirements: "" })],
				[
					"non-https url",
					setupIntent({
						mediaSources: [{ kind: "url", url: "http://example.com/a.mp4" }],
					}),
				],
				[
					"non-media mime type",
					setupIntent({
						mediaSources: [
							{
								kind: "filePath",
								filePath: "/tmp/result.json",
								mimeType: "application/json",
							},
						],
					}),
				],
				[
					"non-media local extension",
					setupIntent({
						mediaSources: [{ kind: "filePath", filePath: "/tmp/result.json" }],
					}),
				],
				[
					"non-media url extension",
					setupIntent({
						mediaSources: [
							{ kind: "url", url: "https://cdn.example.com/result.json" },
						],
					}),
				],
				["bad aspect ratio", setupIntent({ targetAspectRatio: "4:5" })],
				[
					"bad transition preference",
					setupIntent({ transitionPreference: "spin" }),
				],
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
						output: { ...setupIntent().output, captionFont: "serif" },
					}),
				],
				[
					"bad built-in voice pack",
					setupIntent({
						mediaSources: [{ kind: "filePath", filePath }],
						output: {
							...setupIntent().output,
							voicePackId: "女声",
						},
					}),
				],
				[
					"custom voice file with built-in voice",
					setupIntent({
						mediaSources: [{ kind: "filePath", filePath }],
						output: {
							...setupIntent().output,
							voicePackId: "podcast-female",
							customVoiceFile: {
								name: "voice.wav",
								path: "/tmp/voice.wav",
							},
						},
					}),
				],
				[
					"voice clone source with custom voice",
					setupIntent({
						mediaSources: [{ kind: "filePath", filePath }],
						output: {
							...setupIntent().output,
							voicePackId: "custom",
							customVoiceFile: {
								name: "voice.wav",
								path: "/tmp/voice.wav",
							},
							voiceCloneSourceFile: {
								name: "reference.wav",
								path: "/tmp/reference.wav",
							},
						},
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
				detail:
					"Choose whether CodeCut should generate an opening cover image.",
			});

			const conflictingIntroCover = await serverModule.inspectCodecutSetup(
				setupIntent({
					durationContract: {
						totalDurationMode: "preserve_source",
						sourceCoverageMode: "full_source",
						sourceDurationSeconds: 28.866667,
					},
					generateIntroCover: true,
				}),
				{ bridgeToolImpl },
			);
			expect(conflictingIntroCover.status).toBe("blocked");
			expect(conflictingIntroCover.checks).toContainEqual({
				id: "intro-cover-duration-contract",
				label: "Intro cover duration contract",
				ok: false,
				detail:
					"Timeline intro cover cannot be enabled when preserving the full source duration and full source coverage. Use a fixed title or project cover instead.",
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

	test("workspace tool persists pending confirmation for later setup submission", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const env = {
			...process.env,
			CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
			CODECUT_CONFIRMATION_ROOT: directory,
		};
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
			const opened = await serverModule.callCodecutWorkspaceTool(
				"open_codecut_workspace",
				setupIntent({ mediaSources: [{ kind: "filePath", filePath: "" }] }),
				{
					env,
					fetchImpl: async () => ({ ok: true, status: 200 }),
				},
			);
			const pendingConfirmationId =
				opened.structuredContent.pendingConfirmationId;
			const persistedState = JSON.parse(
				await readFile(
					join(directory, ".codecut-confirmations", "tokens.json"),
					"utf8",
				),
			);
			expect(persistedState.pendingConfirmations).toContainEqual(
				expect.objectContaining({ pendingConfirmationId }),
			);

			const result = await serverModule.submitCodecutSetup(
				setupIntent({
					pendingConfirmationId,
					mediaSources: [{ kind: "filePath", filePath: "" }],
				}),
				{
					bridgeToolImpl,
					confirmationRoot: directory,
					workspaceSourceRoot: directory,
				},
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
				],
			});
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
		const pendingConfirmationId = serverModule.openCodecutWorkspace(
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
					transitionPreference: "dissolve",
					output: {
						...setupIntent().output,
						voiceEnabled: true,
						voicePackId: "podcast-male",
						captionSize: "large",
						captionStylePreset: "product-punch",
					},
					mediaSources: [
						{ kind: "filePath", filePath },
						{ kind: "filePath", filePath: secondFilePath },
					],
				}),
				{
					bridgeToolImpl,
					confirmationRoot: directory,
					workspaceSourceRoot: directory,
				},
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
			).toMatchObject({
				projectId: "launch-cut-001",
				name: "Launch Cut",
				confirmationToken: result.structuredContent.confirmationToken,
				confirmedSetup: {
					version: 1,
					taskType: "edit_execution",
					confirmedAt: expect.any(String),
					source: "codecut_setup_confirmation",
					timelinePreferences: {
						aspectRatio: "9:16",
						durationGoal: { mode: "auto" },
						durationContract: {
							totalDurationMode: "auto",
							sourceCoverageMode: "selected_segments",
							toleranceSeconds: 0.2,
						},
						transitionPreference: "dissolve",
						generateIntroCover: true,
						requirements:
							"Cut a high-retention short for a product launch.\nShow a hook, proof, and CTA with readable captions.",
					},
					titlePreferences: { enabled: false },
					captionPreferences: {
						enabled: true,
						language: "auto",
						font: "auto",
						size: "large",
						stylePreset: "product-punch",
					},
					voicePreferences: {
						enabled: true,
						voicePackId: "podcast-male",
					},
					characterPreferences: { characterId: "none" },
					bgmPreferences: { mode: "none" },
					templatePreference: { mode: "auto" },
					exportPreferences: {
						format: "mp4",
						quality: "high",
						includeAudio: true,
					},
					changes: [],
				},
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
					taskType: "edit_execution",
					generateIntroCover: true,
					transitionPreference: "dissolve",
					output: {
						captionFont: "auto",
						captionSize: "large",
						captionStylePreset: "product-punch",
						voiceEnabled: true,
						voicePackId: "podcast-male",
					},
				},
				importedMedia: [
					{ id: "media-1", name: "source.mp4" },
					{ id: "media-2", name: "second.mp4" },
				],
			});
			const workspaceDirectory = join(
				directory,
				".codecut-workspace/projects/launch-cut-canonical",
			);
			expect(result.structuredContent.workspace).toMatchObject({
				projectId: "launch-cut-canonical",
				projectDirectory: workspaceDirectory,
			});
			expect(
				JSON.parse(
					await readFile(join(workspaceDirectory, "workspace.json"), "utf8"),
				),
			).toMatchObject({
				projectId: "launch-cut-canonical",
				name: "Launch Cut",
			});
			expect(
				JSON.parse(
					await readFile(
						join(workspaceDirectory, "02-inventory/asset-manifest.json"),
						"utf8",
					),
				),
			).toMatchObject({
				projectId: "launch-cut-canonical",
				assets: [],
			});
			expect(result.content[0].text).toContain(
				"[Open CodeCut editor](http://127.0.0.1:4100/en/editor/launch-cut-canonical)",
			);
			const confirmationToken = result.structuredContent.confirmationToken;
			expect(confirmationToken).toMatch(/^ccconfirmed_[a-f0-9]{32}$/);
			expect(result.structuredContent.continuePrompt).toContain("$codecut");
			expect(result.structuredContent.continuePrompt).toContain(
				"real CodeCut editing chain",
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
				"get_timeline_state",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"call resolve_template",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				'templatePreference: {"mode":"auto"}',
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"04-planning/template-resolution.json",
			);
			expect(result.structuredContent.continuePrompt).not.toContain(
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
				"Voice display names are not executable voiceType values",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"Built-in voice library",
			);
			expect(result.structuredContent.continuePrompt).toContain("女声");
			expect(slashPath(result.structuredContent.continuePrompt)).toContain(
				"apps/web/public/voices/podcast-female.mp3",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"generate_runninghub_voice_clone",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"Selected built-in voice: 男声 (podcast-male)",
			);
			expect(slashPath(result.structuredContent.continuePrompt)).toContain(
				"apps/web/public/voices/podcast-male.mp3",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"Stop before timeline mutation if the requested voice cannot be resolved",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				"Intro cover changes the timeline structure",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				'"captionStylePreset":"product-punch"',
			);
			expect(result.structuredContent.continuePrompt).toContain(
				'"transitionPreference":"dissolve"',
			);
			expect(result.structuredContent.continuePrompt).toContain(
				'"taskType":"edit_execution"',
			);
			expect(result.structuredContent.continuePrompt).not.toContain(
				"launch-cut-001",
			);
			const recovered = await serverModule.recoverCodecutSetup(
				{
					projectId: "launch-cut-canonical",
					pendingConfirmationId,
				},
				{ confirmationRoot: directory },
			);
			expect(recovered.structuredContent).toMatchObject({
				status: "recovered",
				projectId: "launch-cut-canonical",
				projectName: "Launch Cut",
				pendingConfirmationId,
				confirmationToken,
				continuePrompt: result.structuredContent.continuePrompt,
				editorUrl: "http://127.0.0.1:4100/en/editor/launch-cut-canonical",
			});
			expect(recovered.content[0].text).toContain(
				"Recovered CodeCut project launch-cut-canonical",
			);
			const recoveredByRequestedId = await serverModule.recoverCodecutSetup(
				{
					projectId: "launch-cut-001",
					pendingConfirmationId,
				},
				{ confirmationRoot: directory },
			);
			expect(recoveredByRequestedId.structuredContent).toMatchObject({
				status: "recovered",
				projectId: "launch-cut-canonical",
				requestedProjectId: "launch-cut-001",
				pendingConfirmationId,
				confirmationToken,
			});
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
		});

		test("create template preference asks for a draft confirmation after primary work", async () => {
			const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
			const opened = serverModule.openCodecutWorkspace(
				{
					projectName: "Template From Edit",
					templatePreference: {
						mode: "create",
						draftTemplateName: "TikTok 解说模板草稿",
					},
					mediaSources: [
						{ kind: "url", url: "https://cdn.example.com/source.mp4" },
					],
				},
				{ confirmationRoot: directory },
			);
			const bridgeToolImpl = async (toolName) => {
				if (toolName === "create_project") {
					return {
						structuredContent: {
							projectId: "template-from-edit",
							name: "Template From Edit",
							revision: 1,
							editorUrl: "http://127.0.0.1:4100/en/editor/template-from-edit",
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
						pendingConfirmationId: opened.structuredContent.pendingConfirmationId,
						projectId: "template-from-edit",
						projectName: "Template From Edit",
						templatePreference: {
							mode: "create",
							draftTemplateName: "TikTok 解说模板草稿",
						},
						mediaSources: [
							{ kind: "url", url: "https://cdn.example.com/source.mp4" },
						],
					}),
					{
						bridgeToolImpl,
						confirmationRoot: directory,
						workspaceSourceRoot: directory,
					},
				);

				const prompt = result.structuredContent.continuePrompt;
				expect(prompt).toContain(
					'templatePreference: {"mode":"create","draftTemplateName":"TikTok 解说模板草稿"}',
				);
				expect(prompt).toContain(
					"After the edit or reference analysis is complete, ask the user whether to create a template draft named",
				);
				expect(prompt).toContain("TikTok 解说模板草稿");
				expect(prompt).toContain(
					"Do not import the template until the user confirms the draft.",
				);
			} finally {
				await rm(directory, {
					recursive: true,
					force: true,
				});
			}
		});

	test("downloads and imports selected smart matched BGM during setup", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-bgm-setup-"));
		const filePath = join(directory, "source.mp4");
		await writeFile(filePath, "video");
		const opened = serverModule.openCodecutWorkspace(
			setupIntent({
				mediaSources: [{ kind: "filePath", filePath }],
				bgmPreferences: smartBgmPreferences(),
			}),
			{ confirmationRoot: directory },
		);
		const pendingConfirmationId =
			opened.structuredContent.pendingConfirmationId;
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
				const isBgmImport = args.filePath !== filePath;
				return {
					structuredContent: {
						status: "completed",
						results: [
							{
								success: true,
								data: {
									assets: [
										isBgmImport
											? { id: "bgm-asset-1", name: "safe-lofi.mp3" }
											: { id: "media-1", name: "source.mp4" },
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
						results: [{ success: true, data: { revision: 3 } }],
					},
				};
			}
			throw new Error(`Unexpected tool ${toolName}`);
		};

		try {
			const result = await serverModule.submitCodecutSetup(
				setupIntent({
					pendingConfirmationId,
					mediaSources: [{ kind: "filePath", filePath }],
					bgmPreferences: smartBgmPreferences(),
				}),
				{
					bridgeToolImpl,
					confirmationRoot: directory,
					workspaceSourceRoot: directory,
					fetchImpl: async (url) => {
						expect(String(url)).toBe(
							"https://archive.org/download/safe-lofi/safe-lofi.mp3",
						);
						const bytes = Buffer.from("audio-bytes");
							return {
								ok: true,
								status: 200,
								headers: new Headers({
									"content-type": "audio/mpeg",
									"content-length": String(bytes.byteLength),
								}),
								arrayBuffer: async () =>
									bytes.buffer.slice(
										bytes.byteOffset,
									bytes.byteOffset + bytes.byteLength,
								),
						};
					},
				},
			);

			expect(calls.map((call) => call.toolName)).toEqual([
				"create_project",
				"import_media",
				"import_media",
				"get_project_info",
			]);
			expect(
				calls.find((call) => call.toolName === "create_project")?.args
					.confirmedSetup.bgmPreferences,
			).toEqual(smartBgmPreferences());
			const bgmImportArgs = calls
				.filter((call) => call.toolName === "import_media")
				.map((call) => call.args)
				.find((args) => args.filePath !== filePath);
			expect(bgmImportArgs).toMatchObject({
				projectId: "launch-cut-canonical",
				confirmationToken: result.structuredContent.confirmationToken,
			});
			expect(isAbsolute(bgmImportArgs.filePath)).toBe(true);
			expect(slashPath(bgmImportArgs.filePath)).toContain(
				".codecut-workspace/projects/launch-cut-canonical/01-input/bgm",
			);
			expect(slashPath(bgmImportArgs.filePath)).toContain("safe-lofi.mp3");
			expect(existsSync(bgmImportArgs.filePath)).toBe(true);
			expect(
				Buffer.from(await readFile(bgmImportArgs.filePath)).toString("utf8"),
			).toBe("audio-bytes");
			expect(result.structuredContent.bgmAsset).toMatchObject({
				assetId: "bgm-asset-1",
				candidate: bgmCandidate(),
				license: {
					label: "CC BY 4.0",
					url: "https://creativecommons.org/licenses/by/4.0/",
					commercialUseAllowed: true,
					attributionRequired: true,
				},
			});
			expect(result.structuredContent.continuePrompt).toContain(
				"audio.bgm.assetId",
			);
			expect(result.structuredContent.continuePrompt).toContain("bgm-asset-1");
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
			}
		});

		test("blocks forged BGM candidates before creating a project", async () => {
			const calls = [];
			const result = await serverModule.submitCodecutSetup(
				setupIntent({
					bgmPreferences: smartBgmPreferences({
						candidates: [
							bgmCandidate({
								downloadUrl: "https://example.com/safe-lofi.mp3",
							}),
						],
						selectedCandidate: bgmCandidate({
							downloadUrl: "https://example.com/safe-lofi.mp3",
						}),
					}),
				}),
				{
					bridgeToolImpl: async (toolName, args) => {
						calls.push({ toolName, args });
						throw new Error(`Unexpected tool ${toolName}`);
					},
				},
			);

			expect(result.isError).toBe(true);
			expect(result.structuredContent.status).toBe("blocked");
			expect(JSON.stringify(result.structuredContent.checks)).toContain(
				"BGM downloadUrl must be an archive.org download URL.",
			);
			expect(calls).toEqual([]);
		});

		test("fails BGM import when the download response is not audio", async () => {
			const directory = await mkdtemp(join(tmpdir(), "codecut-bgm-type-"));
			const opened = serverModule.openCodecutWorkspace(
				setupIntent({ bgmPreferences: smartBgmPreferences() }),
				{ confirmationRoot: directory },
			);
			const pendingConfirmationId =
				opened.structuredContent.pendingConfirmationId;
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
										assets: [{ id: "media-1", name: "source.mp4" }],
									},
								},
							],
						},
					};
				}
				throw new Error(`Unexpected tool ${toolName}`);
			};

			try {
				const result = await serverModule.submitCodecutSetup(
					setupIntent({
						pendingConfirmationId,
						mediaSources: [],
						bgmPreferences: smartBgmPreferences(),
					}),
					{
						bridgeToolImpl,
						confirmationRoot: directory,
						workspaceSourceRoot: directory,
						fetchImpl: async () => ({
							ok: true,
							status: 200,
							headers: new Headers({
								"content-type": "text/html",
								"content-length": "32",
							}),
							arrayBuffer: async () => new ArrayBuffer(32),
						}),
					},
				);

				expect(result.isError).toBe(true);
				expect(result.structuredContent.status).toBe("bgm_import_failed");
				expect(result.structuredContent.error).toBe(
					"BGM download must return audio content.",
				);
				expect(calls.map((call) => call.toolName)).toEqual(["create_project"]);
			} finally {
				await rm(directory, {
					recursive: true,
					force: true,
				});
			}
		});

		test("imports BGM after a valid Internet Archive mirror redirect", async () => {
			const directory = await mkdtemp(join(tmpdir(), "codecut-bgm-redirect-"));
			const opened = serverModule.openCodecutWorkspace(
				setupIntent({ mediaSources: [], bgmPreferences: smartBgmPreferences() }),
				{ confirmationRoot: directory },
			);
			const pendingConfirmationId =
				opened.structuredContent.pendingConfirmationId;
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
									data: { assets: [{ id: "bgm-mirror", name: "safe-lofi.mp3" }] },
								},
							],
						},
					};
				}
				if (toolName === "get_project_info") {
					return { structuredContent: { results: [{ data: { revision: 2 } }] } };
				}
				throw new Error(`Unexpected tool ${toolName}`);
			};
			const fetchCalls = [];

			try {
				const result = await serverModule.submitCodecutSetup(
					setupIntent({
						pendingConfirmationId,
						mediaSources: [],
						bgmPreferences: smartBgmPreferences(),
					}),
					{
						bridgeToolImpl,
						confirmationRoot: directory,
						workspaceSourceRoot: directory,
						fetchImpl: async (url, init) => {
							fetchCalls.push({ url: String(url), redirect: init.redirect });
							if (String(url) === "https://archive.org/download/safe-lofi/safe-lofi.mp3") {
								return {
									ok: false,
									status: 302,
									headers: new Headers({
										location:
											"https://dn721605.ca.archive.org/0/items/safe-lofi/safe-lofi.mp3",
									}),
								};
							}
							if (
								String(url) ===
								"https://dn721605.ca.archive.org/0/items/safe-lofi/safe-lofi.mp3"
							) {
								const bytes = Buffer.from("redirected-audio");
								return {
									ok: true,
									status: 200,
									headers: new Headers({
										"content-type": "audio/mpeg",
										"content-length": String(bytes.byteLength),
									}),
									arrayBuffer: async () =>
										bytes.buffer.slice(
											bytes.byteOffset,
											bytes.byteOffset + bytes.byteLength,
										),
								};
							}
							throw new Error(`Unexpected fetch ${url}`);
						},
					},
				);

				expect(result.structuredContent.bgmAsset.assetId).toBe("bgm-mirror");
				expect(fetchCalls).toEqual([
					{
						url: "https://archive.org/download/safe-lofi/safe-lofi.mp3",
						redirect: "manual",
					},
					{
						url: "https://dn721605.ca.archive.org/0/items/safe-lofi/safe-lofi.mp3",
						redirect: "manual",
					},
				]);
			} finally {
				await rm(directory, {
					recursive: true,
					force: true,
				});
			}
		});

		test("rejects BGM redirects outside Internet Archive without fetching them", async () => {
			const directory = await mkdtemp(join(tmpdir(), "codecut-bgm-ssrf-"));
			const opened = serverModule.openCodecutWorkspace(
				setupIntent({ mediaSources: [], bgmPreferences: smartBgmPreferences() }),
				{ confirmationRoot: directory },
			);
			const pendingConfirmationId =
				opened.structuredContent.pendingConfirmationId;
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
				throw new Error(`Unexpected tool ${toolName}`);
			};
			const fetchCalls = [];

			try {
				const result = await serverModule.submitCodecutSetup(
					setupIntent({
						pendingConfirmationId,
						mediaSources: [],
						bgmPreferences: smartBgmPreferences(),
					}),
					{
						bridgeToolImpl,
						confirmationRoot: directory,
						workspaceSourceRoot: directory,
						fetchImpl: async (url, init) => {
							fetchCalls.push({ url: String(url), redirect: init.redirect });
							if (String(url) === "https://archive.org/download/safe-lofi/safe-lofi.mp3") {
								return {
									ok: false,
									status: 302,
									headers: new Headers({
										location: "http://127.0.0.1/private.mp3",
									}),
								};
							}
							throw new Error(`Unexpected fetch ${url}`);
						},
					},
				);

				expect(result.isError).toBe(true);
				expect(result.structuredContent.status).toBe("bgm_import_failed");
				expect(result.structuredContent.error).toBe(
					"BGM download redirect must stay on Internet Archive.",
				);
				expect(calls.map((call) => call.toolName)).toEqual(["create_project"]);
				expect(fetchCalls).toEqual([
					{
						url: "https://archive.org/download/safe-lofi/safe-lofi.mp3",
						redirect: "manual",
					},
				]);
			} finally {
				await rm(directory, {
					recursive: true,
					force: true,
				});
			}
		});

		test("imports OGG BGM when Internet Archive returns application ogg", async () => {
			const directory = await mkdtemp(join(tmpdir(), "codecut-bgm-ogg-"));
			const opened = serverModule.openCodecutWorkspace(
				setupIntent({
					mediaSources: [],
					bgmPreferences: smartBgmPreferences({
						candidates: [
							bgmCandidate({
								id: "internet-archive:safe-lofi:safe-lofi.ogg",
								sourceId: "internet-archive:safe-lofi:safe-lofi.ogg",
								previewUrl: "https://archive.org/download/safe-lofi/safe-lofi.ogg",
								downloadUrl:
									"https://archive.org/download/safe-lofi/safe-lofi.ogg",
							}),
						],
						selectedCandidate: bgmCandidate({
							id: "internet-archive:safe-lofi:safe-lofi.ogg",
							sourceId: "internet-archive:safe-lofi:safe-lofi.ogg",
							previewUrl: "https://archive.org/download/safe-lofi/safe-lofi.ogg",
							downloadUrl:
								"https://archive.org/download/safe-lofi/safe-lofi.ogg",
						}),
					}),
				}),
				{ confirmationRoot: directory },
			);
			const pendingConfirmationId =
				opened.structuredContent.pendingConfirmationId;
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
									data: { assets: [{ id: "bgm-ogg", name: "safe-lofi.ogg" }] },
								},
							],
						},
					};
				}
				if (toolName === "get_project_info") {
					return { structuredContent: { results: [{ data: { revision: 2 } }] } };
				}
				throw new Error(`Unexpected tool ${toolName}`);
			};

			try {
				const result = await serverModule.submitCodecutSetup(
					setupIntent({
						pendingConfirmationId,
						mediaSources: [],
						bgmPreferences: smartBgmPreferences({
							candidates: [
								bgmCandidate({
									id: "internet-archive:safe-lofi:safe-lofi.ogg",
									sourceId: "internet-archive:safe-lofi:safe-lofi.ogg",
									previewUrl:
										"https://archive.org/download/safe-lofi/safe-lofi.ogg",
									downloadUrl:
										"https://archive.org/download/safe-lofi/safe-lofi.ogg",
								}),
							],
							selectedCandidate: bgmCandidate({
								id: "internet-archive:safe-lofi:safe-lofi.ogg",
								sourceId: "internet-archive:safe-lofi:safe-lofi.ogg",
								previewUrl: "https://archive.org/download/safe-lofi/safe-lofi.ogg",
								downloadUrl:
									"https://archive.org/download/safe-lofi/safe-lofi.ogg",
							}),
						}),
					}),
					{
						bridgeToolImpl,
						confirmationRoot: directory,
						workspaceSourceRoot: directory,
						fetchImpl: async () => {
							const bytes = Buffer.from("ogg-bytes");
							return {
								ok: true,
								status: 200,
								headers: new Headers({
									"content-type": "application/ogg",
									"content-length": String(bytes.byteLength),
								}),
								arrayBuffer: async () =>
									bytes.buffer.slice(
										bytes.byteOffset,
										bytes.byteOffset + bytes.byteLength,
									),
							};
						},
					},
				);

				expect(result.structuredContent.bgmAsset.assetId).toBe("bgm-ogg");
				const bgmImportArgs = calls
					.filter((call) => call.toolName === "import_media")
					.map((call) => call.args)
					.find((args) => args.filePath?.endsWith(".ogg"));
				expect(bgmImportArgs.filePath).toContain("safe-lofi.ogg");
			} finally {
				await rm(directory, {
					recursive: true,
					force: true,
				});
			}
		});

		test("fails BGM import when the body download times out", async () => {
			const directory = await mkdtemp(join(tmpdir(), "codecut-bgm-timeout-"));
			const opened = serverModule.openCodecutWorkspace(
				setupIntent({ mediaSources: [], bgmPreferences: smartBgmPreferences() }),
				{ confirmationRoot: directory },
			);
			const pendingConfirmationId =
				opened.structuredContent.pendingConfirmationId;
			const bridgeToolImpl = async (toolName) => {
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
				throw new Error(`Unexpected tool ${toolName}`);
			};

			try {
				const result = await serverModule.submitCodecutSetup(
					setupIntent({
						pendingConfirmationId,
						mediaSources: [],
						bgmPreferences: smartBgmPreferences(),
					}),
					{
						bridgeToolImpl,
						bgmDownloadTimeoutMs: 1,
						confirmationRoot: directory,
						workspaceSourceRoot: directory,
						fetchImpl: async (_url, init) => ({
							ok: true,
							status: 200,
							headers: new Headers({
								"content-type": "audio/mpeg",
								"content-length": "32",
							}),
							arrayBuffer: async () =>
								new Promise((_resolve, reject) => {
									init.signal.addEventListener(
										"abort",
										() => {
											const error = new Error("aborted");
											error.name = "AbortError";
											reject(error);
										},
										{ once: true },
									);
								}),
						}),
					},
				);

				expect(result.isError).toBe(true);
				expect(result.structuredContent.status).toBe("bgm_import_failed");
				expect(result.structuredContent.error).toBe("BGM download timed out.");
			} finally {
				await rm(directory, {
					recursive: true,
					force: true,
				});
			}
		});

		test("reuses a confirmed setup result on repeated submission without creating again", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const filePath = join(directory, "source.mp4");
		await writeFile(filePath, "video");
		const opened = serverModule.openCodecutWorkspace(
			setupIntent({ mediaSources: [{ kind: "filePath", filePath }] }),
			{ confirmationRoot: directory },
		);
		const pendingConfirmationId =
			opened.structuredContent.pendingConfirmationId;
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
									assets: [{ id: "media-1", name: "source.mp4" }],
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
		const intent = setupIntent({
			pendingConfirmationId,
			mediaSources: [{ kind: "filePath", filePath }],
		});

		try {
			const first = await serverModule.submitCodecutSetup(intent, {
				bridgeToolImpl,
				confirmationRoot: directory,
				workspaceSourceRoot: directory,
			});
			const second = await serverModule.submitCodecutSetup(intent, {
				bridgeToolImpl,
				confirmationRoot: directory,
				workspaceSourceRoot: directory,
			});

			expect(calls.map((call) => call.toolName)).toEqual([
				"create_project",
				"import_media",
				"get_project_info",
			]);
			expect(second.structuredContent).toMatchObject({
				status: "created",
				reusedSetupResult: true,
				projectId: "launch-cut-canonical",
				projectName: "Launch Cut",
				pendingConfirmationId,
				confirmationToken: first.structuredContent.confirmationToken,
				continuePrompt: first.structuredContent.continuePrompt,
			});
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("routes template draft setup to the reference-template skill and stops before editing", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const opened = serverModule.openCodecutWorkspace(
			{
				projectName: "Template Draft",
				requirements: "创建模板，学习参考视频结构。",
				taskType: "template_draft",
				mediaSources: [
					{ kind: "url", url: "https://cdn.example.com/reference.mp4" },
				],
			},
			{ confirmationRoot: directory },
		);
		const bridgeToolImpl = async (toolName) => {
			if (toolName === "create_project") {
				return {
					structuredContent: {
						projectId: "template-draft",
						name: "Template Draft",
						revision: 1,
						editorUrl: "http://127.0.0.1:4100/en/editor/template-draft",
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
					pendingConfirmationId: opened.structuredContent.pendingConfirmationId,
					projectId: "template-draft",
					projectName: "Template Draft",
					taskType: "template_draft",
					mediaSources: [
						{ kind: "url", url: "https://cdn.example.com/reference.mp4" },
					],
					requirements: "创建模板，学习参考视频结构。",
				}),
				{
					bridgeToolImpl,
					confirmationRoot: directory,
					workspaceSourceRoot: directory,
				},
			);

			const prompt = result.structuredContent.continuePrompt;
			expect(prompt).toContain(
				"Use $codecut-reference-template to derive a reusable template draft",
			);
			expect(prompt).toContain("reference-analysis.md");
			expect(prompt).toContain("template.json");
			expect(prompt).toContain("template-fields.md");
			expect(prompt).toContain("Stop after presenting those draft artifacts");
			expect(prompt).not.toContain("real CodeCut editing chain");
			expect(prompt).not.toContain("apply_narrated_remix_plan");
			expect(prompt).not.toContain("generate_runninghub_voice");
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("routes template import setup to import-only work and sample/template editing to the existing edit chain", async () => {
		async function submitForTaskType(taskType) {
			const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
			const safeProjectId = `${taskType.replaceAll("_", "-")}-project`;
			const opened = serverModule.openCodecutWorkspace(
				{
					projectName: `${taskType} project`,
					taskType,
					requirements: "Confirm this task.",
					mediaSources: [
						{ kind: "url", url: "https://cdn.example.com/source.mp4" },
					],
				},
				{ confirmationRoot: directory },
			);
			const bridgeToolImpl = async (toolName) => {
				if (toolName === "create_project") {
					return {
						structuredContent: {
							projectId: safeProjectId,
							name: `${taskType} project`,
							revision: 1,
							editorUrl: `http://127.0.0.1:4100/en/editor/${safeProjectId}`,
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
				return await serverModule.submitCodecutSetup(
					setupIntent({
						pendingConfirmationId:
							opened.structuredContent.pendingConfirmationId,
						projectId: safeProjectId,
						projectName: `${taskType} project`,
						taskType,
						mediaSources: [
							{ kind: "url", url: "https://cdn.example.com/source.mp4" },
						],
						requirements: "Confirm this task.",
					}),
					{
						bridgeToolImpl,
						confirmationRoot: directory,
						workspaceSourceRoot: directory,
					},
				);
			} finally {
				await rm(directory, {
					recursive: true,
					force: true,
				});
			}
		}

		const importResult = await submitForTaskType("template_import");
		expect(importResult.structuredContent.continuePrompt).toContain(
			"Use $codecut-reference-template to import the confirmed template draft",
		);
		expect(importResult.structuredContent.continuePrompt).not.toContain(
			"real CodeCut editing chain",
		);
		expect(importResult.structuredContent.continuePrompt).not.toContain(
			"get_timeline_state",
		);

		for (const taskType of ["template_apply_sample", "edit_execution"]) {
			const result = await submitForTaskType(taskType);
			expect(result.structuredContent.continuePrompt).toContain(
				"real CodeCut editing chain",
			);
			expect(result.structuredContent.continuePrompt).toContain(
				`"taskType":"${taskType}"`,
			);
		}
	}, 15_000);

	test("reports pending setup recovery without a host tool error when no confirmed result exists", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));

		try {
			const result = await serverModule.recoverCodecutSetup(
				{
					projectId: "missing-cut",
					pendingConfirmationId: "ccpending_000000000000000000000000",
				},
				{ confirmationRoot: directory },
			);

			expect(result.isError).not.toBe(true);
			expect(result.structuredContent).toMatchObject({
				status: "confirmation_pending",
				nextAction: "submit_current_workspace_widget",
				projectId: "missing-cut",
				pendingConfirmationId: "ccpending_000000000000000000000000",
			});
			expect(result.structuredContent.error).toContain(
				"No confirmed CodeCut setup result found",
			);
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("blocks setup submission without consuming confirmation when the service stops after widget render", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));

		try {
			const opened = await serverModule.callCodecutWorkspaceTool(
				"open_codecut_workspace",
				setupIntent(),
				{
					env: {
						CODECUT_CONFIRMATION_ROOT: directory,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
					fetchImpl: async () => ({ ok: true, status: 200 }),
				},
			);
			const pendingConfirmationId =
				opened.structuredContent.pendingConfirmationId;

			const blocked = await serverModule.callCodecutWorkspaceTool(
				"submit_codecut_setup",
				setupIntent({ pendingConfirmationId }),
				{
					env: {
						CODECUT_CONFIRMATION_ROOT: directory,
						CODECUT_AGENT_BRIDGE_URL: "http://127.0.0.1:4100",
					},
					fetchImpl: async () => {
						throw new Error("fetch failed");
					},
				},
			);

			expect(blocked.isError).not.toBe(true);
			expect(blocked.structuredContent).toMatchObject({
				status: "service_unavailable",
				nextAction: "start_codecut_web_service_and_retry_widget_submission",
				projectId: "launch-cut-001",
				readinessUrl: "http://127.0.0.1:4100/en/projects",
				error: "Codecut web service is not reachable: fetch failed",
			});

			const calls = [];
			const result = await serverModule.submitCodecutSetup(
				setupIntent({ pendingConfirmationId }),
				{
					confirmationRoot: directory,
					workspaceSourceRoot: directory,
					bridgeToolImpl: async (toolName) => {
						calls.push(toolName);
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
						if (toolName === "get_project_info") {
							return {
								structuredContent: {
									results: [{ success: true, data: { revision: 1 } }],
								},
							};
						}
						throw new Error(`Unexpected tool ${toolName}`);
					},
				},
			);

			expect(calls).toEqual(["create_project", "get_project_info"]);
			expect(result.structuredContent).toMatchObject({
				status: "created",
				projectId: "launch-cut-001",
			});
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("blocks setup submission without explicit create-project confirmation", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const pendingConfirmationId = serverModule.openCodecutWorkspace(
			setupIntent(),
			{ confirmationRoot: directory },
		).structuredContent.pendingConfirmationId;
		const calls = [];

		try {
			const blocked = await serverModule.submitCodecutSetup(
				setupIntent({
					pendingConfirmationId,
					confirmedByUser: undefined,
				}),
				{
					confirmationRoot: directory,
					workspaceSourceRoot: directory,
					bridgeToolImpl: async (toolName) => {
						calls.push(toolName);
						throw new Error(`Unexpected tool ${toolName}`);
					},
				},
			);

			expect(blocked.isError).not.toBe(true);
			expect(calls).toEqual([]);
			expect(blocked.structuredContent).toMatchObject({
				status: "confirmation_required",
				nextAction: "confirm_codecut_setup_before_submission",
				projectId: "launch-cut-001",
				pendingConfirmationId,
				error:
					"confirmedByUser must be true after explicit user confirmation before CodeCut setup submission.",
			});

			const result = await serverModule.submitCodecutSetup(
				setupIntent({ pendingConfirmationId, confirmedByUser: true }),
				{
					confirmationRoot: directory,
					workspaceSourceRoot: directory,
					bridgeToolImpl: async (toolName) => {
						calls.push(toolName);
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
						if (toolName === "get_project_info") {
							return {
								structuredContent: {
									results: [{ success: true, data: { revision: 1 } }],
								},
							};
						}
						throw new Error(`Unexpected tool ${toolName}`);
					},
				},
			);

			expect(calls).toEqual(["create_project", "get_project_info"]);
			expect(result.structuredContent).toMatchObject({
				status: "created",
				projectId: "launch-cut-001",
			});
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("reports create project failure through setup status instead of host tool error", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const pendingConfirmationId = serverModule.openCodecutWorkspace(
			setupIntent(),
		).structuredContent.pendingConfirmationId;

		try {
			const result = await serverModule.submitCodecutSetup(
				setupIntent({ pendingConfirmationId }),
				{
					confirmationRoot: directory,
					workspaceSourceRoot: directory,
					bridgeToolImpl: async (toolName) => {
						if (toolName === "create_project") {
							return {
								isError: true,
								structuredContent: {
									error: "Codecut web service is not reachable: fetch failed",
								},
							};
						}
						throw new Error(`Unexpected tool ${toolName}`);
					},
				},
			);

			expect(result.isError).not.toBe(true);
			expect(result.structuredContent).toMatchObject({
				status: "create_failed",
				nextAction: "open_codecut_workspace",
				projectId: "launch-cut-001",
				error: "Codecut web service is not reachable: fetch failed",
			});
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("creates project without importing optional local media paths that are missing or not import-ready", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const pendingConfirmationId = serverModule.openCodecutWorkspace(
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
				{
					bridgeToolImpl,
					confirmationRoot: directory,
					workspaceSourceRoot: directory,
				},
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
			expect(result.structuredContent.continuePrompt).toContain("source.mp4");
		} finally {
			await rm(directory, {
				recursive: true,
				force: true,
			});
		}
	});

	test("creates project when setup intent omits media sources", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const pendingConfirmationId = serverModule.openCodecutWorkspace(
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
				{
					bridgeToolImpl,
					confirmationRoot: directory,
					workspaceSourceRoot: directory,
				},
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
		const pendingConfirmationId = serverModule.openCodecutWorkspace(
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
				{
					bridgeToolImpl,
					confirmationRoot: directory,
					workspaceSourceRoot: directory,
				},
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

	test("creates project without importing remote URL sources during setup", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-widget-"));
		const sourceUrl =
			"https://www.tiktok.com/@ayusbangga2/video/7638536445577235732";
		const pendingConfirmationId = serverModule.openCodecutWorkspace(
			setupIntent({
				mediaSources: [{ kind: "url", url: sourceUrl }],
			}),
			{ confirmationRoot: directory },
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
					mediaSources: [{ kind: "url", url: sourceUrl }],
				}),
				{
					bridgeToolImpl,
					confirmationRoot: directory,
					workspaceSourceRoot: directory,
				},
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
					{
						index: 0,
						kind: "url",
						url: sourceUrl,
						reason: "remote_url_requires_material_ingest",
					},
				],
			});
			expect(result.structuredContent.continuePrompt).toContain(sourceUrl);
			const recovered = await serverModule.recoverCodecutSetup(
				{
					projectId: "launch-cut-canonical",
					pendingConfirmationId,
				},
				{ confirmationRoot: directory },
			);
			expect(recovered.structuredContent).toMatchObject({
				status: "recovered",
				projectId: "launch-cut-canonical",
				pendingConfirmationId,
				continuePrompt: result.structuredContent.continuePrompt,
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
					workspaceSourceRoot: directory,
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
		const pendingConfirmationId = serverModule.openCodecutWorkspace(
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
					workspaceSourceRoot: directory,
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
			buildBridgeCliArgs("get_timeline_state", {
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
				startTime: 1,
				endTime: 3,
				includeFrames: true,
				includeReferencedMedia: true,
			}),
		]);
		expect(() =>
			buildBridgeCliArgs("get_timeline_state", {
				projectId: "project-1",
				format: "v2",
			}),
		).toThrow("get_timeline_state does not accept argument(s): format");
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
			buildBridgeCliArgs("apply_composite_layout_plan", {
				projectId: "project-1",
				planJsonFile: "/tmp/composite-layout-plan.json",
				replaceExisting: true,
				confirmationToken,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"apply-composite-layout-plan",
			"--project-id",
			"project-1",
			"--plan-json-file",
			"/tmp/composite-layout-plan.json",
			"--replace-existing",
			"true",
			"--confirmation-token",
			confirmationToken,
		]);

		expect(
			buildBridgeCliArgs("import_template", {
				projectId: "project-1",
				templateJsonFile: "/tmp/template.json",
				confirmedByUser: true,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"import-template",
			"--project-id",
			"project-1",
			"--template-json-file",
			"/tmp/template.json",
			"--confirmed-by-user",
			"true",
		]);

		expect(
			buildBridgeCliArgs("list_templates", {
				projectId: "project-1",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"list-templates",
			"--project-id",
			"project-1",
		]);

		expect(
			buildBridgeCliArgs("get_template", {
				projectId: "project-1",
				templateId: "proof-demo-cut",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"get-template",
			"--project-id",
			"project-1",
			"--template-id",
			"proof-demo-cut",
		]);

		expect(
			buildBridgeCliArgs("resolve_template", {
				projectId: "project-1",
				requestedTemplate: "proof demo",
				triggerType: "product-proof-ad",
				userIntent: "tiktok explainer",
				platformHint: "TikTok",
				hasTranscript: true,
				hasVisualProof: true,
				hasProductFacts: false,
				hasExistingNarrationAudio: false,
				hasVisualBroll: false,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"resolve-template",
			"--project-id",
			"project-1",
			"--args-json",
			'{"requestedTemplate":"proof demo","triggerType":"product-proof-ad","userIntent":"tiktok explainer","platformHint":"TikTok","hasTranscript":true,"hasVisualProof":true,"hasProductFacts":false,"hasExistingNarrationAudio":false,"hasVisualBroll":false}',
		]);

		expect(
			buildBridgeCliArgs("check_template_import", {
				projectId: "project-1",
				templateJsonFile: "/tmp/template.json",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"check-template-import",
			"--project-id",
			"project-1",
			"--template-json-file",
			"/tmp/template.json",
		]);

		expect(
			buildBridgeCliArgs("update_template", {
				projectId: "project-1",
				templateJsonFile: "/tmp/template.json",
				confirmedByUser: true,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"update-template",
			"--project-id",
			"project-1",
			"--template-json-file",
			"/tmp/template.json",
			"--confirmed-by-user",
			"true",
		]);

		expect(
			buildBridgeCliArgs("delete_template", {
				projectId: "project-1",
				templateId: "proof-demo-cut",
				confirmedByUser: true,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"delete-template",
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
			buildBridgeCliArgs("import_subtitles", {
				projectId: "project-1",
				confirmationToken,
				filePath: "/tmp/captions.srt",
				format: "srt",
				trackName: "Imported Captions",
				captionStyle: {
					preset: "talking-head-pop",
					position: "lower-safe",
				},
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"import-subtitles",
			"--project-id",
			"project-1",
			"--file-path",
			"/tmp/captions.srt",
			"--format",
			"srt",
			"--track-name",
			"Imported Captions",
			"--caption-style-json",
			JSON.stringify({
				preset: "talking-head-pop",
				position: "lower-safe",
			}),
			"--confirmation-token",
			confirmationToken,
		]);

		expect(
			buildBridgeCliArgs("generate_runninghub_voice_design", {
				projectId: "project-1",
				confirmationToken,
				text: "欢迎来到今天的测试",
				emotionPrompt: "温柔、稳定的中文女声",
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
			"温柔、稳定的中文女声",
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
			buildBridgeCliArgs("add_transitions", {
				projectId: "project-1",
				confirmationToken,
				entries: [
					{
						trackId: "video-track-1",
						fromElementId: "clip-1",
						toElementId: "clip-2",
						type: "fade",
						duration: 0.35,
					},
				],
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"add_transitions",
			"--args-json",
			JSON.stringify({
				entries: [
					{
						trackId: "video-track-1",
						fromElementId: "clip-1",
						toElementId: "clip-2",
						type: "fade",
						duration: 0.35,
					},
				],
			}),
			"--confirmation-token",
			confirmationToken,
		]);

		expect(
			buildBridgeCliArgs("update_transition", {
				projectId: "project-1",
				confirmationToken,
				trackId: "video-track-1",
				transitionId: "transition-1",
				type: "slide-left",
				duration: 0.25,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"update_transition",
			"--args-json",
			JSON.stringify({
				trackId: "video-track-1",
				transitionId: "transition-1",
				type: "slide-left",
				duration: 0.25,
			}),
			"--confirmation-token",
			confirmationToken,
		]);

		expect(
			buildBridgeCliArgs("remove_transition", {
				projectId: "project-1",
				confirmationToken,
				trackId: "video-track-1",
				transitionId: "transition-1",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"remove_transition",
			"--args-json",
			JSON.stringify({
				trackId: "video-track-1",
				transitionId: "transition-1",
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
			buildBridgeCliArgs("build_caption_diagnostics", {
				projectId: "project-1",
				language: "zh",
				modelId: "whisper-base",
				captionStyle: {
					preset: "creator-clean",
					position: "lower-safe",
					motionPreset: "soft-reveal",
				},
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"build-caption-diagnostics",
			"--project-id",
			"project-1",
			"--language",
			"zh",
			"--model-id",
			"whisper-base",
			"--caption-style-preset",
			"creator-clean",
			"--caption-position",
			"lower-safe",
			"--caption-motion-preset",
			"soft-reveal",
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
		expect(
			buildBridgeCliArgs("generate_volcengine_cloned_voice", {
				projectId: "project-1",
				confirmationToken,
				voiceType: "voice-clone-1",
				text: "hello",
				protectedTerms: ["CodeCut"],
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"generate-volcengine-cloned-voice",
			"--project-id",
			"project-1",
			"--voice-type",
			"voice-clone-1",
			"--text",
			"hello",
			"--protected-term",
			"CodeCut",
			"--confirmation-token",
			confirmationToken,
		]);
		expect(
			buildBridgeCliArgs("transcribe_volcengine_url", {
				projectId: "project-1",
				mediaUrl: "https://example.com/audio.mp3",
				requestId: "asr-request-1",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"transcribe_volcengine_url",
			"--args-json",
			JSON.stringify({
				mediaUrl: "https://example.com/audio.mp3",
				requestId: "asr-request-1",
			}),
		]);
		expect(
			buildBridgeCliArgs("build_volcengine_url_captions", {
				projectId: "project-1",
				mediaUrl: "https://example.com/video.mp4",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"build_volcengine_url_captions",
			"--args-json",
			JSON.stringify({ mediaUrl: "https://example.com/video.mp4" }),
		]);
		expect(
			buildBridgeCliArgs("transcribe_volcengine_media", {
				projectId: "project-1",
				mediaId: "media-1",
				requestId: "asr-request-1",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"transcribe_volcengine_media",
			"--args-json",
			JSON.stringify({
				mediaId: "media-1",
				requestId: "asr-request-1",
			}),
		]);
		expect(
			buildBridgeCliArgs("build_volcengine_media_captions", {
				projectId: "project-1",
				mediaId: "media-1",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"build_volcengine_media_captions",
			"--args-json",
			JSON.stringify({ mediaId: "media-1" }),
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
		expect(
			buildBridgeCliArgs("export_timeline_frame", {
				projectId: "project-1",
				confirmationToken,
				timeSeconds: 1.25,
				format: "png",
				outputFile: "/tmp/frame.png",
				overwrite: false,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"export-timeline-frame",
			"--project-id",
			"project-1",
			"--time-seconds",
			"1.25",
			"--format",
			"png",
			"--output-file",
			"/tmp/frame.png",
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

	test("marks executor envelopes with failed command results as MCP errors", () => {
		const result = normalizeCliResult({
			toolName: "generate_volcengine_cloned_voice",
			stdout: JSON.stringify({
				status: "completed",
				results: [
					{
						tool: "generate_volcengine_cloned_voice",
						success: false,
						message: "Volcengine request failed: 403",
					},
				],
			}),
			stderr: "",
		});

		expect(result.isError).toBe(true);
		expect(result.structuredContent).toMatchObject({
			status: "completed",
			error: "Volcengine request failed: 403",
			results: [
				{
					tool: "generate_volcengine_cloned_voice",
					success: false,
					message: "Volcengine request failed: 403",
				},
			],
		});
		expect(result.content[0].text).toContain(
			"Codecut generate_volcengine_cloned_voice failed",
		);
	});

	test("keeps template import conflicts as successful MCP preflight readback", () => {
		const result = normalizeCliResult({
			toolName: "check_template_import",
			stdout: JSON.stringify({
				status: "completed",
				results: [
					{
						tool: "check_template_import",
						success: true,
						message: "Template already exists: proof-demo-cut",
						data: {
							canImport: false,
							code: "template-id-conflict",
						},
					},
				],
			}),
			stderr: "",
		});

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent.results[0]).toMatchObject({
			tool: "check_template_import",
			success: true,
			data: {
				canImport: false,
				code: "template-id-conflict",
			},
		});
		expect(result.content[0].text).toContain(
			"Codecut check_template_import completed",
		);
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
