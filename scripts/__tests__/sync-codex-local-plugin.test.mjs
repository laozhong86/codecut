import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
	await mkdir(join(sourceRoot, "skills/codecut-jianying-editor-framework"), {
		recursive: true,
	});
	await writeFile(
		join(sourceRoot, ".codex-plugin/plugin.json"),
		JSON.stringify({ name: "codecut", version }),
		"utf8",
	);
	await writeFile(
		join(sourceRoot, "skills/codecut-jianying-editor-framework/SKILL.md"),
		"---\nname: codecut-jianying-editor-framework\n---\n",
		"utf8",
	);
	return sourceRoot;
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
		expect(args).toContain("--dry-run");
		expect(args).toContain("--exclude=.git/");
		expect(args).toContain("--exclude=node_modules/");
		expect(args).toContain("--exclude=.next/");
		expect(args).toContain("--exclude=.turbo/");
		expect(args).toContain("--exclude=.playwright-cli/");
		expect(args).toContain("--exclude=.worktrees/");
		expect(args).toContain("--exclude=.codecut-workspace/");
		expect(args).toContain("--exclude=.codecut-executor/");
		expect(args).toContain("--exclude=outputs/");
		expect(args).toContain("--exclude=tmp/");
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
			});
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(homeRoot, { recursive: true, force: true });
		}
	});
});
