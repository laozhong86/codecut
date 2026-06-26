#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
	createPendingCodecutConfirmation,
	mintCodecutConfirmationToken,
} from "../scripts/codecut-confirmation-gate.mjs";

const execFileAsync = promisify(execFile);
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bridgeEnvFileRelativePath = "apps/web/.env.local";
const bridgeEnvPrefix = "CODECUT_AGENT_BRIDGE_";
const bridgeAllowedEnvKeys = new Set(["RUNNINGHUB_API_KEY"]);
const workspaceResourceMimeType = "text/html;profile=mcp-app";
const codecutServiceStartCommand = "bun run dev:web";
const defaultCodecutReadinessUrl = "http://127.0.0.1:4100/en/projects";
const captionFontOptionsToken = "<!-- CODECUT_CAPTION_FONT_OPTIONS -->";

const projectIdSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Codecut executor project ID.");
const confirmationTokenSchema = z
	.string()
	.trim()
	.min(1)
	.describe(
		"Confirmed CodeCut setup token returned by submit_codecut_setup. Required for side-effect tools.",
	);
const confirmationTokenInputSchema = {
	confirmationToken: confirmationTokenSchema,
};

const planJsonFileSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Absolute path to an EditPlan JSON file.");
const titleRubricJsonFileSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Absolute path to a title quality rubric JSON file.");
const templateJsonFileSchema = z
	.string()
	.trim()
	.min(1)
	.describe(
		"Absolute path to a confirmed LocalTemplateScript JSON draft file.",
	);
const templateIdSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Exact Codecut system template script ID.");

const verificationJsonFileSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Absolute path to a timeline verification JSON file.");

const filePathSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Absolute path to a local media file.");
const urlSchema = z.string().trim().url().describe("HTTPS media URL.");
const bytesSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Base64-encoded media bytes.");
const fileNameSchema = z.string().trim().min(1);
const mimeTypeSchema = z.string().trim().min(1);

const mediaIdSchema = z.string().trim().min(1).describe("Codecut media ID.");
const coverTitleSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Human-readable project cover title text.");
const coverPromptSchema = z
	.string()
	.trim()
	.min(1)
	.describe(
		"Prompt or design instruction used to create the project cover image.",
	);
const coverStylePresetSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Project cover style preset identifier.");
const languageSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Transcription language code or auto.");
const modelIdSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Local transcription model ID.");
const secondsSchema = z.number().nonnegative();
const targetAspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);
const outputFormatSchema = z.enum(["mp4", "webm"]);
const outputQualitySchema = z.enum(["low", "medium", "high", "very_high"]);
const codecutFontManifest = readCodecutFontManifest();
const codecutCaptionFonts = codecutFontManifest.localFonts;
const captionFontValues = [
	"auto",
	...codecutCaptionFonts.map((font) => font.family),
];
const captionSizeValues = ["small", "medium", "large"];
const captionStylePresetValues = [
	"creator-clean",
	"short-form-bold",
	"black-bar",
	"talking-head-pop",
	"tutorial-clean",
	"documentary-soft",
	"product-punch",
	"lifestyle-warm",
	"cinematic-serif",
	"social-highlight",
	"comment-bubble",
	"minimal-reel",
];
const captionMotionPresetValues = ["slam-in", "soft-reveal", "pop-bounce"];
const transitionTypeValues = [
	"fade",
	"dissolve",
	"wipe-left",
	"wipe-right",
	"wipe-up",
	"wipe-down",
	"slide-left",
	"slide-right",
	"slide-up",
	"slide-down",
	"zoom-in",
	"zoom-out",
];
const transitionPreferenceValues = ["auto", "none", ...transitionTypeValues];
const transitionTypeSchema = z.enum(transitionTypeValues);
const captionFontSchema = z.enum(captionFontValues);
const captionSizeSchema = z.enum(captionSizeValues);
const captionStylePresetSchema = z.enum(captionStylePresetValues);
const captionMotionPresetSchema = z.enum(captionMotionPresetValues);
const transitionPreferenceSchema = z.enum(transitionPreferenceValues);
const durationGoalModeSchema = z.enum(["auto", "custom"]);
const durationGoalRangeSecondsSchema = z
	.object({
		minSeconds: z.number().positive(),
		maxSeconds: z.number().positive(),
	})
	.strict();

const workspaceMediaSourceSchema = z
	.object({
		kind: z.enum(["filePath", "url", "directoryPath"]),
		filePath: z.string().trim().optional(),
		directoryPath: z.string().trim().optional(),
		url: z.string().trim().optional(),
		mimeType: z.string().trim().optional(),
	})
	.strict();
const workspaceMediaSourcesSchema = z.array(workspaceMediaSourceSchema);

const workspaceOutputSchema = z
	.object({
		format: outputFormatSchema,
		quality: outputQualitySchema,
		includeAudio: z.boolean(),
		captionFont: captionFontSchema,
		captionSize: captionSizeSchema,
		captionStylePreset: captionStylePresetSchema,
	})
	.strict();

const workspaceIntentInputSchema = {
	pendingConfirmationId: z.string().trim().optional(),
	projectId: z.string().trim(),
	projectName: z.string().trim(),
	mediaSource: workspaceMediaSourceSchema.optional(),
	mediaSources: workspaceMediaSourcesSchema.optional(),
	targetAspectRatio: targetAspectRatioSchema,
	durationGoalMode: durationGoalModeSchema,
	durationGoalRangeSeconds: durationGoalRangeSecondsSchema.optional(),
	captionLanguage: z.string().trim(),
	transitionPreference: transitionPreferenceSchema,
	output: workspaceOutputSchema,
	generateIntroCover: z.boolean(),
	requirements: z.string(),
};

const workspaceOpenInputSchema = {
	projectName: z.string().trim().optional(),
	requirements: z.string().optional(),
	filePath: z.string().trim().optional(),
	mediaPath: z.string().trim().optional(),
	mediaPaths: z.array(z.string().trim().min(1)).optional(),
	directoryPath: z.string().trim().optional(),
	directoryPaths: z.array(z.string().trim().min(1)).optional(),
	url: z.string().trim().optional(),
	mimeType: z.string().trim().optional(),
	mediaSources: workspaceMediaSourcesSchema.optional(),
	requirementOptions: z.array(z.string().trim().min(1)).optional(),
	recommendedRequirementOptions: z.array(z.string().trim().min(1)).optional(),
	targetAspectRatio: targetAspectRatioSchema.optional(),
	durationGoalMode: durationGoalModeSchema.optional(),
	durationGoalRangeSeconds: durationGoalRangeSecondsSchema.optional(),
	captionLanguage: z.string().trim().optional(),
	transitionPreference: transitionPreferenceSchema.optional(),
	locale: z.string().trim().optional(),
	uiLanguage: z.string().trim().optional(),
	output: workspaceOutputSchema.partial().optional(),
	generateIntroCover: z.boolean().optional(),
};

const projectOnlyInputSchema = {
	projectId: projectIdSchema,
};

const planFileInputSchema = {
	projectId: projectIdSchema,
	planJsonFile: planJsonFileSchema,
};

const transcribeInputSchema = {
	projectId: projectIdSchema,
	mediaId: mediaIdSchema,
	language: languageSchema,
	modelId: modelIdSchema,
};

const timelineWindowInputSchema = {
	startTime: secondsSchema.optional(),
	endTime: secondsSchema.optional(),
};

const inspectTimelineInputSchema = {
	projectId: projectIdSchema,
	startTime: secondsSchema,
	endTime: secondsSchema.optional(),
	frameCount: z.number().int().min(1).max(16).optional(),
};

const videoQualityReportInputSchema = {
	projectId: projectIdSchema,
	planJsonFile: planJsonFileSchema,
	startTime: secondsSchema,
	endTime: secondsSchema,
	frameCount: z.number().int().min(1).max(16),
	titleRubricJsonFile: titleRubricJsonFileSchema.optional(),
	outputFile: z
		.string()
		.trim()
		.min(1)
		.describe("Absolute path to an already exported local video file to probe.")
		.optional(),
	outputFormat: outputFormatSchema.optional(),
	includeAudio: z.boolean().optional(),
};

const transcriptInputSchema = {
	projectId: projectIdSchema,
	granularity: z.enum(["segment", "word"]),
	language: languageSchema,
	modelId: modelIdSchema,
	...timelineWindowInputSchema,
	includeFrames: z.boolean().optional(),
};

const rippleDeleteRangeSchema = z
	.object({
		startTime: secondsSchema,
		endTime: secondsSchema,
	})
	.strict()
	.refine(
		(range) => range.endTime > range.startTime,
		"range endTime must be greater than range startTime",
	);

const rippleDeleteScopeSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("timeline") }).strict(),
	z.object({ type: z.literal("track"), trackId: z.string().min(1) }).strict(),
	z
		.object({ type: z.literal("element"), elementId: z.string().min(1) })
		.strict(),
]);

const transformSchema = z
	.object({
		scale: z.number().positive(),
		position: z.object({ x: z.number(), y: z.number() }).strict(),
		rotate: z.number(),
		flipX: z.boolean().optional(),
		flipY: z.boolean().optional(),
	})
	.strict();

const clipPropertiesSchema = z
	.object({
		duration: z.number().positive().optional(),
		trimStart: secondsSchema.optional(),
		trimEnd: secondsSchema.optional(),
		opacity: z.number().min(0).max(1).optional(),
		volume: z.number().min(0).max(1).optional(),
		muted: z.boolean().optional(),
		hidden: z.boolean().optional(),
		playbackRate: z.number().positive().optional(),
		transform: transformSchema.optional(),
		content: z.string().optional(),
		fontSize: z.number().positive().optional(),
		fontFamily: z.string().min(1).optional(),
		color: z.string().min(1).optional(),
		backgroundColor: z.string().min(1).optional(),
		textAlign: z.enum(["left", "center", "right"]).optional(),
		fontWeight: z.enum(["normal", "bold"]).optional(),
		fontStyle: z.enum(["normal", "italic"]).optional(),
		textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
	})
	.strict();

const textStrokeSchema = z
	.object({
		color: z.string().min(1),
		width: z.number().nonnegative(),
	})
	.strict();

const textShadowSchema = z
	.object({
		color: z.string().min(1),
		blur: z.number().nonnegative(),
		offsetX: z.number(),
		offsetY: z.number(),
	})
	.strict();

const textEntrySchema = z
	.object({
		startTime: secondsSchema,
		duration: z.number().positive(),
		content: z.string().min(1),
		name: z.string().min(1).optional(),
		transform: transformSchema.optional(),
		opacity: z.number().min(0).max(1).optional(),
		fontSize: z.number().positive().optional(),
		fontFamily: z.string().min(1).optional(),
		color: z.string().min(1).optional(),
		backgroundColor: z.string().min(1).optional(),
		textAlign: z.enum(["left", "center", "right"]).optional(),
		fontWeight: z.enum(["normal", "bold"]).optional(),
		fontStyle: z.enum(["normal", "italic"]).optional(),
		textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
		boxWidth: z.number().positive().optional(),
		stroke: textStrokeSchema.optional(),
		shadow: textShadowSchema.optional(),
		backgroundOpacity: z.number().min(0).max(1).optional(),
		backgroundPaddingX: z.number().nonnegative().optional(),
		backgroundPaddingY: z.number().nonnegative().optional(),
		backgroundBorderRadius: z.number().nonnegative().optional(),
	})
	.strict();

const captionStyleSchema = z
	.object({
		preset: captionStylePresetSchema,
		position: z.enum(["lower-safe", "center"]),
		motionPreset: captionMotionPresetSchema.optional(),
	})
	.strict();
const protectedTermsSchema = z.array(z.string().trim().min(1)).optional();

const keyframeInterpolationSchema = z.enum(["linear", "hold"]);
const scalarKeyframeSchema = z
	.object({
		time: secondsSchema,
		value: z.number(),
		interpolation: keyframeInterpolationSchema.optional(),
	})
	.strict();
const positionKeyframeSchema = z
	.object({
		time: secondsSchema,
		value: z.object({ x: z.number(), y: z.number() }).strict(),
		interpolation: keyframeInterpolationSchema.optional(),
	})
	.strict();
const keyframePropertySchema = z.enum([
	"opacity",
	"transform.position",
	"transform.scale",
	"transform.rotate",
]);

export const CODECUT_TOOL_GOVERNANCE_CATEGORIES = Object.freeze({
	EVIDENCE_READ: "evidence_read",
	PLAN_EXECUTION: "plan_execution",
	ADVANCED_REPAIR: "advanced_repair",
	ASSET_SIDE_EFFECT: "asset_side_effect",
	EXTERNAL_SIDE_EFFECT: "external_side_effect",
});

const codecutToolGovernanceCategoryByName = new Map([
	["get_project_info", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ],
	["list_media_assets", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ],
	["transcribe_media", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ],
	["build_video_context", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ],
	["build_visual_context", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ],
	["inspect_video_range", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ],
	["inspect_timeline", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ],
	[
		"build_video_quality_report",
		CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ,
	],
	["get_transcript", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ],
	[
		"build_caption_diagnostics",
		CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ,
	],
	["build_post_cut_captions", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ],
	["list_models", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ],
	["search_media", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ],
	["get_timeline_state", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EVIDENCE_READ],
	["validate_edit_plan", CODECUT_TOOL_GOVERNANCE_CATEGORIES.PLAN_EXECUTION],
	["preview_edit_plan", CODECUT_TOOL_GOVERNANCE_CATEGORIES.PLAN_EXECUTION],
	["apply_edit_plan", CODECUT_TOOL_GOVERNANCE_CATEGORIES.PLAN_EXECUTION],
	[
		"apply_narrated_remix_plan",
		CODECUT_TOOL_GOVERNANCE_CATEGORIES.PLAN_EXECUTION,
	],
	["verify_timeline", CODECUT_TOOL_GOVERNANCE_CATEGORIES.PLAN_EXECUTION],
	["add_texts", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR],
	["add_captions", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR],
	["insert_clips", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR],
	["move_clips", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR],
	["remove_clips", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR],
	["split_clip", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR],
	["set_clip_properties", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR],
	["set_keyframes", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR],
	["add_transitions", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR],
	["update_transition", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR],
	["remove_transition", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR],
	["ripple_delete_ranges", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR],
	[
		"create_text_background_effect",
		CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR,
	],
	[
		"create_human_pip_effect",
		CODECUT_TOOL_GOVERNANCE_CATEGORIES.ADVANCED_REPAIR,
	],
	["import_media", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ASSET_SIDE_EFFECT],
	["set_project_cover", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ASSET_SIDE_EFFECT],
	["clear_project_cover", CODECUT_TOOL_GOVERNANCE_CATEGORIES.ASSET_SIDE_EFFECT],
	[
		"import_system_template_script",
		CODECUT_TOOL_GOVERNANCE_CATEGORIES.ASSET_SIDE_EFFECT,
	],
	[
		"update_system_template_script",
		CODECUT_TOOL_GOVERNANCE_CATEGORIES.ASSET_SIDE_EFFECT,
	],
	[
		"delete_system_template_script",
		CODECUT_TOOL_GOVERNANCE_CATEGORIES.ASSET_SIDE_EFFECT,
	],
	["export_project", CODECUT_TOOL_GOVERNANCE_CATEGORIES.EXTERNAL_SIDE_EFFECT],
	[
		"generate_digital_human",
		CODECUT_TOOL_GOVERNANCE_CATEGORIES.EXTERNAL_SIDE_EFFECT,
	],
	[
		"generate_runninghub_voice_design",
		CODECUT_TOOL_GOVERNANCE_CATEGORIES.EXTERNAL_SIDE_EFFECT,
	],
	[
		"generate_runninghub_voice_clone",
		CODECUT_TOOL_GOVERNANCE_CATEGORIES.EXTERNAL_SIDE_EFFECT,
	],
]);

export const DESTRUCTIVE_MCP_TOOL_NAMES = new Set([
	"apply_edit_plan",
	"apply_narrated_remix_plan",
	"import_system_template_script",
	"update_system_template_script",
	"delete_system_template_script",
	"create_text_background_effect",
	"create_human_pip_effect",
	"generate_digital_human",
	"generate_runninghub_voice_design",
	"generate_runninghub_voice_clone",
	"export_project",
]);

export const CODECUT_MCP_TOOLS = [
	{
		name: "get_project_info",
		title: "Get Codecut Project Info",
		description:
			"Read project metadata from the Codecut local executor for one explicit project ID.",
		inputSchema: projectOnlyInputSchema,
		readOnly: true,
	},
	{
		name: "list_media_assets",
		title: "List Codecut Media Assets",
		description:
			"List media assets currently available in one explicit Codecut executor project.",
		inputSchema: projectOnlyInputSchema,
		readOnly: true,
	},
	{
		name: "import_media",
		title: "Import Codecut Media",
		description:
			"Import one local media file, HTTPS URL, or base64 payload into one explicit Codecut executor project.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			filePath: filePathSchema.optional(),
			url: urlSchema.optional(),
			bytes: bytesSchema.optional(),
			fileName: fileNameSchema.optional(),
			mimeType: mimeTypeSchema.optional(),
			lastModified: z.number().optional(),
			duration: z.number().positive().optional(),
			width: z.number().positive().optional(),
			height: z.number().positive().optional(),
		},
		readOnly: false,
	},
	{
		name: "set_project_cover",
		title: "Set Codecut Project Cover",
		description:
			"Set or replace the independent project cover poster from one imported image media asset. This does not add a timeline frame or change exported video duration.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			mediaId: mediaIdSchema,
			title: coverTitleSchema.optional(),
			prompt: coverPromptSchema.optional(),
			stylePreset: coverStylePresetSchema.optional(),
		},
		readOnly: false,
	},
	{
		name: "clear_project_cover",
		title: "Clear Codecut Project Cover",
		description:
			"Clear the independent project cover poster without mutating timeline tracks or exported video duration.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
		},
		readOnly: false,
	},
	{
		name: "transcribe_media",
		title: "Transcribe Codecut Media",
		description:
			"Transcribe one imported video or audio asset through the Codecut local executor.",
		inputSchema: transcribeInputSchema,
		readOnly: true,
	},
	{
		name: "build_video_context",
		title: "Build Codecut Video Context",
		description:
			"Build a VideoContext for one imported media asset through the Codecut local executor.",
		inputSchema: transcribeInputSchema,
		readOnly: true,
	},
	{
		name: "build_visual_context",
		title: "Build Codecut Visual Context",
		description:
			"Build visual evidence for one imported video asset through the Codecut local executor.",
		inputSchema: {
			projectId: projectIdSchema,
			mediaId: mediaIdSchema,
			targetAspectRatio: z.enum(["9:16", "16:9", "1:1"]),
		},
		readOnly: true,
	},
	{
		name: "inspect_video_range",
		title: "Inspect Codecut Video Range",
		description:
			"Extract and inspect frames for one video time range through the Codecut local executor.",
		inputSchema: {
			projectId: projectIdSchema,
			mediaId: mediaIdSchema,
			startSeconds: secondsSchema,
			endSeconds: secondsSchema,
			frameCount: z.number().int().min(1).max(16).optional(),
		},
		readOnly: true,
	},
	{
		name: "inspect_timeline",
		title: "Inspect Codecut Timeline",
		description:
			"Render sampled composited timeline frames without exporting a full video.",
		inputSchema: inspectTimelineInputSchema,
		readOnly: true,
	},
	{
		name: "build_video_quality_report",
		title: "Build Codecut Video Quality Report",
		description:
			"Validate one EditPlan against current timeline readback, caption_quality, optional title_quality, optional export probe, optional audio presence, and sampled timeline frames without mutating timeline state.",
		inputSchema: videoQualityReportInputSchema,
		readOnly: true,
	},
	{
		name: "get_transcript",
		title: "Get Codecut Timeline Transcript",
		description:
			"Read segment-level or word-level transcript mapped onto the currently edited timeline. Use word granularity for filler, dead-air, retake, and repeated-word cleanup. Word mode requires real word timestamps and fails instead of falling back to segment estimates.",
		inputSchema: transcriptInputSchema,
		readOnly: true,
	},
	{
		name: "build_caption_diagnostics",
		title: "Build Codecut Caption Diagnostics",
		description:
			"Build a read-only caption diagnostics report before caption generation. Reports transcription failures, skipped timeline clips, caption readability issues, confidence availability or low-confidence items, existing editable subtitles, and burned-subtitle risk as unverified visual evidence.",
		inputSchema: {
			projectId: projectIdSchema,
			language: languageSchema,
			modelId: modelIdSchema,
			captionStyle: captionStyleSchema,
		},
		readOnly: true,
	},
	{
		name: "build_post_cut_captions",
		title: "Build Codecut Post-Cut Captions",
		description:
			"Build caption data from the currently edited timeline without mutating the timeline.",
		inputSchema: {
			projectId: projectIdSchema,
			language: languageSchema,
			modelId: modelIdSchema,
		},
		readOnly: true,
	},
	{
		name: "list_models",
		title: "List Codecut Models",
		description:
			"List the model contracts currently callable through the Codecut local executor.",
		inputSchema: {
			projectId: projectIdSchema,
			type: z.enum(["transcription", "digital_human"]).optional(),
		},
		readOnly: true,
	},
	{
		name: "search_media",
		title: "Search Codecut Media",
		description:
			"Search media metadata and cached spoken transcript segments without running implicit indexing.",
		inputSchema: {
			projectId: projectIdSchema,
			query: z.string().trim().min(1),
			scope: z.enum(["metadata", "spoken", "both"]).optional(),
			mediaId: mediaIdSchema.optional(),
			limit: z.number().int().positive().optional(),
		},
		readOnly: true,
	},
	{
		name: "import_system_template_script",
		title: "Import Codecut System Template Script",
		description:
			"Import one user-confirmed reference-derived template draft into the Codecut system template library used by Templates UI and future Codex planning context.",
		inputSchema: {
			projectId: projectIdSchema,
			templateJsonFile: templateJsonFileSchema,
			confirmedByUser: z
				.literal(true)
				.describe(
					"Must be true only after the user explicitly confirmed this exact template draft for import.",
				),
		},
		readOnly: false,
	},
	{
		name: "update_system_template_script",
		title: "Update Codecut System Template Script",
		description:
			"Update one user-confirmed Codecut system template script in place from a strict LocalTemplateScript JSON file with the same template ID.",
		inputSchema: {
			projectId: projectIdSchema,
			templateJsonFile: templateJsonFileSchema,
			confirmedByUser: z
				.literal(true)
				.describe(
					"Must be true only after the user explicitly confirmed updating this exact system template.",
				),
		},
		readOnly: false,
	},
	{
		name: "delete_system_template_script",
		title: "Delete Codecut System Template Script",
		description:
			"Delete one user-confirmed Codecut system template script from the Templates UI library for explicit cleanup or removal.",
		inputSchema: {
			projectId: projectIdSchema,
			templateId: templateIdSchema,
			confirmedByUser: z
				.literal(true)
				.describe(
					"Must be true only after the user explicitly confirmed deleting this exact system template.",
				),
		},
		readOnly: false,
	},
	{
		name: "validate_edit_plan",
		title: "Validate Codecut EditPlan",
		description:
			"Validate one existing EditPlan JSON file without mutating the timeline.",
		inputSchema: planFileInputSchema,
		readOnly: true,
	},
	{
		name: "preview_edit_plan",
		title: "Preview Codecut EditPlan",
		description:
			"Preview one existing EditPlan JSON file without mutating the timeline.",
		inputSchema: planFileInputSchema,
		readOnly: true,
	},
	{
		name: "apply_edit_plan",
		title: "Apply Codecut EditPlan",
		description:
			"Apply one existing EditPlan JSON file to one explicit Codecut executor project.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			planJsonFile: planJsonFileSchema,
			replaceExisting: z
				.boolean()
				.describe("Whether Codecut should replace the existing timeline."),
		},
		readOnly: false,
	},
	{
		name: "apply_narrated_remix_plan",
		title: "Apply Codecut Narrated Remix Plan",
		description:
			"Apply one existing NarratedRemixPlan JSON file to one explicit Codecut executor project.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			planJsonFile: planJsonFileSchema,
			replaceExisting: z
				.boolean()
				.describe("Whether Codecut should replace the existing timeline."),
		},
		readOnly: false,
	},
	{
		name: "add_texts",
		title: "Add Codecut Texts",
		description:
			"Add one or more text elements to an existing or newly created text track.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			trackId: z.string().min(1).optional(),
			entries: z.array(textEntrySchema).min(1),
		},
		readOnly: false,
	},
	{
		name: "add_captions",
		title: "Add Codecut Captions",
		description:
			"Transcribe the edited timeline audio and add segment-level captions as text elements.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			language: languageSchema,
			modelId: modelIdSchema,
			captionStyle: captionStyleSchema.optional(),
		},
		readOnly: false,
	},
	{
		name: "insert_clips",
		title: "Insert Codecut Clips",
		description:
			"Insert one or more media clips into an existing track and ripple later elements on that track.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			trackId: z.string().min(1),
			atTime: secondsSchema,
			clips: z
				.array(
					z
						.object({
							mediaId: mediaIdSchema,
							duration: z.number().positive(),
							trimStart: secondsSchema.optional(),
							trimEnd: secondsSchema.optional(),
							playbackRate: z.number().positive().optional(),
							name: z.string().min(1).optional(),
						})
						.strict(),
				)
				.min(1),
		},
		readOnly: false,
	},
	{
		name: "move_clips",
		title: "Move Codecut Clips",
		description:
			"Move clips by stable element ID to another track and/or start time.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			moves: z
				.array(
					z
						.object({
							elementId: z.string().min(1),
							toTrackId: z.string().min(1).optional(),
							startTime: secondsSchema.optional(),
						})
						.strict(),
				)
				.min(1),
		},
		readOnly: false,
	},
	{
		name: "remove_clips",
		title: "Remove Codecut Clips",
		description: "Remove clips by stable element ID without ripple.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			elementIds: z.array(z.string().min(1)).min(1),
		},
		readOnly: false,
	},
	{
		name: "split_clip",
		title: "Split Codecut Clip",
		description: "Split one clip by element ID at a timeline time.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			elementId: z.string().min(1),
			atTime: secondsSchema,
		},
		readOnly: false,
	},
	{
		name: "set_clip_properties",
		title: "Set Codecut Clip Properties",
		description: "Set whitelisted clip properties by stable element ID.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			elementId: z.string().min(1),
			properties: clipPropertiesSchema,
		},
		readOnly: false,
	},
	{
		name: "set_keyframes",
		title: "Set Codecut Keyframes",
		description:
			"Replace or clear keyframes for one whitelisted element property.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			elementId: z.string().min(1),
			property: keyframePropertySchema,
			keyframes: z.array(
				z.union([scalarKeyframeSchema, positionKeyframeSchema]),
			),
		},
		readOnly: false,
	},
	{
		name: "add_transitions",
		title: "Add Codecut Transitions",
		description:
			"Add native timeline transitions between adjacent visual elements on video tracks. This does not move clips, create keyframes, or downgrade transition requests to animation.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			entries: z
				.array(
					z
						.object({
							trackId: z.string().min(1),
							fromElementId: z.string().min(1),
							toElementId: z.string().min(1),
							type: transitionTypeSchema,
							duration: z.number().positive(),
						})
						.strict(),
				)
				.min(1),
		},
		readOnly: false,
	},
	{
		name: "update_transition",
		title: "Update Codecut Transition",
		description:
			"Update one existing native timeline transition by trackId and transitionId. At least one of type or duration is required.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			trackId: z.string().min(1),
			transitionId: z.string().min(1),
			type: transitionTypeSchema.optional(),
			duration: z.number().positive().optional(),
		},
		readOnly: false,
	},
	{
		name: "remove_transition",
		title: "Remove Codecut Transition",
		description:
			"Remove one existing native timeline transition by trackId and transitionId.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			trackId: z.string().min(1),
			transitionId: z.string().min(1),
		},
		readOnly: false,
	},
	{
		name: "ripple_delete_ranges",
		title: "Ripple Delete Codecut Ranges",
		description:
			"Delete timeline second ranges with an explicit scope and ripple only the scoped target. Bare ranges without explicit scope are invalid.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			scope: rippleDeleteScopeSchema,
			ranges: z.array(rippleDeleteRangeSchema).min(1),
		},
		readOnly: false,
	},
	{
		name: "create_text_background_effect",
		title: "Create Codecut Text Background Effect",
		description:
			"Create a text-background masked effect through the Codecut local executor.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			sourceMediaId: mediaIdSchema,
			derivedAssetId: z.string().trim().min(1),
			content: z.string().trim().min(1),
			startTime: secondsSchema,
			duration: z.number().positive(),
			replaceExisting: z.boolean(),
		},
		readOnly: false,
	},
	{
		name: "create_human_pip_effect",
		title: "Create Codecut Human PIP Effect",
		description:
			"Create a human picture-in-picture masked effect through the Codecut local executor.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			foregroundMediaId: mediaIdSchema,
			backgroundMediaId: mediaIdSchema,
			derivedAssetId: z.string().trim().min(1),
			placement: z.string().trim().min(1),
			scale: z.number().positive(),
			startTime: secondsSchema,
			duration: z.number().positive(),
			replaceExisting: z.boolean(),
		},
		readOnly: false,
	},
	{
		name: "generate_digital_human",
		title: "Generate Codecut Digital Human",
		description:
			"Generate a digital human media asset through the Codecut local executor.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			imageMediaId: mediaIdSchema,
			audioMediaId: mediaIdSchema,
			scriptText: z.string().trim().min(1),
			motionPrompt: z.string().trim().min(1),
			width: z.number().positive(),
			height: z.number().positive(),
			fps: z.number().positive(),
		},
		readOnly: false,
	},
	{
		name: "generate_runninghub_voice_design",
		title: "Generate RunningHub Voice Design",
		description:
			"Generate a prompt-only RunningHub voice audio asset through the Codecut local executor.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			text: z.string().trim().min(1),
			emotionPrompt: z.string().trim().min(1),
			protectedTerms: protectedTermsSchema,
		},
		readOnly: false,
	},
	{
		name: "generate_runninghub_voice_clone",
		title: "Generate RunningHub Voice Clone",
		description:
			"Generate a RunningHub cloned voice audio asset from one absolute local reference audio path through the Codecut local executor.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			audioPath: filePathSchema,
			text: z.string().trim().min(1),
			protectedTerms: protectedTermsSchema,
		},
		readOnly: false,
	},
	{
		name: "verify_timeline",
		title: "Verify Codecut Timeline",
		description:
			"Verify the current timeline against one verification JSON file.",
		inputSchema: {
			projectId: projectIdSchema,
			verificationJsonFile: verificationJsonFileSchema,
		},
		readOnly: true,
	},
	{
		name: "export_project",
		title: "Export Codecut Project",
		description:
			"Export the current timeline to one explicit local file through the Codecut executor.",
		inputSchema: {
			projectId: projectIdSchema,
			...confirmationTokenInputSchema,
			format: z.enum(["mp4", "webm"]),
			quality: z.enum(["low", "medium", "high", "very_high"]),
			includeAudio: z.boolean(),
			outputFile: z.string().trim().min(1),
			overwrite: z.boolean(),
		},
		readOnly: false,
	},
	{
		name: "get_timeline_state",
		title: "Get Codecut Timeline State",
		description:
			"Read the canonical current timeline state from one explicit Codecut executor project.",
		inputSchema: {
			projectId: projectIdSchema,
			...timelineWindowInputSchema,
			includeFrames: z.boolean().optional(),
			includeReferencedMedia: z.boolean().optional(),
		},
		readOnly: true,
	},
].map((tool) => {
	const governanceCategory = codecutToolGovernanceCategoryByName.get(tool.name);
	if (!governanceCategory) {
		throw new Error(
			`Missing Codecut MCP tool governance category: ${tool.name}`,
		);
	}
	return {
		...tool,
		governanceCategory,
	};
});

function workspaceResourceContentVersion() {
	return createHash("sha256")
		.update(readFileSync(resolve(pluginRoot, "mcp", "codecut-workspace.html"), "utf8"))
		.digest("hex")
		.slice(0, 12);
}

export const CODECUT_WORKSPACE_RESOURCE_URI = `ui://codecut/${pluginVersion()}/workspace-${workspaceResourceContentVersion()}.html`;
export const CODECUT_WORKSPACE_LEGACY_RESOURCE_URI = `ui://codecut/${pluginVersion()}/workspace.html`;

const codecutWorkspaceResourceMeta = {
	ui: {
		resourceUri: CODECUT_WORKSPACE_RESOURCE_URI,
		prefersBorder: true,
		csp: {
			connectDomains: [],
			resourceDomains: [],
		},
	},
	"openai/widgetDescription":
		"Confirm CodeCut project setup, validate the local executor, import media, and continue the editing chain.",
	"openai/widgetPrefersBorder": true,
	"openai/widgetCSP": {
		connect_domains: [],
		resource_domains: [],
		redirect_domains: ["http://127.0.0.1:4100"],
	},
};

const codecutWorkspaceToolMeta = {
	ui: {
		resourceUri: CODECUT_WORKSPACE_RESOURCE_URI,
		visibility: ["model", "app"],
	},
	"openai/outputTemplate": CODECUT_WORKSPACE_RESOURCE_URI,
	"openai/widgetAccessible": true,
	"openai/toolInvocation/invoking": "Opening CodeCut workspace setup...",
	"openai/toolInvocation/invoked": "CodeCut workspace setup ready.",
};

const codecutWorkspaceAppOnlyMeta = {
	ui: {
		visibility: ["app"],
	},
	"openai/widgetAccessible": true,
};

export const CODECUT_WORKSPACE_TOOLS = [
	{
		name: "open_codecut_workspace",
		title: "Open CodeCut Workspace Setup",
		description:
			"Render a CodeCut setup confirmation widget with editable intent fields. Requires local CodeCut web service readiness before rendering the widget. Use exactly one source input style: either mediaSources for mixed file, folder, or URL sources; mediaPaths and/or directoryPaths for resolved local paths; or one of filePath, mediaPath, directoryPath, or url for a single source. Do not combine mediaSources with mediaPaths or directoryPaths. Put all editing requirements into requirements, create focused requirementOptions for the user's scenario, and put the options that should be selected by default into recommendedRequirementOptions. Keep durationGoalMode auto unless the user explicitly asked for one of the fixed duration ranges. Keep transitionPreference auto unless the user manually chooses a transition animation. Pass uiLanguage or locale to match the user's conversation language; keep captionLanguage for video captions only.",
		inputSchema: workspaceOpenInputSchema,
		readOnly: true,
		modelVisible: true,
		meta: codecutWorkspaceToolMeta,
	},
	{
		name: "inspect_codecut_setup",
		title: "Inspect CodeCut Workspace Setup",
		description:
			"Validate a CodeCut setup intent without creating projects or importing media.",
		inputSchema: workspaceIntentInputSchema,
		readOnly: true,
		modelVisible: false,
		meta: codecutWorkspaceAppOnlyMeta,
	},
	{
		name: "submit_codecut_setup",
		title: "Submit CodeCut Workspace Setup",
		description:
			"Create a CodeCut executor project, import the confirmed media source, and return editor context.",
		inputSchema: workspaceIntentInputSchema,
		readOnly: false,
		modelVisible: false,
		meta: codecutWorkspaceAppOnlyMeta,
	},
];

function readCodecutFontManifest() {
	const manifestPath = resolve(
		pluginRoot,
		"apps/web/src/lib/codecut-fonts.json",
	);
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	if (!manifest || typeof manifest !== "object") {
		throw new Error("CodeCut font manifest must be an object.");
	}
	if (!Array.isArray(manifest.localFonts) || manifest.localFonts.length === 0) {
		throw new Error("CodeCut font manifest must define localFonts.");
	}
	for (const font of manifest.localFonts) {
		if (!font || typeof font !== "object") {
			throw new Error("CodeCut font manifest contains an invalid font.");
		}
		if (typeof font.family !== "string" || font.family.trim() === "") {
			throw new Error("CodeCut font manifest font.family is required.");
		}
		if (typeof font.label !== "string" || font.label.trim() === "") {
			throw new Error("CodeCut font manifest font.label is required.");
		}
	}
	return manifest;
}

function escapeHtmlText(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value) {
	return escapeHtmlText(value).replaceAll('"', "&quot;");
}

function renderCaptionFontOptionsHtml() {
	return codecutCaptionFonts
		.map(
			(font) =>
				`                <option value="${escapeHtmlAttribute(font.family)}">${escapeHtmlText(font.label)}</option>`,
		)
		.join("\n");
}

export async function readCodecutWorkspaceHtml() {
	const html = readFileSync(
		resolve(pluginRoot, "mcp", "codecut-workspace.html"),
		"utf8",
	);
	if (!html.includes(captionFontOptionsToken)) {
		throw new Error("CodeCut workspace font option token is missing.");
	}
	return html.replace(captionFontOptionsToken, renderCaptionFontOptionsHtml());
}

export function openCodecutWorkspace(input = {}) {
	assertNoLegacyWorkspaceOpenFields(input);
	const intentDefaults = buildWorkspaceIntentDefaults(input);
	const pendingConfirmationId = createPendingCodecutConfirmation();
	return {
		content: [
			{
				type: "text",
				text: "Rendered CodeCut workspace setup confirmation widget. Wait for the user to submit the widget before reading files, running shell commands, creating projects, importing media, or mutating timelines.",
			},
		],
		structuredContent: {
			status: "awaiting_user_confirmation",
			nextAction: "wait_for_widget_submission",
			pendingConfirmationId,
			intentDefaults,
		},
		_meta: {
			...codecutWorkspaceToolMeta,
			widgetData: { pendingConfirmationId, intentDefaults },
		},
	};
}

function assertNoLegacyWorkspaceOpenFields(input = {}) {
	const staleFields = [
		"brief",
		"briefOptions",
		"successCriteria",
		"successCriteriaOptions",
	].filter((field) => Object.prototype.hasOwnProperty.call(input, field));
	if (staleFields.length) {
		throw new Error(
			`stale CodeCut workspace schema: ${staleFields.join(", ")} were removed. Use requirements, requirementOptions, and recommendedRequirementOptions from a fresh Codex session.`,
		);
	}
}

function buildCodecutServiceBlockedResult({ readinessUrl, error }) {
	const verifyCommand = `curl -fsS -o /dev/null ${readinessUrl}`;
	return {
		content: [
			{
				type: "text",
				text: `P0 blocked: Codecut web service is not available on ${readinessUrl}. Start it with \`${codecutServiceStartCommand}\`, then verify with \`${verifyCommand}\` before opening the setup widget.`,
			},
		],
		structuredContent: {
			status: "service_unavailable",
			nextAction: "start_codecut_web_service",
			startCommand: codecutServiceStartCommand,
			verifyCommand,
			readinessUrl,
			error,
		},
		isError: true,
	};
}

async function assertCodecutServiceReady({
	cwd = pluginRoot,
	env = process.env,
	fetchImpl = fetch,
} = {}) {
	const bridgeEnv = buildBridgeProcessEnv({ cwd, env });
	const baseUrl = bridgeEnv.CODECUT_AGENT_BRIDGE_URL;
	const readinessUrl = baseUrl
		? `${baseUrl.replace(/\/$/, "")}/en/projects`
		: defaultCodecutReadinessUrl;
	if (!baseUrl) {
		return buildCodecutServiceBlockedResult({
			readinessUrl,
			error:
				"CODECUT_AGENT_BRIDGE_URL is required before opening CodeCut workspace.",
		});
	}

	try {
		const response = await fetchImpl(readinessUrl);
		if (!response.ok) {
			return buildCodecutServiceBlockedResult({
				readinessUrl,
				error: `Codecut web service returned ${response.status}`,
			});
		}
		return null;
	} catch (error) {
		return buildCodecutServiceBlockedResult({
			readinessUrl,
			error: `Codecut web service is not reachable: ${error instanceof Error ? error.message : String(error)}`,
		});
	}
}

export async function inspectCodecutSetup(intent, _options = {}) {
	return validateCodecutSetupIntent(intent);
}

async function validateCodecutSetupIntent(intent) {
	const checks = [];
	const normalized = normalizeWorkspaceIntent(intent || {});

	pushCheck(
		checks,
		"project-id",
		"Project ID",
		/^[a-z0-9][a-z0-9-]{2,63}$/.test(normalized.projectId),
		"Use 3-64 lowercase letters, numbers, and hyphens, starting with a letter or number.",
	);
	pushCheck(
		checks,
		"project-name",
		"Project name",
		normalized.projectName.length > 0,
		"Project name is required.",
	);
	pushCheck(
		checks,
		"requirements",
		"Requirements",
		normalized.requirements.length > 0,
		"Editing requirements are required.",
	);

	const mediaSourceCheck = validateWorkspaceMediaSources(
		normalized.mediaSources,
	);
	pushCheck(
		checks,
		"media-sources",
		"Media sources",
		mediaSourceCheck.ok,
		mediaSourceCheck.message,
	);

	pushCheck(
		checks,
		"aspect-ratio",
		"Aspect ratio",
		["9:16", "16:9", "1:1"].includes(normalized.targetAspectRatio),
		"Target aspect ratio must be 9:16, 16:9, or 1:1.",
	);
	pushCheck(
		checks,
		"duration",
		"Duration",
		normalized.durationGoalMode === "auto" ||
			(normalized.durationGoalMode === "custom" &&
				isValidDurationGoalRange(normalized.durationGoalRangeSeconds)),
		"Duration goal must be automatic or a valid positive seconds range.",
	);
	pushCheck(
		checks,
		"generate-intro-cover",
		"Intro cover",
		typeof normalized.generateIntroCover === "boolean",
		"Choose whether CodeCut should generate an opening cover image.",
	);
	pushCheck(
		checks,
		"transition-preference",
		"Transition animation",
		transitionPreferenceValues.includes(normalized.transitionPreference),
		"Transition animation must be auto, none, or a supported CodeCut transition type.",
	);
	pushCheck(
		checks,
		"caption-font",
		"Caption font",
		captionFontValues.includes(normalized.output.captionFont),
		"Caption font must be auto or a CodeCut local font.",
	);
	pushCheck(
		checks,
		"caption-size",
		"Caption size",
		captionSizeValues.includes(normalized.output.captionSize),
		"Caption size must be small, medium, or large.",
	);
	pushCheck(
		checks,
		"caption-style-preset",
		"Caption style preset",
		captionStylePresetValues.includes(normalized.output.captionStylePreset),
		"Caption style preset must be a supported CodeCut caption preset.",
	);

	return {
		status: checks.every((check) => check.ok) ? "ready" : "blocked",
		checks,
		intent: normalized,
	};
}

export async function submitCodecutSetup(
	intent,
	{
		bridgeToolImpl = callBridgeCliTool,
		statImpl = stat,
		confirmationRoot,
	} = {},
) {
	const inspection = await validateCodecutSetupIntent(intent);
	if (inspection.status !== "ready") {
		return {
			content: [
				{
					type: "text",
					text: "CodeCut workspace setup is blocked by validation errors.",
				},
			],
			structuredContent: inspection,
			isError: true,
		};
	}

	const normalized = inspection.intent;
	if (!normalized.pendingConfirmationId) {
		return buildSetupErrorResult({
			status: "confirmation_required",
			nextAction: "open_codecut_workspace",
			intent: normalized,
			error:
				"pendingConfirmationId from open_codecut_workspace is required before setup submission.",
		});
	}
	const confirmationToken = await mintCodecutConfirmationToken({
		root: confirmationRoot,
		projectId: normalized.projectId,
		pendingConfirmationId: normalized.pendingConfirmationId,
	});
	const createdResult = await bridgeToolImpl("create_project", {
		projectId: normalized.projectId,
		name: normalized.projectName,
		confirmationToken,
	});
	if (createdResult?.isError) {
		return buildSetupErrorResult({
			status: "create_failed",
			projectId: normalized.projectId,
			projectName: normalized.projectName,
			intent: normalized,
			error: extractErrorMessage(createdResult),
		});
	}

	const createdProject = extractProjectInfo(
		createdResult?.structuredContent || createdResult,
	);
	const projectContext = {
		projectId: createdProject.projectId || normalized.projectId,
		projectName: createdProject.name || normalized.projectName,
		revision: createdProject.revision,
		editorUrl: createdProject.editorUrl,
	};

	const importedMedia = [];
	const { importableMediaSources, deferredMediaSources } =
		await collectSetupMediaSourcesForImport(normalized.mediaSources, statImpl);
	for (const { index, mediaSource } of importableMediaSources) {
		const importResult = await bridgeToolImpl(
			"import_media",
			buildImportMediaArgs({
				projectId: projectContext.projectId,
				mediaSource,
				confirmationToken,
			}),
		);
		if (importResult?.isError) {
			return buildSetupErrorResult({
				status: "import_failed",
				...projectContext,
				importedMedia,
				failedMediaSourceIndex: index,
				intent: normalized,
				error: extractErrorMessage(importResult),
			});
		}

		const importedAsset = extractImportedMedia(
			importResult?.structuredContent || importResult,
		);
		if (!importedAsset) {
			return buildSetupErrorResult({
				status: "import_failed",
				...projectContext,
				importedMedia,
				failedMediaSourceIndex: index,
				intent: normalized,
				error: "import_media did not return an imported media asset.",
			});
		}
		importedMedia.push(importedAsset);
	}

	const projectInfoResult = await bridgeToolImpl("get_project_info", {
		projectId: projectContext.projectId,
	});
	if (projectInfoResult?.isError) {
		return buildSetupErrorResult({
			status: "readback_failed",
			...projectContext,
			importedMedia,
			deferredMediaSources,
			intent: normalized,
			error: extractErrorMessage(projectInfoResult),
		});
	}

	const latestProject = extractProjectInfo(
		projectInfoResult?.structuredContent || projectInfoResult,
	);
	if (latestProject.revision === undefined) {
		return buildSetupErrorResult({
			status: "readback_failed",
			...projectContext,
			importedMedia,
			deferredMediaSources,
			intent: normalized,
			error: "get_project_info did not return the latest project revision.",
		});
	}

	const editorUrl = latestProject.editorUrl || projectContext.editorUrl;
	const resultProjectId = latestProject.projectId || projectContext.projectId;
	const resultProjectName = latestProject.name || projectContext.projectName;
	const resultIntent = {
		...normalized,
		projectId: resultProjectId,
		projectName: resultProjectName,
	};
	const structuredContent = {
		status: "created",
		projectId: resultProjectId,
		projectName: resultProjectName,
		revision: latestProject.revision,
		editorUrl,
		confirmationToken,
		importedMedia,
		deferredMediaSources,
		intent: resultIntent,
		continuePrompt: buildContinuePrompt({
			intent: resultIntent,
			projectId: resultProjectId,
			projectName: resultProjectName,
			revision: latestProject.revision,
			editorUrl,
			confirmationToken,
			importedMedia,
			deferredMediaSources,
		}),
	};

	return {
		content: [
			{
				type: "text",
				text: `CodeCut project ${structuredContent.projectId} created at revision ${structuredContent.revision}.\n\n[Open CodeCut editor](${editorUrl})`,
			},
		],
		structuredContent,
	};
}

function buildWorkspaceIntentDefaults(input = {}) {
	const uiLanguage = normalizeWorkspaceUiLanguage(
		input.uiLanguage || input.locale || "",
	);
	const projectName =
		String(input.projectName || "").trim() ||
		defaultWorkspaceProjectName(uiLanguage);
	const mediaSources = buildWorkspaceOpenMediaSources(input);
	const requirements =
		String(input.requirements || "").trim() ||
		defaultWorkspaceRequirements(uiLanguage);
	const requirementOptions = normalizeWorkspaceOptionList(
		input.requirementOptions,
		defaultWorkspaceRequirementOptions(uiLanguage),
	);
	const recommendedRequirementOptions = normalizeWorkspaceOptionList(
		input.recommendedRequirementOptions,
		[],
	);
	const defaults = {
		projectId:
			String(input.projectId || "").trim() ||
			buildWorkspaceProjectSlug(projectName || "codecut-project"),
		projectName,
		mediaSource: mediaSources[0],
		mediaSources,
		targetAspectRatio: input.targetAspectRatio || "9:16",
		durationGoalMode: input.durationGoalMode === "custom" ? "custom" : "auto",
		captionLanguage: String(input.captionLanguage || "auto"),
		uiLanguage,
		output: {
			format: input.output?.format || "mp4",
			quality: input.output?.quality || "high",
			includeAudio:
				typeof input.output?.includeAudio === "boolean"
					? input.output.includeAudio
					: true,
			captionFont: input.output?.captionFont || "auto",
			captionSize: input.output?.captionSize || "medium",
			captionStylePreset: input.output?.captionStylePreset || "creator-clean",
		},
		generateIntroCover:
			typeof input.generateIntroCover === "boolean"
				? input.generateIntroCover
				: true,
		transitionPreference: normalizeWorkspaceTransitionPreference(
			input.transitionPreference,
		),
		requirements,
		requirementOptions,
	};
	if (recommendedRequirementOptions.length) {
		defaults.recommendedRequirementOptions = recommendedRequirementOptions;
	} else if (!input.requirements && !input.requirementOptions) {
		defaults.recommendedRequirementOptions = requirementOptions;
	}
	const durationGoalRangeSeconds = normalizeDurationGoalRangeSeconds(
		input.durationGoalRangeSeconds,
	);
	if (durationGoalRangeSeconds) {
		defaults.durationGoalRangeSeconds = durationGoalRangeSeconds;
	}
	return defaults;
}

function buildWorkspaceOpenMediaSources(input = {}) {
	if (Array.isArray(input.mediaSources) && input.mediaSources.length) {
		if (
			(Array.isArray(input.mediaPaths) && input.mediaPaths.length) ||
			(Array.isArray(input.directoryPaths) && input.directoryPaths.length)
		) {
			throw new Error(
				"mediaSources cannot be combined with mediaPaths or directoryPaths.",
			);
		}
		return input.mediaSources.map(normalizeWorkspaceMediaSource);
	}
	const mediaPaths = normalizeWorkspaceMediaPaths(input.mediaPaths);
	const directoryPaths = normalizeWorkspaceDirectoryPaths(input.directoryPaths);
	if (mediaPaths.length || directoryPaths.length) {
		if (
			resolveWorkspaceOpenFilePath(input) ||
			resolveWorkspaceOpenDirectoryPath(input) ||
			String(input.url || "").trim()
		) {
			throw new Error(
				"mediaPaths and directoryPaths cannot be combined with filePath, mediaPath, directoryPath, or url.",
			);
		}
		return [
			...mediaPaths.map((filePath) => ({ kind: "filePath", filePath })),
			...directoryPaths.map((directoryPath) => ({
				kind: "directoryPath",
				directoryPath,
			})),
		];
	}
	const filePath = resolveWorkspaceOpenFilePath(input);
	const directoryPath = resolveWorkspaceOpenDirectoryPath(input);
	const url = String(input.url || "").trim();
	const mediaSources = [];
	if (filePath) mediaSources.push({ kind: "filePath", filePath });
	if (directoryPath)
		mediaSources.push({ kind: "directoryPath", directoryPath });
	if (url) {
		mediaSources.push({
			kind: "url",
			url,
			...(input.mimeType ? { mimeType: String(input.mimeType).trim() } : {}),
		});
	}
	if (mediaSources.length) return mediaSources;
	return [{ kind: "filePath", filePath: "" }];
}

function normalizeWorkspaceMediaPaths(mediaPaths) {
	if (!Array.isArray(mediaPaths)) return [];
	return mediaPaths
		.map((mediaPath) => String(mediaPath || "").trim())
		.filter(Boolean);
}

function normalizeWorkspaceDirectoryPaths(directoryPaths) {
	if (!Array.isArray(directoryPaths)) return [];
	return directoryPaths
		.map((directoryPath) => String(directoryPath || "").trim())
		.filter(Boolean);
}

function normalizeWorkspaceOptionList(options, fallback) {
	const values = Array.isArray(options)
		? options
		: Array.isArray(fallback)
			? fallback
			: [fallback];
	return [
		...new Set(
			values.map((option) => String(option || "").trim()).filter(Boolean),
		),
	];
}

function defaultWorkspaceProjectName(uiLanguage) {
	return uiLanguage === "zh-CN" ? "CodeCut 项目" : "CodeCut Project";
}

function defaultWorkspaceRequirements(uiLanguage) {
	return uiLanguage === "zh-CN"
		? "剪成节奏清晰的短视频；开头有明确信息点；主体节奏紧凑；字幕清晰可读；自然音频；结尾适合继续编辑或导出。"
		: "Cut a clear short; clear hook; tight pacing; keep the key message; readable captions; natural audio; export-ready ending.";
}

function defaultWorkspaceRequirementOptions(uiLanguage) {
	return uiLanguage === "zh-CN"
		? [
				"剪成节奏清晰",
				"保留核心信息",
				"开头有明确信息点",
				"主体节奏紧凑",
				"字幕清晰可读",
				"自然音频",
				"结尾适合继续编辑或导出",
			]
		: [
				"Clear pacing",
				"Keep the key message",
				"Clear hook",
				"Tight pacing",
				"Readable captions",
				"Natural audio",
				"Export-ready ending",
			];
}

function resolveWorkspaceOpenFilePath(input = {}) {
	const filePath = String(input.filePath || "").trim();
	const mediaPath = String(input.mediaPath || "").trim();
	if (filePath && mediaPath && filePath !== mediaPath) {
		throw new Error(
			"filePath and mediaPath must match when both are provided.",
		);
	}
	return filePath || mediaPath;
}

function resolveWorkspaceOpenDirectoryPath(input = {}) {
	return String(input.directoryPath || "").trim();
}

function normalizeWorkspaceUiLanguage(value) {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	if (!normalized) return "";
	return normalized.startsWith("zh") ? "zh-CN" : "en";
}

function normalizeWorkspaceTransitionPreference(value) {
	if (value === undefined) return "auto";
	const normalized = String(value).trim();
	if (transitionPreferenceValues.includes(normalized)) return normalized;
	throw new Error(
		"transitionPreference must be auto, none, or a supported CodeCut transition type.",
	);
}

function buildWorkspaceProjectSlug(projectName) {
	const slug =
		String(projectName || "codecut-project")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 42) || "codecut-project";
	const suffix = Date.now().toString(36).slice(-6);
	return `${slug}-${suffix}`.slice(0, 64).replace(/-+$/g, "");
}

function normalizeWorkspaceIntent(intent) {
	const mediaSources = Array.isArray(intent.mediaSources)
		? intent.mediaSources.map(normalizeWorkspaceMediaSource)
		: [
				normalizeWorkspaceMediaSource(
					intent.mediaSource && typeof intent.mediaSource === "object"
						? intent.mediaSource
						: {},
				),
			];
	return {
		pendingConfirmationId:
			intent.pendingConfirmationId === undefined
				? undefined
				: String(intent.pendingConfirmationId).trim(),
		projectId: String(intent.projectId || "").trim(),
		projectName: String(intent.projectName || "").trim(),
		mediaSource: mediaSources[0],
		mediaSources,
		targetAspectRatio: String(intent.targetAspectRatio || ""),
		durationGoalMode: intent.durationGoalMode === "custom" ? "custom" : "auto",
		durationGoalRangeSeconds: normalizeDurationGoalRangeSeconds(
			intent.durationGoalRangeSeconds,
		),
		captionLanguage: String(intent.captionLanguage || "auto").trim() || "auto",
		transitionPreference:
			intent.transitionPreference === undefined
				? ""
				: String(intent.transitionPreference).trim(),
		output: {
			format: String(intent.output?.format || ""),
			quality: String(intent.output?.quality || ""),
			includeAudio: Boolean(intent.output?.includeAudio),
			captionFont: String(intent.output?.captionFont || ""),
			captionSize: String(intent.output?.captionSize || ""),
			captionStylePreset: String(intent.output?.captionStylePreset || ""),
		},
		generateIntroCover: intent.generateIntroCover,
		requirements: String(intent.requirements || "").trim(),
	};
}

function normalizeDurationGoalRangeSeconds(value) {
	if (!value || typeof value !== "object") return undefined;
	return {
		minSeconds: Number(value.minSeconds),
		maxSeconds: Number(value.maxSeconds),
	};
}

function isValidDurationGoalRange(range) {
	return (
		Boolean(range) &&
		Number.isFinite(range.minSeconds) &&
		Number.isFinite(range.maxSeconds) &&
		range.minSeconds > 0 &&
		range.maxSeconds >= range.minSeconds
	);
}

function normalizeWorkspaceMediaSource(mediaSource = {}) {
	return {
		kind: String(mediaSource.kind || ""),
		filePath:
			mediaSource.filePath === undefined
				? undefined
				: String(mediaSource.filePath).trim(),
		directoryPath:
			mediaSource.directoryPath === undefined
				? undefined
				: String(mediaSource.directoryPath).trim(),
		url:
			mediaSource.url === undefined
				? undefined
				: String(mediaSource.url).trim(),
		mimeType:
			mediaSource.mimeType === undefined
				? undefined
				: String(mediaSource.mimeType).trim(),
	};
}

function validateWorkspaceMediaSources(mediaSources) {
	if (!Array.isArray(mediaSources) || mediaSources.length < 1) {
		return { ok: true };
	}
	for (const [index, mediaSource] of mediaSources.entries()) {
		const check = validateWorkspaceMediaSource(mediaSource);
		if (!check.ok) {
			return {
				ok: false,
				message: `Media source ${index + 1}: ${check.message}`,
			};
		}
	}
	return { ok: true };
}

function validateWorkspaceMediaSource(mediaSource) {
	if (!mediaSource || typeof mediaSource !== "object") {
		return { ok: false, message: "A media source row is required." };
	}
	const hasFilePath = Boolean(String(mediaSource.filePath || "").trim());
	const hasDirectoryPath = Boolean(
		String(mediaSource.directoryPath || "").trim(),
	);
	const hasUrl = Boolean(String(mediaSource.url || "").trim());
	if (!hasFilePath && !hasDirectoryPath && !hasUrl) {
		return { ok: true };
	}
	if (Number(hasFilePath) + Number(hasDirectoryPath) + Number(hasUrl) > 1) {
		return { ok: false, message: "Use only one source path or URL." };
	}
	if (hasFilePath) {
		if (mediaSource.kind !== "filePath") {
			return { ok: false, message: "File path source must use kind filePath." };
		}
		return { ok: true };
	}
	if (hasDirectoryPath) {
		if (mediaSource.kind !== "directoryPath") {
			return {
				ok: false,
				message: "Directory path source must use kind directoryPath.",
			};
		}
		return { ok: true };
	}
	if (mediaSource.kind !== "url") {
		return { ok: false, message: "URL source must use kind url." };
	}
	try {
		const parsed = new URL(mediaSource.url);
		if (parsed.protocol !== "https:") {
			return { ok: false, message: "Media URL must use https." };
		}
		return { ok: true };
	} catch {
		return { ok: false, message: "Media URL must be valid." };
	}
}

async function collectSetupMediaSourcesForImport(mediaSources, statImpl) {
	const importableMediaSources = [];
	const deferredMediaSources = [];
	for (const [index, mediaSource] of mediaSources.entries()) {
		const deferredMediaSource = await getDeferredSetupMediaSource(
			mediaSource,
			index,
			statImpl,
		);
		if (deferredMediaSource) {
			deferredMediaSources.push(deferredMediaSource);
		} else {
			importableMediaSources.push({ index, mediaSource });
		}
	}
	return { importableMediaSources, deferredMediaSources };
}

async function getDeferredSetupMediaSource(mediaSource, index, statImpl) {
	const filePath = String(mediaSource.filePath || "").trim();
	const directoryPath = String(mediaSource.directoryPath || "").trim();
	const url = String(mediaSource.url || "").trim();
	if (mediaSource.kind === "directoryPath") {
		return {
			index,
			kind: "directoryPath",
			...(directoryPath ? { directoryPath } : {}),
			reason: directoryPath ? "directory_input" : "missing_directory_path",
		};
	}
	if (!filePath && !directoryPath && !url) {
		return {
			index,
			kind: "filePath",
			reason: "missing_file_path",
		};
	}
	if (url) return null;
	if (mediaSource.kind !== "filePath") return null;
	if (!isAbsolute(filePath)) {
		return {
			index,
			kind: "filePath",
			filePath,
			reason: "file_path_not_absolute",
		};
	}
	try {
		const fileStat = await statImpl(filePath);
		if (fileStat.isFile()) return null;
		return {
			index,
			kind: "filePath",
			filePath,
			reason: "not_a_file",
		};
	} catch (error) {
		return {
			index,
			kind: "filePath",
			filePath,
			reason: error?.code === "ENOENT" ? "file_not_found" : "file_stat_failed",
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

function pushCheck(checks, id, label, ok, detail) {
	checks.push({
		id,
		label,
		ok: Boolean(ok),
		...(ok ? {} : { detail }),
	});
}

function extractProjectInfo(content) {
	const fromResult = content?.results?.find?.(
		(result) => result?.success !== false,
	);
	const data =
		fromResult?.data || content?.data || content?.project || content || {};
	return {
		projectId: data.projectId || data.id,
		name: data.name || data.projectName,
		revision: data.revision,
		editorUrl: data.editorUrl,
	};
}

function extractImportedMedia(content) {
	if (content?.importedMedia) return content.importedMedia;
	if (content?.media) return content.media;
	if (content?.asset) return content.asset;
	const result = content?.results?.find?.((entry) => entry?.success !== false);
	const data = result?.data || {};
	if (Array.isArray(data.assets) && data.assets.length) return data.assets[0];
	if (data.asset) return data.asset;
	if (data.media) return data.media;
	if (data.mediaId) {
		return {
			id: data.mediaId,
			name: data.fileName || data.name || "Imported media",
		};
	}
	return null;
}

function extractErrorMessage(result) {
	return String(
		result?.structuredContent?.error ||
			result?.structuredContent?.message ||
			result?.content?.[0]?.text ||
			result?.error ||
			"CodeCut setup failed.",
	);
}

function buildImportMediaArgs(intent) {
	if (intent.mediaSource.kind === "filePath") {
		return {
			projectId: intent.projectId,
			filePath: intent.mediaSource.filePath,
			confirmationToken: intent.confirmationToken,
		};
	}
	const fileName = basename(new URL(intent.mediaSource.url).pathname);
	return {
		projectId: intent.projectId,
		url: intent.mediaSource.url,
		confirmationToken: intent.confirmationToken,
		...(intent.mediaSource.mimeType
			? { mimeType: intent.mediaSource.mimeType }
			: {}),
		...(fileName ? { fileName } : {}),
	};
}

function buildSetupErrorResult(content) {
	return {
		content: [
			{
				type: "text",
				text: `CodeCut setup ${content.status} for ${content.projectId}: ${content.error}`,
			},
		],
		structuredContent: content,
		isError: true,
	};
}

function buildContinuePrompt({
	intent,
	projectId,
	projectName,
	revision,
	editorUrl,
	confirmationToken,
	importedMedia,
	deferredMediaSources,
}) {
	return [
		`Use $codecut to continue the real CodeCut editing chain for project "${projectName}" (${projectId}).`,
		`Use --confirmation-token ${confirmationToken} for any CodeCut side-effect command that creates projects, imports media, initializes workspaces, adds assets, generates media, mutates timelines, or exports files.`,
		`Use $browser:control-in-app-browser to make the Codex in-app browser visible, then open the editor URL "${editorUrl}" for human preview. Click this host-rendered link if manual preview is needed: [Open CodeCut editor](${editorUrl}). If the selected tab is already on that URL, do not reload it.`,
		`Before planning edits, call get_project_info with projectId "${projectId}", then list_media_assets with projectId "${projectId}", then get_timeline_state with projectId "${projectId}".`,
		`Use the confirmed setup intent and imported media as source context. Project revision: ${revision}. Editor URL: ${editorUrl}. Imported media: ${JSON.stringify(importedMedia)}.`,
		`Deferred media sources: ${JSON.stringify(deferredMediaSources)}.`,
		`Confirmed intent: ${JSON.stringify(intent)}.`,
	].join("\n");
}

function requireProjectId(args) {
	if (!args?.projectId) {
		throw new Error("projectId is required");
	}
	return String(args.projectId);
}

function requireStringArg(args, key) {
	if (!args?.[key]) {
		throw new Error(`${key} is required`);
	}
	return String(args[key]);
}

function requireConfirmationTokenArg(args) {
	return requireStringArg(args, "confirmationToken");
}

function requireNumberArg(args, key) {
	if (typeof args?.[key] !== "number") {
		throw new Error(`${key} is required`);
	}
	return String(args[key]);
}

function protectedTermCliArgs(args) {
	if (args?.protectedTerms === undefined) return [];
	if (!Array.isArray(args.protectedTerms)) {
		throw new Error("protectedTerms must be an array");
	}
	return args.protectedTerms.flatMap((term) => [
		"--protected-term",
		String(term),
	]);
}

function requireBooleanArg(args, key) {
	if (typeof args?.[key] !== "boolean") {
		throw new Error(`${key} is required`);
	}
	return String(args[key]);
}

function requireRawBooleanArg(args, key) {
	if (typeof args?.[key] !== "boolean") {
		throw new Error(`${key} is required`);
	}
	return args[key];
}

function requireConfirmedByUser(args) {
	if (args?.confirmedByUser !== true) {
		throw new Error(
			"confirmedByUser must be true after explicit user confirmation",
		);
	}
	return true;
}

function optionalBooleanArg(args, key) {
	if (args?.[key] === undefined) return undefined;
	if (typeof args[key] !== "boolean") {
		throw new Error(`${key} must be boolean`);
	}
	return args[key];
}

function optionalNumberArg(args, key) {
	if (args?.[key] === undefined) return undefined;
	if (typeof args[key] !== "number") {
		throw new Error(`${key} must be number`);
	}
	return args[key];
}

function buildSendArgs({ projectId, toolName, args, confirmationToken }) {
	return [
		"scripts/codex-bridge.mjs",
		"send",
		"--project-id",
		projectId,
		"--tool",
		toolName,
		"--args-json",
		JSON.stringify(args),
		...(confirmationToken ? ["--confirmation-token", confirmationToken] : []),
	];
}

function appendOptionalCliArgs(command, args, mappings) {
	for (const [sourceKey, flag] of mappings) {
		if (args[sourceKey] !== undefined) {
			command.push(flag, String(args[sourceKey]));
		}
	}
	return command;
}

function assertOnlyToolArgs(args, allowedKeys, toolName) {
	const unexpected = Object.keys(args ?? {}).filter((key) => !allowedKeys.has(key));
	if (unexpected.length > 0) {
		throw new Error(
			`${toolName} does not accept argument(s): ${unexpected.join(", ")}`,
		);
	}
}

function countImportSources(args) {
	return ["filePath", "url", "bytes"].filter((key) => args?.[key]).length;
}

function writeBytesImportFile(bytes) {
	const directory = mkdtempSync(join(tmpdir(), "codecut-mcp-import-"));
	const filePath = join(directory, "payload.base64");
	writeFileSync(filePath, String(bytes), "utf8");
	return filePath;
}

export function buildBridgeCliArgs(toolName, args = {}) {
	if (toolName === "list_projects") {
		return ["scripts/codex-bridge.mjs", "list-projects"];
	}
	if (toolName === "create_project") {
		return [
			"scripts/codex-bridge.mjs",
			"create-project",
			"--project-id",
			requireProjectId(args),
			"--name",
			requireStringArg(args, "name"),
			"--confirmation-token",
			requireConfirmationTokenArg(args),
		];
	}
	const projectId = requireProjectId(args);
	switch (toolName) {
		case "get_project_info":
		case "list_media_assets":
			return [
				"scripts/codex-bridge.mjs",
				"send",
				"--project-id",
				projectId,
				"--tool",
				toolName,
				"--args-json",
				"{}",
			];
		case "get_timeline_state":
			assertOnlyToolArgs(
				args,
				new Set([
					"projectId",
					"startTime",
					"endTime",
					"includeFrames",
					"includeReferencedMedia",
				]),
				toolName,
			);
			return buildSendArgs({
				projectId,
				toolName: "get_timeline_state",
				args: {
					...(optionalNumberArg(args, "startTime") === undefined
						? {}
						: { startTime: optionalNumberArg(args, "startTime") }),
					...(optionalNumberArg(args, "endTime") === undefined
						? {}
						: { endTime: optionalNumberArg(args, "endTime") }),
					...(optionalBooleanArg(args, "includeFrames") === undefined
						? {}
						: { includeFrames: optionalBooleanArg(args, "includeFrames") }),
					...(optionalBooleanArg(args, "includeReferencedMedia") === undefined
						? {}
						: {
								includeReferencedMedia: optionalBooleanArg(
									args,
									"includeReferencedMedia",
								),
							}),
				},
			});
		case "transcribe_media":
			return [
				"scripts/codex-bridge.mjs",
				"transcribe",
				"--project-id",
				projectId,
				"--media-id",
				requireStringArg(args, "mediaId"),
				"--language",
				requireStringArg(args, "language"),
				"--model-id",
				requireStringArg(args, "modelId"),
			];
		case "build_video_context":
			return [
				"scripts/codex-bridge.mjs",
				"build-video-context",
				"--project-id",
				projectId,
				"--media-id",
				requireStringArg(args, "mediaId"),
				"--language",
				requireStringArg(args, "language"),
				"--model-id",
				requireStringArg(args, "modelId"),
			];
		case "build_visual_context":
			return [
				"scripts/codex-bridge.mjs",
				"build-visual-context",
				"--project-id",
				projectId,
				"--media-id",
				requireStringArg(args, "mediaId"),
				"--target-aspect-ratio",
				requireStringArg(args, "targetAspectRatio"),
			];
		case "inspect_video_range": {
			const command = [
				"scripts/codex-bridge.mjs",
				"inspect-video-range",
				"--project-id",
				projectId,
				"--media-id",
				requireStringArg(args, "mediaId"),
				"--start-seconds",
				requireNumberArg(args, "startSeconds"),
				"--end-seconds",
				requireNumberArg(args, "endSeconds"),
			];
			if (args.frameCount !== undefined) {
				command.push("--frame-count", requireNumberArg(args, "frameCount"));
			}
			return command;
		}
		case "inspect_timeline":
			return buildSendArgs({
				projectId,
				toolName,
				args: {
					startTime: Number(requireNumberArg(args, "startTime")),
					...(optionalNumberArg(args, "endTime") === undefined
						? {}
						: { endTime: optionalNumberArg(args, "endTime") }),
					...(optionalNumberArg(args, "frameCount") === undefined
						? {}
						: { frameCount: optionalNumberArg(args, "frameCount") }),
				},
			});
		case "build_video_quality_report":
			return appendOptionalCliArgs(
				[
					"scripts/codex-bridge.mjs",
					"build-video-quality-report",
					"--project-id",
					projectId,
					"--plan-json-file",
					requireStringArg(args, "planJsonFile"),
					"--start-time",
					requireNumberArg(args, "startTime"),
					"--end-time",
					requireNumberArg(args, "endTime"),
					"--frame-count",
					requireNumberArg(args, "frameCount"),
				],
				args,
				[
					["titleRubricJsonFile", "--title-rubric-json-file"],
					["outputFile", "--output-file"],
					["outputFormat", "--format"],
					["includeAudio", "--include-audio"],
				],
			);
		case "get_transcript":
			return buildSendArgs({
				projectId,
				toolName,
				args: {
					granularity: requireStringArg(args, "granularity"),
					language: requireStringArg(args, "language"),
					modelId: requireStringArg(args, "modelId"),
					...(optionalNumberArg(args, "startTime") === undefined
						? {}
						: { startTime: optionalNumberArg(args, "startTime") }),
					...(optionalNumberArg(args, "endTime") === undefined
						? {}
						: { endTime: optionalNumberArg(args, "endTime") }),
					...(optionalBooleanArg(args, "includeFrames") === undefined
						? {}
						: { includeFrames: optionalBooleanArg(args, "includeFrames") }),
				},
			});
		case "build_post_cut_captions":
			return [
				"scripts/codex-bridge.mjs",
				"build-post-cut-captions",
				"--project-id",
				projectId,
				"--language",
				requireStringArg(args, "language"),
				"--model-id",
				requireStringArg(args, "modelId"),
			];
		case "build_caption_diagnostics": {
			const captionStyle = args.captionStyle;
			if (!captionStyle || typeof captionStyle !== "object") {
				throw new Error("captionStyle is required");
			}
			const captionStyleRecord = captionStyle;
			const command = [
				"scripts/codex-bridge.mjs",
				"build-caption-diagnostics",
				"--project-id",
				projectId,
				"--language",
				requireStringArg(args, "language"),
				"--model-id",
				requireStringArg(args, "modelId"),
				"--caption-style-preset",
				requireStringArg(captionStyleRecord, "preset"),
				"--caption-position",
				requireStringArg(captionStyleRecord, "position"),
			];
			if (captionStyleRecord.motionPreset !== undefined) {
				command.push(
					"--caption-motion-preset",
					requireStringArg(captionStyleRecord, "motionPreset"),
				);
			}
			return command;
		}
		case "list_models":
			return buildSendArgs({
				projectId,
				toolName,
				args: {
					...(args.type === undefined
						? {}
						: { type: requireStringArg(args, "type") }),
				},
			});
		case "search_media":
			return buildSendArgs({
				projectId,
				toolName,
				args: {
					query: requireStringArg(args, "query"),
					...(args.scope === undefined
						? {}
						: { scope: requireStringArg(args, "scope") }),
					...(args.mediaId === undefined
						? {}
						: { mediaId: requireStringArg(args, "mediaId") }),
					...(optionalNumberArg(args, "limit") === undefined
						? {}
						: { limit: optionalNumberArg(args, "limit") }),
				},
			});
		case "import_system_template_script":
			requireConfirmedByUser(args);
			return [
				"scripts/codex-bridge.mjs",
				"import-system-template-script",
				"--project-id",
				projectId,
				"--template-json-file",
				requireStringArg(args, "templateJsonFile"),
				"--confirmed-by-user",
				"true",
			];
		case "update_system_template_script":
			requireConfirmedByUser(args);
			return [
				"scripts/codex-bridge.mjs",
				"update-system-template-script",
				"--project-id",
				projectId,
				"--template-json-file",
				requireStringArg(args, "templateJsonFile"),
				"--confirmed-by-user",
				"true",
			];
		case "delete_system_template_script":
			requireConfirmedByUser(args);
			return [
				"scripts/codex-bridge.mjs",
				"delete-system-template-script",
				"--project-id",
				projectId,
				"--template-id",
				requireStringArg(args, "templateId"),
				"--confirmed-by-user",
				"true",
			];
		case "validate_edit_plan":
			return [
				"scripts/codex-bridge.mjs",
				"validate-edit-plan",
				"--project-id",
				projectId,
				"--plan-json-file",
				requireStringArg(args, "planJsonFile"),
			];
		case "preview_edit_plan":
			return [
				"scripts/codex-bridge.mjs",
				"preview-edit-plan",
				"--project-id",
				projectId,
				"--plan-json-file",
				requireStringArg(args, "planJsonFile"),
			];
		case "import_media":
			if (countImportSources(args) !== 1) {
				throw new Error("import_media requires exactly one source");
			}
			if (args.filePath) {
				const command = [
					"scripts/codex-bridge.mjs",
					"import-media",
					"--project-id",
					projectId,
					"--file-path",
					String(args.filePath),
					"--confirmation-token",
					requireConfirmationTokenArg(args),
				];
				return appendOptionalCliArgs(command, args, [
					["duration", "--duration"],
					["width", "--width"],
					["height", "--height"],
				]);
			}
			if (args.url) {
				const command = [
					"scripts/codex-bridge.mjs",
					"import-media",
					"--project-id",
					projectId,
					"--url",
					String(args.url),
					"--confirmation-token",
					requireConfirmationTokenArg(args),
				];
				return appendOptionalCliArgs(command, args, [
					["fileName", "--file-name"],
					["mimeType", "--mime-type"],
					["lastModified", "--last-modified"],
					["duration", "--duration"],
					["width", "--width"],
					["height", "--height"],
				]);
			}
			if (!args.fileName) {
				throw new Error("fileName is required for bytes import");
			}
			if (!args.mimeType) {
				throw new Error("mimeType is required for bytes import");
			}
			return appendOptionalCliArgs(
				[
					"scripts/codex-bridge.mjs",
					"import-media",
					"--project-id",
					projectId,
					"--bytes-base64-file",
					writeBytesImportFile(args.bytes),
					"--file-name",
					String(args.fileName),
					"--mime-type",
					String(args.mimeType),
					"--confirmation-token",
					requireConfirmationTokenArg(args),
				],
				args,
				[
					["lastModified", "--last-modified"],
					["duration", "--duration"],
					["width", "--width"],
					["height", "--height"],
				],
			);
		case "set_project_cover":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {
					mediaId: requireStringArg(args, "mediaId"),
					...(args.title === undefined
						? {}
						: { title: requireStringArg(args, "title") }),
					...(args.prompt === undefined
						? {}
						: { prompt: requireStringArg(args, "prompt") }),
					...(args.stylePreset === undefined
						? {}
						: { stylePreset: requireStringArg(args, "stylePreset") }),
				},
			});
		case "clear_project_cover":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {},
			});
		case "apply_edit_plan":
			if (!args.planJsonFile) {
				throw new Error("planJsonFile is required");
			}
			if (typeof args.replaceExisting !== "boolean") {
				throw new Error("replaceExisting is required");
			}
			return [
				"scripts/codex-bridge.mjs",
				"apply-plan",
				"--project-id",
				projectId,
				"--plan-json-file",
				String(args.planJsonFile),
				"--replace-existing",
				String(args.replaceExisting),
				"--confirmation-token",
				requireConfirmationTokenArg(args),
			];
		case "apply_narrated_remix_plan":
			if (!args.planJsonFile) {
				throw new Error("planJsonFile is required");
			}
			if (typeof args.replaceExisting !== "boolean") {
				throw new Error("replaceExisting is required");
			}
			return [
				"scripts/codex-bridge.mjs",
				"apply-narrated-remix-plan",
				"--project-id",
				projectId,
				"--plan-json-file",
				String(args.planJsonFile),
				"--replace-existing",
				String(args.replaceExisting),
				"--confirmation-token",
				requireConfirmationTokenArg(args),
			];
		case "add_texts":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {
					...(args.trackId === undefined
						? {}
						: { trackId: requireStringArg(args, "trackId") }),
					entries: args.entries,
				},
			});
		case "add_captions":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {
					language: requireStringArg(args, "language"),
					modelId: requireStringArg(args, "modelId"),
					...(args.captionStyle === undefined
						? {}
						: { captionStyle: args.captionStyle }),
				},
			});
		case "insert_clips":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {
					trackId: requireStringArg(args, "trackId"),
					atTime: Number(requireNumberArg(args, "atTime")),
					clips: args.clips,
				},
			});
		case "move_clips":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: { moves: args.moves },
			});
		case "remove_clips":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: { elementIds: args.elementIds },
			});
		case "split_clip":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {
					elementId: requireStringArg(args, "elementId"),
					atTime: Number(requireNumberArg(args, "atTime")),
				},
			});
		case "set_clip_properties":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {
					elementId: requireStringArg(args, "elementId"),
					properties: args.properties,
				},
			});
		case "set_keyframes":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {
					elementId: requireStringArg(args, "elementId"),
					property: requireStringArg(args, "property"),
					keyframes: args.keyframes,
				},
			});
		case "add_transitions":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: { entries: args.entries },
			});
		case "update_transition": {
			if (args.type === undefined && args.duration === undefined) {
				throw new Error("type or duration is required");
			}
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {
					trackId: requireStringArg(args, "trackId"),
					transitionId: requireStringArg(args, "transitionId"),
					...(args.type === undefined
						? {}
						: { type: requireStringArg(args, "type") }),
					...(optionalNumberArg(args, "duration") === undefined
						? {}
						: { duration: optionalNumberArg(args, "duration") }),
				},
			});
		}
		case "remove_transition":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {
					trackId: requireStringArg(args, "trackId"),
					transitionId: requireStringArg(args, "transitionId"),
				},
			});
		case "ripple_delete_ranges":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {
					scope: args.scope,
					ranges: args.ranges.map((range) => [range.startTime, range.endTime]),
				},
			});
		case "create_text_background_effect":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {
					sourceMediaId: requireStringArg(args, "sourceMediaId"),
					derivedAssetId: requireStringArg(args, "derivedAssetId"),
					content: requireStringArg(args, "content"),
					startTime: Number(requireNumberArg(args, "startTime")),
					duration: Number(requireNumberArg(args, "duration")),
					replaceExisting: requireRawBooleanArg(args, "replaceExisting"),
				},
			});
		case "create_human_pip_effect":
			return buildSendArgs({
				projectId,
				toolName,
				confirmationToken: requireConfirmationTokenArg(args),
				args: {
					foregroundMediaId: requireStringArg(args, "foregroundMediaId"),
					backgroundMediaId: requireStringArg(args, "backgroundMediaId"),
					derivedAssetId: requireStringArg(args, "derivedAssetId"),
					placement: requireStringArg(args, "placement"),
					scale: Number(requireNumberArg(args, "scale")),
					startTime: Number(requireNumberArg(args, "startTime")),
					duration: Number(requireNumberArg(args, "duration")),
					replaceExisting: requireRawBooleanArg(args, "replaceExisting"),
				},
			});
		case "generate_digital_human":
			return [
				"scripts/codex-bridge.mjs",
				"generate-digital-human",
				"--project-id",
				projectId,
				"--image-media-id",
				requireStringArg(args, "imageMediaId"),
				"--audio-media-id",
				requireStringArg(args, "audioMediaId"),
				"--script-text",
				requireStringArg(args, "scriptText"),
				"--motion-prompt",
				requireStringArg(args, "motionPrompt"),
				"--width",
				requireNumberArg(args, "width"),
				"--height",
				requireNumberArg(args, "height"),
				"--fps",
				requireNumberArg(args, "fps"),
				"--confirmation-token",
				requireConfirmationTokenArg(args),
			];
		case "generate_runninghub_voice_design":
			return [
				"scripts/codex-bridge.mjs",
				"generate-runninghub-voice-design",
				"--project-id",
				projectId,
				"--text",
				requireStringArg(args, "text"),
				"--emotion-prompt",
				requireStringArg(args, "emotionPrompt"),
				...protectedTermCliArgs(args),
				"--confirmation-token",
				requireConfirmationTokenArg(args),
			];
		case "generate_runninghub_voice_clone":
			return [
				"scripts/codex-bridge.mjs",
				"generate-runninghub-voice-clone",
				"--project-id",
				projectId,
				"--audio-path",
				requireStringArg(args, "audioPath"),
				"--text",
				requireStringArg(args, "text"),
				...protectedTermCliArgs(args),
				"--confirmation-token",
				requireConfirmationTokenArg(args),
			];
		case "verify_timeline":
			return [
				"scripts/codex-bridge.mjs",
				"verify-timeline",
				"--project-id",
				projectId,
				"--verification-json-file",
				requireStringArg(args, "verificationJsonFile"),
			];
		case "export_project":
			return [
				"scripts/codex-bridge.mjs",
				"export",
				"--project-id",
				projectId,
				"--format",
				requireStringArg(args, "format"),
				"--quality",
				requireStringArg(args, "quality"),
				"--include-audio",
				requireBooleanArg(args, "includeAudio"),
				"--output-file",
				requireStringArg(args, "outputFile"),
				"--overwrite",
				requireBooleanArg(args, "overwrite"),
				"--confirmation-token",
				requireConfirmationTokenArg(args),
			];
		default:
			throw new Error(`Unsupported Codecut MCP tool: ${toolName}`);
	}
}

function parseJsonIfPossible(stdout) {
	const trimmed = stdout.trim();
	if (!trimmed) return {};
	try {
		const parsed = JSON.parse(trimmed);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed;
		}
		return { stdout };
	} catch {
		return { stdout };
	}
}

export function normalizeCliResult({ toolName, stdout = "", stderr = "" }) {
	const structuredContent = parseJsonIfPossible(stdout);
	if (stderr.trim()) {
		structuredContent.stderr = stderr;
	}
	const visibleOutput = stdout.trim() || stderr.trim() || "No CLI output.";
	return {
		content: [
			{
				type: "text",
				text: `Codecut ${toolName} completed.\n\n${visibleOutput}`,
			},
		],
		structuredContent,
	};
}

function normalizeCliError({ toolName, error }) {
	const stdout = String(error?.stdout || "");
	const stderr = String(error?.stderr || "");
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [
			{
				type: "text",
				text: `Codecut ${toolName} failed.\n\n${stderr || stdout || message}`,
			},
		],
		structuredContent: {
			error: message,
			...(stdout ? { stdout } : {}),
			...(stderr ? { stderr } : {}),
		},
		isError: true,
	};
}

function unquoteEnvValue(value) {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function readBridgeEnvFile(cwd) {
	const envPath = resolve(cwd, bridgeEnvFileRelativePath);
	if (!existsSync(envPath)) {
		return {};
	}
	const entries = {};
	const raw = readFileSync(envPath, "utf8");
	for (const [index, rawLine] of raw.split(/\r?\n/).entries()) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const separatorIndex = line.indexOf("=");
		if (separatorIndex === -1) {
			throw new Error(
				`Invalid ${bridgeEnvFileRelativePath} line ${index + 1}: expected KEY=value`,
			);
		}
		const key = line.slice(0, separatorIndex).trim();
		if (!key.startsWith(bridgeEnvPrefix) && !bridgeAllowedEnvKeys.has(key)) {
			continue;
		}
		entries[key] = unquoteEnvValue(line.slice(separatorIndex + 1));
	}
	return entries;
}

export function buildBridgeProcessEnv({
	cwd = pluginRoot,
	env = process.env,
} = {}) {
	return {
		...readBridgeEnvFile(cwd),
		...env,
	};
}

export async function callBridgeCliTool(
	toolName,
	args,
	{ cwd = pluginRoot, env = process.env, execFileImpl = execFileAsync } = {},
) {
	const cliArgs = buildBridgeCliArgs(toolName, args);
	try {
		const { stdout, stderr } = await execFileImpl(process.execPath, cliArgs, {
			cwd,
			env: buildBridgeProcessEnv({ cwd, env }),
			maxBuffer: 50 * 1024 * 1024,
		});
		return normalizeCliResult({ toolName, stdout, stderr });
	} catch (error) {
		return normalizeCliError({ toolName, error });
	}
}

function pluginVersion() {
	const manifest = JSON.parse(
		readFileSync(resolve(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
	);
	return String(manifest.version || "0.0.0");
}

export function createCodecutMcpServer() {
	const server = new McpServer(
		{
			name: "codecut",
			version: pluginVersion(),
		},
		{
			instructions:
				"Expose stable Codecut local-executor primitives. Skills own workflow decisions, EditPlan construction, preview policy, and verification criteria; this MCP server only wraps the existing codex-bridge CLI.",
		},
	);

	for (const resourceUri of [
		CODECUT_WORKSPACE_RESOURCE_URI,
		CODECUT_WORKSPACE_LEGACY_RESOURCE_URI,
	]) {
		registerCodecutWorkspaceResource(server, resourceUri);
	}

	for (const tool of CODECUT_WORKSPACE_TOOLS) {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema,
				annotations: {
					readOnlyHint: tool.readOnly,
					destructiveHint: false,
					idempotentHint: tool.readOnly,
					openWorldHint: false,
				},
				_meta: tool.meta,
			},
			async (input) => callCodecutWorkspaceTool(tool.name, input),
		);
	}

	for (const tool of CODECUT_MCP_TOOLS) {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema,
				annotations: {
					readOnlyHint: tool.readOnly,
					destructiveHint: DESTRUCTIVE_MCP_TOOL_NAMES.has(tool.name),
					idempotentHint: tool.readOnly,
					openWorldHint: false,
				},
				_meta: {
					"codecut/governanceCategory": tool.governanceCategory,
				},
			},
			async (input) => callBridgeCliTool(tool.name, input),
		);
	}

	return server;
}

function registerCodecutWorkspaceResource(server, resourceUri) {
	server.registerResource(
		"codecut_workspace",
		resourceUri,
		{
			title: "CodeCut Workspace Setup",
			description:
				"Static MCP App widget for confirming CodeCut project setup before editing.",
			mimeType: workspaceResourceMimeType,
			_meta: codecutWorkspaceResourceMeta,
		},
		async () => ({
			contents: [
				{
					uri: resourceUri,
					mimeType: workspaceResourceMimeType,
					text: await readCodecutWorkspaceHtml(),
					_meta: codecutWorkspaceResourceMeta,
				},
			],
		}),
	);
}

export async function callCodecutWorkspaceTool(
	toolName,
	input,
	{ cwd = pluginRoot, env = process.env, fetchImpl = fetch } = {},
) {
	if (toolName === "open_codecut_workspace") {
		const blocked = await assertCodecutServiceReady({ cwd, env, fetchImpl });
		if (blocked) return blocked;
		return openCodecutWorkspace(input);
	}
	if (toolName === "inspect_codecut_setup") {
		const structuredContent = await inspectCodecutSetup(input);
		return {
			content: [
				{
					type: "text",
					text:
						structuredContent.status === "ready"
							? "CodeCut workspace setup is ready."
							: "CodeCut workspace setup is blocked.",
				},
			],
			structuredContent,
		};
	}
	if (toolName === "submit_codecut_setup") {
		return submitCodecutSetup(input);
	}
	throw new Error(`Unsupported CodeCut workspace tool: ${toolName}`);
}

export async function runStdioServer() {
	const server = createCodecutMcpServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	runStdioServer().catch((error) => {
		process.stderr.write(`${error.stack || error.message || String(error)}\n`);
		process.exitCode = 1;
	});
}
