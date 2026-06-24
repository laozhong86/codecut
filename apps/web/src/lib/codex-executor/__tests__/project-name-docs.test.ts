import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("Codex project naming docs", () => {
	test("require a business project name before creating a project", () => {
		const docs = readFileSync(
			new URL(
				"../../../../../../docs/codex-driven-editing.md",
				import.meta.url,
			),
			"utf8",
		);
		const skill = readFileSync(
			new URL(
				"../../../../../../skills/codecut/SKILL.md",
				import.meta.url,
			),
			"utf8",
		);

		for (const content of [docs, skill]) {
			expect(content).toContain("business project name");
			expect(content).toContain("create-project --project-id <id> --name");
			expect(content).toContain("Do not create projects with generic names");
		}
	});
});
