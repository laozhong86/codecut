import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installMainCheckoutGuard } from "../git-hooks/install-hooks.mjs";
import { parseCheckoutMovement } from "../git-hooks/main-checkout-guard.mjs";

async function makeTempRepo() {
	const repoRoot = await mkdtemp(join(tmpdir(), "codecut-hooks-repo-"));
	await runGit(repoRoot, ["init", "-b", "main"]);
	await runGit(repoRoot, ["config", "user.email", "codex@example.local"]);
	await runGit(repoRoot, ["config", "user.name", "Codex Test"]);
	await writeFile(join(repoRoot, "README.md"), "fixture\n");
	await runGit(repoRoot, ["add", "."]);
	await runGit(repoRoot, ["commit", "-m", "initial"]);
	await runGit(repoRoot, ["branch", "other"]);
	return repoRoot;
}

async function runGit(cwd, args) {
	const result = await runGitResult(cwd, args);
	if (result.exitCode !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${result.stdout}${result.stderr}`);
	}
	return result.stdout.trim();
}

async function runGitResult(cwd, args) {
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
	return { stdout, stderr, exitCode };
}

describe("main checkout git hook guard", () => {
	test("parses Git checkout reflog movements", () => {
		expect(parseCheckoutMovement("checkout: moving from main to other")).toEqual({
			from: "main",
			to: "other",
		});
		expect(parseCheckoutMovement("commit: initial")).toBeNull();
	});

	test("installs a local post-checkout hook that locks the main checkout branch", async () => {
		const repoRoot = await makeTempRepo();

		try {
			const install = await installMainCheckoutGuard({ repoRoot });

			expect(install.protectedBranch).toBe("main");
			expect(await runGit(repoRoot, ["config", "--get", "codecut.mainCheckoutBranch"])).toBe("main");
			expect(await runGit(repoRoot, ["config", "--get", "core.hooksPath"])).toBe(install.hooksPath);
			expect(await readFile(install.hookFiles[0], "utf8")).toContain(
				`exec "${process.execPath}"`,
			);

			const switchResult = await runGitResult(repoRoot, ["switch", "other"]);
			expect(switchResult.exitCode).not.toBe(0);
			expect(switchResult.stderr).toContain("Codecut main checkout guard");
			expect(await runGit(repoRoot, ["branch", "--show-current"])).toBe("main");
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	test("allows branch switching inside a linked worktree", async () => {
		const repoRoot = await makeTempRepo();
		const worktreePath = join(repoRoot, ".worktrees/demo");

		try {
			await installMainCheckoutGuard({ repoRoot });
			await runGit(repoRoot, ["worktree", "add", "-b", "codex/demo", worktreePath, "main"]);

			const switchResult = await runGitResult(worktreePath, ["switch", "-c", "local-worktree-branch"]);
			expect(switchResult.exitCode).toBe(0);
			expect(await runGit(worktreePath, ["branch", "--show-current"])).toBe("local-worktree-branch");
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});
});
