import { describe, expect, test } from "bun:test";

describe("assets panel store", () => {
	test("opens AI settings from configuration reminders", async () => {
		const { useAssetsPanelStore } = await import("../assets-panel-store");

		useAssetsPanelStore.setState({
			activeTab: "media",
			settingsTab: "project-info",
		});

		useAssetsPanelStore.getState().openAISettings();

		expect(useAssetsPanelStore.getState().activeTab).toBe("settings");
		expect(useAssetsPanelStore.getState().settingsTab).toBe("ai");
	});
});
