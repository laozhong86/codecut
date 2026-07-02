import { afterEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

let rateLimitError: Error | null = null;

mock.module("@codecut/env/web", () => ({
	webEnv: {
		FREESOUND_API_KEY: undefined,
	},
}));

mock.module("@/lib/rate-limit", () => ({
	checkRateLimit: async () => {
		if (rateLimitError) throw rateLimitError;
		return { limited: false };
	},
}));

const { GET } = await import("../route");
const { isCommercialVideoSafeLicense } = await import(
	"../../../../../lib/sounds/internet-archive-search.mjs"
);

const origin = "http://localhost:4100";
const originalFetch = globalThis.fetch;
const originalFreesoundApiKey = process.env.FREESOUND_API_KEY;
const originalNodeEnv = process.env.NODE_ENV;
const originalConsoleWarn = console.warn;

function searchRequest(path: string): NextRequest {
	return new NextRequest(`${origin}${path}`);
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function mockFetch(
	implementation: (
		...args: Parameters<typeof fetch>
	) => ReturnType<typeof fetch>,
): void {
	globalThis.fetch = implementation as typeof fetch;
}

function setNodeEnv(value: string | undefined): void {
	if (value === undefined) {
		Reflect.deleteProperty(process.env, "NODE_ENV");
		return;
	}
	Reflect.set(process.env, "NODE_ENV", value);
}

describe("sound search route", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
		if (originalFreesoundApiKey === undefined) {
			delete process.env.FREESOUND_API_KEY;
		} else {
			process.env.FREESOUND_API_KEY = originalFreesoundApiKey;
		}
		setNodeEnv(originalNodeEnv);
		rateLimitError = null;
		console.warn = originalConsoleWarn;
	});

	test("searches downloadable Internet Archive songs and filters unsafe licenses", async () => {
		const fetchedUrls: string[] = [];
		mockFetch(async (input) => {
			const url = String(input);
			fetchedUrls.push(url);

			if (url.startsWith("https://archive.org/advancedsearch.php")) {
				return jsonResponse({
					response: {
						numFound: 3,
						docs: [
							{
								identifier: "safe-lofi",
								title: "Safe Lofi Beat",
								creator: "Open Artist",
								licenseurl: "https://creativecommons.org/licenses/by/4.0/",
								downloads: 12,
							},
							{
								identifier: "non-commercial",
								title: "NC Track",
								creator: "Closed Artist",
								licenseurl: "https://creativecommons.org/licenses/by-nc/4.0/",
								downloads: 7,
							},
							{
								identifier: "no-derivatives",
								title: "ND Track",
								creator: "Closed Artist",
								licenseurl: "https://creativecommons.org/licenses/by-nd/4.0/",
								downloads: 4,
							},
						],
					},
				});
			}

			if (url === "https://archive.org/metadata/safe-lofi") {
				return jsonResponse({
					server: "ia801234.us.archive.org",
					metadata: {
						identifier: "safe-lofi",
						title: "Safe Lofi Beat",
						creator: "Open Artist",
						subject: "lofi; background music",
						licenseurl: "https://creativecommons.org/licenses/by/4.0/",
					},
					files: [
						{
							name: "safe-lofi.mp3",
							source: "original",
							format: "VBR MP3",
							size: "123456",
							length: "91.2",
						},
					],
				});
			}

			throw new Error(`Unexpected fetch: ${url}`);
		});

		const response = await GET(
			searchRequest("/api/sounds/search?type=songs&q=lofi&page_size=5"),
		);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.type).toBe("songs");
		expect(body.results).toEqual([
			expect.objectContaining({
				id: expect.any(Number),
				name: "Safe Lofi Beat",
				username: "Open Artist",
				sourceId: "internet-archive:safe-lofi:safe-lofi.mp3",
				source: "internet_archive",
				license: "CC BY 4.0",
				licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
				downloadUrl: "https://archive.org/download/safe-lofi/safe-lofi.mp3",
				previewUrl: "https://archive.org/download/safe-lofi/safe-lofi.mp3",
				duration: 91.2,
			}),
		]);
		expect(fetchedUrls).not.toContain(
			"https://archive.org/metadata/non-commercial",
		);
		expect(fetchedUrls).not.toContain(
			"https://archive.org/metadata/no-derivatives",
		);
	});

	test("requires a real Creative Commons host for commercial song licenses", () => {
		expect(
			isCommercialVideoSafeLicense(
				"https://creativecommons.org/licenses/by/4.0/",
			),
		).toBe(true);
		expect(
			isCommercialVideoSafeLicense(
				"https://example.com/not-real/creativecommons.org/licenses/by/4.0/",
			),
		).toBe(false);
		expect(
			isCommercialVideoSafeLicense(
				"https://creativecommons.org/licenses/by-nc/4.0/",
			),
		).toBe(false);
	});

	test("fails fast when Freesound effects search has no API key", async () => {
		delete process.env.FREESOUND_API_KEY;

		let fetchCount = 0;
		mockFetch(async () => {
			fetchCount += 1;
			return jsonResponse({});
		});

		const response = await GET(
			searchRequest("/api/sounds/search?type=effects&q=whoosh"),
		);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			error: "Freesound API key is not configured",
		});
		expect(fetchCount).toBe(0);
	});

	test("skips Internet Archive songs when metadata lookup fails", async () => {
		mockFetch(async (input) => {
			const url = String(input);

			if (url.startsWith("https://archive.org/advancedsearch.php")) {
				return jsonResponse({
					response: {
						numFound: 1,
						docs: [
							{
								identifier: "metadata-offline",
								title: "Metadata Offline",
								creator: "Open Artist",
								licenseurl: "https://creativecommons.org/licenses/by/4.0/",
								downloads: 12,
							},
						],
					},
				});
			}

			if (url === "https://archive.org/metadata/metadata-offline") {
				throw new Error("metadata unavailable");
			}

			throw new Error(`Unexpected fetch: ${url}`);
		});

		const response = await GET(
			searchRequest("/api/sounds/search?type=songs&q=lofi&page_size=1"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			type: "songs",
			results: [],
		});
	});

	test("continues local development song search when rate limit storage is unavailable", async () => {
		setNodeEnv("development");
		rateLimitError = new Error("redis offline");
		const warn = mock(() => {});
		console.warn = warn as unknown as typeof console.warn;
		mockFetch(async (input) => {
			const url = String(input);

			if (url.startsWith("https://archive.org/advancedsearch.php")) {
				return jsonResponse({
					response: {
						numFound: 0,
						docs: [],
					},
				});
			}

			throw new Error(`Unexpected fetch: ${url}`);
		});

		const response = await GET(
			searchRequest("/api/sounds/search?type=songs&q=lofi&page_size=1"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			type: "songs",
			results: [],
		});
		expect(warn).toHaveBeenCalledTimes(1);
	});

	test("does not add noncommercial Freesound filters for commercial searches", async () => {
		process.env.FREESOUND_API_KEY = "test-freesound-token";
		let upstreamUrl = "";
		mockFetch(async (input) => {
			upstreamUrl = String(input);
			return jsonResponse({
				count: 0,
				next: null,
				previous: null,
				results: [],
			});
		});

		const response = await GET(
			searchRequest("/api/sounds/search?type=effects&q=whoosh"),
		);

		expect(response.status).toBe(200);
		expect(new URL(upstreamUrl).searchParams.getAll("filter")).toContain(
			'license:("Attribution" OR "Creative Commons 0")',
		);
		expect(upstreamUrl).not.toContain("Noncommercial");
	});

	test("does not add commercial Freesound filters when commercial_only is false", async () => {
		process.env.FREESOUND_API_KEY = "test-freesound-token";
		let upstreamUrl = "";
		mockFetch(async (input) => {
			upstreamUrl = String(input);
			return jsonResponse({
				count: 0,
				next: null,
				previous: null,
				results: [],
			});
		});

		const response = await GET(
			searchRequest(
				"/api/sounds/search?type=effects&q=whoosh&commercial_only=false",
			),
		);

		expect(response.status).toBe(200);
		expect(new URL(upstreamUrl).searchParams.getAll("filter")).not.toContain(
			'license:("Attribution" OR "Creative Commons 0")',
		);
	});
});
