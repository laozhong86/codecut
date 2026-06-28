import { describe, expect, mock, test } from "bun:test";
import {
	queryVolcengineAsrTask,
	queryVolcengineSubtitleTask,
	submitVolcengineAsrTask,
	submitVolcengineSubtitleTask,
	synthesizeVolcengineClonedVoice,
} from "../volcengine-openspeech";

describe("Volcengine OpenSpeech provider", () => {
	test("synthesizes cloned voice audio through x-api-key without leaking the key into the body", async () => {
		const fetchImpl = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe(
					"https://openspeech.bytedance.com/api/v1/tts",
				);
				expect(init?.method).toBe("POST");
				expect(new Headers(init?.headers).get("x-api-key")).toBe("volc-key");
				const body = JSON.parse(String(init?.body));
				expect(JSON.stringify(body)).not.toContain("volc-key");
				expect(body.audio.voice_type).toBe("voice-clone-1");
				expect(body.audio.encoding).toBe("mp3");
				expect(body.request.text).toBe("豆包语音");
				expect(body.request.operation).toBe("query");
				return Response.json({
					reqid: "req-1",
					data: Buffer.from("mp3-bytes").toString("base64"),
				});
			},
		);

		const result = await synthesizeVolcengineClonedVoice({
			apiKey: "volc-key",
			voiceType: "voice-clone-1",
			text: "豆包语音",
			reqid: "req-1",
			fetchImpl,
		});

		expect(result).toEqual({
			taskId: "req-1",
			audioBytes: Buffer.from("mp3-bytes"),
			mimeType: "audio/mpeg",
		});
	});

	test("submits ASR jobs with the required resource headers", async () => {
		const fetchImpl = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe(
					"https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit",
				);
				const headers = new Headers(init?.headers);
				expect(headers.get("x-api-key")).toBe("volc-key");
				expect(headers.get("X-Api-Resource-Id")).toBe("volc.seedasr.auc");
				expect(headers.get("X-Api-Request-Id")).toBe("asr-request-1");
				expect(headers.get("X-Api-Sequence")).toBe("-1");
				const body = JSON.parse(String(init?.body));
				expect(JSON.stringify(body)).not.toContain("volc-key");
				expect(body.audio.url).toBe("https://example.com/audio.mp3");
				expect(body.request.model_name).toBe("bigmodel");
				return Response.json({ code: 0, message: "Success" });
			},
		);

		await expect(
			submitVolcengineAsrTask({
				apiKey: "volc-key",
				audioUrl: "https://example.com/audio.mp3",
				requestId: "asr-request-1",
				fetchImpl,
			}),
		).resolves.toEqual({
			taskId: "asr-request-1",
			status: "submitted",
		});
	});

	test("normalizes ASR query results to the shared transcription contract", async () => {
		const fetchImpl = mock(async () =>
			Response.json({
				result: {
					text: "豆包语音",
					utterances: [{ text: "豆包语音", start_time: 0, end_time: 1230 }],
				},
			}),
		);

		const result = await queryVolcengineAsrTask({
			apiKey: "volc-key",
			requestId: "asr-request-1",
			fetchImpl,
		});

		expect(result).toMatchObject({
			taskId: "asr-request-1",
			status: "succeeded",
			text: "豆包语音",
			language: "zh-CN",
			modelId: "volcengine-bigmodel",
			segments: [{ text: "豆包语音", start: 0, end: 1.23 }],
			capabilities: {
				segments: true,
				words: false,
				timestamps: { segments: true, words: false },
				confidence: false,
			},
			quality: {
				confidence: null,
				warnings: ["word timestamps unavailable"],
			},
		});
	});

	test("submits and queries VC subtitle jobs as editable caption entries", async () => {
		const submitFetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toContain("/api/v1/vc/submit?");
				expect(new Headers(init?.headers).get("x-api-key")).toBe("volc-key");
				const body = JSON.parse(String(init?.body));
				expect(body.url).toBe("https://example.com/video.mp4");
				return Response.json({ id: "subtitle-task-1" });
			},
		);
		const submitted = await submitVolcengineSubtitleTask({
			apiKey: "volc-key",
			mediaUrl: "https://example.com/video.mp4",
			fetchImpl: submitFetch,
		});
		expect(submitted).toEqual({
			taskId: "subtitle-task-1",
			status: "submitted",
		});

		const queryFetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe(
					"https://openspeech.bytedance.com/api/v1/vc/query?id=subtitle-task-1",
				);
				expect(new Headers(init?.headers).get("x-api-key")).toBe("volc-key");
				return Response.json({
					utterances: [
						{ text: "第一句", start_time: 0, end_time: 900 },
						{ text: "第二句", start_time: 900, end_time: 1800 },
					],
				});
			},
		);

		await expect(
			queryVolcengineSubtitleTask({
				apiKey: "volc-key",
				taskId: "subtitle-task-1",
				fetchImpl: queryFetch,
			}),
		).resolves.toEqual({
			taskId: "subtitle-task-1",
			status: "succeeded",
			captions: [
				{ text: "第一句", startTime: 0, duration: 0.9 },
				{ text: "第二句", startTime: 0.9, duration: 0.9 },
			],
		});
	});

	test("fails fast on non-JSON provider responses", async () => {
		await expect(
			synthesizeVolcengineClonedVoice({
				apiKey: "volc-key",
				voiceType: "voice-clone-1",
				text: "豆包语音",
				fetchImpl: async () => new Response("not json"),
			}),
		).rejects.toThrow("Volcengine returned non-JSON response");
	});

	test("includes provider error details when voice synthesis is rejected", async () => {
		await expect(
			synthesizeVolcengineClonedVoice({
				apiKey: "volc-key",
				voiceType: "主播女 声音克隆",
				text: "豆包语音",
				fetchImpl: async () =>
					Response.json(
						{ message: "voice_type is unauthorized" },
						{ status: 403 },
					),
			}),
		).rejects.toThrow(
			"Volcengine request failed: 403 - voice_type is unauthorized",
		);
	});
});
