import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("characters voice design UI", () => {
	test("characters page exposes voice creation and generated voice list", async () => {
		const source = await readFile(
			"apps/web/src/app/[locale]/characters/page.tsx",
			"utf8",
		).then((value) => value.replaceAll("\r\n", "\n"));

		expect(source).toContain("Create Voice");
		expect(source).toContain("Generate new voice");
		expect(source).toContain("Clone from reference audio");
		expect(source).toContain("Reference audio");
		expect(source).toContain("Voice text");
		expect(source).toContain("Emotion / voice description");
		expect(source).toContain('mode === "new" &&');
		expect(source).toContain("Generated Voices");
		expect(source).toContain("useGeneratedVoicesStore");
		expect(source).toContain("generateNewVoice");
		expect(source).toContain("cloneVoiceFromReference");
		expect(source).toContain("referenceAudioFile");
		expect(source).toContain("cloneVoiceFromReference({\n\t\t\t\t\ttext,\n\t\t\t\t\treferenceAudioFile");
	});
});
