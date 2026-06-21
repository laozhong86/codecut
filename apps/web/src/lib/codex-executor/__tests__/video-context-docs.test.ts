import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("VideoContext contract docs", () => {
	test("document suggestTrimFillers as a marker-class hint", () => {
		const docs = readFileSync(
			new URL(
				"../../../../../../skills/codecut-jianying-editor-framework/references/video-context-contract.md",
				import.meta.url,
			),
			"utf8",
		);

		expect(docs).toContain(
			"`suggestTrimFillers` is a hint triggered by at least two different filler marker classes; it is not a deletion count.",
		);
	});
});
