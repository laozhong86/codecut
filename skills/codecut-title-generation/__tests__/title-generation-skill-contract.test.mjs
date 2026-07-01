import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function expectFile(relativePath) {
	const absolutePath = join(skillRoot, relativePath);
	expect(existsSync(absolutePath), relativePath).toBe(true);
	return readFileSync(absolutePath, "utf8");
}

describe("codecut title generation skill contract", () => {
	test("exposes loadable skill metadata for CodeCut discovery", () => {
		const skill = expectFile("SKILL.md");
		const manifest = expectFile("manifest.yaml");
		const openai = expectFile("agents/openai.yaml");

		expect(manifest).toContain("name: codecut-title-generation");
		expect(manifest).toContain("type: strategy");
		expect(openai).toContain("Use $codecut-title-generation");
		expect(skill).toContain("# CodeCut Title Generation");
	});

	test("requires ranked title candidates with formula source evidence and risk", () => {
		const skill = expectFile("SKILL.md");
		const manifest = expectFile("manifest.yaml");

		for (const content of [skill, manifest]) {
			expect(content).toContain("Top 3");
			expect(content).toContain("formula source");
			expect(content).toContain("material evidence");
			expect(content).toContain("risk");
			expect(content).toContain("recommendation reason");
		}
	});

	test("separates fixed top title cover title and platform title lanes", () => {
		const skill = expectFile("SKILL.md");
		const manifest = expectFile("manifest.yaml");

		for (const content of [skill, manifest]) {
			expect(content).toContain("fixedTopTitle");
			expect(content).toContain("coverTitle");
			expect(content).toContain("platformTitle");
			expect(content).toContain("generic short-video");
		}
	});

	test("absorbs title formula patterns without guaranteeing virality or mutating timelines", () => {
		const skill = expectFile("SKILL.md");
		const manifest = expectFile("manifest.yaml");

		for (const content of [skill, manifest]) {
			expect(content).toContain("dbs-xhs-title");
			expect(content).toContain("Do not copy all 75 formulas");
			expect(content).toContain("No guaranteed viral claims");
			expect(content).toContain("No timeline mutation");
		}
		expect(skill).not.toContain("apply_edit_plan");
		expect(skill).not.toContain("export_project");
	});
});
