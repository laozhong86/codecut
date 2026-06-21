import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";

const rootDir = resolve(import.meta.dir, "../../../../..");
const legacyName = "cu" + "tia";
const legacyNamePattern = new RegExp(legacyName, "i");
const allowedFolderNamePattern = new RegExp(
	`(^|[/\\s"\`'])plugins/${legacyName}([/\\s"\`']|$)`,
	"i",
);

const binaryExtensions = new Set([
	".gif",
	".ico",
	".jpg",
	".jpeg",
	".mp3",
	".mp4",
	".png",
	".webm",
]);

function trackedFiles() {
	const result = spawnSync("git", ["ls-files", "-z"], {
		cwd: rootDir,
		encoding: "utf8",
	});

	if (result.status !== 0) {
		throw new Error(result.stderr || "Failed to list tracked files.");
	}

	return result.stdout.split("\0").filter(Boolean);
}

function isAllowedFolderNameReference(line: string) {
	return allowedFolderNamePattern.test(line);
}

describe("project naming", () => {
	test("does not keep the legacy product name in tracked text files", () => {
		const offenders: string[] = [];

		for (const file of trackedFiles()) {
			if (binaryExtensions.has(extname(file).toLowerCase())) {
				continue;
			}

			const absolutePath = resolve(rootDir, file);
			if (!existsSync(absolutePath)) {
				continue;
			}

			const content = readFileSync(absolutePath, "utf8");
			const lines = content.split(/\r?\n/);

			for (const [index, line] of lines.entries()) {
				if (
					legacyNamePattern.test(line) &&
					!isAllowedFolderNameReference(line)
				) {
					offenders.push(`${file}:${index + 1}:${line.trim()}`);
				}
			}
		}

		expect(offenders).toEqual([]);
	});
});
