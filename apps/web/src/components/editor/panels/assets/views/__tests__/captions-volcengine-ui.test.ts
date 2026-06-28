import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const sourcePath = join(import.meta.dir, "../captions.tsx");

describe("Captions Volcengine UI", () => {
	test("exposes a Volcengine public URL subtitle mode without local upload fallback", async () => {
		const source = await readFile(sourcePath, "utf8");

		expect(source).toContain("volcengine-url");
		expect(source).toContain("Volcengine public URL");
		expect(source).toContain("https://");
		expect(source).toContain("/api/ai/volcengine/captions");
		expect(source).not.toContain("uploadAudioToR2");
	});
});
