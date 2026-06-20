#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requiredConfig = [
	"CUTIA_AGENT_BRIDGE_URL",
	"CUTIA_AGENT_BRIDGE_TOKEN",
	"CUTIA_AGENT_BRIDGE_TIMEOUT_MS",
	"CUTIA_AGENT_BRIDGE_INTERVAL_MS",
];

function usage() {
	return [
		"Usage:",
		"  node scripts/codex-bridge.mjs send --project-id <id> --tool <tool> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs import-media --project-id <id> --file-path /absolute/path/media-file",
		"  node scripts/codex-bridge.mjs transcribe --project-id <id> --media-id <id> --language <auto|code> --model-id <model>",
		"  node scripts/codex-bridge.mjs apply-plan --project-id <id> --plan-json-file /absolute/path/edit-plan.json --replace-existing <true|false>",
		"  node scripts/codex-bridge.mjs export --project-id <id> --format <mp4|webm> --quality <low|medium|high|very_high> --include-audio <true|false> --download <true|false>",
		"",
		"Required local env:",
		...requiredConfig.map((name) => `  ${name}`),
	].join("\n");
}

function parseFlags(argv) {
	const flags = {};
	for (let index = 0; index < argv.length; index += 1) {
		const entry = argv[index];
		if (!entry.startsWith("--")) {
			throw new Error(`Unexpected argument: ${entry}`);
		}

		const key = entry
			.slice(2)
			.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for --${key}`);
		}

		flags[key] = value;
		index += 1;
	}
	return flags;
}

function assertNoTokenFlags(flags) {
	const tokenFlagKeys = [
		"token",
		"bridgeToken",
		"agentBridgeToken",
		"cutiaAgentBridgeToken",
	];
	for (const key of tokenFlagKeys) {
		if (Object.hasOwn(flags, key)) {
			throw new Error("Token must be provided through CUTIA_AGENT_BRIDGE_TOKEN");
		}
	}
}

export function requireRuntimeConfig({ env }) {
	const baseUrl = env.CUTIA_AGENT_BRIDGE_URL;
	if (!baseUrl) {
		throw new Error("CUTIA_AGENT_BRIDGE_URL is required");
	}

	const token = env.CUTIA_AGENT_BRIDGE_TOKEN;
	if (!token) {
		throw new Error("CUTIA_AGENT_BRIDGE_TOKEN is required");
	}

	const timeoutMsRaw = env.CUTIA_AGENT_BRIDGE_TIMEOUT_MS;
	if (!timeoutMsRaw) {
		throw new Error("CUTIA_AGENT_BRIDGE_TIMEOUT_MS is required");
	}

	const intervalMsRaw = env.CUTIA_AGENT_BRIDGE_INTERVAL_MS;
	if (!intervalMsRaw) {
		throw new Error("CUTIA_AGENT_BRIDGE_INTERVAL_MS is required");
	}

	const timeoutMs = Number(timeoutMsRaw);
	const intervalMs = Number(intervalMsRaw);
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error("CUTIA_AGENT_BRIDGE_TIMEOUT_MS must be a positive number");
	}
	if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
		throw new Error("CUTIA_AGENT_BRIDGE_INTERVAL_MS must be a positive number");
	}

	return {
		baseUrl: baseUrl.replace(/\/$/, ""),
		token,
		timeoutMs,
		intervalMs,
	};
}

export function parseBoolean(value, label) {
	if (value === "true") return true;
	if (value === "false") return false;
	throw new Error(`${label} must be true or false`);
}

export function buildCommandEnvelope({ projectId, tool, args }) {
	if (!projectId) {
		throw new Error("--project-id is required");
	}
	if (!tool) {
		throw new Error("--tool is required");
	}
	if (!args || typeof args !== "object" || Array.isArray(args)) {
		throw new Error("--args-json must be a JSON object");
	}

	return {
		version: 1,
		projectId,
		source: "codex",
		commands: [{ id: "cmd-1", tool, args }],
	};
}

export function buildExportEnvelope({
	projectId,
	format,
	quality,
	includeAudio,
	download,
	fileName,
}) {
	if (!format) {
		throw new Error("--format is required");
	}
	if (!quality) {
		throw new Error("--quality is required");
	}
	if (typeof includeAudio !== "boolean") {
		throw new Error("--include-audio is required");
	}
	if (typeof download !== "boolean") {
		throw new Error("--download is required");
	}

	return buildCommandEnvelope({
		projectId,
		tool: "export_project",
		args: {
			format,
			quality,
			includeAudio,
			download,
			...(fileName ? { fileName } : {}),
		},
	});
}

export function buildTranscribeEnvelope({
	projectId,
	mediaId,
	language,
	modelId,
}) {
	if (!mediaId) {
		throw new Error("--media-id is required");
	}
	if (!language) {
		throw new Error("--language is required");
	}
	if (!modelId) {
		throw new Error("--model-id is required");
	}

	return buildCommandEnvelope({
		projectId,
		tool: "transcribe_media",
		args: {
			mediaId,
			language,
			modelId,
		},
	});
}

const extensionMimeTypes = new Map([
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".png", "image/png"],
	[".webp", "image/webp"],
	[".gif", "image/gif"],
	[".svg", "image/svg+xml"],
	[".mp4", "video/mp4"],
	[".m4v", "video/mp4"],
	[".mov", "video/quicktime"],
	[".webm", "video/webm"],
	[".mkv", "video/x-matroska"],
	[".mp3", "audio/mpeg"],
	[".wav", "audio/wav"],
	[".m4a", "audio/mp4"],
	[".aac", "audio/aac"],
	[".ogg", "audio/ogg"],
	[".flac", "audio/flac"],
]);

function mimeTypeForFilePath({ filePath }) {
	const extension = extname(filePath).toLowerCase();
	const mimeType = extensionMimeTypes.get(extension);
	if (!mimeType) {
		throw new Error("--file-path must point to a supported media file");
	}
	return mimeType;
}

export async function buildImportMediaEnvelope({ projectId, filePath }) {
	if (!filePath) {
		throw new Error("--file-path is required");
	}
	if (!isAbsolute(filePath)) {
		throw new Error("--file-path must be an absolute path");
	}

	const fileStat = await stat(filePath);
	if (!fileStat.isFile()) {
		throw new Error("--file-path must point to a regular file");
	}

	const content = await readFile(filePath);
	return buildCommandEnvelope({
		projectId,
		tool: "import_media_file",
		args: {
			fileName: basename(filePath),
			mimeType: mimeTypeForFilePath({ filePath }),
			base64: content.toString("base64"),
			size: fileStat.size,
			lastModified: fileStat.mtimeMs,
		},
	});
}

export async function buildApplyPlanEnvelope({
	projectId,
	planJsonFile,
	replaceExisting,
}) {
	if (!planJsonFile) {
		throw new Error("--plan-json-file is required");
	}
	if (!isAbsolute(planJsonFile)) {
		throw new Error("--plan-json-file must be an absolute path");
	}
	if (typeof replaceExisting !== "boolean") {
		throw new Error("--replace-existing is required");
	}

	const plan = JSON.parse(await readFile(planJsonFile, "utf8"));
	if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
		throw new Error("--plan-json-file must contain a JSON object");
	}

	return buildCommandEnvelope({
		projectId,
		tool: "apply_edit_plan",
		args: {
			plan,
			replaceExisting,
		},
	});
}

async function postEnvelope({ config, envelope, fetchImpl }) {
	const response = await fetchImpl(`${config.baseUrl}/api/agent-bridge/commands`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${config.token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ envelope }),
	});

	const text = await response.text();
	if (!response.ok) {
		throw new Error(`Command enqueue failed: ${response.status} ${text}`);
	}
	return JSON.parse(text);
}

async function pollResult({ config, id, fetchImpl }) {
	const deadline = Date.now() + config.timeoutMs;
	while (Date.now() <= deadline) {
		const response = await fetchImpl(
			`${config.baseUrl}/api/agent-bridge/results?id=${encodeURIComponent(id)}`,
			{ headers: { Authorization: `Bearer ${config.token}` } },
		);
		const text = await response.text();
		if (!response.ok) {
			throw new Error(`Result polling failed: ${response.status} ${text}`);
		}

		const payload = JSON.parse(text);
		if (payload.status === "completed") {
			return payload;
		}

		await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
	}

	throw new Error(`Timed out waiting for bridge result ${id}`);
}

export async function runCli({
	argv,
	env,
	fetchImpl = fetch,
	stdout = console.log,
}) {
	const [command, ...rest] = argv;
	if (!command || command === "help" || command === "--help") {
		stdout(usage());
		return 0;
	}

	const flags = parseFlags(rest);
	assertNoTokenFlags(flags);
	const config = requireRuntimeConfig({ env, flags });
	let envelope;

	if (command === "send") {
		if (!flags.argsJson) {
			throw new Error("--args-json is required");
		}
		envelope = buildCommandEnvelope({
			projectId: flags.projectId,
			tool: flags.tool,
			args: JSON.parse(flags.argsJson),
		});
	} else if (command === "export") {
		envelope = buildExportEnvelope({
			projectId: flags.projectId,
			format: flags.format,
			quality: flags.quality,
			includeAudio: parseBoolean(flags.includeAudio, "includeAudio"),
			download: parseBoolean(flags.download, "download"),
			fileName: flags.fileName,
		});
	} else if (command === "import-media") {
		envelope = await buildImportMediaEnvelope({
			projectId: flags.projectId,
			filePath: flags.filePath,
		});
	} else if (command === "transcribe") {
		envelope = buildTranscribeEnvelope({
			projectId: flags.projectId,
			mediaId: flags.mediaId,
			language: flags.language,
			modelId: flags.modelId,
		});
	} else if (command === "apply-plan") {
		envelope = await buildApplyPlanEnvelope({
			projectId: flags.projectId,
			planJsonFile: flags.planJsonFile,
			replaceExisting: parseBoolean(flags.replaceExisting, "replaceExisting"),
		});
	} else {
		throw new Error(`Unknown command: ${command}`);
	}

	const queued = await postEnvelope({ config, envelope, fetchImpl });
	const result = await pollResult({ config, id: queued.id, fetchImpl });
	stdout(JSON.stringify(result, null, 2));
	return 0;
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	runCli({ argv: process.argv.slice(2), env: process.env }).catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		console.error(usage());
		process.exitCode = 1;
	});
}
