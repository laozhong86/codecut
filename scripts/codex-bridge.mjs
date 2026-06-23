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
const importBytesBase64MaxBytes = 15 * 1024 * 1024;

function usage() {
	return [
		"Usage:",
		"  node scripts/codex-bridge.mjs create-project --project-id <id> --name <name>",
		"  node scripts/codex-bridge.mjs doctor-install --project-id <id>",
		"  node scripts/codex-bridge.mjs doctor --project-id <id>",
		"  node scripts/codex-bridge.mjs send --project-id <id> --tool <tool> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs import-media --project-id <id> --file-path /absolute/path/media-file",
		"  node scripts/codex-bridge.mjs import-media --project-id <id> --bytes-base64-file /absolute/path/payload.base64 --file-name <name> --mime-type <type>",
		"  node scripts/codex-bridge.mjs transcribe --project-id <id> --media-id <id> --language <auto|code> --model-id <model>",
		"  node scripts/codex-bridge.mjs build-video-context --project-id <id> --media-id <id> --language <auto|code> --model-id <model>",
		"  node scripts/codex-bridge.mjs build-visual-context --project-id <id> --media-id <id> --target-aspect-ratio <9:16|16:9|1:1>",
		"  node scripts/codex-bridge.mjs inspect-video-range --project-id <id> --media-id <id> --start-seconds <seconds> --end-seconds <seconds> [--frame-count <1..16>]",
		"  node scripts/codex-bridge.mjs get-timeline-state-v2 --project-id <id> [--start-time <seconds>] [--end-time <seconds>] [--include-frames <true|false>] [--include-referenced-media <true|false>]",
		"  node scripts/codex-bridge.mjs inspect-timeline --project-id <id> --start-time <seconds> [--end-time <seconds>] [--frame-count <1..16>]",
		"  node scripts/codex-bridge.mjs build-video-quality-report --project-id <id> --plan-json-file /absolute/path/edit-plan.json --start-time <seconds> --end-time <seconds> --frame-count <1..16>",
		"  node scripts/codex-bridge.mjs get-transcript --project-id <id> --language <auto|code> --model-id <model> [--start-time <seconds>] [--end-time <seconds>] [--include-frames <true|false>]",
		"  node scripts/codex-bridge.mjs add-texts --project-id <id> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs add-captions --project-id <id> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs insert-clips --project-id <id> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs move-clips --project-id <id> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs remove-clips --project-id <id> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs split-clip --project-id <id> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs set-clip-properties --project-id <id> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs set-keyframes --project-id <id> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs ripple-delete-ranges --project-id <id> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs list-models --project-id <id> [--type <transcription|digital_human>]",
		"  node scripts/codex-bridge.mjs search-media --project-id <id> --args-json '<json>'",
		"  node scripts/codex-bridge.mjs import-system-template-script --project-id <id> --template-json-file /absolute/path/local-template-script.json --confirmed-by-user true",
		"  node scripts/codex-bridge.mjs delete-system-template-script --project-id <id> --template-id <id> --confirmed-by-user true",
		"  node scripts/codex-bridge.mjs build-post-cut-captions --project-id <id> --language <auto|code> --model-id <model>",
		'  node scripts/codex-bridge.mjs generate-digital-human --project-id <id> --image-media-id <id> --audio-media-id <id> --script-text "..." --motion-prompt "..." --width 1280 --height 720 --fps 25',
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

function parseArgsJsonFlag(flags) {
	if (!flags.argsJson) {
		throw new Error("--args-json is required");
	}
	return JSON.parse(flags.argsJson);
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

function parseNonNegativeNumber(value, label) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`--${label} must be a finite non-negative number`);
	}
	return parsed;
}

function assertFrameCount(value) {
	if (
		value !== undefined &&
		(!Number.isInteger(Number(value)) ||
			Number(value) < 1 ||
			Number(value) > 16)
	) {
		throw new Error("--frame-count must be an integer from 1 to 16");
	}
	return value === undefined ? undefined : Number(value);
}

function requireJsonObject(value, label) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`--${label} must be a JSON object`);
	}
	return value;
}

function requireNonEmptyStringArray(value, label) {
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		value.some((entry) => typeof entry !== "string" || entry.length === 0)
	) {
		throw new Error(`--${label} must contain at least one id`);
	}
	return value;
}

function validateRanges(ranges) {
	if (!Array.isArray(ranges) || ranges.length === 0) {
		throw new Error("--ranges must contain at least one range");
	}
	for (const range of ranges) {
		if (
			!Array.isArray(range) ||
			range.length !== 2 ||
			!Number.isFinite(Number(range[0])) ||
			!Number.isFinite(Number(range[1])) ||
			Number(range[0]) < 0 ||
			Number(range[1]) <= Number(range[0])
		) {
			throw new Error(
				"--ranges entries must be [start, end] with end greater than start",
			);
		}
	}
	return ranges.map(([start, end]) => [Number(start), Number(end)]);
}

function optionalTimelineWindow({ startTime, endTime, frameCount }) {
	const args = {};
	if (startTime !== undefined) {
		args.startTime = parseNonNegativeNumber(startTime, "start-time");
	}
	if (endTime !== undefined) {
		args.endTime = parseNonNegativeNumber(endTime, "end-time");
		if (args.startTime !== undefined && args.endTime <= args.startTime) {
			throw new Error("--end-time must be greater than --start-time");
		}
	}
	const parsedFrameCount = assertFrameCount(frameCount);
	if (parsedFrameCount !== undefined) {
		args.frameCount = parsedFrameCount;
	}
	return args;
}

export function buildGetTimelineStateV2Envelope({
	projectId,
	startTime,
	endTime,
	includeFrames,
	includeReferencedMedia,
}) {
	const args = {
		format: "v2",
		...optionalTimelineWindow({ startTime, endTime }),
		...(includeFrames === undefined ? {} : { includeFrames }),
		...(includeReferencedMedia === undefined ? {} : { includeReferencedMedia }),
	};
	return buildCommandEnvelope({
		projectId,
		tool: "get_timeline_state",
		args,
	});
}

export function buildInspectTimelineEnvelope({
	projectId,
	startTime,
	endTime,
	frameCount,
}) {
	if (startTime === undefined) {
		throw new Error("--start-time is required");
	}
	return buildCommandEnvelope({
		projectId,
		tool: "inspect_timeline",
		args: optionalTimelineWindow({ startTime, endTime, frameCount }),
	});
}

export async function buildVideoQualityReportEnvelope({
	projectId,
	planJsonFile,
	startTime,
	endTime,
	frameCount,
}) {
	if (startTime === undefined) {
		throw new Error("--start-time is required");
	}
	if (endTime === undefined) {
		throw new Error("--end-time is required");
	}
	if (frameCount === undefined) {
		throw new Error("--frame-count is required");
	}
	const plan = await readJsonObjectFile({
		filePath: planJsonFile,
		flagName: "plan-json-file",
	});
	return buildCommandEnvelope({
		projectId,
		tool: "build_video_quality_report",
		args: {
			plan,
			inspection: optionalTimelineWindow({ startTime, endTime, frameCount }),
		},
	});
}

export function buildGetTranscriptEnvelope({
	projectId,
	language,
	modelId,
	startTime,
	endTime,
	includeFrames,
}) {
	if (!language) {
		throw new Error("--language is required");
	}
	if (!modelId) {
		throw new Error("--model-id is required");
	}
	return buildCommandEnvelope({
		projectId,
		tool: "get_transcript",
		args: {
			language,
			modelId,
			...optionalTimelineWindow({ startTime, endTime }),
			...(includeFrames === undefined ? {} : { includeFrames }),
		},
	});
}

export function buildAddTextsEnvelope({ projectId, trackId, entries }) {
	if (!Array.isArray(entries) || entries.length === 0) {
		throw new Error("--entries must contain at least one text entry");
	}
	return buildCommandEnvelope({
		projectId,
		tool: "add_texts",
		args: {
			...(trackId === undefined ? {} : { trackId }),
			entries,
		},
	});
}

export function buildAddCaptionsEnvelope({
	projectId,
	language,
	modelId,
	captionStyle,
}) {
	if (!language) {
		throw new Error("--language is required");
	}
	if (!modelId) {
		throw new Error("--model-id is required");
	}
	return buildCommandEnvelope({
		projectId,
		tool: "add_captions",
		args: {
			language,
			modelId,
			...(captionStyle === undefined ? {} : { captionStyle }),
		},
	});
}

export function buildListModelsEnvelope({ projectId, type }) {
	if (
		type !== undefined &&
		type !== "transcription" &&
		type !== "digital_human"
	) {
		throw new Error("--type must be transcription or digital_human");
	}
	return buildCommandEnvelope({
		projectId,
		tool: "list_models",
		args: type === undefined ? {} : { type },
	});
}

export function buildInsertClipsEnvelope({
	projectId,
	trackId,
	atTime,
	clips,
}) {
	if (!trackId) {
		throw new Error("--track-id is required");
	}
	if (!Array.isArray(clips) || clips.length === 0) {
		throw new Error("--clips must contain at least one clip");
	}
	return buildCommandEnvelope({
		projectId,
		tool: "insert_clips",
		args: {
			trackId,
			atTime: parseNonNegativeNumber(atTime, "at-time"),
			clips,
		},
	});
}

export function buildMoveClipsEnvelope({ projectId, moves }) {
	if (!Array.isArray(moves) || moves.length === 0) {
		throw new Error("--moves must contain at least one move");
	}
	return buildCommandEnvelope({
		projectId,
		tool: "move_clips",
		args: { moves },
	});
}

export function buildRemoveClipsEnvelope({ projectId, elementIds }) {
	return buildCommandEnvelope({
		projectId,
		tool: "remove_clips",
		args: { elementIds: requireNonEmptyStringArray(elementIds, "element-ids") },
	});
}

export function buildSplitClipEnvelope({ projectId, elementId, atTime }) {
	if (!elementId) {
		throw new Error("--element-id is required");
	}
	return buildCommandEnvelope({
		projectId,
		tool: "split_clip",
		args: {
			elementId,
			atTime: parseNonNegativeNumber(atTime, "at-time"),
		},
	});
}

export function buildSetClipPropertiesEnvelope({
	projectId,
	elementId,
	properties,
}) {
	if (!elementId) {
		throw new Error("--element-id is required");
	}
	return buildCommandEnvelope({
		projectId,
		tool: "set_clip_properties",
		args: {
			elementId,
			properties: requireJsonObject(properties, "properties"),
		},
	});
}

const supportedKeyframeProperties = new Set([
	"opacity",
	"transform.position",
	"transform.scale",
	"transform.rotate",
]);

export function buildSetKeyframesEnvelope({
	projectId,
	elementId,
	property,
	keyframes,
}) {
	if (!elementId) {
		throw new Error("--element-id is required");
	}
	if (!supportedKeyframeProperties.has(property)) {
		throw new Error("--property must be a supported keyframe property");
	}
	if (!Array.isArray(keyframes)) {
		throw new Error("--keyframes must be an array");
	}
	return buildCommandEnvelope({
		projectId,
		tool: "set_keyframes",
		args: { elementId, property, keyframes },
	});
}

export function buildSearchMediaEnvelope({
	projectId,
	query,
	scope,
	mediaId,
	limit,
}) {
	if (!query || !String(query).trim()) {
		throw new Error("--query is required");
	}
	if (
		scope !== undefined &&
		scope !== "metadata" &&
		scope !== "spoken" &&
		scope !== "both"
	) {
		throw new Error("--scope must be metadata, spoken, or both");
	}
	return buildCommandEnvelope({
		projectId,
		tool: "search_media",
		args: {
			query,
			...(scope === undefined ? {} : { scope }),
			...(mediaId === undefined ? {} : { mediaId }),
			...(limit === undefined
				? {}
				: { limit: parsePositiveNumber(limit, "limit") }),
		},
	});
}

function requireConfirmedTemplateImport(confirmedByUser) {
	if (confirmedByUser !== true) {
		throw new Error(
			"--confirmed-by-user must be true after explicit user confirmation",
		);
	}
}

export async function buildImportSystemTemplateScriptEnvelope({
	projectId,
	templateJsonFile,
	confirmedByUser,
}) {
	requireConfirmedTemplateImport(confirmedByUser);
	const template = await readJsonObjectFile({
		filePath: templateJsonFile,
		flagName: "template-json-file",
	});

	return buildCommandEnvelope({
		projectId,
		tool: "import_system_template_script",
		args: {
			confirmedByUser: true,
			template,
		},
	});
}

export function buildDeleteSystemTemplateScriptEnvelope({
	projectId,
	templateId,
	confirmedByUser,
}) {
	requireConfirmedTemplateImport(confirmedByUser);
	if (typeof templateId !== "string" || templateId.trim() === "") {
		throw new Error("--template-id is required");
	}

	return buildCommandEnvelope({
		projectId,
		tool: "delete_system_template_script",
		args: {
			confirmedByUser: true,
			templateId: templateId.trim(),
		},
	});
}

export function buildRippleDeleteRangesEnvelope({ projectId, ranges }) {
	return buildCommandEnvelope({
		projectId,
		tool: "ripple_delete_ranges",
		args: { ranges: validateRanges(ranges) },
	});
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

function normalizeSupportedMimeType(value, flagName = "mime-type") {
	if (!value || typeof value !== "string") {
		throw new Error(`--${flagName} is required`);
	}
	const mimeType = value.split(";")[0].trim().toLowerCase();
	if (![...extensionMimeTypes.values()].includes(mimeType)) {
		throw new Error(`--${flagName} must be a supported media MIME type`);
	}
	return mimeType;
}

function validateSingleImportSource({ filePath, url, bytes, bytesBase64File }) {
	if (url) {
		throw new Error(
			"import-media --url is disabled; use --file-path or --bytes-base64-file",
		);
	}
	const sourceCount = [
		Boolean(filePath),
		Boolean(bytes || bytesBase64File),
	].filter(Boolean).length;
	if (sourceCount !== 1) {
		throw new Error("import-media requires exactly one media source");
	}
}

function normalizeMediaMetadata({ duration, width, height }) {
	return {
		...(duration === undefined
			? {}
			: { duration: parsePositiveNumber(duration, "duration") }),
		...(width === undefined ? {} : { width: parsePositiveNumber(width, "width") }),
		...(height === undefined
			? {}
			: { height: parsePositiveNumber(height, "height") }),
	};
}

async function readBase64Input({ bytes, bytesBase64File }) {
	if (bytes && bytesBase64File) {
		throw new Error("--bytes and --bytes-base64-file cannot be used together");
	}
	const base64 = bytes ?? (await readFile(bytesBase64File, "utf8"));
	if (Buffer.byteLength(base64, "utf8") > importBytesBase64MaxBytes) {
		throw new Error("--bytes payload must be 15MB or smaller");
	}
	const content = Buffer.from(base64, "base64");
	if (content.byteLength === 0) {
		throw new Error("--bytes payload must not be empty");
	}
	return {
		base64: content.toString("base64"),
		content,
	};
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
	url,
	bytes,
	bytesBase64File,
	fileName,
	mimeType,
	lastModified,
	duration,
	width,
	height,
	mediaMetadata,
}) {
	validateSingleImportSource({ filePath, url, bytes, bytesBase64File });
	if (filePath) {
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
				...normalizeMediaMetadata({ duration, width, height }),
			},
		});
	}

	if (bytes || bytesBase64File) {
		if (!fileName) {
			throw new Error("--file-name is required for bytes import");
		}
		if (!mimeType) {
			throw new Error("--mime-type is required for bytes import");
		}
		const payload = await readBase64Input({ bytes, bytesBase64File });
		return buildCommandEnvelope({
			projectId,
			tool: "import_media_file",
			args: {
				fileName,
				mimeType: normalizeSupportedMimeType(mimeType),
				base64: payload.base64,
				size: payload.content.byteLength,
				lastModified:
					lastModified === undefined
						? Date.now()
						: parseNonNegativeNumber(lastModified, "last-modified"),
				...normalizeMediaMetadata({ duration, width, height }),
			},
		});
	}

	throw new Error("import-media requires exactly one media source");
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

async function fetchAgentBridgeHeartbeat({ config, projectId, fetchImpl }) {
	const response = await fetchImpl(
		`${config.baseUrl}/api/agent-bridge/heartbeat?projectId=${encodeURIComponent(projectId)}`,
		{ headers: { Authorization: `Bearer ${config.token}` } },
	);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`Agent bridge heartbeat failed: ${response.status} ${text}`);
	}
	return JSON.parse(text);
}

async function waitForAgentBridge({ config, projectId, fetchImpl }) {
	if (!projectId) {
		throw new Error("--project-id is required");
	}
	const status = await fetchAgentBridgeHeartbeat({ config, projectId, fetchImpl });
	if (status.mounted !== true) {
		throw new Error(
			`Agent bridge is not mounted for project ${projectId}. Open the editor URL before importing system templates.`,
		);
	}
	return status;
}

async function postAgentBridgeEnvelope({ config, envelope, fetchImpl }) {
	const response = await fetchImpl(
		`${config.baseUrl}/api/agent-bridge/commands`,
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
		throw new Error(`Agent bridge command failed: ${response.status} ${text}`);
	}
	return JSON.parse(text);
}

async function fetchAgentBridgeResult({ config, id, fetchImpl }) {
	const response = await fetchImpl(
		`${config.baseUrl}/api/agent-bridge/results?id=${encodeURIComponent(id)}`,
		{ headers: { Authorization: `Bearer ${config.token}` } },
	);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`Agent bridge result failed: ${response.status} ${text}`);
	}
	return JSON.parse(text);
}

async function waitForAgentBridgeResult({ config, id, fetchImpl }) {
	const deadline = Date.now() + config.timeoutMs;
	while (Date.now() <= deadline) {
		const result = await fetchAgentBridgeResult({ config, id, fetchImpl });
		if (result.status === "completed") {
			return result;
		}
		await new Promise((resolvePromise) =>
			setTimeout(resolvePromise, config.intervalMs),
		);
	}
	throw new Error(`Agent bridge command timed out: ${id}`);
}

async function postAgentBridgeEnvelopeAndWait({ config, envelope, fetchImpl }) {
	await waitForAgentBridge({
		config,
		projectId: envelope.projectId,
		fetchImpl,
	});
	const item = await postAgentBridgeEnvelope({ config, envelope, fetchImpl });
	return waitForAgentBridgeResult({ config, id: item.id, fetchImpl });
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
		envelope = buildCommandEnvelope({
			projectId: flags.projectId,
			tool: flags.tool,
			args: parseArgsJsonFlag(flags),
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
		const flagMetadata = normalizeMediaMetadata({
			duration: flags.duration,
			width: flags.width,
			height: flags.height,
		});
		const mediaMetadata =
			flags.filePath && flagMetadata.duration === undefined
				? await probeMediaFile({ filePath: flags.filePath })
				: flagMetadata;
		envelope = await buildImportMediaEnvelope({
			projectId: flags.projectId,
			filePath: flags.filePath,
			url: flags.url,
			bytes: flags.bytes,
			bytesBase64File: flags.bytesBase64File,
			fileName: flags.fileName,
			mimeType: flags.mimeType,
			lastModified: flags.lastModified,
			duration: flags.duration,
			width: flags.width,
			height: flags.height,
			mediaMetadata,
			fetchImpl,
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
	} else if (command === "get-timeline-state-v2") {
		envelope = buildGetTimelineStateV2Envelope({
			projectId: flags.projectId,
			startTime:
				flags.startTime === undefined ? undefined : Number(flags.startTime),
			endTime: flags.endTime === undefined ? undefined : Number(flags.endTime),
			includeFrames:
				flags.includeFrames === undefined
					? undefined
					: parseBoolean(flags.includeFrames, "includeFrames"),
			includeReferencedMedia:
				flags.includeReferencedMedia === undefined
					? undefined
					: parseBoolean(
							flags.includeReferencedMedia,
							"includeReferencedMedia",
						),
		});
	} else if (command === "inspect-timeline") {
		envelope = buildInspectTimelineEnvelope({
			projectId: flags.projectId,
			startTime: Number(flags.startTime),
			endTime: flags.endTime === undefined ? undefined : Number(flags.endTime),
			frameCount:
				flags.frameCount === undefined ? undefined : Number(flags.frameCount),
		});
	} else if (command === "build-video-quality-report") {
		envelope = await buildVideoQualityReportEnvelope({
			projectId: flags.projectId,
			planJsonFile: flags.planJsonFile,
			startTime:
				flags.startTime === undefined ? undefined : Number(flags.startTime),
			endTime: flags.endTime === undefined ? undefined : Number(flags.endTime),
			frameCount:
				flags.frameCount === undefined ? undefined : Number(flags.frameCount),
		});
	} else if (command === "get-transcript") {
		envelope = buildGetTranscriptEnvelope({
			projectId: flags.projectId,
			language: flags.language,
			modelId: flags.modelId,
			startTime:
				flags.startTime === undefined ? undefined : Number(flags.startTime),
			endTime: flags.endTime === undefined ? undefined : Number(flags.endTime),
			includeFrames:
				flags.includeFrames === undefined
					? undefined
					: parseBoolean(flags.includeFrames, "includeFrames"),
		});
	} else if (command === "add-texts") {
		const payload = parseArgsJsonFlag(flags);
		envelope = buildAddTextsEnvelope({
			projectId: flags.projectId,
			...payload,
		});
	} else if (command === "add-captions") {
		const payload = parseArgsJsonFlag(flags);
		envelope = buildAddCaptionsEnvelope({
			projectId: flags.projectId,
			...payload,
		});
	} else if (command === "list-models") {
		envelope = buildListModelsEnvelope({
			projectId: flags.projectId,
			type: flags.type,
		});
	} else if (command === "search-media") {
		const payload = parseArgsJsonFlag(flags);
		envelope = buildSearchMediaEnvelope({
			projectId: flags.projectId,
			...payload,
		});
	} else if (command === "import-system-template-script") {
		envelope = await buildImportSystemTemplateScriptEnvelope({
			projectId: flags.projectId,
			templateJsonFile: flags.templateJsonFile,
			confirmedByUser: parseBoolean(
				flags.confirmedByUser,
				"confirmedByUser",
			),
		});
	} else if (command === "delete-system-template-script") {
		envelope = buildDeleteSystemTemplateScriptEnvelope({
			projectId: flags.projectId,
			templateId: flags.templateId,
			confirmedByUser: parseBoolean(
				flags.confirmedByUser,
				"confirmedByUser",
			),
		});
	} else if (command === "insert-clips") {
		const payload = parseArgsJsonFlag(flags);
		envelope = buildInsertClipsEnvelope({
			projectId: flags.projectId,
			...payload,
		});
	} else if (command === "move-clips") {
		const payload = parseArgsJsonFlag(flags);
		envelope = buildMoveClipsEnvelope({
			projectId: flags.projectId,
			...payload,
		});
	} else if (command === "remove-clips") {
		const payload = parseArgsJsonFlag(flags);
		envelope = buildRemoveClipsEnvelope({
			projectId: flags.projectId,
			...payload,
		});
	} else if (command === "split-clip") {
		const payload = parseArgsJsonFlag(flags);
		envelope = buildSplitClipEnvelope({
			projectId: flags.projectId,
			...payload,
		});
	} else if (command === "set-clip-properties") {
		const payload = parseArgsJsonFlag(flags);
		envelope = buildSetClipPropertiesEnvelope({
			projectId: flags.projectId,
			...payload,
		});
	} else if (command === "set-keyframes") {
		const payload = parseArgsJsonFlag(flags);
		envelope = buildSetKeyframesEnvelope({
			projectId: flags.projectId,
			...payload,
		});
	} else if (command === "ripple-delete-ranges") {
		const payload = parseArgsJsonFlag(flags);
		envelope = buildRippleDeleteRangesEnvelope({
			projectId: flags.projectId,
			...payload,
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

	const result =
		command === "import-system-template-script" ||
		command === "delete-system-template-script"
			? await postAgentBridgeEnvelopeAndWait({ config, envelope, fetchImpl })
			: await (async () => {
					await waitForExecutor({
						config,
						projectId: envelope.projectId,
						fetchImpl,
					});
					return postEnvelope({ config, envelope, fetchImpl });
				})();
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
