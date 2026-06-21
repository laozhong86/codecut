#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const LOCAL_HOOKS_DIR_NAME = "codecut-hooks";
const HOOKS_PATH_CONFIG = "core.hooksPath";
const PROTECTED_BRANCH_CONFIG = "codecut.mainCheckoutBranch";

export async function installMainCheckoutGuard({
	repoRoot = process.cwd(),
	protectedBranch,
	execFileImpl = execFile,
} = {}) {
	const root = await gitStdout({
		cwd: repoRoot,
		args: ["rev-parse", "--show-toplevel"],
		execFileImpl,
		errorMessage: `Not a git repository: ${repoRoot}`,
	});
	await assertMainCheckout({ repoRoot: root, execFileImpl });

	const branch =
		protectedBranch ||
		(await gitStdout({
			cwd: root,
			args: ["branch", "--show-current"],
			execFileImpl,
			errorMessage: "Cannot determine current branch for checkout guard",
		}));
	if (!branch) {
		throw new Error("Cannot install checkout guard from detached HEAD");
	}

	const commonGitDir = await gitStdout({
		cwd: root,
		args: ["rev-parse", "--path-format=absolute", "--git-common-dir"],
		execFileImpl,
		errorMessage: "Cannot resolve git common directory",
	});
	const hooksPath = join(commonGitDir, LOCAL_HOOKS_DIR_NAME);
	const guardSourcePath = join(
		dirname(fileURLToPath(import.meta.url)),
		"main-checkout-guard.mjs",
	);
	const guardTargetPath = join(hooksPath, "main-checkout-guard.mjs");
	const postCheckoutPath = join(hooksPath, "post-checkout");

	await mkdir(hooksPath, { recursive: true });
	await copyFile(guardSourcePath, guardTargetPath);
	await chmod(guardTargetPath, 0o755);
	await writeFile(
		postCheckoutPath,
		[
			"#!/usr/bin/env sh",
			`exec node "${guardTargetPath}" "$@"`,
			"",
		].join("\n"),
	);
	await chmod(postCheckoutPath, 0o755);

	await execFileImpl("git", ["config", HOOKS_PATH_CONFIG, hooksPath], {
		cwd: root,
	});
	await execFileImpl("git", ["config", PROTECTED_BRANCH_CONFIG, branch], {
		cwd: root,
	});

	return {
		repoRoot: root,
		hooksPath,
		protectedBranch: branch,
		hookFiles: [postCheckoutPath, guardTargetPath],
	};
}

export async function runCli({
	argv = process.argv.slice(2),
	cwd = process.cwd(),
	stdout = process.stdout,
} = {}) {
	const { protectedBranch } = parseArgs(argv);
	const result = await installMainCheckoutGuard({
		repoRoot: cwd,
		protectedBranch,
	});
	stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	return 0;
}

function parseArgs(argv) {
	const result = { protectedBranch: undefined };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--protected-branch") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--protected-branch requires a branch name");
			}
			result.protectedBranch = value;
			index += 1;
			continue;
		}
		if (arg === "help" || arg === "-h" || arg === "--help") {
			throw new Error("Usage: node scripts/git-hooks/install-hooks.mjs [--protected-branch <branch>]");
		}
		throw new Error(`Unknown option: ${arg}`);
	}
	return result;
}

async function assertMainCheckout({ repoRoot, execFileImpl }) {
	const gitDir = await gitStdout({
		cwd: repoRoot,
		args: ["rev-parse", "--path-format=absolute", "--git-dir"],
		execFileImpl,
		errorMessage: "Cannot resolve git directory",
	});
	const commonDir = await gitStdout({
		cwd: repoRoot,
		args: ["rev-parse", "--path-format=absolute", "--git-common-dir"],
		execFileImpl,
		errorMessage: "Cannot resolve git common directory",
	});
	if (resolve(gitDir) !== resolve(commonDir)) {
		throw new Error("Install the main checkout guard from the main repository directory, not a linked worktree");
	}
}

async function gitStdout({ cwd, args, execFileImpl, errorMessage }) {
	try {
		const { stdout } = await execFileImpl("git", args, { cwd });
		return stdout.trim();
	} catch (error) {
		const stderr = error?.stderr ? `: ${String(error.stderr).trim()}` : "";
		throw new Error(`${errorMessage}${stderr}`);
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	runCli().catch((error) => {
		console.error(error.message);
		process.exit(1);
	});
}
