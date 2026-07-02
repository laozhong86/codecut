import { describe, expect, test } from "bun:test";
import {
	downloadNetworkMaterialCandidate,
	searchNetworkMaterialProvider,
} from "../providers";

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { "content-type": "application/json" },
		...init,
	});
}

describe("searchNetworkMaterialProvider", () => {
	test("fails fast when the selected provider API key is missing", async () => {
		await expect(
			searchNetworkMaterialProvider({
				provider: "pexels",
				searchTerm: "startup office",
				env: {},
				fetchImpl: async () => jsonResponse({ videos: [] }),
			}),
		).rejects.toThrow("PEXELS_API_KEY is required");
	});

	test("searches Pexels videos and maps the selected video file", async () => {
		const requests: Array<{ url: string; init?: RequestInit }> = [];
		const results = await searchNetworkMaterialProvider({
			provider: "pexels",
			searchTerm: "startup office",
			env: { PEXELS_API_KEY: "pexels-key" },
			fetchImpl: async (url, init) => {
				requests.push({ url: String(url), init });
				return jsonResponse({
					videos: [
						{
							width: 1080,
							height: 1920,
							url: "https://www.pexels.com/video/123/",
							duration: 12,
							video_files: [
								{
									file_type: "video/mp4",
									width: 540,
									height: 960,
									link: "https://cdn.example/pexels-sd.mp4",
								},
								{
									file_type: "video/mp4",
									width: 1080,
									height: 1920,
									link: "https://cdn.example/pexels-hd.mp4",
								},
							],
						},
					],
				});
			},
		});

		expect(requests[0]?.url).toContain(
			"https://api.pexels.com/v1/videos/search",
		);
		expect(requests[0]?.url).toContain("query=startup+office");
		expect(requests[0]?.init?.headers).toEqual({
			Authorization: "pexels-key",
		});
		expect(results).toEqual([
			{
				provider: "pexels",
				sourceUrl: "https://www.pexels.com/video/123/",
				downloadUrl: "https://cdn.example/pexels-hd.mp4",
				license: {
					label: "Pexels License",
					url: "https://www.pexels.com/license/",
				},
				width: 1080,
				height: 1920,
				duration: 12,
			},
		]);
	});

	test("searches Pixabay videos and uses downloadable video URLs", async () => {
		const requests: string[] = [];
		const results = await searchNetworkMaterialProvider({
			provider: "pixabay",
			searchTerm: "mobile app",
			env: { PIXABAY_API_KEY: "pixabay-key" },
			fetchImpl: async (url) => {
				requests.push(String(url));
				return jsonResponse({
					hits: [
						{
							pageURL: "https://pixabay.com/videos/id-125/",
							duration: 9,
							videos: {
								large: {
									url: "https://cdn.example/pixabay-large.mp4",
									width: 1920,
									height: 1080,
								},
							},
						},
					],
				});
			},
		});

		expect(requests[0]).toContain("https://pixabay.com/api/videos/");
		expect(requests[0]).toContain("key=pixabay-key");
		expect(requests[0]).toContain("q=mobile+app");
		expect(results[0]).toMatchObject({
			provider: "pixabay",
			sourceUrl: "https://pixabay.com/videos/id-125/",
			downloadUrl: "https://cdn.example/pixabay-large.mp4?download=1",
			license: {
				label: "Pixabay Content License",
				url: "https://pixabay.com/service/license-summary/",
			},
			width: 1920,
			height: 1080,
			duration: 9,
		});
	});

	test("searches Coverr videos with signed URLs enabled", async () => {
		const requests: Array<{ url: string; init?: RequestInit }> = [];
		const results = await searchNetworkMaterialProvider({
			provider: "coverr",
			searchTerm: "factory machine",
			env: { COVERR_API_KEY: "coverr-key" },
			fetchImpl: async (url, init) => {
				requests.push({ url: String(url), init });
				return jsonResponse({
					hits: [
						{
							id: "S1YbPl1NfI",
							duration: 11.625,
							max_width: 2048,
							max_height: 1152,
							urls: {
								mp4: "https://storage.coverr.co/videos/S1Yb.mp4",
								mp4_download: "https://storage.coverr.co/videos/S1Yb/download",
							},
						},
					],
				});
			},
		});

		expect(requests[0]?.url).toContain("https://api.coverr.co/videos");
		expect(requests[0]?.url).toContain("query=factory+machine");
		expect(requests[0]?.url).toContain("urls=true");
		expect(requests[0]?.init?.headers).toEqual({
			Authorization: "Bearer coverr-key",
		});
		expect(results[0]).toMatchObject({
			provider: "coverr",
			sourceUrl: "https://coverr.co/videos/S1YbPl1NfI",
			downloadUrl: "https://storage.coverr.co/videos/S1Yb/download",
			license: {
				label: "Coverr License",
				url: "https://coverr.co/license/",
			},
			width: 2048,
			height: 1152,
			duration: 11.625,
		});
	});

	test("fails clearly when a candidate download fails", async () => {
		await expect(
			downloadNetworkMaterialCandidate({
				candidate: {
					provider: "pexels",
					sourceUrl: "https://www.pexels.com/video/123/",
					downloadUrl: "https://cdn.example/missing.mp4",
					license: {
						label: "Pexels License",
						url: "https://www.pexels.com/license/",
					},
					width: 1080,
					height: 1920,
					duration: 12,
				},
				fetchImpl: async () =>
					new Response("not found", {
						status: 404,
					}),
			}),
		).rejects.toThrow("Network material download failed with 404: not found");
	});
});
