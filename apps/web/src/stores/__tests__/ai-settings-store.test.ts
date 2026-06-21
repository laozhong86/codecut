import { beforeAll, describe, expect, test } from "bun:test";

beforeAll(() => {
	const storage = new Map<string, string>();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => {
				storage.set(key, value);
			},
			removeItem: (key: string) => {
				storage.delete(key);
			},
		},
	});
});

describe("AI settings store", () => {
	test("stores digital human provider and shared RunningHub API key explicitly", async () => {
		const { useAISettingsStore } = await import("../ai-settings-store");

		useAISettingsStore
			.getState()
			.setDigitalHumanProvider("runninghub-digital-human");
		useAISettingsStore.getState().setRunningHubApiKey("rh-key");

		expect(useAISettingsStore.getState().digitalHumanProviderId).toBe(
			"runninghub-digital-human",
		);
		expect(useAISettingsStore.getState().runningHubApiKey).toBe("rh-key");
	});
});
