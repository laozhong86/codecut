import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("characters voice design UI", () => {
	test("characters page exposes voice creation and generated voice list", async () => {
		const source = await readFile(
			"apps/web/src/app/[locale]/characters/page.tsx",
			"utf8",
		);

		expect(source).toContain("Create Voice");
		expect(source).toContain("Voice text");
		expect(source).toContain("Emotion / voice description");
		expect(source).toContain("Generated Voices");
		expect(source).toContain("useGeneratedVoicesStore");
	});
});
