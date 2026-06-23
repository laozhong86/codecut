import { describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildRsyncArgs,
	findEnabledMarketplaceName,
	resolvePluginSyncPlan,
	runSync,
} from "../sync-codex-local-plugin.mjs";

async function createPluginSource({ version = "0.1.1" } = {}) {
	const sourceRoot = await mkdtemp(join(tmpdir(), "codecut-sync-source-"));
	await mkdir(join(sourceRoot, ".codex-plugin"), { recursive: true });
	await mkdir(join(sourceRoot, "mcp"), { recursive: true });
	await mkdir(join(sourceRoot, "scripts"), { recursive: true });
	await mkdir(join(sourceRoot, "skills/codecut-jianying-editor-framework"), {
		recursive: true,
	});
	await writeFile(
		join(sourceRoot, ".codex-plugin/plugin.json"),
		JSON.stringify({ name: "codecut", version }),
		"utf8",
	);
	await writeFile(join(sourceRoot, "mcp/server.mjs"), "source mcp\n", "utf8");
	await writeFile(
		join(sourceRoot, "mcp/codecut-workspace.html"),
		"source workspace\n",
		"utf8",
	);
	await writeFile(
		join(sourceRoot, "scripts/codex-bridge.mjs"),
		"source bridge\n",
		"utf8",
	);
	await writeFile(
		join(sourceRoot, "skills/codecut-jianying-editor-framework/SKILL.md"),
		"---\nname: codecut-jianying-editor-framework\n---\n",
		"utf8",
	);
	return sourceRoot;
}

async function copyCriticalSyncFiles({ sourceRoot, cacheRoot }) {
	for (const file of [
		".codex-plugin/plugin.json",
		"mcp/server.mjs",
		"mcp/codecut-workspace.html",
		"scripts/codex-bridge.mjs",
	]) {
		await mkdir(join(cacheRoot, file.split("/").slice(0, -1).join("/")), {
			recursive: true,
		});
		await writeFile(
			join(cacheRoot, file),
			await readFile(join(sourceRoot, file)),
			"utf8",
		);
	}
}

describe("sync Codex local plugin", () => {
	test("finds the enabled marketplace for a plugin from Codex config", () => {
		const config = `
[plugins."tiktok-shop-radar@local-opc"]
enabled = true

[plugins."codecut@local-opc"]
enabled = true
`;

		expect(
			findEnabledMarketplaceName({ configText: config, pluginName: "codecut" }),
		).toBe("local-opc");
	});

	test("fails when the plugin is not enabled in Codex config", () => {
		expect(() =>
			findEnabledMarketplaceName({
				configText: '[plugins."codecut@local-opc"]\nenabled = false\n',
				pluginName: "codecut",
			}),
		).toThrow("Enabled Codex plugin entry was not found for codecut.");
	});

	test("resolves source and installed cache paths without hard-coded version directories", async () => {
		const sourceRoot = await createPluginSource({ version: "0.2.3" });
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-sync-home-"));
		const cacheRoot = join(
			homeRoot,
			".codex/plugins/cache/local-opc/codecut/0.2.3",
		);
		await mkdir(cacheRoot, { recursive: true });
		await writeFile(
			join(homeRoot, "config.toml"),
			'[plugins."codecut@local-opc"]\nenabled = true\n',
			"utf8",
		);

		try {
			const plan = await resolvePluginSyncPlan({
				sourceRoot,
				homeDir: homeRoot,
				configPath: join(homeRoot, "config.toml"),
			});

			expect(plan).toEqual({
				pluginName: "codecut",
				version: "0.2.3",
				marketplaceName: "local-opc",
				sourceRoot,
				cacheRoot,
			});
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(homeRoot, { recursive: true, force: true });
		}
	});

	test("builds a guarded rsync command with runtime and secret exclusions", () => {
		const args = buildRsyncArgs({
			sourceRoot: "/repo/codecut",
			cacheRoot: "/home/.codex/plugins/cache/local-opc/codecut/0.1.1",
			dryRun: true,
		});

		expect(args).toContain("--delete");
		expect(args).toContain("--checksum");
		expect(args).toContain("--dry-run");
		expect(args).toContain("--exclude=.git");
		expect(args).toContain("--exclude=.git/");
		expect(args).toContain("--exclude=node_modules/");
		expect(args).toContain("--exclude=.next/");
		expect(args).toContain("--exclude=.turbo/");
		expect(args).toContain("--exclude=.playwright-cli/");
		expect(args).toContain("--exclude=.worktrees/");
		expect(args).toContain("--exclude=.codecut-workspace/");
		expect(args).toContain("--exclude=.codecut-executor/");
		expect(args).toContain("--exclude=output/");
		expect(args).toContain("--exclude=outputs/");
		expect(args).toContain("--exclude=tmp/");
		expect(args).toContain("--exclude=.DS_Store");
		expect(args).toContain("--exclude=.env.local");
		expect(args.at(-2)).toBe("/repo/codecut/");
		expect(args.at(-1)).toBe(
			"/home/.codex/plugins/cache/local-opc/codecut/0.1.1/",
		);
	});

	test("runs rsync in dry-run mode and prints a structured sync summary", async () => {
		const sourceRoot = await createPluginSource();
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-sync-home-"));
		const cacheRoot = join(
			homeRoot,
			".codex/plugins/cache/local-opc/codecut/0.1.1",
		);
		await mkdir(cacheRoot, { recursive: true });
		await writeFile(
			join(homeRoot, "config.toml"),
			'[plugins."codecut@local-opc"]\nenabled = true\n',
			"utf8",
		);
		const calls = [];
		const output = [];

		try {
			const result = await runSync({
				sourceRoot,
				homeDir: homeRoot,
				configPath: join(homeRoot, "config.toml"),
				dryRun: true,
				execFileImpl: async (command, args) => {
					calls.push({ command, args });
					return { stdout: "dry-run output", stderr: "" };
				},
				stdout: (value) => output.push(value),
			});

			expect(result.cacheRoot).toBe(cacheRoot);
			expect(calls).toHaveLength(1);
			expect(calls[0].command).toBe("rsync");
			expect(calls[0].args).toContain("--dry-run");
			expect(JSON.parse(output[0])).toMatchObject({
				status: "dry-run",
				pluginName: "codecut",
				version: "0.1.1",
				marketplaceName: "local-opc",
				cacheRoot,
				reloadGuidance: {
					cacheSynced: false,
					reopenWidget: true,
					newSessionRecommended: true,
					restartCodexAppOnlyIfStale: true,
					reason:
						"Codex loads plugins from the installed cache, but running sessions and MCP server processes may keep old tool schemas or server code until a new session starts.",
				},
			});
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(homeRoot, { recursive: true, force: true });
		}
	});

	test("syncs required Codecut bridge and RunningHub runtime env into the installed cache", async () => {
		const sourceRoot = await createPluginSource();
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-sync-home-"));
		const cacheRoot = join(
			homeRoot,
			".codex/plugins/cache/local-opc/codecut/0.1.1",
		);
		await mkdir(join(sourceRoot, "apps/web"), { recursive: true });
		await mkdir(join(cacheRoot, "apps/web"), { recursive: true });
		await copyCriticalSyncFiles({ sourceRoot, cacheRoot });
		await writeFile(
			join(sourceRoot, "apps/web/.env.local"),
			[
				"CODECUT_AGENT_BRIDGE_URL=http://127.0.0.1:4100",
				"CODECUT_AGENT_BRIDGE_TOKEN=source-token",
				"CODECUT_AGENT_BRIDGE_TIMEOUT_MS=120000",
				"CODECUT_AGENT_BRIDGE_INTERVAL_MS=1000",
				"RUNNINGHUB_API_KEY=runninghub-secret",
				"UNRELATED_PROVIDER_SECRET=do-not-copy",
			].join("\n"),
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "apps/web/.env.local"),
			"CODECUT_AGENT_BRIDGE_URL=http://127.0.0.1:4102\n",
			"utf8",
		);
		await writeFile(
			join(homeRoot, "config.toml"),
			'[plugins."codecut@local-opc"]\nenabled = true\n',
			"utf8",
		);

		try {
			const result = await runSync({
				sourceRoot,
				homeDir: homeRoot,
				configPath: join(homeRoot, "config.toml"),
				execFileImpl: async () => ({ stdout: "", stderr: "" }),
				stdout: () => {},
			});

			const cachedEnv = await readFile(
				join(result.cacheRoot, "apps/web/.env.local"),
				"utf8",
			);
			expect(cachedEnv).toContain(
				"CODECUT_AGENT_BRIDGE_URL=http://127.0.0.1:4100",
			);
			expect(cachedEnv).toContain("CODECUT_AGENT_BRIDGE_TOKEN=source-token");
			expect(cachedEnv).toContain("CODECUT_AGENT_BRIDGE_TIMEOUT_MS=120000");
			expect(cachedEnv).toContain("CODECUT_AGENT_BRIDGE_INTERVAL_MS=1000");
			expect(cachedEnv).toContain("RUNNINGHUB_API_KEY=runninghub-secret");
			expect(cachedEnv).not.toContain("UNRELATED_PROVIDER_SECRET");
			expect(cachedEnv).not.toContain("4102");
			expect(result.bridgeEnv.keys).toEqual([
				"CODECUT_AGENT_BRIDGE_URL",
				"CODECUT_AGENT_BRIDGE_TOKEN",
				"CODECUT_AGENT_BRIDGE_TIMEOUT_MS",
				"CODECUT_AGENT_BRIDGE_INTERVAL_MS",
				"RUNNINGHUB_API_KEY",
			]);
			expect(result.verifiedChecksums).toEqual([
				".codex-plugin/plugin.json",
				"mcp/server.mjs",
				"mcp/codecut-workspace.html",
				"scripts/codex-bridge.mjs",
			]);
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(homeRoot, { recursive: true, force: true });
		}
	});

	test("removes stale local metadata from the installed cache before syncing", async () => {
		const sourceRoot = await createPluginSource();
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-sync-home-"));
		const cacheRoot = join(
			homeRoot,
			".codex/plugins/cache/local-opc/codecut/0.1.1",
		);
		await mkdir(cacheRoot, { recursive: true });
		await writeFile(join(cacheRoot, ".git"), "gitdir: /repo/.git/worktrees/p0\n");
		await mkdir(join(cacheRoot, ".worktrees/old-worktree"), { recursive: true });
		await writeFile(join(cacheRoot, ".worktrees/old-worktree/bun.lock"), "");
		await writeFile(
			join(homeRoot, "config.toml"),
			'[plugins."codecut@local-opc"]\nenabled = true\n',
			"utf8",
		);

		try {
			const result = await runSync({
				sourceRoot,
				homeDir: homeRoot,
				configPath: join(homeRoot, "config.toml"),
				execFileImpl: async () => {
					await copyCriticalSyncFiles({ sourceRoot, cacheRoot });
					return { stdout: "", stderr: "" };
				},
				stdout: () => {},
			});

			await expect(access(join(cacheRoot, ".git"))).rejects.toThrow();
			await expect(access(join(cacheRoot, ".worktrees"))).rejects.toThrow();
			expect(result.verifiedChecksums).toEqual([
				".codex-plugin/plugin.json",
				"mcp/server.mjs",
				"mcp/codecut-workspace.html",
				"scripts/codex-bridge.mjs",
			]);
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(homeRoot, { recursive: true, force: true });
		}
	});

	test("fails after sync when critical cache entry checksums do not match source", async () => {
		const sourceRoot = await createPluginSource();
		const homeRoot = await mkdtemp(join(tmpdir(), "codecut-sync-home-"));
		const cacheRoot = join(
			homeRoot,
			".codex/plugins/cache/local-opc/codecut/0.1.1",
		);
		await mkdir(join(cacheRoot, ".codex-plugin"), { recursive: true });
		await mkdir(join(cacheRoot, "mcp"), { recursive: true });
		await mkdir(join(cacheRoot, "scripts"), { recursive: true });
		await writeFile(
			join(cacheRoot, ".codex-plugin/plugin.json"),
			JSON.stringify({ name: "codecut", version: "0.1.1" }),
			"utf8",
		);
		await writeFile(join(cacheRoot, "mcp/server.mjs"), "stale mcp\n", "utf8");
		await writeFile(
			join(cacheRoot, "mcp/codecut-workspace.html"),
			"source workspace\n",
			"utf8",
		);
		await writeFile(
			join(cacheRoot, "scripts/codex-bridge.mjs"),
			"source bridge\n",
			"utf8",
		);
		await writeFile(
			join(homeRoot, "config.toml"),
			'[plugins."codecut@local-opc"]\nenabled = true\n',
			"utf8",
		);

		try {
			await expect(
				runSync({
					sourceRoot,
					homeDir: homeRoot,
					configPath: join(homeRoot, "config.toml"),
					execFileImpl: async () => ({ stdout: "", stderr: "" }),
					stdout: () => {},
				}),
			).rejects.toThrow(
				"Post-sync checksum mismatch for mcp/server.mjs",
			);
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(homeRoot, { recursive: true, force: true });
		}
	});
});
