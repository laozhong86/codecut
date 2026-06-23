import { afterEach, describe, expect, test } from "bun:test";
import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/types/assets";
import { generateAndInsertSpeech } from "../service";

const originalFetch = globalThis.fetch;
const originalAudioContext = globalThis.AudioContext;
const originalCreateObjectURL = URL.createObjectURL;

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
});
