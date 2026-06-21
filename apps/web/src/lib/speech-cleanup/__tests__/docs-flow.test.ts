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
});
