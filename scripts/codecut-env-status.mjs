#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ENV_FILE = "apps/web/.env.local";
const DEFAULT_KEYS = [
	"CODECUT_AGENT_BRIDGE_URL",
	"CODECUT_AGENT_BRIDGE_TOKEN",
	"CODECUT_AGENT_BRIDGE_TIMEOUT_MS",
	"CODECUT_AGENT_BRIDGE_INTERVAL_MS",
	"RUNNINGHUB_API_KEY",
	"VOLCENGINE_OPEN_SPEECH_API_KEY",
];

function unquote(value) {
	const trimmed = String(value ?? "").trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

export function parseEnvFile(raw) {
	const entries = {};
	for (const [index, rawLine] of String(raw ?? "")
		.split(/\r?\n/)
		.entries()) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const separatorIndex = line.indexOf("=");
		if (separatorIndex === -1) {
			throw new Error(`Invalid env line ${index + 1}: expected KEY=value`);
		}
		const key = line.slice(0, separatorIndex).trim();
		entries[key] = unquote(line.slice(separatorIndex + 1));
	}
	return entries;
}

export function buildEnvStatus(entries, { keys = DEFAULT_KEYS } = {}) {
	return keys.map((key) => {
		const value = entries[key];
		const present = typeof value === "string" && value.length > 0;
		return {
			key,
			present,
			length: present ? value.length : 0,
		};
	});
}

function parseArgs(argv) {
	const result = {
		envFile: DEFAULT_ENV_FILE,
		keys: DEFAULT_KEYS,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--env-file") {
			result.envFile = argv[++index];
			continue;
		}
		if (arg === "--key") {
			result.keys = [argv[++index]];
			continue;
		}
		if (arg === "--keys") {
			result.keys = argv[++index].split(",").map((key) => key.trim());
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return result;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const envPath = resolve(process.cwd(), args.envFile);
	let envFileExists = true;
	let raw = "";
	try {
		raw = await readFile(envPath, "utf8");
	} catch (error) {
		if (error?.code !== "ENOENT") {
			throw error;
		}
		envFileExists = false;
	}
	const entries = parseEnvFile(raw);
	const status = buildEnvStatus(entries, { keys: args.keys });
	process.stdout.write(
		`${JSON.stringify({ envFile: envPath, envFileExists, keys: status }, null, 2)}\n`,
	);
}

if (
	process.argv[1] &&
	fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
	main().catch((error) => {
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 1;
	});
}
