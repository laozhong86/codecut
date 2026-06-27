import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readSkillFile(relativePath) {
	const absolutePath = join(skillRoot, relativePath);
	expect(existsSync(absolutePath), `${relativePath} should exist`).toBe(true);
	return readFileSync(absolutePath, "utf8");
}

function countExactHeading(content, heading) {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return Array.from(content.matchAll(new RegExp(`^${escaped}$`, "gm"))).length;
}

describe("codecut edit planning skill contract", () => {
	test("declares the standard stage skill sections exactly once", () => {
		const skill = readSkillFile("SKILL.md");

		for (const section of [
			"## Core Boundary",
			"## Progressive Load Map",
			"## Stage Ownership",
			"## Inputs",
			"## Outputs",
			"## Artifacts",
			"## Stop Conditions",
			"## Handoff",
		]) {
			expect(countExactHeading(skill, section), section).toBe(1);
		}
	});

	test("exposes plugin metadata for planning discovery", () => {
		const manifest = readSkillFile("manifest.yaml");
		const openai = readSkillFile("agents/openai.yaml");

		expect(manifest).toContain("name: codecut-edit-planning");
		expect(openai).toContain("Use $codecut-edit-planning");
		expect(openai).toContain("candidate clips");
		expect(openai).toContain("EditingDecisionLedger");
		expect(openai).toContain("verification spec");
		expect(openai).toContain("$codecut-executor-apply");
	});

	test("keeps planning references as the single source of edit planning truth", () => {
		for (const relativePath of [
			"references/editing-intent-router.md",
			"references/workflow-recipes/long-to-short.md",
			"references/workflow-recipes/talking-head-polish.md",
			"references/workflow-recipes/subtitle-pass.md",
			"references/workflow-recipes/voiceover-remix.md",
			"references/workflow-recipes/timeline-inspection.md",
			"references/workflow-recipes/fixtures/post-cut-captions-final-edit-plan.json",
		]) {
			expect(existsSync(join(skillRoot, relativePath)), relativePath).toBe(true);
		}

		const router = readSkillFile("references/editing-intent-router.md");
		expect(router).toContain("workflow-recipes/long-to-short.md");
		expect(router).toContain("workflow-recipes/timeline-inspection.md");
		expect(router).not.toContain("../codecut/references/workflow-recipes");
		expect(router).not.toContain("skills/codecut/references/workflow-recipes");
	});

	test("blocks execution, export, hidden defaults, and weaker replacement paths", () => {
		const skill = readSkillFile("SKILL.md");
		const openai = readSkillFile("agents/openai.yaml");
		const manifest = readSkillFile("manifest.yaml");
		const longToShort = readSkillFile("references/workflow-recipes/long-to-short.md");
		const subtitlePass = readSkillFile("references/workflow-recipes/subtitle-pass.md");

		expect(skill).toContain("run executor commands");
		expect(skill).toContain("mutate timelines");
		expect(skill).toContain("export files");
		expect(skill).toContain("One selected primary recipe");
		expect(skill).toContain("verification spec");
		expect(openai).toContain("Do not call executor tools");
		expect(openai).toContain("silently");
		expect(openai).toContain("downgrade unsupported requests");
		expect(manifest).toContain("Hidden defaults");
		expect(manifest).toContain("Weaker replacement edits");
		expect(longToShort).not.toContain("fallback MP4");
		expect(subtitlePass).not.toContain("fallback MP4");
		expect(longToShort).not.toContain("safe defaults");
		expect(subtitlePass).not.toContain("safe defaults");
	});

	test("requires candidate comparison before broad edit plan drafts", () => {
		const router = readSkillFile("references/editing-intent-router.md");
		const longToShort = readSkillFile("references/workflow-recipes/long-to-short.md");

		for (const content of [router, longToShort]) {
			expect(content).toContain("candidate clips");
			expect(content).toContain("standalone coherence");
			expect(content).toContain("EditingDecisionLedger");
		}
		expect(longToShort).toContain("No candidate clip passes standalone coherence");
		expect(longToShort).toContain("verification spec");
	});
});
