#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bridgeEnvFileRelativePath = "apps/web/.env.local";
const bridgeEnvPrefix = "CODECUT_AGENT_BRIDGE_";

const projectIdSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Codecut executor project ID.");

const planJsonFileSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Absolute path to an EditPlan JSON file.");

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

const transcriptInputSchema = {
	projectId: projectIdSchema,
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
		preset: z
			.enum([
				"short-form-bold",
				"black-bar",
				"talking-head-pop",
				"tutorial-clean",
				"documentary-soft",
				"product-punch",
				"lifestyle-warm",
				"cinematic-serif",
			])
			.optional(),
		position: z.enum(["lower-safe", "center"]).optional(),
	})
	.strict();

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
		name: "get_transcript",
		title: "Get Codecut Timeline Transcript",
		description:
			"Read segment-level transcript mapped onto the currently edited timeline.",
		inputSchema: transcriptInputSchema,
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
			elementId: z.string().min(1),
			property: keyframePropertySchema,
			keyframes: z.array(z.union([scalarKeyframeSchema, positionKeyframeSchema])),
		},
		readOnly: false,
	},
	{
		name: "ripple_delete_ranges",
		title: "Ripple Delete Codecut Ranges",
		description:
			"Delete timeline second ranges and ripple all tracks left by the removed duration.",
		inputSchema: {
			projectId: projectIdSchema,
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
			"Read the current timeline state from one explicit Codecut executor project.",
		inputSchema: projectOnlyInputSchema,
		readOnly: true,
	},
	{
		name: "get_timeline_state_v2",
		title: "Get Codecut Timeline State V2",
		description:
			"Read the current timeline state v2 from one explicit Codecut executor project.",
		inputSchema: {
			projectId: projectIdSchema,
			...timelineWindowInputSchema,
			includeFrames: z.boolean().optional(),
			includeReferencedMedia: z.boolean().optional(),
		},
		readOnly: true,
	},
];

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

function requireNumberArg(args, key) {
	if (typeof args?.[key] !== "number") {
		throw new Error(`${key} is required`);
	}
	return String(args[key]);
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

function buildSendArgs({ projectId, toolName, args }) {
	return [
		"scripts/codex-bridge.mjs",
		"send",
		"--project-id",
		projectId,
		"--tool",
		toolName,
		"--args-json",
		JSON.stringify(args),
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
	const projectId = requireProjectId(args);
	switch (toolName) {
		case "get_project_info":
		case "list_media_assets":
		case "get_timeline_state":
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
		case "get_timeline_state_v2":
			return buildSendArgs({
				projectId,
				toolName: "get_timeline_state",
				args: {
					format: "v2",
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
		case "get_transcript":
			return buildSendArgs({
				projectId,
				toolName,
				args: {
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
		case "list_models":
			return buildSendArgs({
				projectId,
				toolName,
				args: {
					...(args.type === undefined ? {} : { type: requireStringArg(args, "type") }),
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
			return appendOptionalCliArgs([
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
			], args, [
				["lastModified", "--last-modified"],
				["duration", "--duration"],
				["width", "--width"],
				["height", "--height"],
			]);
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
			];
		case "add_texts":
			return buildSendArgs({
				projectId,
				toolName,
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
				args: { moves: args.moves },
			});
		case "remove_clips":
			return buildSendArgs({
				projectId,
				toolName,
				args: { elementIds: args.elementIds },
			});
		case "split_clip":
			return buildSendArgs({
				projectId,
				toolName,
				args: {
					elementId: requireStringArg(args, "elementId"),
					atTime: Number(requireNumberArg(args, "atTime")),
				},
			});
		case "set_clip_properties":
			return buildSendArgs({
				projectId,
				toolName,
				args: {
					elementId: requireStringArg(args, "elementId"),
					properties: args.properties,
				},
			});
		case "set_keyframes":
			return buildSendArgs({
				projectId,
				toolName,
				args: {
					elementId: requireStringArg(args, "elementId"),
					property: requireStringArg(args, "property"),
					keyframes: args.keyframes,
				},
			});
		case "ripple_delete_ranges":
			return buildSendArgs({
				projectId,
				toolName,
				args: {
					ranges: args.ranges.map((range) => [
						range.startTime,
						range.endTime,
					]),
				},
			});
		case "create_text_background_effect":
			return buildSendArgs({
				projectId,
				toolName,
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
		if (!key.startsWith(bridgeEnvPrefix)) continue;
		entries[key] = unquoteEnvValue(line.slice(separatorIndex + 1));
	}
	return entries;
}

export function buildBridgeProcessEnv({ cwd = pluginRoot, env = process.env } = {}) {
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

	for (const tool of CODECUT_MCP_TOOLS) {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema,
				annotations: {
					readOnlyHint: tool.readOnly,
					destructiveHint:
						tool.name === "apply_edit_plan" ||
						tool.name === "apply_narrated_remix_plan" ||
						tool.name === "create_text_background_effect" ||
						tool.name === "create_human_pip_effect" ||
						tool.name === "generate_digital_human" ||
						tool.name === "export_project",
					idempotentHint: tool.readOnly,
					openWorldHint: false,
				},
			},
			async (input) => callBridgeCliTool(tool.name, input),
		);
	}

	return server;
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
