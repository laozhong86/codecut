import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readSkillFile(relativePath) {
	return readFileSync(join(skillRoot, relativePath), "utf8");
}

describe("codecut reference template granularity guidance", () => {
	test("requires per-reference beat and copy breakdown before template import confirmation", () => {
		const skill = readSkillFile("SKILL.md");
		const contract = readSkillFile("references/template-script-contract.md");

		for (const content of [skill, contract]) {
			expect(content).toContain("Per-Reference Beat And Copy Breakdown");
			expect(content).toContain("narration or spoken transcript");
			expect(content).toContain("on-screen caption or visible copy");
			expect(content).toContain("visual action");
			expect(content).toContain("editing function");
			expect(content).toContain("reusable template rule");
		}
	});

	test("blocks visual-only drafts when speech or captions matter unless evidence is explicitly missing", () => {
		const skill = readSkillFile("SKILL.md");
		const pressureTests = readSkillFile("references/pressure-tests.md");

		for (const content of [skill, pressureTests]) {
			expect(content).toContain("speech-or-copy evidence gate");
			expect(content).toContain("transcribe_media");
			expect(content).toContain("get_transcript");
			expect(content).toContain("visual-only draft");
			expect(content).toContain("not import-ready");
		}
	});

	test("agent metadata preserves confirmation and readback gates", () => {
		const metadata = readSkillFile("agents/openai.yaml");

		expect(metadata).toContain("confirmed draft");
		expect(metadata).toContain("system-template import");
		expect(metadata).toContain("visual-only");
		expect(metadata).toContain("not import-ready");
		expect(metadata).toContain("unsupported runtime gaps");
		expect(metadata).toContain("normal Codecut requirement intake");
		expect(metadata).toContain("strict plan validation");
		expect(metadata).toContain("get_timeline_state readback");
	});
});
