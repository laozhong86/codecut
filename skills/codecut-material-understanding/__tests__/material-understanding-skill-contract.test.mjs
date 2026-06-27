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

describe("codecut material understanding skill contract", () => {
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

	test("exposes plugin metadata for material understanding discovery", () => {
		const manifest = readSkillFile("manifest.yaml");
		const openai = readSkillFile("agents/openai.yaml");

		expect(manifest).toContain("name: codecut-material-understanding");
		expect(openai).toContain("Use $codecut-material-understanding");
		expect(openai).toContain("script-to-material matching");
		expect(openai).toContain("picture-in-picture suitability");
		expect(openai).toContain("circular talking-head suitability");
		expect(openai).toContain("$codecut-edit-planning");
	});

	test("defines material-understanding artifacts and role labels", () => {
		const skill = readSkillFile("SKILL.md");
		const contract = readSkillFile("references/material-understanding-contract.md");

		for (const content of [skill, contract]) {
			expect(content).toContain("material-understanding.json");
			expect(content).toContain("material-understanding.md");
			expect(content).toContain("talking_head_subject");
			expect(content).toContain("b_roll");
			expect(content).toContain("product_demo");
			expect(content).toContain("screen_recording");
			expect(content).toContain("proof_asset");
			expect(content).toContain("ambience");
			expect(content).toContain("low_usability");
		}
		expect(contract).toContain("schemaVersion");
		expect(contract).toContain("material-understanding.v1");
		expect(contract).toContain("compositionAffordances");
		expect(contract).toContain("scriptMatches");
	});

	test("keeps understanding separate from planning and execution", () => {
		const skill = readSkillFile("SKILL.md");
		const openai = readSkillFile("agents/openai.yaml");
		const manifest = readSkillFile("manifest.yaml");
		const contract = readSkillFile("references/material-understanding-contract.md");

		for (const content of [skill, openai, manifest, contract]) {
			expect(content).toContain("Do not");
		}
		expect(skill).toContain("It must not choose the final editing recipe");
		expect(skill).toContain("final composition choices belong");
		expect(openai).toContain("Do not call executor tools");
		expect(openai).toContain("mutate timelines");
		expect(openai).toContain("generate masks");
		expect(manifest).toContain("Material understanding is treated as edit planning");
		expect(contract).toContain("not an edit plan");
	});
});
