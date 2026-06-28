import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginRoot = resolve(skillRoot, "..", "..");

function expectFile(relativePath) {
	const absolutePath = join(skillRoot, relativePath);
	expect(existsSync(absolutePath), relativePath).toBe(true);
	return readFileSync(absolutePath, "utf8");
}

function readProjectFile(...parts) {
	return readFileSync(join(pluginRoot, ...parts), "utf8");
}

describe("codecut scriptwriting skill contract", () => {
	test("separates cover titles, video titles, voiceover scripts, and de-AI cleanup", () => {
		const skill = expectFile("SKILL.md");
		const template = expectFile("templates/scriptwriting-brief.md");
		const manifest = expectFile("manifest.yaml");

		for (const content of [skill, template, manifest]) {
			expect(content).toContain("cover title");
			expect(content).toContain("video title");
			expect(content).toContain("Voiceover");
			expect(content).toContain("De-AI");
		}
		expect(skill).toContain("Do not merge cover title and video title");
		expect(manifest).toContain("Separate coverTitle and videoTitle lanes");
	});

	test("keeps copywriting upstream of CodeCut timeline mutation", () => {
		const skill = expectFile("SKILL.md");
		const sourcePatterns = expectFile("references/source-patterns.md");
		const template = expectFile("templates/scriptwriting-brief.md");
		const manifest = expectFile("manifest.yaml");

		for (const content of [skill, sourcePatterns, template, manifest]) {
			expect(content).toContain("timeline");
		}
		expect(skill).not.toContain("export_project");
		expect(skill).not.toContain("apply_edit_plan");
	});

	test("records local reference patterns and rejects wholesale copying", () => {
		const sourcePatterns = expectFile("references/source-patterns.md");

		for (const source of [
			"dbs-xhs-title",
			"FireRed OpenStoryline",
			"chengfeng-videocut-skills",
			"OpenMontage",
			"unified-skills/design-content-script",
		]) {
			expect(sourcePatterns).toContain(source);
		}
		expect(sourcePatterns).toContain("Adopt");
		expect(sourcePatterns).toContain("Reject");
		expect(sourcePatterns).toContain("ScriptwritingBrief");
	});

	test("requires proof checks, trigger families, and natural spoken beat structure", () => {
		const skill = expectFile("SKILL.md");
		const template = expectFile("templates/scriptwriting-brief.md");
		const manifest = expectFile("manifest.yaml");

		for (const content of [skill, template, manifest]) {
			expect(content).toContain("Proof");
		}
		expect(skill).toContain("formula");
		expect(template).toContain("Formula");
		expect(template).toContain("Visual Intent");
		expect(manifest).toContain("visual intent");
		expect(skill).toContain("trigger families");
		expect(skill).toContain("4-6 Chinese characters per second");
		expect(manifest).toContain("Proof checks for claims and titles");
	});

	test("exposes plugin agent metadata for discovery", () => {
		const openai = expectFile("agents/openai.yaml");
		const manifest = expectFile("manifest.yaml");

		expect(manifest).toContain("name: codecut-scriptwriting");
		expect(manifest).toContain("type: strategy");
		expect(openai).toContain("Use $codecut-scriptwriting");
		expect(openai).toContain("cover titles");
		expect(openai).toContain("voiceover scripts");
	});

	test("is routed from the CodeCut entrypoint as an upstream non-mutation skill", () => {
		const router = readProjectFile("skills", "codecut", "SKILL.md");
		const workflowContract = readProjectFile(
			"skills",
			"codecut",
			"references",
			"workflow-stage-contract.md",
		);

		for (const content of [router, workflowContract]) {
			expect(content).toContain("codecut-scriptwriting");
			expect(content).toContain("ScriptwritingBrief");
			expect(content).toContain("timeline mutation");
		}
	});
});
