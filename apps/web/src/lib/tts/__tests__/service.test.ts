import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/types/assets";

const originalFetch = globalThis.fetch;
const originalAudioContext = globalThis.AudioContext;
const originalCreateObjectURL = URL.createObjectURL;
const cloneVoiceFromReference = mock(
	async ({
		text,
		referenceAudioFile,
		name,
	}: {
		text: string;
		referenceAudioFile: File;
		name?: string;
		apiKeySource?: "settings" | "runtime";
	}) => {
		expect(referenceAudioFile).toBeInstanceOf(File);
		return {
			voice: {
				id: "generated-voice-1",
				name: name ?? "Generated voice",
				text,
				provider: "runninghub-voice-clone",
				taskId: "voice-clone-task-1",
				audioBlobId: "generated-voice-audio-1",
				mimeType: "audio/wav",
				createdAt: "2026-06-25T00:00:00.000Z",
			},
			audioBlob: new Blob(["cloned-audio"], { type: "audio/wav" }),
		};
	},
);

mock.module("@/stores/generated-voices-store", () => ({
	useGeneratedVoicesStore: {
		getState: () => ({
			cloneVoiceFromReference,
		}),
	},
}));

beforeEach(() => {
	cloneVoiceFromReference.mockClear();
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	globalThis.AudioContext = originalAudioContext;
	URL.createObjectURL = originalCreateObjectURL;
});

function installTtsBrowserMocks({ duration }: { duration: number }) {
	globalThis.fetch = (async () =>
		new Response(
			JSON.stringify({
				audio: Buffer.from("fake-mp3").toString("base64"),
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		)) as unknown as typeof fetch;
	globalThis.AudioContext = class {
		async decodeAudioData() {
			return { duration } as AudioBuffer;
		}
	} as unknown as typeof AudioContext;
	URL.createObjectURL = () => "blob:tts-audio";
}

describe("TTS service", () => {
	test("stores generated speech script metadata on the created audio asset", async () => {
		const { generateAndInsertSpeech } = await import("../service");
		installTtsBrowserMocks({ duration: 5.5 });
		const addedAssets: Array<{
			projectId: string;
			asset: Omit<MediaAsset, "id">;
		}> = [];
		const insertedElements: unknown[] = [];
		const editor = {
			project: {
				getActive: () => ({ metadata: { id: "project-123" } }),
			},
			media: {
				addMediaAsset: async ({
					projectId,
					asset,
				}: {
					projectId: string;
					asset: Omit<MediaAsset, "id">;
				}) => {
					addedAssets.push({ projectId, asset });
					return "tts-media-1";
				},
			},
			timeline: {
				getTracks: () => [],
				addTrack: () => "audio-track-1",
				insertElement: ({ element }: { element: unknown }) => {
					insertedElements.push(element);
				},
			},
		} as unknown as EditorCore;

		const result = await generateAndInsertSpeech({
			editor,
			text: "A pizza portion costs $2.34. Venmo that ASAP.",
			startTime: 1.25,
			voice: "default",
			protectedTerms: ["$2.34", "Venmo"],
		});

		expect(result).toEqual({ duration: 5.5 });
		expect(addedAssets).toHaveLength(1);
		expect(addedAssets[0].projectId).toBe("project-123");
		expect(addedAssets[0].asset.spokenScript).toEqual({
			source: "tts",
			text: "A pizza portion costs $2.34. Venmo that ASAP.",
			captions: ["A pizza portion costs $2.34.", "Venmo that ASAP."],
			protectedTerms: ["$2.34", "Venmo"],
		});
		expect(insertedElements).toHaveLength(1);
	});

	test("uses the built-in podcast female voice through RunningHub clone and stores provider metadata", async () => {
		const { generateAndInsertSpeech } = await import("../service");
		const addedAssets: Array<{
			projectId: string;
			asset: Omit<MediaAsset, "id">;
		}> = [];
		const insertedElements: unknown[] = [];
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === "/voices/podcast-female.mp3") {
				return new Response("reference-audio", {
					status: 200,
					headers: { "Content-Type": "audio/mpeg" },
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		}) as unknown as typeof fetch;
		globalThis.AudioContext = class {
			async decodeAudioData() {
				return { duration: 7.25 } as AudioBuffer;
			}
		} as unknown as typeof AudioContext;
		URL.createObjectURL = () => "blob:runninghub-voice";
		const editor = {
			project: {
				getActive: () => ({ metadata: { id: "project-123" } }),
			},
			media: {
				addMediaAsset: async ({
					projectId,
					asset,
				}: {
					projectId: string;
					asset: Omit<MediaAsset, "id">;
				}) => {
					addedAssets.push({ projectId, asset });
					return "tts-media-1";
				},
			},
			timeline: {
				getTracks: () => [],
				addTrack: () => "audio-track-1",
				insertElement: ({ element }: { element: unknown }) => {
					insertedElements.push(element);
				},
			},
		} as unknown as EditorCore;

		const result = await generateAndInsertSpeech({
			editor,
			text: "欢迎来到今天的节目。",
			startTime: 0,
			voice: "podcast-female",
		});

		expect(result).toEqual({ duration: 7.25 });
		expect(cloneVoiceFromReference).toHaveBeenCalledWith({
			text: "欢迎来到今天的节目。",
			name: "播客女",
			apiKeySource: "runtime",
			referenceAudioFile: expect.any(File),
		});
		const cloneCall = cloneVoiceFromReference.mock.calls[0]?.[0] as
			| { referenceAudioFile: File }
			| undefined;
		expect(cloneCall?.referenceAudioFile.name).toBe("podcast-female.mp3");
		expect(cloneCall?.referenceAudioFile.type).toBe("audio/mpeg");
		expect(addedAssets[0].asset.spokenScript).toEqual({
			source: "tts",
			text: "欢迎来到今天的节目。",
			captions: ["欢迎来到今天的节目。"],
			provider: "runninghub-voice-clone",
			providerTaskId: "voice-clone-task-1",
		});
		expect(insertedElements).toHaveLength(1);
	});

	test("uses Volcengine voice_type synthesis and stores provider metadata", async () => {
		const { generateAndInsertSpeech } = await import("../service");
		const addedAssets: Array<{
			projectId: string;
			asset: Omit<MediaAsset, "id">;
		}> = [];
		const insertedElements: unknown[] = [];
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			expect(String(input)).toBe("/api/tts/generate");
			const body = JSON.parse(String(init?.body));
			expect(body).toMatchObject({
				provider: "volcengine-voice-clone",
				voiceType: "voice-clone-1",
				text: "欢迎来到今天的节目。",
			});
			return new Response(
				JSON.stringify({
					audio: Buffer.from("volc-mp3").toString("base64"),
					provider: "volcengine-voice-clone",
					providerTaskId: "volc-req-1",
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		}) as unknown as typeof fetch;
		globalThis.AudioContext = class {
			async decodeAudioData() {
				return { duration: 6.5 } as AudioBuffer;
			}
		} as unknown as typeof AudioContext;
		URL.createObjectURL = () => "blob:volcengine-voice";
		const editor = {
			project: {
				getActive: () => ({ metadata: { id: "project-123" } }),
			},
			media: {
				addMediaAsset: async ({
					projectId,
					asset,
				}: {
					projectId: string;
					asset: Omit<MediaAsset, "id">;
				}) => {
					addedAssets.push({ projectId, asset });
					return "tts-media-1";
				},
			},
			timeline: {
				getTracks: () => [],
				addTrack: () => "audio-track-1",
				insertElement: ({ element }: { element: unknown }) => {
					insertedElements.push(element);
				},
			},
		} as unknown as EditorCore;

		const result = await generateAndInsertSpeech({
			editor,
			text: "欢迎来到今天的节目。",
			startTime: 0,
			voice: "volcengine-voice-clone",
			volcengineVoiceType: "voice-clone-1",
		});

		expect(result).toEqual({ duration: 6.5 });
		expect(addedAssets[0].asset.spokenScript).toEqual({
			source: "tts",
			text: "欢迎来到今天的节目。",
			captions: ["欢迎来到今天的节目。"],
			provider: "volcengine-voice-clone",
			providerTaskId: "volc-req-1",
		});
		expect(insertedElements).toHaveLength(1);
	});
});
