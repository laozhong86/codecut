import { EditorCore } from "@/core";
import { i18next } from "@/lib/i18n";
import { getDigitalHumanProvider } from "@/lib/ai/providers";
import type { DigitalHumanTaskResult } from "@/lib/ai/providers";
import { processMediaAssets } from "@/lib/media/processing";
import type { MediaAsset } from "@/types/assets";
import { generateUUID } from "@/utils/id";
import { toast } from "sonner";
import { create } from "zustand";
import { useAISettingsStore } from "./ai-settings-store";

type DigitalHumanAssetStatus = "pending" | "adding" | "added" | "failed";

export interface GeneratedDigitalHumanVideo {
	id: string;
	taskId: string;
	taskStatus: DigitalHumanTaskResult["status"];
	scriptText: string;
	motionPrompt: string;
	videoUrl?: string;
	mediaId?: string;
	assetStatus: DigitalHumanAssetStatus;
	error?: string;
}

interface AIDigitalHumanGenerationState {
	imageMediaId: string;
	audioMediaId: string;
	scriptText: string;
	motionPrompt: string;
	width: number;
	height: number;
	fps: number;
	isGenerating: boolean;
	generatedVideos: GeneratedDigitalHumanVideo[];

	setImageMediaId: (mediaId: string) => void;
	setAudioMediaId: (mediaId: string) => void;
	setScriptText: (text: string) => void;
	setMotionPrompt: (text: string) => void;
	setWidth: (width: number) => void;
	setHeight: (height: number) => void;
	setFps: (fps: number) => void;
	generate: () => Promise<void>;
	retryAddToAssets: (videoId: string) => void;
	clearVideos: () => void;
}

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120;
const pendingVideoBlobs = new Map<string, Blob>();

function sleep({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateDigitalHumanVideo({
	videoId,
	updates,
}: {
	videoId: string;
	updates: Partial<GeneratedDigitalHumanVideo>;
}): void {
	useAIDigitalHumanGenerationStore.setState((state) => ({
		generatedVideos: state.generatedVideos.map((video) =>
			video.id === videoId ? { ...video, ...updates } : video,
		),
	}));
}

function requireAsset({
	assets,
	mediaId,
	expectedType,
}: {
	assets: MediaAsset[];
	mediaId: string;
	expectedType: MediaAsset["type"];
}): MediaAsset {
	const asset = assets.find((candidate) => candidate.id === mediaId);
	if (!asset) {
		throw new Error(`Media asset '${mediaId}' not found`);
	}
	if (asset.type !== expectedType) {
		throw new Error(
			`Media asset '${asset.name}' is type '${asset.type}', expected ${expectedType}`,
		);
	}
	return asset;
}

async function addBlobToAssets({
	videoId,
	taskId,
	blob,
}: {
	videoId: string;
	taskId: string;
	blob: Blob;
}): Promise<string> {
	const editor = EditorCore.getInstance();
	const project = editor.project.getActiveOrNull();
	if (!project) {
		throw new Error("No active project");
	}

	updateDigitalHumanVideo({
		videoId,
		updates: { assetStatus: "adding" },
	});

	const file = new File([blob], `digital-human-${taskId}.mp4`, {
		type: blob.type || "video/mp4",
	});
	const processedAssets = await processMediaAssets({ files: [file] });
	const firstAsset = processedAssets[0];
	if (!firstAsset) {
		throw new Error("Generated digital human video could not be processed");
	}
	const mediaId = await editor.media.addMediaAsset({
		projectId: project.metadata.id,
		asset: firstAsset,
	});
	updateDigitalHumanVideo({
		videoId,
		updates: {
			videoUrl: firstAsset.url,
			mediaId,
			assetStatus: "added",
		},
	});
	pendingVideoBlobs.delete(videoId);
	return mediaId;
}

async function pollDigitalHumanTask({
	provider,
	apiKey,
	videoId,
	taskId,
}: {
	provider: ReturnType<typeof getDigitalHumanProvider>;
	apiKey: string;
	videoId: string;
	taskId: string;
}): Promise<void> {
	if (!provider) return;

	try {
		for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
			const result = await provider.getDigitalHumanTask({ taskId, apiKey });
			updateDigitalHumanVideo({
				videoId,
				updates: {
					taskStatus: result.status,
					error: result.error,
					...(result.videoUrl ? { videoUrl: result.videoUrl } : {}),
				},
			});

			if (result.status === "failed") {
				const message =
					result.error ?? i18next.t("Digital human generation failed");
				updateDigitalHumanVideo({
					videoId,
					updates: { taskStatus: "failed", error: message },
				});
				toast.error(message);
				return;
			}

			if (result.status === "succeeded") {
				if (!result.videoUrl) {
					throw new Error("RunningHub task succeeded without a video URL");
				}
				const blob = await provider.downloadDigitalHumanResult({
					videoUrl: result.videoUrl,
				});
				pendingVideoBlobs.set(videoId, blob);
				await addBlobToAssets({ videoId, taskId, blob });
				toast.success(i18next.t("Digital human video generated"));
				return;
			}

			await sleep({ ms: POLL_INTERVAL_MS });
		}
		throw new Error(`RunningHub task ${taskId} did not finish before timeout`);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: i18next.t("Digital human generation failed");
		updateDigitalHumanVideo({
			videoId,
			updates: { taskStatus: "failed", assetStatus: "failed", error: message },
		});
		toast.error(message);
	}
}

export const useAIDigitalHumanGenerationStore =
	create<AIDigitalHumanGenerationState>()((set, get) => ({
		imageMediaId: "",
		audioMediaId: "",
		scriptText: "",
		motionPrompt: "",
		width: 1280,
		height: 720,
		fps: 25,
		isGenerating: false,
		generatedVideos: [],

		setImageMediaId: (mediaId) => set({ imageMediaId: mediaId }),
		setAudioMediaId: (mediaId) => set({ audioMediaId: mediaId }),
		setScriptText: (text) => set({ scriptText: text }),
		setMotionPrompt: (text) => set({ motionPrompt: text }),
		setWidth: (width) => set({ width }),
		setHeight: (height) => set({ height }),
		setFps: (fps) => set({ fps }),

		generate: async () => {
			if (get().isGenerating) return;

			const {
				imageMediaId,
				audioMediaId,
				scriptText,
				motionPrompt,
				width,
				height,
				fps,
			} = get();
			const trimmedScriptText = scriptText.trim();
			const trimmedMotionPrompt = motionPrompt.trim();

			try {
				if (!imageMediaId) throw new Error(i18next.t("Select an image asset"));
				if (!audioMediaId) throw new Error(i18next.t("Select an audio asset"));
				if (!trimmedScriptText) throw new Error(i18next.t("Enter script text"));
				if (!trimmedMotionPrompt) {
					throw new Error(i18next.t("Enter a motion prompt"));
				}
				if (width <= 0 || height <= 0 || fps <= 0) {
					throw new Error(i18next.t("Width, height, and FPS must be positive"));
				}

				const { digitalHumanProviderId, runningHubApiKey } =
					useAISettingsStore.getState();
				if (!digitalHumanProviderId || !runningHubApiKey) {
					throw new Error(
						i18next.t("Please configure a digital human provider in Settings"),
					);
				}
				const provider = getDigitalHumanProvider({
					id: digitalHumanProviderId,
				});
				if (!provider) {
					throw new Error(
						i18next.t("Please configure a digital human provider in Settings"),
					);
				}

				const editor = EditorCore.getInstance();
				const assets = editor.media.getAssets();
				const imageAsset = requireAsset({
					assets,
					mediaId: imageMediaId,
					expectedType: "image",
				});
				const audioAsset = requireAsset({
					assets,
					mediaId: audioMediaId,
					expectedType: "audio",
				});

				set({ isGenerating: true });
				const submitResult = await provider.submitDigitalHumanTask({
					request: {
						imageMediaId,
						audioMediaId,
						scriptText: trimmedScriptText,
						motionPrompt: trimmedMotionPrompt,
						width,
						height,
						fps,
					},
					apiKey: runningHubApiKey,
					imageFile: imageAsset.file,
					audioFile: audioAsset.file,
				});
				const videoId = generateUUID();
				const newVideo: GeneratedDigitalHumanVideo = {
					id: videoId,
					taskId: submitResult.taskId,
					taskStatus: submitResult.status,
					scriptText: trimmedScriptText,
					motionPrompt: trimmedMotionPrompt,
					videoUrl: submitResult.videoUrl,
					assetStatus: "pending",
					error: submitResult.error,
				};
				set((state) => ({
					generatedVideos: [newVideo, ...state.generatedVideos],
				}));

				await pollDigitalHumanTask({
					provider,
					apiKey: runningHubApiKey,
					videoId,
					taskId: submitResult.taskId,
				});
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: i18next.t("Digital human generation failed");
				toast.error(message);
			} finally {
				set({ isGenerating: false });
			}
		},

		retryAddToAssets: (videoId) => {
			const video = get().generatedVideos.find((entry) => entry.id === videoId);
			const blob = pendingVideoBlobs.get(videoId);
			if (!video || !blob) return;
			void addBlobToAssets({ videoId, taskId: video.taskId, blob }).catch(
				(error) => {
					const message =
						error instanceof Error
							? error.message
							: i18next.t("Failed to add digital human video");
					updateDigitalHumanVideo({
						videoId,
						updates: { assetStatus: "failed", error: message },
					});
					toast.error(message);
				},
			);
		},

		clearVideos: () => {
			for (const video of get().generatedVideos) {
				if (video.videoUrl?.startsWith("blob:")) {
					URL.revokeObjectURL(video.videoUrl);
				}
			}
			pendingVideoBlobs.clear();
			set({ generatedVideos: [] });
		},
	}));
