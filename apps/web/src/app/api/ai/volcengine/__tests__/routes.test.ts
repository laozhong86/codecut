import { afterEach, describe, expect, mock, test } from "bun:test";
import { POST as POST_CAPTIONS } from "../captions/route";
import { POST as POST_TRANSCRIBE } from "../transcribe/route";

const originalFetch = globalThis.fetch;
const originalKey = process.env.VOLCENGINE_OPEN_SPEECH_API_KEY;

function jsonRequest(body: unknown): Request {
	return new Request("http://localhost/api/ai/volcengine", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalKey === undefined) {
		delete process.env.VOLCENGINE_OPEN_SPEECH_API_KEY;
	} else {
		process.env.VOLCENGINE_OPEN_SPEECH_API_KEY = originalKey;
	}
});

describe("Volcengine OpenSpeech API routes", () => {
	test("returns 503 when the OpenSpeech key is missing", async () => {
		delete process.env.VOLCENGINE_OPEN_SPEECH_API_KEY;

		const response = await POST_CAPTIONS(
			jsonRequest({ mediaUrl: "https://example.com/video.mp4" }) as never,
		);

		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({
			error: "VOLCENGINE_OPEN_SPEECH_API_KEY is required",
		});
	});

	test("rejects non-HTTPS media URLs before calling Volcengine", async () => {
		process.env.VOLCENGINE_OPEN_SPEECH_API_KEY = "volc-key";
		const fetchImpl = mock(async () => Response.json({}));
		globalThis.fetch = fetchImpl as unknown as typeof fetch;

		const response = await POST_TRANSCRIBE(
			jsonRequest({ mediaUrl: "http://example.com/audio.mp3" }) as never,
		);

		expect(response.status).toBe(400);
		expect(fetchImpl).not.toHaveBeenCalled();
		const body = await response.json();
		expect(body.details.mediaUrl).toContain(
			"Volcengine media URL must use https",
		);
	});

	test("returns editable captions for a public HTTPS URL", async () => {
		process.env.VOLCENGINE_OPEN_SPEECH_API_KEY = "volc-key";
		const fetchImpl = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input).includes("/api/v1/vc/submit?")) {
					expect(new Headers(init?.headers).get("x-api-key")).toBe("volc-key");
					return Response.json({ id: "subtitle-task-1" });
				}
				expect(String(input)).toBe(
					"https://openspeech.bytedance.com/api/v1/vc/query?id=subtitle-task-1",
				);
				return Response.json({
					utterances: [{ text: "第一句", start_time: 0, end_time: 900 }],
				});
			},
		);
		globalThis.fetch = fetchImpl as unknown as typeof fetch;

		const response = await POST_CAPTIONS(
			jsonRequest({ mediaUrl: "https://example.com/video.mp4" }) as never,
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			taskId: "subtitle-task-1",
			status: "succeeded",
			captions: [{ text: "第一句", startTime: 0, duration: 0.9 }],
		});
	});
});
