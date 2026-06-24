import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const sourcePath = join(import.meta.dir, "../text-speech-panel.tsx");

describe("TextSpeechPanel", () => {
	test("does not log expected RunningHub key configuration reminders as console errors", async () => {
		const source = await readFile(sourcePath, "utf8");

		expect(source).toContain("isRunningHubApiKeyMissingError");
		expect(source).toContain("RUNNINGHUB_API_KEY_MISSING_MESSAGE");
		expect(source).toContain("if (!isRunningHubApiKeyMissingError(error))");
	});

	test("configuration reminders offer a direct Settings action", async () => {
		const source = await readFile(sourcePath, "utf8");

		expect(source).toContain("openAISettings");
		expect(source).toContain("action:");
		expect(source).toContain('label: i18next.t("Go to Settings")');
	});
});
