import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { GeneratedVoice } from "@/types/voice";

const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = String(input);
	if (url === "/api/ai/voice-design/generate") {
		return new Response(
			JSON.stringify({
				taskId: "voice-task-1",
				status: "RUNNING",
			}),
		);
	}
	if (url.startsWith("/api/ai/voice-design/task?")) {
		return new Response(
			JSON.stringify({
				taskId: "voice-task-1",
				status: "SUCCESS",
				audioUrl: "https://www.runninghub.cn/output/voice.wav",
			}),
		);
	}
	if (url.startsWith("/api/ai/voice-design/download?")) {
		return new Response("audio-bytes", {
			headers: { "content-type": "audio/wav" },
		});
	}
	if (url === "/api/ai/voice-clone/generate") {
		if (!(init?.body instanceof FormData)) {
			throw new Error("Voice clone submit must use multipart form data");
		}
		expect(init.body.get("audio")).toBeInstanceOf(File);
		expect(init.body.get("text")).toBe("把肩膀沉下来，深呼吸。");
		expect(init.body.get("emotionPrompt")).toBeNull();
		return new Response(
			JSON.stringify({
				taskId: "voice-clone-task-1",
				status: "RUNNING",
			}),
		);
	}
	if (url.startsWith("/api/ai/voice-clone/task?")) {
		return new Response(
			JSON.stringify({
				taskId: "voice-clone-task-1",
				status: "SUCCESS",
				audioUrl: "https://www.runninghub.cn/output/cloned.wav",
			}),
		);
	}
	if (url.startsWith("/api/ai/voice-clone/download?")) {
		return new Response("cloned-audio-bytes", {
			headers: { "content-type": "audio/wav" },
		});
	}
	throw new Error(`Unexpected fetch: ${url}`);
});
const loadGeneratedVoices = mock(async () => ({
	voices: [] as GeneratedVoice[],
	lastModified: "2026-06-21T00:00:00.000Z",
}));
const saveGeneratedVoice = mock(async () => undefined);
const removeGeneratedVoice = mock(async () => undefined);
const toastSuccess = mock(() => undefined);
const toastError = mock(() => undefined);

mock.module("@/services/storage/service", () => ({
	storageService: {
		loadGeneratedVoices,
		saveGeneratedVoice,
		removeGeneratedVoice,
	},
}));

mock.module("sonner", () => ({
	toast: {
		success: toastSuccess,
		error: toastError,
	},
}));

describe("generated voices store", () => {
	beforeEach(async () => {
		const storage = new Map<string, string>();
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) => storage.get(key) ?? null,
				setItem: (key: string, value: string) => {
					storage.set(key, value);
				},
				removeItem: (key: string) => {
					storage.delete(key);
				},
			},
		});

		fetchMock.mockClear();
		Object.defineProperty(globalThis, "fetch", {
			configurable: true,
			value: fetchMock,
		});
		loadGeneratedVoices.mockClear();
		saveGeneratedVoice.mockClear();
		removeGeneratedVoice.mockClear();
		toastSuccess.mockClear();
		toastError.mockClear();
	});

	test("generates a new RunningHub voice without uploading reference audio", async () => {
		const { useAISettingsStore } = await import("../ai-settings-store");
		const { useGeneratedVoicesStore } = await import("../generated-voices-store");

		useAISettingsStore.getState().setRunningHubApiKey("rh-key");
		useGeneratedVoicesStore.setState({
			voices: [],
			isGenerating: false,
			currentTaskStatus: null,
			error: null,
		});

		await useGeneratedVoicesStore.getState().generateNewVoice({
			text: "把肩膀沉下来，深呼吸。",
			emotionPrompt: "温柔、低沉、安抚感强的心理咨询师声音",
		});

		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("/api/ai/voice-design/download?"),
		);
		expect(fetchMock).not.toHaveBeenCalledWith(
			"/api/ai/voice-clone/generate",
			expect.anything(),
		);
		expect(saveGeneratedVoice).toHaveBeenCalledWith({
			voice: expect.objectContaining({
				text: "把肩膀沉下来，深呼吸。",
				emotionPrompt: "温柔、低沉、安抚感强的心理咨询师声音",
				provider: "runninghub-voice-design",
				taskId: "voice-task-1",
				mimeType: "audio/wav",
			}),
			audioBlob: expect.any(Blob),
		});
		expect(useGeneratedVoicesStore.getState().voices[0]).toMatchObject({
			taskId: "voice-task-1",
			text: "把肩膀沉下来，深呼吸。",
			emotionPrompt: "温柔、低沉、安抚感强的心理咨询师声音",
		});
	});

	test("clones a RunningHub voice from reference audio and stores it locally", async () => {
		const { useAISettingsStore } = await import("../ai-settings-store");
		const { useGeneratedVoicesStore } = await import("../generated-voices-store");

		useAISettingsStore.getState().setRunningHubApiKey("rh-key");
		useGeneratedVoicesStore.setState({
			voices: [],
			isGenerating: false,
			currentTaskStatus: null,
			error: null,
		});

		await useGeneratedVoicesStore.getState().cloneVoiceFromReference({
			text: "把肩膀沉下来，深呼吸。",
			referenceAudioFile: new File(["audio"], "reference.wav", {
				type: "audio/wav",
			}),
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/ai/voice-clone/generate",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer rh-key",
				}),
				body: expect.any(FormData),
			}),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("/api/ai/voice-clone/download?"),
		);
		expect(saveGeneratedVoice).toHaveBeenCalledWith({
			voice: expect.objectContaining({
				text: "把肩膀沉下来，深呼吸。",
				provider: "runninghub-voice-clone",
				taskId: "voice-clone-task-1",
				mimeType: "audio/wav",
			}),
			audioBlob: expect.any(Blob),
		});
		expect(useGeneratedVoicesStore.getState().voices[0]).toMatchObject({
			taskId: "voice-clone-task-1",
			text: "把肩膀沉下来，深呼吸。",
		});
		expect(useGeneratedVoicesStore.getState().voices[0]?.emotionPrompt).toBe(
			undefined,
		);
	});

	test("requires the shared RunningHub key", async () => {
		const { useAISettingsStore } = await import("../ai-settings-store");
		const { useGeneratedVoicesStore } = await import("../generated-voices-store");

		useAISettingsStore.getState().setRunningHubApiKey("");

		await expect(
			useGeneratedVoicesStore.getState().generateNewVoice({
				text: "hello",
				emotionPrompt: "warm",
			}),
		).rejects.toThrow("RUNNINGHUB_API_KEY is required");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
