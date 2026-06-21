import { IS_DEV } from "@/constants/editor-constants";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AISettingsState {
	imageProviderId: string | null;
	imageApiKey: string;
	videoProviderId: string | null;
	videoApiKey: string;
	digitalHumanProviderId: string | null;
	runningHubApiKey: string;
	devPlaceholderEnabled: boolean;

	setImageProvider: (providerId: string | null) => void;
	setImageApiKey: (apiKey: string) => void;
	setVideoProvider: (providerId: string | null) => void;
	setVideoApiKey: (apiKey: string) => void;
	setDigitalHumanProvider: (providerId: string | null) => void;
	setRunningHubApiKey: (apiKey: string) => void;
	setDevPlaceholderEnabled: (enabled: boolean) => void;
}

export const useAISettingsStore = create<AISettingsState>()(
	persist(
		(set) => ({
			imageProviderId: null,
			imageApiKey: "",
			videoProviderId: null,
			videoApiKey: "",
			digitalHumanProviderId: null,
			runningHubApiKey: "",
			devPlaceholderEnabled: IS_DEV,

			setImageProvider: (providerId) => set({ imageProviderId: providerId }),
			setImageApiKey: (apiKey) => set({ imageApiKey: apiKey }),
			setVideoProvider: (providerId) => set({ videoProviderId: providerId }),
			setVideoApiKey: (apiKey) => set({ videoApiKey: apiKey }),
			setDigitalHumanProvider: (providerId) =>
				set({ digitalHumanProviderId: providerId }),
			setRunningHubApiKey: (apiKey) => set({ runningHubApiKey: apiKey }),
			setDevPlaceholderEnabled: (enabled) =>
				set({ devPlaceholderEnabled: enabled }),
		}),
		{
			name: "ai-settings",
		},
	),
);
