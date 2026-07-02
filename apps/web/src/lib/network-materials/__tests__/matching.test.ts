import { describe, expect, test } from "bun:test";
import {
	matchNetworkMaterialCandidates,
	type NetworkMaterialCandidate,
} from "../matching";

function candidate(
	overrides: Partial<NetworkMaterialCandidate> = {},
): NetworkMaterialCandidate {
	return {
		provider: "pexels",
		sourceUrl: "https://example.com/video.mp4",
		downloadUrl: "https://example.com/video.mp4",
		license: {
			label: "Pexels License",
			url: "https://www.pexels.com/license/",
		},
		width: 1080,
		height: 1920,
		duration: 8,
		...overrides,
	};
}

describe("matchNetworkMaterialCandidates", () => {
	test("searches selected providers and round-robins candidates by voiceover search term", async () => {
		const matches = await matchNetworkMaterialCandidates({
			searchTerms: [
				{
					searchTerm: "startup office",
					voiceoverSegment: {
						text: "The founder opens the app.",
						start: 0,
						end: 4,
					},
				},
				"mobile app",
			],
			providers: ["pexels", "coverr"],
			maxClipDuration: 5,
			requiredDuration: 10,
			searchProvider: async ({ provider, searchTerm }) => [
				candidate({
					provider,
					sourceUrl: `https://cdn.example/${provider}/${searchTerm}/1.mp4`,
					downloadUrl: `https://cdn.example/${provider}/${searchTerm}/1.mp4`,
					duration: 6,
				}),
				candidate({
					provider,
					sourceUrl: `https://cdn.example/${provider}/${searchTerm}/2.mp4`,
					downloadUrl: `https://cdn.example/${provider}/${searchTerm}/2.mp4`,
					duration: 6,
				}),
			],
		});

		expect(matches.map((match) => match.searchTerm)).toEqual([
			"startup office",
			"mobile app",
		]);
		expect(matches.map((match) => match.provider)).toEqual([
			"pexels",
			"pexels",
		]);
		expect(matches[0]?.voiceoverSegment).toEqual({
			text: "The founder opens the app.",
			start: 0,
			end: 4,
		});
		expect(matches[0]?.coverageSeconds).toBe(5);
		expect(matches[1]?.coverageSeconds).toBe(5);
	});

	test("fails fast when a selected provider errors instead of silently falling back", async () => {
		await expect(
			matchNetworkMaterialCandidates({
				searchTerms: ["startup office"],
				providers: ["pexels", "pixabay"],
				maxClipDuration: 5,
				requiredDuration: 5,
				searchProvider: async ({ provider }) => {
					if (provider === "pexels") {
						throw new Error("Pexels API key is missing.");
					}
					return [candidate({ provider: "pixabay" })];
				},
			}),
		).rejects.toThrow("Pexels API key is missing.");
	});

	test("rejects candidates without traceable license information", async () => {
		await expect(
			matchNetworkMaterialCandidates({
				searchTerms: ["startup office"],
				providers: ["pexels"],
				maxClipDuration: 5,
				requiredDuration: 5,
				searchProvider: async () => [
					candidate({
						license: undefined,
					}),
				],
			}),
		).rejects.toThrow("license");
	});
});
