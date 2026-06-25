import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readSkillFile(relativePath) {
	return readFileSync(join(skillRoot, relativePath), "utf8");
}

function expectFile(relativePath) {
	const absolutePath = join(skillRoot, relativePath);
	expect(existsSync(absolutePath), relativePath).toBe(true);
	return readFileSync(absolutePath, "utf8");
}

describe("content platform editing strategy skill contract", () => {
	test("keeps platform algorithms as dated hypotheses, not secret ranking truth", () => {
		const skill = expectFile("SKILL.md");
		const signalModel = expectFile("references/platform-signal-model.md");
		const pressureTests = expectFile("references/pressure-tests.md");

		for (const content of [skill, signalModel, pressureTests]) {
			expect(content).toContain("dated hypothesis");
			expect(content).toContain("current-source check");
			expect(content).toContain("Do not claim secret ranking weights");
		}
	});

	test("maps platform signals into a CodeCut planning brief instead of executor mutation", () => {
		const skill = expectFile("SKILL.md");
		const adapter = expectFile("references/editing-decision-ledger-adapter.md");
		const template = expectFile("templates/platform-strategy-brief.md");

		for (const content of [skill, adapter, template]) {
			expect(content).toContain("PlatformStrategyBrief");
			expect(content).toContain("EditingDecisionLedger");
			expect(content).toContain("materialAudit");
			expect(content).toContain("storyBeats");
			expect(content).toContain("qaChecklist");
			expect(content).toContain("does not mutate the timeline");
		}
	});

	test("covers the requested platform set with platform-specific editing cautions", () => {
		const platformFiles = [
			"references/douyin.md",
			"references/xiaohongshu.md",
			"references/wechat-video.md",
			"references/tiktok.md",
			"references/instagram-reels.md",
		];

		for (const relativePath of platformFiles) {
			const content = expectFile(relativePath);
			expect(content).toContain("Editing bias");
			expect(content).toContain("Evidence to inspect");
			expect(content).toContain("Avoid");
		}
	});

	test("exposes plugin agent metadata for discovery", () => {
		const manifest = expectFile("manifest.yaml");
		const openai = expectFile("agents/openai.yaml");

		expect(manifest).toContain("name: content-platform-editing-strategy");
		expect(manifest).toContain("type: strategy");
		expect(openai).toContain("Use $content-platform-editing-strategy");
		expect(openai).toContain("recommendation algorithm");
	});

	test("absorbs algorithm signals into content strategy before edit strategy", () => {
		const skill = expectFile("SKILL.md");
		const adapter = expectFile("references/content-strategy-adapter.md");
		const template = expectFile("templates/platform-strategy-brief.md");

		for (const content of [skill, adapter, template]) {
			expect(content).toContain("ContentCreationStrategy");
			expect(content).toContain("audienceIntent");
			expect(content).toContain("contentAngle");
			expect(content).toContain("scriptPromise");
			expect(content).toContain("proofAsset");
			expect(content).toContain("interactionDesign");
			expect(content).toContain("editingImplication");
		}
	});

	test("records local skill patterns and source quality levels used for strategy guidance", () => {
		const sourcePatterns = expectFile("references/source-patterns.md");
		const researchMap = expectFile("references/research-source-map.md");

		for (const content of [sourcePatterns, researchMap]) {
			expect(content).toContain("Source quality ladder");
			expect(content).toContain("official platform source");
			expect(content).toContain("local skill pattern");
			expect(content).toContain("third-party hypothesis");
			expect(content).toContain("absorbed pattern");
		}

		expect(sourcePatterns).toContain("dbs-hook");
		expect(sourcePatterns).toContain("dbs-xhs-title");
		expect(sourcePatterns).toContain("bggg-tiktok-readvideo");
		expect(sourcePatterns).toContain("ugc-commerce-video-skill");
	});
});
