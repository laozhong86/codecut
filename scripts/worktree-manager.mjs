#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const DEFAULT_BASE_REF = "origin/main";
const DEFAULT_BRANCH_PREFIX = "codex";
const METADATA_FILE = ".codecut-worktree.json";

export function buildWorktreeNames({
	repoRoot,
	topic,
	branchPrefix = DEFAULT_BRANCH_PREFIX,
}) {
	validateTopic(topic);
	const absoluteRoot = resolve(repoRoot);
	return {
		branchName: `${branchPrefix}/${topic}`,
		worktreePath: join(absoluteRoot, ".worktrees", topic),
	};
}

export async function createWorktree({
	repoRoot,
	topic,
	baseRef = DEFAULT_BASE_REF,
	branchPrefix = DEFAULT_BRANCH_PREFIX,
	skipInstall = false,
	dryRun = false,
	execFileImpl = execFile,
}) {
	const absoluteRoot = await resolveRepoRoot(repoRoot, execFileImpl);
	const { branchName, worktreePath } = buildWorktreeNames({
		repoRoot: absoluteRoot,
		topic,
		branchPrefix,
	});

	await assertProjectLocalWorktreesIgnored(absoluteRoot, execFileImpl);
	await fetchRemoteBaseRef({ repoRoot: absoluteRoot, baseRef, execFileImpl });

	const baseSha = await gitStdout({
		repoRoot: absoluteRoot,
		args: ["rev-parse", "--verify", baseRef],
		execFileImpl,
		errorMessage: `Base ref not found: ${baseRef}`,
	});

	if (await gitCommandSucceeds(absoluteRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], execFileImpl)) {
		throw new Error(`Local branch already exists: ${branchName}`);
	}
	if (await pathExists(worktreePath)) {
		throw new Error(`Worktree path already exists: ${worktreePath}`);
	}

	const commands = [
		["git", ["-C", absoluteRoot, "worktree", "add", "-b", branchName, worktreePath, baseRef]],
	];
	if (dryRun) {
		return {
			dryRun: true,
			branchName,
			worktreePath,
			baseRef,
			baseSha,
			commands,
		};
	}

	await mkdir(join(absoluteRoot, ".worktrees"), { recursive: true });
	await execFileImpl("git", [
		"-C",
		absoluteRoot,
		"worktree",
		"add",
		"-b",
		branchName,
		worktreePath,
		baseRef,
	]);

	const metadata = {
		version: 1,
		topic,
		branchName,
		baseRef,
		baseSha,
		createdAt: new Date().toISOString(),
	};
	await writeFile(
		join(worktreePath, METADATA_FILE),
		`${JSON.stringify(metadata, null, 2)}\n`,
	);

	await initWorktree({ worktreePath, skipInstall, execFileImpl });

	return {
		branchName,
		worktreePath,
		baseRef,
		baseSha,
	};
}

export async function initWorktree({
	worktreePath,
	skipInstall = false,
	execFileImpl = execFile,
}) {
	const absolutePath = resolve(worktreePath);
	if (skipInstall) {
		return { installed: false, reason: "skip-install" };
	}
	if (!(await pathExists(join(absolutePath, "package.json")))) {
		return { installed: false, reason: "no-package-json" };
	}
	if (!(await pathExists(join(absolutePath, "bun.lock")))) {
		throw new Error("bun.lock is required for worktree dependency initialization");
	}

	await execFileImpl("bun", ["install", "--frozen-lockfile"], {
		cwd: absolutePath,
	});
	return { installed: true, command: "bun install --frozen-lockfile" };
}

export async function teardownWorktree({
	repoRoot,
	worktreePath,
	keepBranch = false,
	force = false,
	dryRun = false,
	execFileImpl = execFile,
}) {
	const absoluteRoot = await resolveRepoRoot(repoRoot, execFileImpl);
	const absoluteWorktreePath = resolve(worktreePath);
	if (absoluteRoot === absoluteWorktreePath) {
		throw new Error("Refusing to teardown the main repository checkout");
	}
	await assertRegisteredWorktree({
		repoRoot: absoluteRoot,
		worktreePath: absoluteWorktreePath,
		execFileImpl,
	});

	const branchName = await gitStdout({
		repoRoot: absoluteWorktreePath,
		args: ["branch", "--show-current"],
		execFileImpl,
		errorMessage: `Failed to read worktree branch: ${absoluteWorktreePath}`,
	});
	const removeArgs = ["-C", absoluteRoot, "worktree", "remove"];
	if (force) removeArgs.push("--force");
	removeArgs.push(absoluteWorktreePath);

	const commands = [
		["git", removeArgs],
		["git", ["-C", absoluteRoot, "worktree", "prune"]],
	];
	if (!keepBranch && branchName) {
		commands.push([
			"git",
			["-C", absoluteRoot, "branch", force ? "-D" : "-d", branchName],
		]);
	}

	if (dryRun) {
		return {
			dryRun: true,
			branchName,
			worktreePath: absoluteWorktreePath,
			commands,
		};
	}

	await execFileImpl("git", removeArgs);
	await execFileImpl("git", ["-C", absoluteRoot, "worktree", "prune"]);

	if (!keepBranch && branchName) {
		await execFileImpl("git", [
			"-C",
			absoluteRoot,
			"branch",
			force ? "-D" : "-d",
			branchName,
		]);
	}

	return {
		branchName,
		worktreePath: absoluteWorktreePath,
		removedBranch: !keepBranch && Boolean(branchName),
	};
}

export async function cleanupWorktree({
	repoRoot,
	topic,
	keepBranch = false,
	force = false,
	dryRun = false,
	execFileImpl = execFile,
}) {
	const absoluteRoot = await resolveRepoRoot(repoRoot, execFileImpl);
	const { worktreePath } = buildWorktreeNames({ repoRoot: absoluteRoot, topic });
	return teardownWorktree({
		repoRoot: absoluteRoot,
		worktreePath,
		keepBranch,
		force,
		dryRun,
		execFileImpl,
	});
}

export async function runCli({
	argv = process.argv.slice(2),
	cwd = process.cwd(),
	stdout = process.stdout,
} = {}) {
	const [command = "help", ...args] = argv;

	if (command === "help" || command === "-h" || command === "--help") {
		stdout.write(`${usage()}\n`);
		return 0;
	}

	if (command === "list" || command === "ls") {
		const repoRoot = await resolveRepoRoot(cwd, execFile);
		const { stdout: output } = await execFile("git", [
			"-C",
			repoRoot,
			"worktree",
			"list",
		]);
		stdout.write(output);
		return 0;
	}

	if (command === "create") {
		const parsed = parseCreateArgs(args);
		const result = await createWorktree({ repoRoot: cwd, ...parsed });
		printCommandResult(stdout, "created", result);
		return 0;
	}

	if (command === "init") {
		const parsed = parseInitArgs(args);
		const result = await initWorktree({ worktreePath: cwd, ...parsed });
		stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		return 0;
	}

	if (command === "cleanup") {
		const parsed = parseCleanupArgs(args);
		const result = await cleanupWorktree({ repoRoot: cwd, ...parsed });
		printCommandResult(stdout, "cleaned", result);
		return 0;
	}

	if (command === "teardown") {
		const parsed = parseTeardownArgs(args);
		const result = await teardownWorktree({ repoRoot: cwd, ...parsed });
		printCommandResult(stdout, "torn-down", result);
		return 0;
	}

	throw new Error(`Unknown command: ${command}`);
}

function parseCreateArgs(args) {
	const flags = parseFlags(args, new Set(["--skip-install", "--dry-run"]));
	const [topic, baseRef = DEFAULT_BASE_REF, ...extra] = flags.positionals;
	if (!topic || extra.length > 0) {
		throw new Error("Usage: create <topic> [base-ref] [--skip-install] [--dry-run]");
	}
	return {
		topic,
		baseRef,
		skipInstall: flags.options.has("--skip-install"),
		dryRun: flags.options.has("--dry-run"),
	};
}

function parseInitArgs(args) {
	const flags = parseFlags(args, new Set(["--skip-install"]));
	if (flags.positionals.length > 0) {
		throw new Error("Usage: init [--skip-install]");
	}
	return {
		skipInstall: flags.options.has("--skip-install"),
	};
}

function parseCleanupArgs(args) {
	const flags = parseFlags(
		args,
		new Set(["--keep-branch", "--force", "--dry-run"]),
	);
	const [topic, ...extra] = flags.positionals;
	if (!topic || extra.length > 0) {
		throw new Error("Usage: cleanup <topic> [--keep-branch] [--force] [--dry-run]");
	}
	return {
		topic,
		keepBranch: flags.options.has("--keep-branch"),
		force: flags.options.has("--force"),
		dryRun: flags.options.has("--dry-run"),
	};
}

function parseTeardownArgs(args) {
	const flags = parseFlags(
		args,
		new Set(["--keep-branch", "--force", "--dry-run"]),
	);
	const [worktreePath, ...extra] = flags.positionals;
	if (!worktreePath || extra.length > 0) {
		throw new Error(
			"Usage: teardown <worktree-path> [--keep-branch] [--force] [--dry-run]",
		);
	}
	return {
		worktreePath,
		keepBranch: flags.options.has("--keep-branch"),
		force: flags.options.has("--force"),
		dryRun: flags.options.has("--dry-run"),
	};
}

function parseFlags(args, allowedFlags) {
	const options = new Set();
	const positionals = [];
	for (const arg of args) {
		if (arg.startsWith("--")) {
			if (!allowedFlags.has(arg)) {
				throw new Error(`Unknown option: ${arg}`);
			}
			options.add(arg);
		} else {
			positionals.push(arg);
		}
	}
	return { options, positionals };
}

function printCommandResult(stdout, action, result) {
	stdout.write(`${JSON.stringify({ action, ...result }, null, 2)}\n`);
}

function usage() {
	return `Codecut worktree manager

Usage:
  node scripts/worktree-manager.mjs create <topic> [base-ref] [--skip-install] [--dry-run]
  node scripts/worktree-manager.mjs init [--skip-install]
  node scripts/worktree-manager.mjs list
  node scripts/worktree-manager.mjs cleanup <topic> [--keep-branch] [--force] [--dry-run]
  node scripts/worktree-manager.mjs teardown <worktree-path> [--keep-branch] [--force] [--dry-run]

Rules:
  - branch name: codex/<topic>
  - worktree path: .worktrees/<topic>
  - default base ref: origin/main
  - topic format: lowercase letters, numbers, and hyphens only`;
}

async function resolveRepoRoot(cwd, execFileImpl) {
	const root = await gitStdout({
		repoRoot: cwd,
		args: ["rev-parse", "--show-toplevel"],
		execFileImpl,
		errorMessage: `Not a git repository: ${cwd}`,
	});
	return isAbsolute(root) ? root : resolve(cwd, root);
}

function validateTopic(topic) {
	if (!topic) {
		throw new Error("Topic is required");
	}
	if (!/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/.test(topic)) {
		throw new Error("Topic must use lowercase letters, numbers, and hyphens only");
	}
}

async function assertProjectLocalWorktreesIgnored(repoRoot, execFileImpl) {
	if (!(await gitCommandSucceeds(repoRoot, ["check-ignore", "-q", ".worktrees"], execFileImpl))) {
		throw new Error(".worktrees must be ignored before creating worktrees");
	}
	if (!(await gitCommandSucceeds(repoRoot, ["check-ignore", "-q", METADATA_FILE], execFileImpl))) {
		throw new Error(`${METADATA_FILE} must be ignored before creating worktrees`);
	}
}

async function fetchRemoteBaseRef({ repoRoot, baseRef, execFileImpl }) {
	if (!baseRef.includes("/")) {
		return;
	}
	const [remote, ...branchParts] = baseRef.split("/");
	const branch = branchParts.join("/");
	if (!remote || !branch) {
		throw new Error(`Invalid remote base ref: ${baseRef}`);
	}
	await execFileImpl("git", ["-C", repoRoot, "fetch", remote, branch, "--quiet"]);
}

async function assertRegisteredWorktree({ repoRoot, worktreePath, execFileImpl }) {
	const output = await gitStdout({
		repoRoot,
		args: ["worktree", "list", "--porcelain"],
		execFileImpl,
		errorMessage: "Failed to list git worktrees",
	});
	const registeredPaths = output
		.split("\n")
		.filter((line) => line.startsWith("worktree "))
		.map((line) => resolve(line.slice("worktree ".length)));
	if (!registeredPaths.includes(resolve(worktreePath))) {
		throw new Error(`Registered git worktree not found: ${worktreePath}`);
	}
}

async function gitStdout({ repoRoot, args, execFileImpl, errorMessage }) {
	try {
		const { stdout } = await execFileImpl("git", ["-C", repoRoot, ...args]);
		return stdout.trim();
	} catch (error) {
		const stderr = error?.stderr ? `: ${String(error.stderr).trim()}` : "";
		throw new Error(`${errorMessage}${stderr}`);
	}
}

async function gitCommandSucceeds(repoRoot, args, execFileImpl) {
	try {
		await execFileImpl("git", ["-C", repoRoot, ...args]);
		return true;
	} catch (error) {
		if (typeof error?.code === "number" || typeof error?.code === "string") {
			return false;
		}
		throw error;
	}
}

async function pathExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	runCli().catch((error) => {
		console.error(error.message);
		process.exit(1);
	});
}
