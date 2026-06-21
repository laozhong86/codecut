#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROLLBACK_ENV_KEY = "CODECUT_MAIN_CHECKOUT_GUARD_ROLLBACK";
const BYPASS_ENV_KEY = "CODECUT_ALLOW_MAIN_CHECKOUT_SWITCH";

export function parseCheckoutMovement(message) {
	const match = /^checkout: moving from (.+) to (.+)$/.exec(message.trim());
	if (!match) {
		return null;
	}
	return {
		from: match[1],
		to: match[2],
	};
}

export function runMainCheckoutGuard({
	hookArgs = process.argv.slice(2),
	cwd = process.cwd(),
	env = process.env,
	execFileSyncImpl = execFileSync,
	stderr = process.stderr,
} = {}) {
	const [, , checkoutType] = hookArgs;

	if (env[ROLLBACK_ENV_KEY] === "1" || env[BYPASS_ENV_KEY] === "1") {
		return { blocked: false, reason: "bypass" };
	}
	if (checkoutType !== "1") {
		return { blocked: false, reason: "not-branch-checkout" };
	}
	if (!isMainCheckout({ cwd, execFileSyncImpl })) {
		return { blocked: false, reason: "linked-worktree" };
	}

	const currentBranch = readGitOptional({
		cwd,
		args: ["symbolic-ref", "--quiet", "--short", "HEAD"],
		execFileSyncImpl,
	});
	const protectedBranch = readGitOptional({
		cwd,
		args: ["config", "--get", "codecut.mainCheckoutBranch"],
		execFileSyncImpl,
	});

	if (currentBranch && protectedBranch && currentBranch === protectedBranch) {
		return { blocked: false, reason: "protected-branch" };
	}

	const movement = parseCheckoutMovement(
		readGitOptional({
			cwd,
			args: ["reflog", "-1", "--format=%gs", "HEAD"],
			execFileSyncImpl,
		}),
	);
	const rollbackBranch = protectedBranch || movement?.from || "";
	const attemptedBranch = currentBranch || movement?.to || "detached HEAD";

	if (rollbackBranch) {
		execFileSyncImpl("git", ["checkout", "--quiet", rollbackBranch], {
			cwd,
			env: { ...env, [ROLLBACK_ENV_KEY]: "1" },
			stdio: "pipe",
		});
	}

	stderr.write(
		[
			"",
			"[Codecut main checkout guard]",
			`Blocked branch checkout in the main repository directory: ${attemptedBranch}`,
			`Protected branch: ${rollbackBranch || "unconfigured"}`,
			"Use a worktree instead:",
			"  bun run worktree:create -- <topic> [base-ref] --skip-install",
			"Override only for intentional human maintenance:",
			`  ${BYPASS_ENV_KEY}=1 git switch <branch>`,
			"",
		].join("\n"),
	);

	return {
		blocked: true,
		attemptedBranch,
		protectedBranch: rollbackBranch,
	};
}

export function isMainCheckout({ cwd = process.cwd(), execFileSyncImpl = execFileSync } = {}) {
	const gitDir = readGitOptional({
		cwd,
		args: ["rev-parse", "--path-format=absolute", "--git-dir"],
		execFileSyncImpl,
	});
	const commonDir = readGitOptional({
		cwd,
		args: ["rev-parse", "--path-format=absolute", "--git-common-dir"],
		execFileSyncImpl,
	});
	return Boolean(gitDir && commonDir && gitDir === commonDir);
}

function readGitOptional({ cwd, args, execFileSyncImpl }) {
	try {
		return execFileSyncImpl("git", args, {
			cwd,
			encoding: "utf8",
			stdio: "pipe",
		}).trim();
	} catch {
		return "";
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	try {
		const result = runMainCheckoutGuard();
		if (result.blocked) {
			process.exit(1);
		}
	} catch (error) {
		console.error(
			`[Codecut main checkout guard] ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}
