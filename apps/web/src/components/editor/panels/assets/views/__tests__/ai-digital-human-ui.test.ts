import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("digital human UI surfaces", () => {
	test("settings exposes shared RunningHub key configuration", async () => {
		const source = await readFile(
			"apps/web/src/components/editor/panels/assets/views/settings.tsx",
			"utf8",
		);

		expect(source).toContain("Digital Human Provider");
		expect(source).toContain("setDigitalHumanProvider");
		expect(source).toContain("RunningHub API Key");
		expect(source).toContain("setRunningHubApiKey");
	});

	test("settings AI tab can be opened from configuration reminders", async () => {
		const settingsSource = await readFile(
			"apps/web/src/components/editor/panels/assets/views/settings.tsx",
			"utf8",
		);
		const aiSource = await readFile(
			"apps/web/src/components/editor/panels/assets/views/ai.tsx",
			"utf8",
		);

		expect(settingsSource).toContain("settingsTab");
		expect(settingsSource).toContain("setSettingsTab");
		expect(settingsSource).toContain("value={settingsTab}");
		expect(aiSource).toContain("openAISettings");
	});

	test("AI panel exposes the Digital Human tab and media-library selectors", async () => {
		const source = await readFile(
			"apps/web/src/components/editor/panels/assets/views/ai.tsx",
			"utf8",
		);

		expect(source).toContain('value="digital-human"');
		expect(source).toContain("imageMediaId");
		expect(source).toContain("audioMediaId");
	});
});
