import { afterEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { POST as postImageGeneration } from "../image/generate/route";
import { POST as postVideoGeneration } from "../video/generate/route";
import { GET as getProxyDownload } from "../../proxy/download/route";

const origin = "http://localhost:4100";
const originalFetch = globalThis.fetch;

function request({
	url,
	method = "POST",
	headers,
	body,
}: {
	url: string;
	method?: "GET" | "POST";
	headers?: Record<string, string>;
	body?: unknown;
}): NextRequest {
	return new NextRequest(url, {
		method,
		headers: {
			...(body ? { "content-type": "application/json" } : {}),
			...headers,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function mockFetch(
	implementation: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): void {
	globalThis.fetch = implementation as typeof fetch;
}

describe("AI and media proxy route safety", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("image proxy rejects destinations outside the provider allowlist before fetching", async () => {
		let fetchCount = 0;
		mockFetch(async () => {
			fetchCount += 1;
			return jsonResponse({ ok: true });
		});

		const response = await postImageGeneration(
			request({
				url: `${origin}/api/ai/image/generate`,
				body: {
					url: "https://127.0.0.1/internal",
					headers: { Authorization: "Bearer test" },
					body: { prompt: "private" },
				},
			}),
		);

		expect(response.status).toBe(400);
		expect(fetchCount).toBe(0);
	});

	test("image proxy still forwards the known Seedream provider request", async () => {
		let forwardedUrl = "";
		let forwardedInit: RequestInit | undefined;
		mockFetch(async (input, init) => {
			forwardedUrl = String(input);
			forwardedInit = init;
			return jsonResponse({ data: [{ b64_json: "abc" }] });
		});

		const response = await postImageGeneration(
			request({
				url: `${origin}/api/ai/image/generate`,
				body: {
					url: "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
					headers: { Authorization: "Bearer test" },
					body: { prompt: "public" },
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(forwardedUrl).toBe(
			"https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
		);
		expect(forwardedInit?.method).toBe("POST");
		expect(forwardedInit?.headers).toMatchObject({
			Authorization: "Bearer test",
		});
	});

	test("video proxy rejects destinations outside the provider allowlist before fetching", async () => {
		let fetchCount = 0;
		mockFetch(async () => {
			fetchCount += 1;
			return jsonResponse({ ok: true });
		});

		const response = await postVideoGeneration(
			request({
				url: `${origin}/api/ai/video/generate`,
				body: {
					url: "https://169.254.169.254/latest/meta-data",
					headers: { Authorization: "Bearer test" },
					body: { prompt: "private" },
				},
			}),
		);

		expect(response.status).toBe(400);
		expect(fetchCount).toBe(0);
	});

	test("media download proxy is disabled before fetching remote URLs", async () => {
		let fetchCount = 0;
		mockFetch(async () => {
			fetchCount += 1;
			return new Response("remote");
		});

		const response = await getProxyDownload(
			request({
				url: `${origin}/api/proxy/download?url=${encodeURIComponent(
					"https://cdn.example.com/clip.mp4",
				)}`,
				method: "GET",
				headers: { origin },
			}),
		);

		expect(response.status).toBe(410);
		expect(fetchCount).toBe(0);
	});
});
