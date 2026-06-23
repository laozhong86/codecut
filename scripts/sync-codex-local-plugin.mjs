#!/usr/bin/env node

import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const BRIDGE_ENV_PREFIX = "CODECUT_AGENT_BRIDGE_";
const EXCLUDES = [
	".git",
	".git/",
	"node_modules/",
	".next/",
	".turbo/",
	".playwright-cli/",
	".worktrees/",
	".codecut-workspace/",
	".codecut-executor/",
	"output/",
	"outputs/",
	"tmp/",
	".DS_Store",
	".env.local",
];

function usage() {
	return [
		"Usage:",
		"  node scripts/sync-codex-local-plugin.mjs [--dry-run] [--marketplace <name>] [--source-root <path>] [--home-dir <path>] [--config <path>]",
		"",
		"Syncs the local Codecut plugin source into the installed Codex plugin cache.",
		"The cache must already exist; this command does not install plugins.",
	].join("\n");
}

function parseArgs(argv) {
	const flags = {
		dryRun: false,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const entry = argv[index];
		if (entry === "--help" || entry === "help") {
			return { help: true };
		}
		if (entry === "--dry-run") {
			flags.dryRun = true;
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

async function pathExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function readJson(path) {
	const raw = await readFile(path, "utf8");
	return JSON.parse(raw);
}

function parseBridgeEnv(raw) {
	const entries = [];
	for (const [index, rawLine] of raw.split(/\r?\n/).entries()) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const separatorIndex = line.indexOf("=");
		if (separatorIndex === -1) {
			throw new Error(
				`Invalid apps/web/.env.local line ${index + 1}: expected KEY=value`,
			);
		}
		const key = line.slice(0, separatorIndex).trim();
		if (!key.startsWith(BRIDGE_ENV_PREFIX)) continue;
		entries.push([key, line.slice(separatorIndex + 1).trim()]);
	}
	return entries;
}

async function syncBridgeEnvFile({ sourceRoot, cacheRoot, dryRun }) {
	const sourceEnvPath = join(sourceRoot, "apps/web/.env.local");
	if (!(await pathExists(sourceEnvPath))) {
		return {
			status: "skipped",
			reason: "source-env-missing",
			sourceEnvPath,
			cacheEnvPath: join(cacheRoot, "apps/web/.env.local"),
		};
	}

	const entries = parseBridgeEnv(await readFile(sourceEnvPath, "utf8"));
	const cacheEnvPath = join(cacheRoot, "apps/web/.env.local");
	if (entries.length === 0) {
		return {
			status: "skipped",
			reason: "source-bridge-env-missing",
			sourceEnvPath,
			cacheEnvPath,
		};
	}

	const content = `${entries.map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
	if (!dryRun) {
		await mkdir(dirname(cacheEnvPath), { recursive: true });
		await writeFile(cacheEnvPath, content, "utf8");
	}

	return {
		status: dryRun ? "dry-run" : "synced",
		sourceEnvPath,
		cacheEnvPath,
		keys: entries.map(([key]) => key),
	};
}

async function readPluginManifest({ sourceRoot }) {
	const manifestPath = join(sourceRoot, ".codex-plugin/plugin.json");
	const manifest = await readJson(manifestPath);
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		throw new Error("plugin.json must contain a JSON object.");
	}
	if (!manifest.name || typeof manifest.name !== "string") {
		throw new Error("plugin.json must include a string name.");
	}
	if (!manifest.version || typeof manifest.version !== "string") {
		throw new Error("plugin.json must include a string version.");
	}
	return manifest;
}

export function findEnabledMarketplaceName({ configText, pluginName }) {
	const matches = [];
	let currentSection = null;
	const flushSection = () => {
		if (
			currentSection?.pluginName === pluginName &&
			currentSection.enabled === true
		) {
			matches.push(currentSection.marketplaceName);
		}
	};

	for (const line of configText.split(/\r?\n/)) {
		const pluginHeader = line.match(/^\[plugins\."([^"@]+)@([^"]+)"\]$/);
		const anyHeader = line.match(/^\[/);
		if (pluginHeader) {
			flushSection();
			currentSection = {
				pluginName: pluginHeader[1],
				marketplaceName: pluginHeader[2],
				enabled: false,
			};
			continue;
		}
		if (anyHeader) {
			flushSection();
			currentSection = null;
			continue;
		}
		if (currentSection && /^\s*enabled\s*=\s*true\s*$/.test(line)) {
			currentSection.enabled = true;
		}
	}
	flushSection();

	if (matches.length === 0) {
		throw new Error(`Enabled Codex plugin entry was not found for ${pluginName}.`);
	}
	if (matches.length > 1) {
		throw new Error(
			`Multiple enabled Codex plugin entries were found for ${pluginName}. Pass --marketplace explicitly.`,
		);
	}
	return matches[0];
}

export async function resolvePluginSyncPlan({
	sourceRoot = process.cwd(),
	homeDir = homedir(),
	configPath,
	marketplaceName,
}) {
	const resolvedSourceRoot = resolve(sourceRoot);
	const resolvedHomeDir = resolve(homeDir);
	const manifest = await readPluginManifest({ sourceRoot: resolvedSourceRoot });
	const resolvedConfigPath =
		configPath ?? join(resolvedHomeDir, ".codex/config.toml");
	const resolvedMarketplaceName =
		marketplaceName ??
		findEnabledMarketplaceName({
			configText: await readFile(resolvedConfigPath, "utf8"),
			pluginName: manifest.name,
		});
	const cacheRoot = join(
		resolvedHomeDir,
		".codex/plugins/cache",
		resolvedMarketplaceName,
		manifest.name,
		manifest.version,
	);

	if (!(await pathExists(cacheRoot))) {
		throw new Error(`Installed plugin cache is missing: ${cacheRoot}`);
	}

	return {
		pluginName: manifest.name,
		version: manifest.version,
		marketplaceName: resolvedMarketplaceName,
		sourceRoot: resolvedSourceRoot,
		cacheRoot,
	};
}

export function buildRsyncArgs({ sourceRoot, cacheRoot, dryRun = false }) {
	return [
		"-a",
		"--delete",
		...(dryRun ? ["--dry-run"] : []),
		...EXCLUDES.flatMap((pattern) => [`--exclude=${pattern}`]),
		`${sourceRoot.replace(/\/$/, "")}/`,
		`${cacheRoot.replace(/\/$/, "")}/`,
	];
}

export function buildReloadGuidance({ dryRun = false } = {}) {
	return {
		cacheSynced: !dryRun,
		reopenWidget: true,
		newSessionRecommended: true,
		restartCodexAppOnlyIfStale: true,
		reason:
			"Codex loads plugins from the installed cache, but running sessions and MCP server processes may keep old tool schemas or server code until a new session starts.",
	};
}

async function removeStaleCacheMetadata({ cacheRoot, dryRun }) {
	if (dryRun) {
		return;
	}
	await Promise.all([
		rm(join(cacheRoot, ".git"), { recursive: true, force: true }),
		rm(join(cacheRoot, ".worktrees"), { recursive: true, force: true }),
	]);
}

export async function runSync({
	sourceRoot = process.cwd(),
	homeDir = homedir(),
	configPath,
	marketplaceName,
	dryRun = false,
	execFileImpl = execFileAsync,
	stdout = (value) => process.stdout.write(`${value}\n`),
}) {
	const plan = await resolvePluginSyncPlan({
		sourceRoot,
		homeDir,
		configPath,
		marketplaceName,
	});
	const rsyncArgs = buildRsyncArgs({
		sourceRoot: plan.sourceRoot,
		cacheRoot: plan.cacheRoot,
		dryRun,
	});
	await removeStaleCacheMetadata({ cacheRoot: plan.cacheRoot, dryRun });
	await execFileImpl("rsync", rsyncArgs);
	const bridgeEnv = await syncBridgeEnvFile({
		sourceRoot: plan.sourceRoot,
		cacheRoot: plan.cacheRoot,
		dryRun,
	});

	const summary = {
		status: dryRun ? "dry-run" : "synced",
		pluginName: plan.pluginName,
		version: plan.version,
		marketplaceName: plan.marketplaceName,
		sourceRoot: plan.sourceRoot,
		cacheRoot: plan.cacheRoot,
		excluded: EXCLUDES,
		bridgeEnv,
		reloadGuidance: buildReloadGuidance({ dryRun }),
	};
	stdout(JSON.stringify(summary, null, 2));
	return summary;
}

async function main() {
	const flags = parseArgs(process.argv.slice(2));
	if (flags.help) {
		process.stdout.write(`${usage()}\n`);
		return;
	}

	await runSync({
		sourceRoot: flags.sourceRoot,
		homeDir: flags.homeDir,
		configPath: flags.config,
		marketplaceName: flags.marketplace,
		dryRun: flags.dryRun,
	});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 1;
	});
}
