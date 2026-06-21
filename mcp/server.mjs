#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
			"Import one absolute local media file into one explicit Codecut executor project.",
		inputSchema: {
			projectId: projectIdSchema,
			filePath: filePathSchema,
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
			if (!args.filePath) {
				throw new Error("filePath is required");
			}
			return [
				"scripts/codex-bridge.mjs",
				"import-media",
				"--project-id",
				projectId,
				"--file-path",
				String(args.filePath),
			];
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

export async function callBridgeCliTool(
	toolName,
	args,
	{ cwd = pluginRoot, env = process.env, execFileImpl = execFileAsync } = {},
) {
	const cliArgs = buildBridgeCliArgs(toolName, args);
	try {
		const { stdout, stderr } = await execFileImpl(process.execPath, cliArgs, {
			cwd,
			env,
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
