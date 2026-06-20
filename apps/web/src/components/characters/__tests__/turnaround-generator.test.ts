import { describe, expect, test } from "bun:test";
import { buildGenerateCharacterPortraitRequest } from "../turnaround-generator";

describe("character portrait client request", () => {
	test("sends explicit Codex model config and form fields", () => {
		const request = buildGenerateCharacterPortraitRequest({
			name: "测试",
			gender: "female",
			age: "young adult",
			description: "black hair, red jacket",
			styleDescription: "anime key visual",
		});

		expect(request).toEqual({
			action: "generate_character_portrait",
			input: {
				model: "gpt-5.4-mini",
				reasoningEffort: "low",
				name: "测试",
				gender: "female",
				age: "young adult",
				description: "black hair, red jacket",
				styleDescription: "anime key visual",
			},
		});
	});
});
