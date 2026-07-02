import { describe, expect, test } from "bun:test";
import {
	buildNetworkMaterialSearchTermPrompt,
	parseNetworkMaterialSearchTerms,
} from "../search-terms";

describe("network material search terms", () => {
	test("requires voiceover or spoken transcript text", () => {
		expect(() => buildNetworkMaterialSearchTermPrompt({})).toThrow(
			"network material matching requires voiceover, spokenScript, or ASR text",
		);
	});

	test("builds an ordered English-only search term prompt from spokenScript", () => {
		const request = buildNetworkMaterialSearchTermPrompt({
			spokenScript: {
				text: "The founder opens the app, checks weekly revenue, and shares the growth result.",
			},
			maxTerms: 4,
		});

		expect(request.source).toBe("spokenScript");
		expect(request.sourceText).toContain("founder opens the app");
		expect(request.prompt).toContain("chronological stock-video search terms");
		expect(request.prompt).toContain("english search terms only");
		expect(request.prompt).toContain("json-array of strings");
	});

	test("parses only English JSON array search terms", () => {
		expect(
			parseNetworkMaterialSearchTerms('["startup office", "mobile app"]'),
		).toEqual(["startup office", "mobile app"]);
		expect(() => parseNetworkMaterialSearchTerms('["创业 办公室"]')).toThrow(
			"network material search terms must be English",
		);
		expect(() => parseNetworkMaterialSearchTerms('"startup office"')).toThrow(
			"network material search terms must be a JSON array",
		);
	});
});
