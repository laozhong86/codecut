import { describe, expect, test } from "bun:test";
import {
	access,
	mkdtemp,
	realpath,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	buildWorktreeNames,
	createWorktree,
	initWorktree,
	teardownWorktree,
} from "../worktree-manager.mjs";

async function makeTempRepo({ ignoreWorktrees = true } = {}) {
	const repoRoot = await mkdtemp(join(tmpdir(), "codecut-worktree-repo-"));
	await runGit(repoRoot, ["init", "-b", "main"]);
	await runGit(repoRoot, ["config", "user.email", "codex@example.local"]);
	await runGit(repoRoot, ["config", "user.name", "Codex Test"]);
	await writeFile(
		join(repoRoot, "package.json"),
		JSON.stringify({ name: "fixture", packageManager: "bun@1.2.18" }, null, 2),
	);
	if (ignoreWorktrees) {
		await writeFile(join(repoRoot, ".gitignore"), ".worktrees\n.codecut-worktree.json\n");
	}
	await runGit(repoRoot, ["add", "."]);
	await runGit(repoRoot, ["commit", "-m", "initial"]);
	return repoRoot;
}

async function runGit(cwd, args) {
	const process = Bun.spawn(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${stdout}${stderr}`);
	}
	return stdout.trim();
}

async function pathExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

describe("worktree manager", () => {
	test("prints usage through the executable entrypoint", async () => {
		const process = Bun.spawn(["node", "scripts/worktree-manager.mjs", "help"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const output = await new Response(process.stdout).text();
		const exitCode = await process.exited;

		expect(exitCode).toBe(0);
		expect(output).toContain("Codecut worktree manager");
		expect(output).toContain("node scripts/worktree-manager.mjs create");
	});

	test("builds deterministic names and rejects unsafe topics", () => {
		const names = buildWorktreeNames({
			repoRoot: "/repo",
			topic: "visual-export",
		});

		expect(names.branchName).toBe("codex/visual-export");
		expect(names.worktreePath).toBe(
			join(resolve("/repo"), ".worktrees", "visual-export"),
		);
		expect(() =>
			buildWorktreeNames({ repoRoot: "/repo", topic: "../bad" }),
		).toThrow("Topic must use lowercase letters, numbers, and hyphens only");
		expect(() =>
			buildWorktreeNames({ repoRoot: "/repo", topic: "BadCase" }),
		).toThrow("Topic must use lowercase letters, numbers, and hyphens only");
	});

	test("creates a worktree from an explicit base and writes lifecycle metadata", async () => {
		const repoRoot = await makeTempRepo();

		try {
			const result = await createWorktree({
				repoRoot,
				topic: "visual-export",
				baseRef: "main",
				skipInstall: true,
			});
			const canonicalRepoRoot = await realpath(repoRoot);

			expect(result.branchName).toBe("codex/visual-export");
			expect(result.worktreePath).toBe(
				join(canonicalRepoRoot, ".worktrees/visual-export"),
			);
			expect(
				await runGit(result.worktreePath, ["branch", "--show-current"]),
			).toBe("codex/visual-export");

			const metadata = JSON.parse(
				await readFile(join(result.worktreePath, ".codecut-worktree.json"), "utf8"),
			);
			expect(metadata).toMatchObject({
				version: 1,
				topic: "visual-export",
				branchName: "codex/visual-export",
				baseRef: "main",
			});
			expect(metadata.baseSha).toMatch(/^[a-f0-9]{40}$/);
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	test("fails fast when project-local worktrees are not ignored", async () => {
		const repoRoot = await makeTempRepo({ ignoreWorktrees: false });

		try {
			await expect(
				createWorktree({
					repoRoot,
					topic: "missing-ignore",
					baseRef: "main",
					skipInstall: true,
				}),
			).rejects.toThrow(".worktrees must be ignored before creating worktrees");
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	test("initializes dependencies only when explicitly not skipped", async () => {
		const worktreePath = await mkdtemp(join(tmpdir(), "codecut-worktree-init-"));
		const calls = [];

		try {
			await writeFile(
				join(worktreePath, "package.json"),
				JSON.stringify({ packageManager: "bun@1.2.18" }),
			);
			await writeFile(join(worktreePath, "bun.lock"), "");

			await initWorktree({
				worktreePath,
				skipInstall: false,
				execFileImpl: async (command, args, options) => {
					calls.push({ command, args, cwd: options.cwd });
					return { stdout: "", stderr: "" };
				},
			});

			expect(calls).toEqual([
				{
					command: "bun",
					args: ["install", "--frozen-lockfile"],
					cwd: worktreePath,
				},
			]);

			await initWorktree({
				worktreePath,
				skipInstall: true,
				execFileImpl: async () => {
					throw new Error("install should be skipped");
				},
			});
		} finally {
			await rm(worktreePath, { recursive: true, force: true });
		}
	});

	test("tears down a worktree and deletes only the local branch", async () => {
		const repoRoot = await makeTempRepo();

		try {
			const result = await createWorktree({
				repoRoot,
				topic: "cleanup-flow",
				baseRef: "main",
				skipInstall: true,
			});

			await teardownWorktree({
				repoRoot,
				worktreePath: result.worktreePath,
			});

			expect(await pathExists(result.worktreePath)).toBe(false);
			expect(await runGit(repoRoot, ["branch", "--list", "codex/cleanup-flow"])).toBe("");
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});
});
