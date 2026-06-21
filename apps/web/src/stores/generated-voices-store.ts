import { runningHubVoiceDesignProvider } from "@/lib/ai/providers/runninghub-voice-design";
import type { VoiceDesignTaskResult } from "@/lib/ai/providers";
import { storageService } from "@/services/storage/service";
import type { GeneratedVoice } from "@/types/voice";
import { generateUUID } from "@/utils/id";
import { toast } from "sonner";
import { create } from "zustand";
import { useAISettingsStore } from "./ai-settings-store";

interface GenerateVoiceParams {
	text: string;
	emotionPrompt: string;
}

interface GeneratedVoicesState {
	voices: GeneratedVoice[];
	isLoaded: boolean;
	isLoading: boolean;
	isGenerating: boolean;
	currentTaskStatus: VoiceDesignTaskResult["status"] | null;
	error: string | null;

	loadVoices: () => Promise<void>;
	generateVoice: (params: GenerateVoiceParams) => Promise<void>;
	removeVoice: ({ voiceId }: { voiceId: string }) => Promise<void>;
	loadVoiceAudio: ({
		audioBlobId,
	}: {
		audioBlobId: string;
	}) => Promise<Blob | null>;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120;

function sleep({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForVoiceDesignTask({
	apiKey,
	taskId,
}: {
	apiKey: string;
	taskId: string;
}): Promise<VoiceDesignTaskResult> {
	for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
		const result = await runningHubVoiceDesignProvider.getVoiceDesignTask({
			apiKey,
			taskId,
		});
		useGeneratedVoicesStore.setState({
			currentTaskStatus: result.status,
			error: result.error ?? null,
		});
		if (result.status === "succeeded" || result.status === "failed") {
			return result;
		}
		await sleep({ ms: POLL_INTERVAL_MS });
	}
	throw new Error(`RunningHub task ${taskId} did not finish before timeout`);
}

function buildVoiceName({ text }: { text: string }): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	return normalized.length > 28
		? `${normalized.slice(0, 28)}...`
		: normalized;
}

export const useGeneratedVoicesStore = create<GeneratedVoicesState>()(
	(set, get) => ({
		voices: [],
		isLoaded: false,
		isLoading: false,
		isGenerating: false,
		currentTaskStatus: null,
		error: null,

		loadVoices: async () => {
			if (get().isLoading) return;
			set({ isLoading: true, error: null });
			try {
				const data = await storageService.loadGeneratedVoices();
				set({ voices: data.voices, isLoaded: true });
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to load generated voices";
				set({ error: message });
				toast.error(message);
				throw error;
			} finally {
				set({ isLoading: false });
			}
		},

		generateVoice: async ({ text, emotionPrompt }) => {
			if (get().isGenerating) {
				throw new Error("Voice design generation is already running");
			}

			const trimmedText = text.trim();
			const trimmedEmotionPrompt = emotionPrompt.trim();
			if (!trimmedText) {
				throw new Error("Voice text is required");
			}
			if (!trimmedEmotionPrompt) {
				throw new Error("Emotion / voice description is required");
			}

			const { runningHubApiKey } = useAISettingsStore.getState();
			if (!runningHubApiKey) {
				throw new Error("RUNNINGHUB_API_KEY is required");
			}

			set({
				isGenerating: true,
				currentTaskStatus: "pending",
				error: null,
			});
			try {
				const submitted =
					await runningHubVoiceDesignProvider.submitVoiceDesignTask({
						apiKey: runningHubApiKey,
						request: {
							text: trimmedText,
							emotionPrompt: trimmedEmotionPrompt,
						},
					});
				set({
					currentTaskStatus: submitted.status,
					error: submitted.error ?? null,
				});

				const finished =
					submitted.status === "succeeded"
						? submitted
						: await waitForVoiceDesignTask({
								apiKey: runningHubApiKey,
								taskId: submitted.taskId,
							});
				if (finished.status === "failed") {
					throw new Error(
						finished.error ?? "RunningHub voice design generation failed",
					);
				}
				if (!finished.audioUrl) {
					throw new Error("RunningHub task succeeded without an audio URL");
				}

				const audioBlob =
					await runningHubVoiceDesignProvider.downloadVoiceDesignResult({
						audioUrl: finished.audioUrl,
					});
				if (!audioBlob.size) {
					throw new Error("Generated voice audio is empty");
				}

				const voiceId = generateUUID();
				const voice: GeneratedVoice = {
					id: voiceId,
					name: buildVoiceName({ text: trimmedText }),
					text: trimmedText,
					emotionPrompt: trimmedEmotionPrompt,
					provider: runningHubVoiceDesignProvider.id,
					taskId: finished.taskId,
					audioBlobId: `generated-voice-audio-${voiceId}`,
					mimeType: audioBlob.type || "audio/mpeg",
					createdAt: new Date().toISOString(),
				};
				await storageService.saveGeneratedVoice({ voice, audioBlob });
				set((state) => ({
					voices: [voice, ...state.voices],
					isLoaded: true,
					currentTaskStatus: "succeeded",
				}));
				toast.success("Voice created");
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Voice design generation failed";
				set({ error: message, currentTaskStatus: "failed" });
				toast.error(message);
				throw error;
			} finally {
				set({ isGenerating: false });
			}
		},

		removeVoice: async ({ voiceId }) => {
			await storageService.removeGeneratedVoice({ voiceId });
			set((state) => ({
				voices: state.voices.filter((voice) => voice.id !== voiceId),
			}));
		},

		loadVoiceAudio: ({ audioBlobId }) =>
			storageService.loadGeneratedVoiceAudio({ audioBlobId }),
	}),
);
