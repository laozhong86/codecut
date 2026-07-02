#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const pluginRoot = resolve(dirname(scriptPath), "..");
const defaultProjectId = `mcp-fresh-audio-smoke-${new Date()
	.toISOString()
	.slice(0, 10)
	.replaceAll("-", "")}`;

export const REQUIRED_MCP_TOOLS = [
	"add_texts",
	"add_captions",
	"list_models",
	"search_media",
	"set_keyframes",
	"add_transitions",
	"update_transition",
	"remove_transition",
	"import_media",
	"list_templates",
	"get_template",
	"resolve_template",
	"import_template",
	"update_template",
	"delete_template",
	"apply_edit_plan",
	"apply_composite_layout_plan",
	"get_timeline_state",
];

const searchablePhrase =
	"CodeCut transcript smoke searchable phrase. This audio verifies spoken search media indexing.";
const mcpRequestTimeoutMs = 180_000;

function usage() {
	return [
		"Usage:",
		"  node scripts/fresh-session-mcp-smoke.mjs [--project-id <id>] [--model-id whisper-tiny]",
		"  node scripts/fresh-session-mcp-smoke.mjs --surface-only",
		"",
		"Requires 4100 to be running with apps/web/.env.local bridge env.",
	].join("\n");
}

export function parseFreshSessionFlags(argv) {
	const flags = {};
	for (let index = 0; index < argv.length; index += 1) {
		const entry = argv[index];
		if (entry === "--help" || entry === "-h") {
			flags.help = true;
			continue;
		}
		if (entry === "--surface-only") {
			flags.surfaceOnly = true;
			continue;
		}
		if (!entry.startsWith("--")) {
			throw new Error(`Unexpected argument: ${entry}`);
		}
		const key = entry
			.slice(2)
			.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${entry}`);
		}
		flags[key] = value;
		index += 1;
	}
	return flags;
}

function requireTool({ toolsByName, name }) {
	const tool = toolsByName.get(name);
	if (!tool) {
		throw new Error(`Fresh MCP tool surface is missing '${name}'.`);
	}
	return tool;
}

function schemaProperties(tool) {
	return (
		tool?.inputSchema?.properties ?? tool?.inputSchema?.jsonSchema?.properties
	);
}

export function assertFreshMcpToolSurface({ tools }) {
	const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
	for (const name of REQUIRED_MCP_TOOLS) {
		requireTool({ toolsByName, name });
	}

	const importProperties = schemaProperties(
		requireTool({ toolsByName, name: "import_media" }),
	);
	if (!importProperties || typeof importProperties !== "object") {
		throw new Error("import_media input schema properties were not exposed.");
	}
	const importMediaInputs = ["bytes", "filePath", "url"].filter((name) =>
		Object.hasOwn(importProperties, name),
	);
	if (importMediaInputs.length !== 3) {
		throw new Error(
			`import_media is missing payload inputs: expected bytes,filePath,url; got ${importMediaInputs.join(",")}`,
		);
	}

	const templateImportProperties = schemaProperties(
		requireTool({ toolsByName, name: "import_template" }),
	);
	if (
		!templateImportProperties ||
		typeof templateImportProperties !== "object" ||
		!Object.hasOwn(templateImportProperties, "templateJsonFile") ||
		!Object.hasOwn(templateImportProperties, "confirmedByUser")
	) {
		throw new Error(
			"import_template input schema must expose templateJsonFile and confirmedByUser.",
		);
	}

	const templateListProperties = schemaProperties(
		requireTool({ toolsByName, name: "list_templates" }),
	);
	if (
		!templateListProperties ||
		typeof templateListProperties !== "object" ||
		Object.hasOwn(templateListProperties, "templateId") ||
		Object.hasOwn(templateListProperties, "requestedTemplate") ||
		Object.hasOwn(templateListProperties, "triggerType")
	) {
		throw new Error(
			"list_templates input schema must expose no template lookup inputs.",
		);
	}

	const templateGetProperties = schemaProperties(
		requireTool({ toolsByName, name: "get_template" }),
	);
	if (
		!templateGetProperties ||
		typeof templateGetProperties !== "object" ||
		!Object.hasOwn(templateGetProperties, "templateId")
	) {
		throw new Error("get_template input schema must expose templateId.");
	}

	const templateResolveProperties = schemaProperties(
		requireTool({ toolsByName, name: "resolve_template" }),
	);
	if (
		!templateResolveProperties ||
		typeof templateResolveProperties !== "object" ||
		!Object.hasOwn(templateResolveProperties, "requestedTemplate") ||
		!Object.hasOwn(templateResolveProperties, "triggerType")
	) {
		throw new Error(
			"resolve_template input schema must expose requestedTemplate and triggerType.",
		);
	}

	const templateUpdateProperties = schemaProperties(
		requireTool({ toolsByName, name: "update_template" }),
	);
	if (
		!templateUpdateProperties ||
		typeof templateUpdateProperties !== "object" ||
		!Object.hasOwn(templateUpdateProperties, "templateJsonFile") ||
		!Object.hasOwn(templateUpdateProperties, "confirmedByUser")
	) {
		throw new Error(
			"update_template input schema must expose templateJsonFile and confirmedByUser.",
		);
	}

	const templateDeleteProperties = schemaProperties(
		requireTool({ toolsByName, name: "delete_template" }),
	);
	if (
		!templateDeleteProperties ||
		typeof templateDeleteProperties !== "object" ||
		!Object.hasOwn(templateDeleteProperties, "templateId") ||
		!Object.hasOwn(templateDeleteProperties, "confirmedByUser")
	) {
		throw new Error(
			"delete_template input schema must expose templateId and confirmedByUser.",
		);
	}

	return {
		toolNames: REQUIRED_MCP_TOOLS,
		importMediaInputs: importMediaInputs.sort(),
		templateDeleteInputs: ["confirmedByUser", "templateId"],
		templateGetInputs: ["templateId"],
		templateImportInputs: ["confirmedByUser", "templateJsonFile"],
		templateListInputs: [],
		templateResolveInputs: ["requestedTemplate", "triggerType"],
		templateUpdateInputs: ["confirmedByUser", "templateJsonFile"],
	};
}

export function buildAudioEditPlan({ projectId, mediaId, duration }) {
	const durationSec = Math.floor(duration * 1000) / 1000;
	return {
		version: 1,
		projectId,
		sourceMediaId: mediaId,
		target: { durationSec, aspectRatio: "16:9" },
		clips: [
			{
				id: "spoken-audio-clip-1",
				sourceStart: 0,
				sourceEnd: durationSec,
				timelineStart: 0,
				reason:
					"Use the generated spoken audio directly for MCP caption and spoken search smoke.",
			},
		],
		rationale:
			"Verify add_captions can transcribe edited audio clips without wrapping audio in a video container.",
	};
}

export function summarizeTimelineReadback(data) {
	const textTracks = (data.tracks ?? []).filter(
		(track) => track.type === "text",
	);
	const textElements = textTracks.flatMap((track) =>
		(track.elements ?? []).filter((element) => element.type === "text"),
	);
	return {
		revision: data.project?.revision,
		textTrackCount: textTracks.length,
		textElementCount: textElements.length,
		captionTexts: textElements.map((element) => element.content),
	};
}

async function loadEnvFile(path) {
	const env = {};
	const content = await readFile(path, "utf8");
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;
		const [, key, rawValue] = match;
		env[key] = rawValue.replace(/^['"]|['"]$/g, "");
	}
	return env;
}

export async function loadBridgeEnv({ envFile, env }) {
	try {
		return { ...env, ...(await loadEnvFile(envFile)) };
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
		return { ...env };
	}
}

async function bridge(args, env) {
	const { stdout } = await execFileAsync(
		process.execPath,
		["scripts/codex-bridge.mjs", ...args],
		{
			cwd: pluginRoot,
			env,
			maxBuffer: 50 * 1024 * 1024,
		},
	);
	return JSON.parse(stdout);
}

async function generateSpeechWav({ workDir }) {
	const aiffPath = join(workDir, "codecut-mcp-fresh-audio-smoke.aiff");
	const wavPath = join(workDir, "codecut-mcp-fresh-audio-smoke.wav");
	await execFileAsync("say", [
		"-v",
		"Samantha",
		"-o",
		aiffPath,
		searchablePhrase,
	]);
	await execFileAsync("ffmpeg", [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		aiffPath,
		"-ar",
		"16000",
		"-ac",
		"1",
		wavPath,
	]);
	const { stdout } = await execFileAsync("ffprobe", [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"default=noprint_wrappers=1:nokey=1",
		wavPath,
	]);
	const duration = Number(stdout.trim());
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error(`ffprobe returned invalid duration: ${stdout.trim()}`);
	}
	return { wavPath, duration };
}

function structuredToolData(result) {
	if (result.structuredContent) return result.structuredContent;
	const text = result.content?.find((entry) => entry.type === "text")?.text;
	const jsonStart = text?.indexOf("{");
	if (jsonStart === undefined || jsonStart < 0) {
		throw new Error("MCP tool result did not include structured JSON.");
	}
	return JSON.parse(text.slice(jsonStart));
}

function firstBridgeResult(result) {
	const structured = structuredToolData(result);
	const bridgeResult = structured.results?.[0];
	if (!bridgeResult) {
		throw new Error("Codecut MCP tool did not return a bridge result.");
	}
	if (bridgeResult.success === false) {
		throw new Error(bridgeResult.message ?? "Codecut MCP tool failed.");
	}
	return bridgeResult;
}

export async function callCodecutTool(client, params) {
	return client.callTool(params, undefined, { timeout: mcpRequestTimeoutMs });
}

async function withMcpClient({ env }, callback) {
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: ["mcp/server.mjs"],
		cwd: pluginRoot,
		env,
		stderr: "pipe",
	});
	const client = new Client({
		name: "codecut-fresh-session-smoke",
		version: "1.0.0",
	});
	await client.connect(transport);
	try {
		return await callback(client);
	} finally {
		await client.close();
	}
}

async function waitForRuntime({ env }) {
	const baseUrl = env.CODECUT_AGENT_BRIDGE_URL?.replace(/\/$/, "");
	if (!baseUrl) throw new Error("CODECUT_AGENT_BRIDGE_URL is required.");
	const response = await fetch(`${baseUrl}/en/projects`);
	if (!response.ok) {
		throw new Error(`Codecut runtime is not ready: ${response.status}`);
	}
}

export async function runFreshSessionMcpSmoke({
	projectId = defaultProjectId,
	modelId = "whisper-tiny",
	env = process.env,
	surfaceOnly = false,
	waitForRuntimeImpl = waitForRuntime,
	bridgeImpl = bridge,
	withMcpClientImpl = withMcpClient,
} = {}) {
	const runtimeEnv = await loadBridgeEnv({
		envFile: resolve(pluginRoot, "apps/web/.env.local"),
		env,
	});
	if (surfaceOnly) {
		return withMcpClientImpl({ env: runtimeEnv }, async (client) => ({
			status: "passed",
			mode: "surface-only",
			toolSurface: assertFreshMcpToolSurface(
				await client.listTools().then((result) => ({ tools: result.tools })),
			),
		}));
	}

	await waitForRuntimeImpl({ env: runtimeEnv });
	await bridgeImpl(
		[
			"create-project",
			"--project-id",
			projectId,
			"--name",
			"MCP Fresh Audio Smoke",
		],
		runtimeEnv,
	);
	await bridgeImpl(["doctor-install", "--project-id", projectId], runtimeEnv);
	await bridgeImpl(["doctor", "--project-id", projectId], runtimeEnv);

	const workDir = await mkdtemp(join(tmpdir(), "codecut-mcp-fresh-smoke-"));
	const { wavPath, duration } = await generateSpeechWav({ workDir });

	return withMcpClientImpl({ env: runtimeEnv }, async (client) => {
		const toolSurface = assertFreshMcpToolSurface(
			await client.listTools().then((result) => ({ tools: result.tools })),
		);
		const models = firstBridgeResult(
			await callCodecutTool(client, {
				name: "list_models",
				arguments: { projectId, type: "transcription" },
			}),
		);
		const importResult = firstBridgeResult(
			await callCodecutTool(client, {
				name: "import_media",
				arguments: {
					projectId,
					filePath: wavPath,
					mimeType: "audio/wav",
					duration,
				},
			}),
		);
		const mediaId = importResult.data.assets[0].id;
		const planPath = join(workDir, "audio-edit-plan.json");
		await writeFile(
			planPath,
			JSON.stringify(
				buildAudioEditPlan({ projectId, mediaId, duration }),
				null,
				2,
			),
			"utf8",
		);
		await callCodecutTool(client, {
			name: "apply_edit_plan",
			arguments: { projectId, planJsonFile: planPath, replaceExisting: true },
		}).then(firstBridgeResult);
		const captions = firstBridgeResult(
			await callCodecutTool(client, {
				name: "add_captions",
				arguments: {
					projectId,
					language: "auto",
					modelId,
					captionStyle: {
						preset: "talking-head-pop",
						position: "lower-safe",
					},
				},
			}),
		);
		const timeline = firstBridgeResult(
			await callCodecutTool(client, {
				name: "get_timeline_state",
				arguments: {
					projectId,
					includeReferencedMedia: true,
					includeFrames: false,
				},
			}),
		);
		const searchable = firstBridgeResult(
			await callCodecutTool(client, {
				name: "search_media",
				arguments: {
					projectId,
					query: "searchable",
					scope: "spoken",
					limit: 5,
				},
			}),
		);
		const transcript = firstBridgeResult(
			await callCodecutTool(client, {
				name: "search_media",
				arguments: {
					projectId,
					query: "transcript",
					scope: "spoken",
					limit: 5,
				},
			}),
		);

		return {
			status: "passed",
			projectId,
			audioFile: wavPath,
			duration,
			toolSurface,
			modelCount: models.data.models.length,
			mediaId,
			captionCount: captions.data.captionCount,
			createdElementIds: captions.data.createdElementIds,
			timeline: summarizeTimelineReadback(timeline.data),
			search: {
				searchable: searchable.data,
				transcript: transcript.data,
			},
		};
	});
}

async function main() {
	const flags = parseFreshSessionFlags(process.argv.slice(2));
	if (flags.help) {
		console.log(usage());
		return;
	}
	const result = await runFreshSessionMcpSmoke({
		projectId: flags.projectId ?? defaultProjectId,
		modelId: flags.modelId ?? "whisper-tiny",
		surfaceOnly: flags.surfaceOnly === true,
	});
	console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
