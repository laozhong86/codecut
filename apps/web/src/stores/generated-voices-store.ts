import { runningHubVoiceDesignProvider } from "@/lib/ai/providers/runninghub-voice-design";
import { runningHubVoiceCloneProvider } from "@/lib/ai/providers/runninghub-voice-clone";
import type {
	VoiceCloneTaskResult,
	VoiceDesignTaskResult,
} from "@/lib/ai/providers";
import {
	RUNNINGHUB_API_KEY_MISSING_MESSAGE,
	isRunningHubApiKeyMissingError,
	runningHubVoiceErrorMessage,
} from "@/lib/ai/runninghub-user-messages";
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

interface CloneVoiceFromReferenceParams {
	text: string;
	referenceAudioFile: File;
	name?: string;
	apiKeySource?: "settings" | "runtime";
}

type GeneratedVoiceTaskResult = VoiceDesignTaskResult | VoiceCloneTaskResult;
interface GeneratedVoiceResult {
	voice: GeneratedVoice;
	audioBlob: Blob;
}

interface GeneratedVoicesState {
	voices: GeneratedVoice[];
	isLoaded: boolean;
	isLoading: boolean;
	isGenerating: boolean;
	currentTaskStatus: GeneratedVoiceTaskResult["status"] | null;
	error: string | null;

	loadVoices: () => Promise<void>;
	generateNewVoice: (
		params: GenerateVoiceParams,
	) => Promise<GeneratedVoiceResult>;
	cloneVoiceFromReference: (
		params: CloneVoiceFromReferenceParams,
	) => Promise<GeneratedVoiceResult>;
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

async function waitForGeneratedVoiceTask({
	taskId,
	getTask,
}: {
	taskId: string;
	getTask: () => Promise<GeneratedVoiceTaskResult>;
}): Promise<GeneratedVoiceTaskResult> {
	for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
		const result = await getTask();
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

		generateNewVoice: async ({ text, emotionPrompt }) => {
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
				set({
					error: RUNNINGHUB_API_KEY_MISSING_MESSAGE,
					currentTaskStatus: "failed",
				});
				toast.warning(RUNNINGHUB_API_KEY_MISSING_MESSAGE);
				throw new Error(RUNNINGHUB_API_KEY_MISSING_MESSAGE);
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
						: await waitForGeneratedVoiceTask({
								taskId: submitted.taskId,
								getTask: () =>
									runningHubVoiceDesignProvider.getVoiceDesignTask({
										apiKey: runningHubApiKey,
										taskId: submitted.taskId,
									}),
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
				return { voice, audioBlob };
			} catch (error) {
				const message = runningHubVoiceErrorMessage({
					error,
					fallbackMessage: "Voice design generation failed",
				});
				set({ error: message, currentTaskStatus: "failed" });
				if (isRunningHubApiKeyMissingError(error)) {
					toast.warning(message);
					throw new Error(message);
				}
				toast.error(message);
				throw error;
			} finally {
				set({ isGenerating: false });
			}
		},

		cloneVoiceFromReference: async ({
			text,
			referenceAudioFile,
			name,
			apiKeySource = "settings",
		}) => {
			if (get().isGenerating) {
				throw new Error("Voice clone generation is already running");
			}

			const trimmedText = text.trim();
			if (!trimmedText) {
				throw new Error("Voice text is required");
			}
			if (!referenceAudioFile || referenceAudioFile.size <= 0) {
				throw new Error("Reference audio is required");
			}

			const { runningHubApiKey } = useAISettingsStore.getState();
			const cloneApiKey =
				apiKeySource === "runtime"
					? runningHubApiKey.trim() || undefined
					: runningHubApiKey;
			if (apiKeySource === "settings" && !cloneApiKey) {
				set({
					error: RUNNINGHUB_API_KEY_MISSING_MESSAGE,
					currentTaskStatus: "failed",
				});
				toast.warning(RUNNINGHUB_API_KEY_MISSING_MESSAGE);
				throw new Error(RUNNINGHUB_API_KEY_MISSING_MESSAGE);
			}

			set({
				isGenerating: true,
				currentTaskStatus: "pending",
				error: null,
			});
			try {
				const submitted =
					await runningHubVoiceCloneProvider.submitVoiceCloneTask({
						apiKey: cloneApiKey,
						referenceAudioFile,
						request: {
							text: trimmedText,
						},
					});
				set({
					currentTaskStatus: submitted.status,
					error: submitted.error ?? null,
				});

				const finished =
					submitted.status === "succeeded"
						? submitted
						: await waitForGeneratedVoiceTask({
								taskId: submitted.taskId,
								getTask: () =>
									runningHubVoiceCloneProvider.getVoiceCloneTask({
										apiKey: cloneApiKey,
										taskId: submitted.taskId,
									}),
							});
				if (finished.status === "failed") {
					throw new Error(
						finished.error ?? "RunningHub voice clone generation failed",
					);
				}
				if (!finished.audioUrl) {
					throw new Error("RunningHub task succeeded without an audio URL");
				}

				const audioBlob =
					await runningHubVoiceCloneProvider.downloadVoiceCloneResult({
						audioUrl: finished.audioUrl,
					});
				if (!audioBlob.size) {
					throw new Error("Generated voice audio is empty");
				}

				const voiceId = generateUUID();
				const voiceName = name?.trim() || buildVoiceName({ text: trimmedText });
				const voice: GeneratedVoice = {
					id: voiceId,
					name: voiceName,
					text: trimmedText,
					provider: runningHubVoiceCloneProvider.id,
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
				return { voice, audioBlob };
			} catch (error) {
				const message = runningHubVoiceErrorMessage({
					error,
					fallbackMessage: "Voice clone generation failed",
				});
				set({ error: message, currentTaskStatus: "failed" });
				if (isRunningHubApiKeyMissingError(error)) {
					toast.warning(message);
					throw new Error(message);
				}
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
