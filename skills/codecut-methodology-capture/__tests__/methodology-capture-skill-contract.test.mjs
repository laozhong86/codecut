import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginRoot = dirname(dirname(skillRoot));

function readSkillFile(relativePath) {
	const absolutePath = join(skillRoot, relativePath);
	expect(existsSync(absolutePath), `${relativePath} should exist`).toBe(true);
	return readFileSync(absolutePath, "utf8");
}

function readProjectFile(relativePath) {
	const absolutePath = join(pluginRoot, relativePath);
	expect(existsSync(absolutePath), `${relativePath} should exist`).toBe(true);
	return readFileSync(absolutePath, "utf8");
}

describe("codecut methodology capture skill contract", () => {
	test("requires proposal and explicit confirmation before long-term preference writes", () => {
		const skill = readSkillFile("SKILL.md");
		const contract = readSkillFile("references/update-contract.md");
		const template = readSkillFile("templates/methodology-proposal.md");

		for (const content of [skill, contract, template]) {
			expect(content).toContain("methodology-proposal.md");
			expect(content).toContain("explicit user confirmation");
		}
		expect(skill).toContain("Without confirmation");
		expect(contract).toContain("Do not update:");
		expect(template).toContain("Confirmation Question");
	});

	test("stores private methodology only in the ignored Codecut workspace", () => {
		const skill = readSkillFile("SKILL.md");
		const contract = readSkillFile("references/update-contract.md");
		const gitignore = readProjectFile(".gitignore");
		const syncScript = readProjectFile("scripts/sync-codex-local-plugin.mjs");

		for (const content of [skill, contract]) {
			expect(content).toContain(".codecut-workspace/user-methodology/profile.md");
			expect(content).toContain(".codecut-workspace/user-methodology/rules.md");
			expect(content).toContain(".codecut-workspace/user-methodology/feedback-log.md");
			expect(content).toContain("Do not write personal editing preferences to `skills/**`");
		}
		expect(gitignore).toContain(".codecut-workspace/");
		expect(syncScript).toContain('".codecut-workspace/"');
	});

	test("separates body-integrated rules from event-only feedback logs", () => {
		const skill = readSkillFile("SKILL.md");
		const contract = readSkillFile("references/update-contract.md");

		for (const content of [skill, contract]) {
			expect(content).toContain("Integrate reusable");
			expect(content).toContain("feedback-log.md");
			expect(content).toContain("event log only");
		}
		expect(contract).toContain("Do not repeat the full rule text in the log.");
	});

	test("does not own executor, timeline, download, import, export, or publishing side effects", () => {
		const skill = readSkillFile("SKILL.md");
		const metadata = readSkillFile("agents/openai.yaml");
		const manifest = readSkillFile("manifest.yaml");

		for (const content of [skill, metadata, manifest]) {
			expect(content).toContain("executor");
			expect(content).toContain("timeline");
			expect(content).toContain("download");
			expect(content).toContain("import");
			expect(content).toContain("export");
		}
		expect(skill).toContain("must not mutate timeline state");
		expect(metadata).toContain("do not call executor");
		expect(manifest).toContain("Silent automatic learning");
	});

	test("exposes plugin metadata and reusable proposal resources", () => {
		const manifest = readSkillFile("manifest.yaml");
		const metadata = readSkillFile("agents/openai.yaml");

		expect(manifest).toContain("name: codecut-methodology-capture");
		expect(manifest).toContain("usage_log_entrypoint");
		expect(metadata).toContain("Use $codecut-methodology-capture");
		expect(existsSync(join(skillRoot, "templates/methodology-proposal.md"))).toBe(true);
		expect(existsSync(join(skillRoot, "references/update-contract.md"))).toBe(true);
	});
});
