import { describe, expect, mock, test } from "bun:test";
import {
	handleVoiceCloneGenerateRequest,
	parseVoiceCloneGenerateFormData,
} from "@/lib/ai/runninghub-generation-route-inputs";

function validFormData(overrides: Record<string, string | File> = {}): FormData {
	const formData = new FormData();
	formData.set(
		"audio",
		new File(["audio"], "reference.wav", { type: "audio/wav" }),
	);
	formData.set("text", "把肩膀沉下来，深呼吸。");
	for (const [key, value] of Object.entries(overrides)) {
		formData.set(key, value);
	}
	return formData;
}

function formDataRequest({
	formData,
	authorization = "Bearer rh-key",
}: {
	formData: FormData;
	authorization?: string;
}): Request {
	return new Request("https://example.com/api/ai/voice-clone/generate", {
		method: "POST",
		headers: authorization ? { Authorization: authorization } : undefined,
		body: formData,
	});
}

describe("voice clone generate route", () => {
	test("parses valid RunningHub voice clone form data", () => {
		const parsed = parseVoiceCloneGenerateFormData({
			formData: validFormData(),
		});

		expect(parsed.audioFile.type).toBe("audio/wav");
		expect(parsed.request).toEqual({
			text: "把肩膀沉下来，深呼吸。",
		});
	});

	test("rejects missing, empty, and unsupported reference audio", () => {
		const withoutAudio = validFormData();
		withoutAudio.delete("audio");
		expect(() =>
			parseVoiceCloneGenerateFormData({ formData: withoutAudio }),
		).toThrow("audio file is required");

		expect(() =>
			parseVoiceCloneGenerateFormData({
				formData: validFormData({
					audio: new File([], "reference.wav", { type: "audio/wav" }),
				}),
			}),
		).toThrow("Audio file is empty");

		expect(() =>
			parseVoiceCloneGenerateFormData({
				formData: validFormData({
					audio: new File(["video"], "reference.mp4", { type: "video/mp4" }),
				}),
			}),
		).toThrow("Audio file type is not supported");
	});

	test("rejects empty text", () => {
		expect(() =>
			parseVoiceCloneGenerateFormData({
				formData: validFormData({ text: "   " }),
			}),
		).toThrow("Invalid voice clone generation request");
	});

	test("rejects missing Authorization before upload", async () => {
		const uploadAudioFile = mock(async () => "openapi/ref.wav");
		const submitVoiceCloneTask = mock(async () => ({
			taskId: "voice-clone-task-1",
			status: "running" as const,
		}));

		await expect(
			handleVoiceCloneGenerateRequest({
				request: formDataRequest({
					formData: validFormData(),
					authorization: "",
				}),
				uploadAudioFile,
				submitVoiceCloneTask,
			}),
		).rejects.toThrow("Missing Authorization header");
		expect(uploadAudioFile).not.toHaveBeenCalled();
		expect(submitVoiceCloneTask).not.toHaveBeenCalled();
	});

	test("uploads the reference audio before submitting the clone task", async () => {
		const uploadAudioFile = mock(async () => "openapi/ref.wav");
		const submitVoiceCloneTask = mock(async () => ({
			taskId: "voice-clone-task-1",
			status: "running" as const,
		}));

		const result = await handleVoiceCloneGenerateRequest({
			request: formDataRequest({ formData: validFormData() }),
			uploadAudioFile,
			submitVoiceCloneTask,
		});

		expect(uploadAudioFile).toHaveBeenCalledWith({
			apiKey: "rh-key",
			file: expect.any(File),
		});
		expect(submitVoiceCloneTask).toHaveBeenCalledWith({
			apiKey: "rh-key",
			audioFileName: "openapi/ref.wav",
			request: {
				text: "把肩膀沉下来，深呼吸。",
			},
		});
		expect(result).toEqual({
			taskId: "voice-clone-task-1",
			status: "running",
		});
	});
});
