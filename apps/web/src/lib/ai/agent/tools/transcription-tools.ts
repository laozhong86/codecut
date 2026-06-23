import { EditorCore } from "@/core";
import {
	TRANSCRIPTION_LANGUAGES,
	TRANSCRIPTION_MODELS,
} from "@/constants/transcription-constants";
import { extractTimelineAudio } from "@/lib/media/mediabunny";
import { decodeAudioToFloat32 } from "@/lib/media/audio";
import {
	buildUploadAudioElement,
	buildVideoElement,
} from "@/lib/timeline/element-utils";
import { transcriptionService } from "@/services/transcription/service";
import type { MediaAsset } from "@/types/assets";
import type {
	TranscriptionLanguage,
	TranscriptionModelId,
	TranscriptionResult,
} from "@/types/transcription";
import type { TimelineTrack } from "@/types/timeline";
import type { AgentToolResult } from "../types";
import type { AgentTool } from "./types";

interface TranscriptionEditor {
	media: {
		getAssets(): MediaAsset[];
	};
}

type TranscribeMedia = ({
	mediaAsset,
	language,
	modelId,
}: {
	mediaAsset: MediaAsset;
	language: TranscriptionLanguage;
	modelId: TranscriptionModelId;
}) => Promise<TranscriptionResult>;

export function parseLanguage(value: unknown): TranscriptionLanguage {
	if (value === undefined) {
		throw new Error("language is required");
	}
	if (value === "auto") return "auto";
	if (
		typeof value === "string" &&
		TRANSCRIPTION_LANGUAGES.some((language) => language.code === value)
	) {
		return value as TranscriptionLanguage;
	}
	throw new Error("language must be auto or a supported transcription language");
}

export function parseModelId(value: unknown): TranscriptionModelId {
	if (value === undefined) {
		throw new Error("modelId is required");
	}
	if (
		typeof value === "string" &&
		TRANSCRIPTION_MODELS.some((model) => model.id === value)
	) {
		return value as TranscriptionModelId;
	}
	throw new Error("modelId must be a supported transcription model");
}

function buildMediaTimelineTrack({
	mediaAsset,
}: {
	mediaAsset: MediaAsset;
}): TimelineTrack {
	const duration = mediaAsset.duration;
	if (typeof duration !== "number" || duration <= 0) {
		throw new Error(`Media asset '${mediaAsset.name}' duration is required`);
	}

	if (mediaAsset.type === "audio") {
		return {
			id: "codex-transcription-audio-track",
			type: "audio",
			name: "Codex Transcription Audio",
			muted: false,
			elements: [
				{
					...buildUploadAudioElement({
						mediaId: mediaAsset.id,
						name: mediaAsset.name,
						duration,
						startTime: 0,
					}),
					id: "codex-transcription-audio-element",
				},
			],
		};
	}

	return {
		id: "codex-transcription-video-track",
		type: "video",
		name: "Codex Transcription Video",
		isMain: true,
		muted: false,
		hidden: false,
		elements: [
			{
				...buildVideoElement({
					mediaId: mediaAsset.id,
					name: mediaAsset.name,
					duration,
					startTime: 0,
				}),
				id: "codex-transcription-video-element",
			},
		],
	};
}

export async function transcribeMediaWithBrowserRuntime({
	mediaAsset,
	language,
	modelId,
}: {
	mediaAsset: MediaAsset;
	language: TranscriptionLanguage;
	modelId: TranscriptionModelId;
}): Promise<TranscriptionResult> {
	const audioBlob = await extractTimelineAudio({
		tracks: [buildMediaTimelineTrack({ mediaAsset })],
		mediaAssets: [mediaAsset],
		totalDuration: mediaAsset.duration ?? 0,
	});
	const { samples } = await decodeAudioToFloat32({
		audioBlob,
		targetSampleRate: 16000,
	});
	return transcriptionService.transcribe({
		audioData: samples,
		language,
		modelId,
	});
}

export async function executeTranscribeMediaTool({
	args,
	editor,
	transcribeMedia = transcribeMediaWithBrowserRuntime,
}: {
	args: Record<string, unknown>;
	editor: TranscriptionEditor;
	transcribeMedia?: TranscribeMedia;
}): Promise<AgentToolResult> {
	const mediaId = args.mediaId;
	if (typeof mediaId !== "string" || !mediaId) {
		return { success: false, message: "mediaId is required" };
	}

	let language: TranscriptionLanguage;
	let modelId: TranscriptionModelId;
	try {
		language = parseLanguage(args.language);
		modelId = parseModelId(args.modelId);
	} catch (error) {
		return {
			success: false,
			message: error instanceof Error ? error.message : "Invalid transcription args",
		};
	}

	const mediaAsset = editor.media.getAssets().find((asset) => asset.id === mediaId);
	if (!mediaAsset) {
		return { success: false, message: `Media asset '${mediaId}' not found` };
	}

	if (mediaAsset.type !== "video" && mediaAsset.type !== "audio") {
		return {
			success: false,
			message: `Media asset '${mediaAsset.name}' is type '${mediaAsset.type}', expected video or audio`,
		};
	}

	try {
		const result = await transcribeMedia({ mediaAsset, language, modelId });
		return {
			success: true,
			message: `Transcribed '${mediaAsset.name}'`,
			data: {
				text: result.text,
				segments: result.segments,
				language: result.language,
				duration: mediaAsset.duration,
			},
		};
	} catch (error) {
		return {
			success: false,
			message:
				error instanceof Error ? error.message : "Media transcription failed.",
		};
	}
}

export const transcribeMediaTool: AgentTool = {
	name: "transcribe_media",
	description:
		"Transcribe one existing video or audio media asset using the browser transcription runtime. This tool does not call an LLM and does not modify the timeline.",
	parameters: {
		type: "object",
		properties: {
			mediaId: {
				type: "string",
				description: "The video or audio media asset ID to transcribe.",
			},
			language: {
				type: "string",
				description:
					"Transcription language code. Use 'auto' for automatic detection.",
			},
			modelId: {
				type: "string",
				description: "Browser transcription model ID.",
			},
		},
		required: ["mediaId", "language", "modelId"],
	},
	async execute(args) {
		return executeTranscribeMediaTool({
			args,
			editor: EditorCore.getInstance(),
		});
	},
};

export const transcriptionTools: AgentTool[] = [transcribeMediaTool];
