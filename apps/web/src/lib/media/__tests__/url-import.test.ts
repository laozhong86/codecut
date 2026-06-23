import { afterEach, describe, expect, test } from "bun:test";
import { fetchRemoteUrlDirect } from "../url-import";

const originalFetch = globalThis.fetch;

function mockFetch(
	implementation: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): void {
	globalThis.fetch = implementation as typeof fetch;
}

describe("remote media URL import", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("does not fall back to the server media proxy when direct fetch fails", async () => {
		const requestedUrls: string[] = [];
		mockFetch(async (input) => {
			requestedUrls.push(String(input));
			return new Response("blocked", { status: 403 });
		});

		await expect(
			fetchRemoteUrlDirect({ url: "https://cdn.example.com/clip.mp4" }),
		).rejects.toThrow("Direct media fetch failed: 403");

		expect(requestedUrls).toEqual(["https://cdn.example.com/clip.mp4"]);
	});
});
