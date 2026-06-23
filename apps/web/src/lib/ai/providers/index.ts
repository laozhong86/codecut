export type {
	AIDigitalHumanProvider,
	AIImageProvider,
	AIVideoProvider,
	AIVoiceCloneProvider,
	AIVoiceDesignProvider,
	DigitalHumanGenerationRequest,
	DigitalHumanTaskResult,
	DigitalHumanTaskStatus,
	ImageGenerationRequest,
	ImageGenerationResult,
	VideoGenerationRequest,
	VideoTaskResult,
	VideoTaskStatus,
	VoiceCloneRequest,
	VoiceCloneTaskResult,
	VoiceCloneTaskStatus,
	VoiceDesignRequest,
	VoiceDesignTaskResult,
	VoiceDesignTaskStatus,
} from "./types";
export { DIGITAL_HUMAN_PROVIDERS } from "./digital-human-providers";
export { IMAGE_PROVIDERS } from "./image-providers";
export { VIDEO_PROVIDERS } from "./video-providers";

import { DIGITAL_HUMAN_PROVIDERS } from "./digital-human-providers";
import { IMAGE_PROVIDERS } from "./image-providers";
import { VIDEO_PROVIDERS } from "./video-providers";

export function getImageProvider({
	id,
}: {
	id: string;
}) {
	return IMAGE_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function getVideoProvider({
	id,
}: {
	id: string;
}) {
	return VIDEO_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function getDigitalHumanProvider({
	id,
}: {
	id: string;
}) {
	return DIGITAL_HUMAN_PROVIDERS.find((provider) => provider.id === id) ?? null;
}
