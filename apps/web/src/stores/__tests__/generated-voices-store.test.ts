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
const toastWarning = mock(() => undefined);

function hasAuthorizationHeader(headers: RequestInit["headers"]): boolean {
	if (!headers) return false;
	return new Headers(headers).has("authorization");
}

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
		warning: toastWarning,
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
		toastWarning.mockClear();
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

		const result = await useGeneratedVoicesStore.getState().cloneVoiceFromReference({
			text: "把肩膀沉下来，深呼吸。",
			referenceAudioFile: new File(["audio"], "reference.wav", {
				type: "audio/wav",
			}),
			name: "女声",
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
				name: "女声",
				text: "把肩膀沉下来，深呼吸。",
				provider: "runninghub-voice-clone",
				taskId: "voice-clone-task-1",
				mimeType: "audio/wav",
			}),
			audioBlob: expect.any(Blob),
		});
		expect(useGeneratedVoicesStore.getState().voices[0]).toMatchObject({
			name: "女声",
			taskId: "voice-clone-task-1",
			text: "把肩膀沉下来，深呼吸。",
		});
		expect(result.voice).toMatchObject({
			name: "女声",
			taskId: "voice-clone-task-1",
			text: "把肩膀沉下来，深呼吸。",
		});
		expect(result.audioBlob).toBeInstanceOf(Blob);
		expect(useGeneratedVoicesStore.getState().voices[0]?.emotionPrompt).toBe(
			undefined,
		);
	});

	test("clones a built-in RunningHub voice with the runtime key source", async () => {
		const { useAISettingsStore } = await import("../ai-settings-store");
		const { useGeneratedVoicesStore } = await import("../generated-voices-store");

		useAISettingsStore.getState().setRunningHubApiKey("");
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
			name: "女声",
			apiKeySource: "runtime",
		});

		const generateCall = fetchMock.mock.calls.find(
			([url]) => url === "/api/ai/voice-clone/generate",
		);
		const taskCall = fetchMock.mock.calls.find(
			([url]) => typeof url === "string" && url.startsWith("/api/ai/voice-clone/task?"),
		);
		expect(hasAuthorizationHeader(generateCall?.[1]?.headers)).toBe(false);
		expect(hasAuthorizationHeader(taskCall?.[1]?.headers)).toBe(false);
		expect(saveGeneratedVoice).toHaveBeenCalledWith({
			voice: expect.objectContaining({
				name: "女声",
				provider: "runninghub-voice-clone",
				taskId: "voice-clone-task-1",
			}),
			audioBlob: expect.any(Blob),
		});
	});

	test("uses the configured UI RunningHub key before runtime fallback", async () => {
		const { useAISettingsStore } = await import("../ai-settings-store");
		const { useGeneratedVoicesStore } = await import("../generated-voices-store");

		useAISettingsStore.getState().setRunningHubApiKey("rh-ui-key");
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
			name: "女声",
			apiKeySource: "runtime",
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/ai/voice-clone/generate",
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer rh-ui-key",
				}),
			}),
		);
	});

	test("requires the shared RunningHub key", async () => {
		const { useAISettingsStore } = await import("../ai-settings-store");
		const { useGeneratedVoicesStore } = await import("../generated-voices-store");
		const { RUNNINGHUB_API_KEY_MISSING_MESSAGE } = await import(
			"@/lib/ai/runninghub-user-messages"
		);

		useAISettingsStore.getState().setRunningHubApiKey("");

		await expect(
			useGeneratedVoicesStore.getState().generateNewVoice({
				text: "hello",
				emotionPrompt: "warm",
			}),
		).rejects.toThrow(RUNNINGHUB_API_KEY_MISSING_MESSAGE);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(toastWarning).toHaveBeenCalledWith(
			RUNNINGHUB_API_KEY_MISSING_MESSAGE,
		);
		expect(toastError).not.toHaveBeenCalled();
	});

	test("shows a configuration reminder when runtime RunningHub key is missing", async () => {
		const runtimeMissingFetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url === "/api/ai/voice-clone/generate") {
					expect(init?.body).toBeInstanceOf(FormData);
					return new Response(
						JSON.stringify({ error: "Missing Authorization header" }),
						{
							status: 401,
							headers: { "content-type": "application/json" },
						},
					);
				}
				throw new Error(`Unexpected fetch: ${url}`);
			},
		);
		Object.defineProperty(globalThis, "fetch", {
			configurable: true,
			value: runtimeMissingFetch,
		});
		const { useAISettingsStore } = await import("../ai-settings-store");
		const { useGeneratedVoicesStore } = await import("../generated-voices-store");
		const { RUNNINGHUB_API_KEY_MISSING_MESSAGE } = await import(
			"@/lib/ai/runninghub-user-messages"
		);

		useAISettingsStore.getState().setRunningHubApiKey("");
		useGeneratedVoicesStore.setState({
			voices: [],
			isGenerating: false,
			currentTaskStatus: null,
			error: null,
		});

		await expect(
			useGeneratedVoicesStore.getState().cloneVoiceFromReference({
				text: "把肩膀沉下来，深呼吸。",
				referenceAudioFile: new File(["audio"], "reference.wav", {
					type: "audio/wav",
				}),
				name: "女声",
				apiKeySource: "runtime",
			}),
		).rejects.toThrow(RUNNINGHUB_API_KEY_MISSING_MESSAGE);

		expect(toastWarning).toHaveBeenCalledWith(
			RUNNINGHUB_API_KEY_MISSING_MESSAGE,
		);
		expect(toastError).not.toHaveBeenCalled();
	});
});
