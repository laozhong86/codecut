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

describe("codecut cover generation skill contract", () => {
	test("owns evidence frame selection through project cover readback without runtime image generation", () => {
		const skill = readSkillFile("SKILL.md");

		for (const section of [
			"## Core Boundary",
			"## Stage Ownership",
			"## Inputs",
			"## Outputs",
			"## Artifacts",
			"## Stop Conditions",
			"## Handoff",
		]) {
			expect(skill).toContain(section);
		}

		for (const requiredText of [
			"Codecut runtime does not generate images",
			"build_visual_context",
			"inspect_video_range",
			"import_media",
			"set_project_cover",
			"get_project_info",
			"get_timeline_state",
			"must not mutate timeline tracks",
			"must not use `EditPlan.introCover`",
		]) {
			expect(skill).toContain(requiredText);
		}
	});

	test("keeps detailed platform, frame, archetype, and atutun guidance in references", () => {
		const skill = readSkillFile("SKILL.md");
		const platformSpecs = readSkillFile("references/platform-cover-specs.md");
		const frameRubric = readSkillFile("references/frame-selection-rubric.md");
		const archetypes = readSkillFile("references/cover-archetypes.md");
		const atutun = readSkillFile("references/atutun-xhs-cover-method.md");

		for (const referencePath of [
			"references/platform-cover-specs.md",
			"references/frame-selection-rubric.md",
			"references/cover-archetypes.md",
			"references/atutun-xhs-cover-method.md",
		]) {
			expect(skill).toContain(referencePath);
		}

		expect(platformSpecs).toContain("official");
		expect(platformSpecs).toContain("secondary");
		expect(platformSpecs).toContain("9:16");
		expect(platformSpecs).toContain("16:9");
		expect(platformSpecs).toContain("3:4");
		expect(frameRubric).toContain("emotion");
		expect(frameRubric).toContain("atmosphere");
		expect(frameRubric).toContain("proof");
		expect(archetypes).toContain("xhs-atutun-human-title");
		expect(archetypes).toContain("long-video-thumbnail");
		expect(archetypes).toContain("short-video-emotion-poster");
		expect(atutun).toContain("#FDFFA7");
		expect(atutun).toContain("3:4");
	});

	test("exposes plugin metadata for discovery", () => {
		const manifest = readSkillFile("manifest.yaml");
		const openai = readSkillFile("agents/openai.yaml");

		expect(manifest).toContain("name: codecut-cover-generation");
		expect(openai).toContain("Use $codecut-cover-generation");
		expect(openai).toContain("project cover");
	});
});
