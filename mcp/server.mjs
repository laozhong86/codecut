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

const filePathSchema = z
	.string()
	.trim()
	.min(1)
	.describe("Absolute path to a local media file.");

const projectOnlyInputSchema = {
	projectId: projectIdSchema,
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
					destructiveHint: tool.name === "apply_edit_plan",
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
