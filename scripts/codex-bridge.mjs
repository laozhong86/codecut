#!/usr/bin/env node

import { access, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildRsyncArgs } from "./sync-codex-local-plugin.mjs";

const requiredConfig = [
	"CODECUT_AGENT_BRIDGE_URL",
	"CODECUT_AGENT_BRIDGE_TOKEN",
	"CODECUT_AGENT_BRIDGE_TIMEOUT_MS",
	"CODECUT_AGENT_BRIDGE_INTERVAL_MS",
];
const execFileAsync = promisify(execFile);

function usage() {
	return [
		"Usage:",
		"  node scripts/codex-bridge.mjs create-project --project-id <id> --name <name>",
		"  node scripts/codex-bridge.mjs doctor-install --project-id <id>",
		"  node scripts/codex-bridge.mjs doctor --project-id <id>",
		"  node scripts/codex-bridge.mjs send --project-id <id> --tool <tool> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs import-media --project-id <id> --file-path /absolute/path/media-file",
		"  node scripts/codex-bridge.mjs transcribe --project-id <id> --media-id <id> --language <auto|code> --model-id <model>",
		"  node scripts/codex-bridge.mjs build-video-context --project-id <id> --media-id <id> --language <auto|code> --model-id <model>",
		"  node scripts/codex-bridge.mjs build-visual-context --project-id <id> --media-id <id> --target-aspect-ratio <9:16|16:9|1:1>",
		"  node scripts/codex-bridge.mjs inspect-video-range --project-id <id> --media-id <id> --start-seconds <seconds> --end-seconds <seconds> [--frame-count <1..16>]",
		"  node scripts/codex-bridge.mjs build-post-cut-captions --project-id <id> --language <auto|code> --model-id <model>",
		"  node scripts/codex-bridge.mjs generate-digital-human --project-id <id> --image-media-id <id> --audio-media-id <id> --script-text \"...\" --motion-prompt \"...\" --width 1280 --height 720 --fps 25",
		"  node scripts/codex-bridge.mjs validate-edit-plan --project-id <id> --plan-json-file /absolute/path/edit-plan.json",
		"  node scripts/codex-bridge.mjs preview-edit-plan --project-id <id> --plan-json-file /absolute/path/edit-plan.json",
		"  node scripts/codex-bridge.mjs apply-plan --project-id <id> --plan-json-file /absolute/path/edit-plan.json --replace-existing <true|false>",
		"  node scripts/codex-bridge.mjs apply-narrated-remix-plan --project-id <id> --plan-json-file /absolute/path/remix-plan.json --replace-existing <true|false>",
		"  node scripts/codex-bridge.mjs verify-timeline --project-id <id> --verification-json-file /absolute/path/verification.json",
		"  node scripts/codex-bridge.mjs export --project-id <id> --format <mp4|webm> --quality <low|medium|high|very_high> --include-audio <true|false> --output-file /absolute/path/out.mp4 --overwrite <true|false>",
		"  node scripts/codex-bridge.mjs list-projects",
		"  node scripts/codex-bridge.mjs rename-project --project-id <id> --name <name>",
		"  node scripts/codex-bridge.mjs delete-project --project-id <id>",
		"",
		"Required local env:",
		...requiredConfig.map((name) => `  ${name}`),
		"",
		"Codex executor commands do not require a browser tab. The browser URL is only for human preview.",
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
		"codecutAgentBridgeToken",
	];
	for (const key of tokenFlagKeys) {
		if (Object.hasOwn(flags, key)) {
			throw new Error(
				"Token must be provided through CODECUT_AGENT_BRIDGE_TOKEN",
			);
		}
	}
}

export function requireRuntimeConfig({ env }) {
	const baseUrl = env.CODECUT_AGENT_BRIDGE_URL;
	if (!baseUrl) {
		throw new Error("CODECUT_AGENT_BRIDGE_URL is required");
	}

	const token = env.CODECUT_AGENT_BRIDGE_TOKEN;
	if (!token) {
		throw new Error("CODECUT_AGENT_BRIDGE_TOKEN is required");
	}

	const timeoutMsRaw = env.CODECUT_AGENT_BRIDGE_TIMEOUT_MS;
	if (!timeoutMsRaw) {
		throw new Error("CODECUT_AGENT_BRIDGE_TIMEOUT_MS is required");
	}

	const intervalMsRaw = env.CODECUT_AGENT_BRIDGE_INTERVAL_MS;
	if (!intervalMsRaw) {
		throw new Error("CODECUT_AGENT_BRIDGE_INTERVAL_MS is required");
	}

	const timeoutMs = Number(timeoutMsRaw);
	const intervalMs = Number(intervalMsRaw);
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error(
			"CODECUT_AGENT_BRIDGE_TIMEOUT_MS must be a positive number",
		);
	}
	if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
		throw new Error(
			"CODECUT_AGENT_BRIDGE_INTERVAL_MS must be a positive number",
		);
	}

	return {
		baseUrl: baseUrl.replace(/\/$/, ""),
		token,
		timeoutMs,
		intervalMs,
	};
}

async function pathExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function doctorCheck({ id, ok, message, data }) {
	return {
		id,
		ok,
		message,
		...(data ? { data } : {}),
	};
}

async function readPluginManifest(path) {
	const content = await readFile(path, "utf8");
	const manifest = JSON.parse(content);
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		throw new Error("plugin.json must contain a JSON object");
	}
	return manifest;
}

async function checkSourcePlugin({ cwd }) {
	const manifestPath = join(cwd, ".codex-plugin/plugin.json");
	const skillPath = join(
		cwd,
		"skills/codecut-jianying-editor-framework/SKILL.md",
	);

	let manifest;
	try {
		manifest = await readPluginManifest(manifestPath);
	} catch (error) {
		return {
			check: doctorCheck({
				id: "source_plugin",
				ok: false,
				message: `Cannot read source plugin manifest: ${error instanceof Error ? error.message : String(error)}`,
				data: { manifestPath, skillPath },
			}),
			manifest: null,
		};
	}

	if (manifest.name !== "codecut") {
		return {
			check: doctorCheck({
				id: "source_plugin",
				ok: false,
				message: `Source plugin name must be codecut, got ${String(manifest.name)}`,
				data: { manifestPath, skillPath, version: manifest.version },
			}),
			manifest,
		};
	}
	if (!manifest.version || typeof manifest.version !== "string") {
		return {
			check: doctorCheck({
				id: "source_plugin",
				ok: false,
				message: "Source plugin version is required",
				data: { manifestPath, skillPath },
			}),
			manifest,
		};
	}
	if (!(await pathExists(skillPath))) {
		return {
			check: doctorCheck({
				id: "source_plugin",
				ok: false,
				message: "Source Codecut skill is missing",
				data: { manifestPath, skillPath, version: manifest.version },
			}),
			manifest,
		};
	}

	return {
		check: doctorCheck({
			id: "source_plugin",
			ok: true,
			message: "Source Codecut plugin is valid.",
			data: { manifestPath, skillPath, version: manifest.version },
		}),
		manifest,
	};
}

async function checkCachePlugin({ homeDir, sourceManifest }) {
	if (!sourceManifest?.version) {
		return {
			check: doctorCheck({
				id: "cache_plugin",
				ok: false,
				message: "Source plugin version is required before checking cache.",
			}),
			cacheRoot: null,
		};
	}

	const cacheRoot = join(
		homeDir,
		".codex/plugins/cache/local-opc/codecut",
		sourceManifest.version,
	);
	const manifestPath = join(cacheRoot, ".codex-plugin/plugin.json");
	const skillPath = join(
		cacheRoot,
		"skills/codecut-jianying-editor-framework/SKILL.md",
	);
	let manifest;
	try {
		manifest = await readPluginManifest(manifestPath);
	} catch (error) {
		return {
			check: doctorCheck({
				id: "cache_plugin",
				ok: false,
				message: `Cannot read installed plugin manifest: ${error instanceof Error ? error.message : String(error)}`,
				data: { cacheRoot, manifestPath, skillPath },
			}),
			cacheRoot,
		};
	}

	if (manifest.name !== "codecut") {
		return {
			check: doctorCheck({
				id: "cache_plugin",
				ok: false,
				message: `Installed plugin name must be codecut, got ${String(manifest.name)}`,
				data: { cacheRoot, manifestPath, skillPath, version: manifest.version },
			}),
			cacheRoot,
		};
	}
	if (manifest.version !== sourceManifest.version) {
		return {
			check: doctorCheck({
				id: "cache_plugin",
				ok: false,
				message: `Installed plugin version must match source ${sourceManifest.version}, got ${String(manifest.version)}`,
				data: { cacheRoot, manifestPath, skillPath, version: manifest.version },
			}),
			cacheRoot,
		};
	}
	if (!(await pathExists(skillPath))) {
		return {
			check: doctorCheck({
				id: "cache_plugin",
				ok: false,
				message: "Installed Codecut skill is missing",
				data: { cacheRoot, manifestPath, skillPath, version: manifest.version },
			}),
			cacheRoot,
		};
	}

	return {
		check: doctorCheck({
			id: "cache_plugin",
			ok: true,
			message: "Installed Codecut plugin cache is valid.",
			data: { cacheRoot, manifestPath, skillPath, version: manifest.version },
		}),
		cacheRoot,
	};
}

function parseRsyncChangedPaths(output) {
	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const deletingMatch = line.match(/^\*deleting\s+(.+)$/);
			if (deletingMatch) return deletingMatch[1];

			const itemizedMatch = line.match(/^\S+\s+(.+)$/);
			return itemizedMatch ? itemizedMatch[1] : line;
		});
}

async function checkPluginSync({
	cwd,
	cacheRoot,
	sourceOk,
	cacheOk,
	execFileImpl,
}) {
	if (!sourceOk || !cacheOk || !cacheRoot) {
		return doctorCheck({
			id: "plugin_sync",
			ok: false,
			message:
				"Source and installed cache must be valid before checking plugin sync.",
			data: { sourceOk, cacheOk, cacheRoot },
		});
	}

	const args = [
		"--checksum",
		"--itemize-changes",
		...buildRsyncArgs({ sourceRoot: cwd, cacheRoot, dryRun: true }),
	];
	try {
		const { stdout } = await execFileImpl("rsync", args);
		const changedPaths = parseRsyncChangedPaths(String(stdout ?? ""));
		if (changedPaths.length > 0) {
			return doctorCheck({
				id: "plugin_sync",
				ok: false,
				message:
					"Installed Codecut plugin cache is out of sync with the source tree.",
				data: { sourceRoot: cwd, cacheRoot, changedPaths },
			});
		}
		return doctorCheck({
			id: "plugin_sync",
			ok: true,
			message: "Installed Codecut plugin cache matches the source tree.",
			data: { sourceRoot: cwd, cacheRoot },
		});
	} catch (error) {
		return doctorCheck({
			id: "plugin_sync",
			ok: false,
			message: `Plugin sync check failed: ${error instanceof Error ? error.message : String(error)}`,
			data: { sourceRoot: cwd, cacheRoot },
		});
	}
}

function checkEnvironment({ env }) {
	const missing = requiredConfig.filter((name) => !env[name]);
	if (missing.length > 0) {
		return {
			check: doctorCheck({
				id: "environment",
				ok: false,
				message: `Missing ${missing.join(", ")}`,
				data: {
					required: requiredConfig,
					present: requiredConfig.filter((name) => Boolean(env[name])),
				},
			}),
			config: null,
		};
	}

	try {
		const config = requireRuntimeConfig({ env });
		return {
			check: doctorCheck({
				id: "environment",
				ok: true,
				message: "Required CODECUT_AGENT_BRIDGE_* environment is present.",
				data: {
					baseUrl: config.baseUrl,
					timeoutMs: config.timeoutMs,
					intervalMs: config.intervalMs,
					hasToken: true,
				},
			}),
			config,
		};
	} catch (error) {
		return {
			check: doctorCheck({
				id: "environment",
				ok: false,
				message: error instanceof Error ? error.message : String(error),
			}),
			config: null,
		};
	}
}

async function checkWebService({ config, fetchImpl }) {
	if (!config) {
		return doctorCheck({
			id: "web_service",
			ok: false,
			message:
				"CODECUT_AGENT_BRIDGE_* env is required before checking web service.",
		});
	}

	const url = `${config.baseUrl}/en/projects`;
	try {
		const response = await fetchImpl(url);
		if (!response.ok) {
			return doctorCheck({
				id: "web_service",
				ok: false,
				message: `Codecut web service returned ${response.status}`,
				data: { url },
			});
		}
		return doctorCheck({
			id: "web_service",
			ok: true,
			message: "Codecut web service is reachable.",
			data: { url },
		});
	} catch (error) {
		return doctorCheck({
			id: "web_service",
			ok: false,
			message: `Codecut web service is not reachable: ${error instanceof Error ? error.message : String(error)}`,
			data: { url },
		});
	}
}

async function checkExecutorProject({ projectId, config, fetchImpl }) {
	if (!projectId) {
		return doctorCheck({
			id: "executor_project",
			ok: false,
			message: "--project-id is required",
		});
	}
	if (!config) {
		return doctorCheck({
			id: "executor_project",
			ok: false,
			message:
				"CODECUT_AGENT_BRIDGE_* env is required before checking executor project.",
			data: { projectId },
		});
	}

	try {
		const executor = await fetchExecutorStatus({
			config,
			projectId,
			fetchImpl,
		});
		return doctorCheck({
			id: "executor_project",
			ok: true,
			message: "Executor project is ready.",
			data: {
				projectId,
				status: executor.status,
				message: executor.message,
				editorUrl: executor.editorUrl,
			},
		});
	} catch (error) {
		return doctorCheck({
			id: "executor_project",
			ok: false,
			message: error instanceof Error ? error.message : String(error),
			data: { projectId },
		});
	}
}

async function checkNodeRenderer({ cwd }) {
	try {
		const requireFromWeb = createRequire(join(cwd, "apps/web/package.json"));
		const { createCanvas } = requireFromWeb("@napi-rs/canvas");
		const { VideoEncoder, AudioEncoder } = requireFromWeb("@napi-rs/webcodecs");

		const canvas = createCanvas(16, 16);
		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("Failed to create a Node canvas 2D context.");
		}
		context.fillStyle = "#000000";
		context.fillRect(0, 0, 16, 16);

		const [h264, vp9, aac, opus] = await Promise.all([
			VideoEncoder.isConfigSupported({
				codec: "avc1.42001E",
				width: 16,
				height: 16,
				bitrate: 100_000,
				framerate: 1,
			}),
			VideoEncoder.isConfigSupported({
				codec: "vp09.00.10.08",
				width: 16,
				height: 16,
				bitrate: 100_000,
				framerate: 1,
			}),
			AudioEncoder.isConfigSupported({
				codec: "mp4a.40.2",
				sampleRate: 48_000,
				numberOfChannels: 2,
				bitrate: 128_000,
			}),
			AudioEncoder.isConfigSupported({
				codec: "opus",
				sampleRate: 48_000,
				numberOfChannels: 2,
				bitrate: 128_000,
			}),
		]);

		const support = {
			canvas: true,
			h264: Boolean(h264.supported),
			vp9: Boolean(vp9.supported),
			aac: Boolean(aac.supported),
			opus: Boolean(opus.supported),
		};
		const unsupported = Object.entries(support)
			.filter(([, ok]) => !ok)
			.map(([name]) => name);
		if (unsupported.length > 0) {
			return doctorCheck({
				id: "node_renderer",
				ok: false,
				message: `Node renderer codec support is missing: ${unsupported.join(", ")}`,
				data: support,
			});
		}

		return doctorCheck({
			id: "node_renderer",
			ok: true,
			message: "Node Canvas/WebCodecs renderer is available.",
			data: support,
		});
	} catch (error) {
		return doctorCheck({
			id: "node_renderer",
			ok: false,
			message: `Node renderer check failed: ${error instanceof Error ? error.message : String(error)}`,
		});
	}
}

export async function runInstallDoctor({
	projectId,
	cwd = process.cwd(),
	homeDir = homedir(),
	env = process.env,
	fetchImpl = fetch,
	execFileImpl = execFileAsync,
	nodeRendererProbe = checkNodeRenderer,
}) {
	const source = await checkSourcePlugin({ cwd });
	const cache = await checkCachePlugin({
		homeDir,
		sourceManifest: source.manifest,
	});
	const environment = checkEnvironment({ env });
	const checks = [
		source.check,
		cache.check,
		await checkPluginSync({
			cwd,
			cacheRoot: cache.cacheRoot,
			sourceOk: source.check.ok,
			cacheOk: cache.check.ok,
			execFileImpl,
		}),
		environment.check,
		await nodeRendererProbe({ cwd }),
		await checkWebService({ config: environment.config, fetchImpl }),
		await checkExecutorProject({
			projectId,
			config: environment.config,
			fetchImpl,
		}),
	];
	return {
		ok: checks.every((check) => check.ok),
		checks,
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
	outputFile,
	overwrite,
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
	if (!outputFile) {
		throw new Error("--output-file is required");
	}
	if (!isAbsolute(outputFile)) {
		throw new Error("--output-file must be an absolute path");
	}
	if (typeof overwrite !== "boolean") {
		throw new Error("--overwrite is required");
	}

	return buildCommandEnvelope({
		projectId,
		tool: "export_project",
		args: {
			format,
			quality,
			includeAudio,
			outputFile,
			overwrite,
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

export function buildVideoContextEnvelope({
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
		tool: "build_video_context",
		args: {
			mediaId,
			language,
			modelId,
		},
	});
}

export function buildVisualContextEnvelope({
	projectId,
	mediaId,
	targetAspectRatio,
}) {
	if (!mediaId) {
		throw new Error("--media-id is required");
	}
	if (!targetAspectRatio) {
		throw new Error("--target-aspect-ratio is required");
	}
	if (!["9:16", "16:9", "1:1"].includes(targetAspectRatio)) {
		throw new Error("--target-aspect-ratio must be one of 9:16, 16:9, 1:1");
	}

	return buildCommandEnvelope({
		projectId,
		tool: "build_visual_context",
		args: {
			mediaId,
			targetAspectRatio,
		},
	});
}

export function buildInspectVideoRangeEnvelope({
	projectId,
	mediaId,
	startSeconds,
	endSeconds,
	frameCount,
}) {
	if (!mediaId) {
		throw new Error("--media-id is required");
	}
	if (!Number.isFinite(startSeconds) || startSeconds < 0) {
		throw new Error("--start-seconds must be a finite non-negative number");
	}
	if (!Number.isFinite(endSeconds)) {
		throw new Error("--end-seconds must be a finite number");
	}
	if (endSeconds <= startSeconds) {
		throw new Error("--end-seconds must be greater than --start-seconds");
	}
	if (
		frameCount !== undefined &&
		(!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 16)
	) {
		throw new Error("--frame-count must be an integer from 1 to 16");
	}

	return buildCommandEnvelope({
		projectId,
		tool: "inspect_video_range",
		args: {
			mediaId,
			startSeconds,
			endSeconds,
			...(frameCount === undefined ? {} : { frameCount }),
		},
	});
}

export function buildPostCutCaptionsEnvelope({ projectId, language, modelId }) {
	if (!language) {
		throw new Error("--language is required");
	}
	if (!modelId) {
		throw new Error("--model-id is required");
	}

	return buildCommandEnvelope({
		projectId,
		tool: "build_post_cut_captions",
		args: {
			language,
			modelId,
		},
	});
}

function parsePositiveNumber(value, label) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`--${label} must be a positive number`);
	}
	return parsed;
}

export function buildDigitalHumanEnvelope({
	projectId,
	imageMediaId,
	audioMediaId,
	scriptText,
	motionPrompt,
	width,
	height,
	fps,
}) {
	if (!imageMediaId) {
		throw new Error("--image-media-id is required");
	}
	if (!audioMediaId) {
		throw new Error("--audio-media-id is required");
	}
	if (!scriptText?.trim()) {
		throw new Error("--script-text is required");
	}
	if (!motionPrompt?.trim()) {
		throw new Error("--motion-prompt is required");
	}
	const parsedWidth = parsePositiveNumber(width, "width");
	const parsedHeight = parsePositiveNumber(height, "height");
	const parsedFps = parsePositiveNumber(fps, "fps");

	return buildCommandEnvelope({
		projectId,
		tool: "generate_digital_human",
		args: {
			imageMediaId,
			audioMediaId,
			scriptText: scriptText.trim(),
			motionPrompt: motionPrompt.trim(),
			width: parsedWidth,
			height: parsedHeight,
			fps: parsedFps,
		},
	});
}

async function readJsonObjectFile({ filePath, flagName }) {
	if (!filePath) {
		throw new Error(`--${flagName} is required`);
	}
	if (!isAbsolute(filePath)) {
		throw new Error(`--${flagName} must be an absolute path`);
	}
	const value = JSON.parse(await readFile(filePath, "utf8"));
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`--${flagName} must contain a JSON object`);
	}
	return value;
}

function requireRunningHubApiKey({ env }) {
	if (!env.RUNNINGHUB_API_KEY) {
		throw new Error("RUNNINGHUB_API_KEY is required");
	}
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

export async function probeMediaFile({
	filePath,
	execFileImpl = execFileAsync,
}) {
	const { stdout } = await execFileImpl("ffprobe", [
		"-v",
		"error",
		"-print_format",
		"json",
		"-show_entries",
		"format=duration:stream=width,height",
		filePath,
	]);
	const payload = JSON.parse(stdout);
	const duration = Number(payload?.format?.duration);
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error("ffprobe could not read a positive media duration");
	}
	const videoStream = Array.isArray(payload?.streams)
		? payload.streams.find(
				(stream) =>
					Number.isFinite(Number(stream.width)) &&
					Number.isFinite(Number(stream.height)),
			)
		: null;
	return {
		duration,
		...(videoStream
			? {
					width: Number(videoStream.width),
					height: Number(videoStream.height),
				}
			: {}),
	};
}

export async function buildImportMediaEnvelope({
	projectId,
	filePath,
	mediaMetadata,
}) {
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
			...(mediaMetadata ?? {}),
		},
	});
}

export async function buildApplyPlanEnvelope({
	projectId,
	planJsonFile,
	replaceExisting,
}) {
	if (typeof replaceExisting !== "boolean") {
		throw new Error("--replace-existing is required");
	}
	const plan = await readJsonObjectFile({
		filePath: planJsonFile,
		flagName: "plan-json-file",
	});

	return buildCommandEnvelope({
		projectId,
		tool: "apply_edit_plan",
		args: {
			plan,
			replaceExisting,
		},
	});
}

export async function buildNarratedRemixPlanEnvelope({
	projectId,
	planJsonFile,
	replaceExisting,
}) {
	if (typeof replaceExisting !== "boolean") {
		throw new Error("--replace-existing is required");
	}
	const plan = await readJsonObjectFile({
		filePath: planJsonFile,
		flagName: "plan-json-file",
	});

	return buildCommandEnvelope({
		projectId,
		tool: "apply_narrated_remix_plan",
		args: {
			plan,
			replaceExisting,
		},
	});
}

export async function buildValidateEditPlanEnvelope({
	projectId,
	planJsonFile,
}) {
	const plan = await readJsonObjectFile({
		filePath: planJsonFile,
		flagName: "plan-json-file",
	});
	return buildCommandEnvelope({
		projectId,
		tool: "validate_edit_plan",
		args: { plan },
	});
}

export async function buildPreviewEditPlanEnvelope({
	projectId,
	planJsonFile,
}) {
	const plan = await readJsonObjectFile({
		filePath: planJsonFile,
		flagName: "plan-json-file",
	});
	return buildCommandEnvelope({
		projectId,
		tool: "preview_edit_plan",
		args: { plan },
	});
}

export async function buildVerifyTimelineEnvelope({
	projectId,
	verificationJsonFile,
}) {
	const verification = await readJsonObjectFile({
		filePath: verificationJsonFile,
		flagName: "verification-json-file",
	});
	return buildCommandEnvelope({
		projectId,
		tool: "verify_timeline",
		args: { verification },
	});
}

async function postEnvelope({ config, envelope, fetchImpl }) {
	return postExecutorEnvelope({ config, envelope, fetchImpl });
}

async function postExecutorEnvelope({ config, envelope, fetchImpl }) {
	const response = await fetchImpl(
		`${config.baseUrl}/api/codex-executor/commands`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ envelope }),
		},
	);

	const text = await response.text();
	if (!response.ok) {
		throw new Error(`Executor command failed: ${response.status} ${text}`);
	}
	return JSON.parse(text);
}

async function postExecutorProject({ config, projectId, name, fetchImpl }) {
	const response = await fetchImpl(
		`${config.baseUrl}/api/codex-executor/projects`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ projectId, name }),
		},
	);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(
			`Executor project creation failed: ${response.status} ${text}`,
		);
	}
	return JSON.parse(text);
}

async function fetchExecutorProjects({ config, fetchImpl }) {
	const response = await fetchImpl(
		`${config.baseUrl}/api/codex-executor/projects`,
		{
			method: "GET",
			headers: { Authorization: `Bearer ${config.token}` },
		},
	);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`Executor project list failed: ${response.status} ${text}`);
	}
	return JSON.parse(text);
}

async function patchExecutorProject({ config, projectId, name, fetchImpl }) {
	const response = await fetchImpl(
		`${config.baseUrl}/api/codex-executor/project`,
		{
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${config.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ projectId, name }),
		},
	);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`Executor project rename failed: ${response.status} ${text}`);
	}
	return JSON.parse(text);
}

async function deleteExecutorProject({ config, projectId, fetchImpl }) {
	const response = await fetchImpl(
		`${config.baseUrl}/api/codex-executor/project`,
		{
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${config.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ projectId }),
		},
	);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`Executor project delete failed: ${response.status} ${text}`);
	}
	return JSON.parse(text);
}

async function fetchExecutorStatus({ config, projectId, fetchImpl }) {
	const response = await fetchImpl(
		`${config.baseUrl}/api/codex-executor/status?projectId=${encodeURIComponent(projectId)}`,
		{ headers: { Authorization: `Bearer ${config.token}` } },
	);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(
			`Executor readiness check failed: ${response.status} ${text}`,
		);
	}
	return JSON.parse(text);
}

export async function waitForExecutor({ config, projectId, fetchImpl }) {
	if (!projectId) {
		throw new Error("--project-id is required");
	}
	return fetchExecutorStatus({ config, projectId, fetchImpl });
}

export async function runCli({
	argv,
	env,
	fetchImpl = fetch,
	stdout = console.log,
	cwd = process.cwd(),
	homeDir = homedir(),
}) {
	const [command, ...rest] = argv;
	if (!command || command === "help" || command === "--help") {
		stdout(usage());
		return 0;
	}

	const flags = parseFlags(rest);
	assertNoTokenFlags(flags);

	if (command === "doctor-install") {
		const result = await runInstallDoctor({
			projectId: flags.projectId,
			cwd,
			homeDir,
			env,
			fetchImpl,
		});
		stdout(JSON.stringify(result, null, 2));
		return result.ok ? 0 : 1;
	}

	const config = requireRuntimeConfig({ env, flags });
	let envelope;

	if (command === "create-project") {
		if (!flags.projectId) {
			throw new Error("--project-id is required");
		}
		if (!flags.name) {
			throw new Error("--name is required");
		}
		const result = await postExecutorProject({
			config,
			projectId: flags.projectId,
			name: flags.name,
			fetchImpl,
		});
		stdout(JSON.stringify(result, null, 2));
		return 0;
	} else if (command === "list-projects") {
		const result = await fetchExecutorProjects({ config, fetchImpl });
		stdout(JSON.stringify(result, null, 2));
		return 0;
	} else if (command === "rename-project") {
		if (!flags.projectId) {
			throw new Error("--project-id is required");
		}
		if (!flags.name) {
			throw new Error("--name is required");
		}
		const result = await patchExecutorProject({
			config,
			projectId: flags.projectId,
			name: flags.name,
			fetchImpl,
		});
		stdout(JSON.stringify(result, null, 2));
		return 0;
	} else if (command === "delete-project") {
		if (!flags.projectId) {
			throw new Error("--project-id is required");
		}
		const result = await deleteExecutorProject({
			config,
			projectId: flags.projectId,
			fetchImpl,
		});
		stdout(JSON.stringify(result, null, 2));
		return 0;
	} else if (command === "doctor") {
		const executor = await waitForExecutor({
			config,
			projectId: flags.projectId,
			fetchImpl,
		});
		stdout(JSON.stringify({ status: "ready", executor }, null, 2));
		return 0;
	} else if (command === "send") {
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
				outputFile: flags.outputFile,
				overwrite: parseBoolean(flags.overwrite, "overwrite"),
			});
	} else if (command === "import-media") {
		const mediaMetadata = await probeMediaFile({ filePath: flags.filePath });
		envelope = await buildImportMediaEnvelope({
			projectId: flags.projectId,
			filePath: flags.filePath,
			mediaMetadata,
		});
	} else if (command === "transcribe") {
		envelope = buildTranscribeEnvelope({
			projectId: flags.projectId,
			mediaId: flags.mediaId,
			language: flags.language,
			modelId: flags.modelId,
		});
	} else if (command === "build-video-context") {
		envelope = buildVideoContextEnvelope({
			projectId: flags.projectId,
			mediaId: flags.mediaId,
			language: flags.language,
			modelId: flags.modelId,
		});
	} else if (command === "build-visual-context") {
		envelope = buildVisualContextEnvelope({
			projectId: flags.projectId,
			mediaId: flags.mediaId,
			targetAspectRatio: flags.targetAspectRatio,
		});
	} else if (command === "inspect-video-range") {
		envelope = buildInspectVideoRangeEnvelope({
			projectId: flags.projectId,
			mediaId: flags.mediaId,
			startSeconds: Number(flags.startSeconds),
			endSeconds: Number(flags.endSeconds),
			frameCount:
				flags.frameCount === undefined ? undefined : Number(flags.frameCount),
		});
	} else if (command === "build-post-cut-captions") {
		envelope = buildPostCutCaptionsEnvelope({
			projectId: flags.projectId,
			language: flags.language,
			modelId: flags.modelId,
		});
		} else if (command === "generate-digital-human") {
			requireRunningHubApiKey({ env });
			envelope = buildDigitalHumanEnvelope({
			projectId: flags.projectId,
			imageMediaId: flags.imageMediaId,
			audioMediaId: flags.audioMediaId,
			scriptText: flags.scriptText,
			motionPrompt: flags.motionPrompt,
			width: flags.width,
			height: flags.height,
				fps: flags.fps,
			});
		} else if (command === "validate-edit-plan") {
			envelope = await buildValidateEditPlanEnvelope({
				projectId: flags.projectId,
				planJsonFile: flags.planJsonFile,
			});
		} else if (command === "preview-edit-plan") {
			envelope = await buildPreviewEditPlanEnvelope({
				projectId: flags.projectId,
				planJsonFile: flags.planJsonFile,
			});
		} else if (command === "apply-plan") {
			envelope = await buildApplyPlanEnvelope({
				projectId: flags.projectId,
				planJsonFile: flags.planJsonFile,
				replaceExisting: parseBoolean(flags.replaceExisting, "replaceExisting"),
			});
		} else if (command === "apply-narrated-remix-plan") {
			envelope = await buildNarratedRemixPlanEnvelope({
				projectId: flags.projectId,
				planJsonFile: flags.planJsonFile,
				replaceExisting: parseBoolean(flags.replaceExisting, "replaceExisting"),
			});
		} else if (command === "verify-timeline") {
			envelope = await buildVerifyTimelineEnvelope({
				projectId: flags.projectId,
				verificationJsonFile: flags.verificationJsonFile,
			});
		} else {
		throw new Error(`Unknown command: ${command}`);
	}

	await waitForExecutor({
		config,
		projectId: envelope.projectId,
		fetchImpl,
	});
	const result = await postEnvelope({ config, envelope, fetchImpl });
	stdout(JSON.stringify(result, null, 2));
	return 0;
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	runCli({ argv: process.argv.slice(2), env: process.env })
		.then((exitCode) => {
			process.exitCode = exitCode;
		})
		.catch((error) => {
			console.error(error instanceof Error ? error.message : error);
			console.error(usage());
			process.exitCode = 1;
		});
}
