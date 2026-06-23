#!/usr/bin/env bun

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "https://www.runninghub.cn";
const DEFAULT_TASK_ID = "2009215121247047681";

const DIGITAL_HUMAN_APP_ID = "2052014238952108033";
const VOICE_DESIGN_APP_ID = "2049802245339918337";
const VOICE_CLONE_APP_ID = "2067079167992229890";

const DIGITAL_HUMAN_NODES = [
	{ nodeId: "54", fieldName: "value", description: "宽" },
	{ nodeId: "55", fieldName: "value", description: "高" },
	{ nodeId: "182", fieldName: "value", description: "帧率" },
	{ nodeId: "17", fieldName: "image", description: "图" },
	{ nodeId: "156", fieldName: "audio", description: "参考音频" },
	{ nodeId: "230", fieldName: "text", description: "说话内容" },
	{ nodeId: "58", fieldName: "text", description: "提示词" },
];

const VOICE_DESIGN_NODES = [
	{ nodeId: "24", fieldName: "text", description: "语音内容" },
	{ nodeId: "21", fieldName: "text", description: "声音描述" },
];

const VOICE_CLONE_NODES = [
	{ nodeId: "17", fieldName: "audio", description: "音频" },
	{ nodeId: "24", fieldName: "text", description: "文稿" },
];

function normalizeBaseUrl(baseUrl) {
	const normalized = String(baseUrl || DEFAULT_BASE_URL).trim();
	if (!normalized) {
		throw new Error("--base-url is required");
	}
	return normalized.replace(/\/+$/, "");
}

function aiAppEndpoint({ baseUrl }) {
	return `${normalizeBaseUrl(baseUrl)}/task/openapi/ai-app/run`;
}

function aiAppV2RunEndpoint({ baseUrl, appId }) {
	return `${normalizeBaseUrl(baseUrl)}/openapi/v2/run/ai-app/${appId}`;
}

export function redactSecret(value) {
	const secret = String(value || "");
	if (!secret) return "<missing>";
	return `<redacted:${secret.length}>`;
}

export function buildRunningHubHealthContract({
	baseUrl = DEFAULT_BASE_URL,
} = {}) {
	return {
		baseUrl: normalizeBaseUrl(baseUrl),
		queryEndpoint: `${normalizeBaseUrl(baseUrl)}/openapi/v2/query`,
		digitalHuman: {
			appId: DIGITAL_HUMAN_APP_ID,
			endpoint: aiAppEndpoint({ baseUrl }),
			nodeInfoList: DIGITAL_HUMAN_NODES,
		},
		voiceDesign: {
			appId: VOICE_DESIGN_APP_ID,
			endpoint: aiAppEndpoint({ baseUrl }),
			nodeInfoList: VOICE_DESIGN_NODES,
		},
		voiceClone: {
			appId: VOICE_CLONE_APP_ID,
			endpoint: aiAppV2RunEndpoint({ baseUrl, appId: VOICE_CLONE_APP_ID }),
			nodeInfoList: VOICE_CLONE_NODES,
		},
	};
}

export function buildRunningHubQueryHealthRequest({
	apiKey,
	taskId = DEFAULT_TASK_ID,
	baseUrl = DEFAULT_BASE_URL,
}) {
	const key = String(apiKey || "").trim();
	if (!key) {
		throw new Error("RUNNINGHUB_API_KEY is required");
	}
	const trimmedTaskId = String(taskId || "").trim();
	if (!trimmedTaskId) {
		throw new Error("--task-id is required");
	}

	return {
		url: `${normalizeBaseUrl(baseUrl)}/openapi/v2/query`,
		init: {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ taskId: trimmedTaskId }),
		},
	};
}

function stringField(payload, fields) {
	for (const field of fields) {
		const value = payload?.[field];
		if (typeof value === "string" && value.trim()) return value;
	}
	return null;
}

function numberField(payload, fields) {
	for (const field of fields) {
		const value = payload?.[field];
		if (typeof value === "number") return value;
	}
	return null;
}

function isAuthFailure({ httpStatus, payload }) {
	if (httpStatus === 401 || httpStatus === 403) return true;
	const message = String(
		stringField(payload, [
			"msg",
			"message",
			"error",
			"errorMessage",
			"failedReason",
		]) || "",
	).toLowerCase();
	return (
		message.includes("unauthorized") ||
		message.includes("forbidden") ||
		message.includes("api key") ||
		message.includes("apikey") ||
		message.includes("token")
	);
}

async function parseJsonResponse(response) {
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`RunningHub health check returned non-JSON: ${text}`);
	}
}

export async function runRunningHubHealthCheck({
	apiKey,
	taskId = DEFAULT_TASK_ID,
	baseUrl = DEFAULT_BASE_URL,
	fetchImpl = fetch,
} = {}) {
	const request = buildRunningHubQueryHealthRequest({
		apiKey,
		taskId,
		baseUrl,
	});
	const response = await fetchImpl(request.url, request.init);
	const payload = await parseJsonResponse(response);
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		throw new Error("RunningHub health check returned a non-object JSON payload");
	}

	const keys = Object.keys(payload).sort();
	const authOk = !isAuthFailure({ httpStatus: response.status, payload });
	const code = numberField(payload, ["code", "statusCode"]);
	const message = stringField(payload, [
		"msg",
		"message",
		"error",
		"errorMessage",
		"failedReason",
	]);

	return {
		ok: authOk && response.status < 500,
		authOk,
		cost: "no generation task submitted",
		request: {
			endpoint: request.url,
			taskId,
			apiKey: redactSecret(apiKey),
		},
		response: {
			httpStatus: response.status,
			json: true,
			keys,
			status: stringField(payload, ["status"]) || null,
			code,
			message,
		},
	};
}

function parseArgs(argv) {
	const options = {
		baseUrl: DEFAULT_BASE_URL,
		taskId: DEFAULT_TASK_ID,
		json: false,
		contractOnly: false,
	};

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--json") {
			options.json = true;
		} else if (arg === "--contract-only") {
			options.contractOnly = true;
		} else if (arg === "--base-url") {
			options.baseUrl = argv[++index];
		} else if (arg === "--task-id") {
			options.taskId = argv[++index];
		} else if (arg === "--help" || arg === "-h") {
			options.help = true;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	return options;
}

function printHelp() {
	console.log(`Usage:
  RUNNINGHUB_API_KEY=<key> bun scripts/runninghub-api-health.mjs [--json]
  bun scripts/runninghub-api-health.mjs --contract-only [--json]

Options:
  --json           Print machine-readable JSON.
  --contract-only  Print local appId/node mapping without a network request.
  --base-url URL   RunningHub base URL. Default: ${DEFAULT_BASE_URL}
  --task-id ID     Task ID for /openapi/v2/query. Default: ${DEFAULT_TASK_ID}

This script does not upload media, submit generation tasks, or download results.`);
}

function printHumanReport({ contract, health }) {
	console.log("RunningHub API health");
	console.log(`- base: ${contract.baseUrl}`);
	console.log(`- digital human app: ${contract.digitalHuman.appId}`);
	console.log(`- voice design app: ${contract.voiceDesign.appId}`);
	console.log(`- voice clone app: ${contract.voiceClone.appId}`);
	if (!health) {
		console.log("- network: skipped (--contract-only)");
		return;
	}
	console.log(`- query endpoint: ${health.request.endpoint}`);
	console.log(`- task id: ${health.request.taskId}`);
	console.log(`- api key: ${health.request.apiKey}`);
	console.log(`- http status: ${health.response.httpStatus}`);
	console.log(`- json keys: ${health.response.keys.join(", ") || "<none>"}`);
	console.log(`- auth: ${health.authOk ? "ok" : "failed"}`);
	console.log(`- cost: ${health.cost}`);
	if (health.response.message) {
		console.log(`- message: ${health.response.message}`);
	}
	console.log(`- result: ${health.ok ? "ok" : "failed"}`);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		printHelp();
		return;
	}

	const contract = buildRunningHubHealthContract({ baseUrl: options.baseUrl });
	const health = options.contractOnly
		? null
		: await runRunningHubHealthCheck({
				apiKey: process.env.RUNNINGHUB_API_KEY,
				taskId: options.taskId,
				baseUrl: options.baseUrl,
			});

	if (options.json) {
		console.log(JSON.stringify({ contract, health }, null, 2));
	} else {
		printHumanReport({ contract, health });
	}

	if (health && !health.ok) {
		process.exitCode = 1;
	}
}

function isMainModule() {
	return Boolean(
		process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]),
	);
}

if (isMainModule()) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
