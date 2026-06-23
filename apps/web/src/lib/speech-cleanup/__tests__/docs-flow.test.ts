import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("SpeechCleanup workflow docs", () => {
	test("document the deterministic SpeechCleanup to EditPlan flow", () => {
		const docs = readFileSync(
			new URL(
				"../../../../../../docs/codex-driven-editing.md",
				import.meta.url,
			),
			"utf8",
		);

		expect(docs).toContain("## Speech Cleanup Contract");
		expect(docs).toContain("transcribe_media");
		expect(docs).toContain("Codex labels SpeechCleanupDecision[]");
		expect(docs).toContain("rebuildTimelineFromSpeechCleanup()");
		expect(docs).toContain("EditPlan v1 projection");
		expect(docs).toContain("apply_edit_plan");
		expect(docs).toContain('dropReason: "filler"');
		expect(docs).toContain("Do not infer filler counts from words");
	});

	test("document speech cleanup quality gates for talking-head polish", () => {
		const docs = readFileSync(
			new URL(
				"../../../../../../docs/codex-driven-editing.md",
				import.meta.url,
			),
			"utf8",
		);
		const recipe = readFileSync(
			new URL(
				"../../../../../../skills/codecut-jianying-editor-framework/references/workflow-recipes/talking-head-polish.md",
				import.meta.url,
			),
			"utf8",
		);

		expect(docs).toContain("Drop earlier restarts or repeats");
		expect(docs).toContain("classify each dropped range as low or high risk");
		expect(docs).toContain("High-risk drops require explicit retained-meaning evidence");
		expect(docs).toContain('risk: "low" | "high"');
		expect(docs).toContain("retainedMeaningEvidence");
		expect(docs).toContain("trailing untranscribed audio");
		expect(docs).toContain("fails fast when the first or last");
		expect(docs).toContain("build_post_cut_captions");
		expect(recipe).toContain("drop earlier restarts or repeats");
		expect(recipe).toContain(
			"High-risk drops require `retainedMeaningEvidence`",
		);
		expect(recipe).toContain("source duration against transcript coverage");
		expect(recipe).toContain("coverage gap is unclassified");
		expect(recipe).toContain("post-cut captions");
	});
});
