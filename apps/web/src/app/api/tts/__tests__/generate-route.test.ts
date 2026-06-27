import { afterEach, describe, expect, mock, test } from "bun:test";

const originalVolcengineKey = process.env.VOLCENGINE_OPEN_SPEECH_API_KEY;

afterEach(() => {
	if (originalVolcengineKey === undefined) {
		delete process.env.VOLCENGINE_OPEN_SPEECH_API_KEY;
	} else {
		process.env.VOLCENGINE_OPEN_SPEECH_API_KEY = originalVolcengineKey;
	}
});

describe("TTS generate route", () => {
	test("requires Volcengine key for cloned voice synthesis", async () => {
		delete process.env.VOLCENGINE_OPEN_SPEECH_API_KEY;
		const { POST } = await import("../generate/route");

		const response = await POST(
			new Request("http://localhost/api/tts/generate", {
				method: "POST",
				body: JSON.stringify({
					provider: "volcengine-voice-clone",
					voiceType: "voice-clone-1",
					text: "豆包语音",
				}),
			}) as never,
		);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			error: "VOLCENGINE_OPEN_SPEECH_API_KEY is required",
		});
	});

	test("rejects Volcengine synthesis without voiceType", async () => {
		process.env.VOLCENGINE_OPEN_SPEECH_API_KEY = "volc-key";
		const { POST } = await import("../generate/route");

		const response = await POST(
			new Request("http://localhost/api/tts/generate", {
				method: "POST",
				body: JSON.stringify({
					provider: "volcengine-voice-clone",
					text: "豆包语音",
				}),
			}) as never,
		);

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe("Invalid request");
		expect(body.details.voiceType).toContain("Volcengine voice_type is required");
	});

	test("returns base64 mp3 audio for Volcengine cloned voice synthesis", async () => {
		process.env.VOLCENGINE_OPEN_SPEECH_API_KEY = "volc-key";
		const fetchMock = mock(async () =>
			Response.json({
				reqid: "volc-req-1",
				data: Buffer.from("mp3-bytes").toString("base64"),
			}),
		);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		try {
			const { POST } = await import("../generate/route");
			const response = await POST(
				new Request("http://localhost/api/tts/generate", {
					method: "POST",
					body: JSON.stringify({
						provider: "volcengine-voice-clone",
						voiceType: "voice-clone-1",
						text: "豆包语音",
					}),
				}) as never,
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				audio: Buffer.from("mp3-bytes").toString("base64"),
				provider: "volcengine-voice-clone",
				providerTaskId: "volc-req-1",
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
