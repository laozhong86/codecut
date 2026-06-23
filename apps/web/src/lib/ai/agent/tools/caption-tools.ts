import { EditorCore } from "@/core";
import type {
	EditPlanCaption,
	EditPlanCaptionStyle,
} from "@/lib/agent-bridge/edit-plan/schema";
import { buildPostCutCaptionEntries } from "@/lib/agent-bridge/edit-plan/caption-chunking";
import { decodeAudioToFloat32 } from "@/lib/media/audio";
import { extractTimelineAudio } from "@/lib/media/mediabunny";
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
import type {
	TimelineTrack,
	UploadAudioElement,
	VideoElement,
} from "@/types/timeline";
import type { AgentToolResult } from "../types";
import type { AgentTool } from "./types";
import {
	parseLanguage as parseTranscriptionLanguage,
	parseModelId as parseTranscriptionModelId,
} from "./transcription-tools";

interface PostCutCaptionEditor {
	media: {
		getAssets(): MediaAsset[];
	};
	timeline: {
		getTracks(): TimelineTrack[];
	};
}

type CaptionSourceElement = VideoElement | UploadAudioElement;

type TranscribeMediaRange = ({
	mediaAsset,
	language,
	modelId,
	range,
}: {
	mediaAsset: MediaAsset;
	language: TranscriptionLanguage;
	modelId: TranscriptionModelId;
	range: { start: number; end: number };
}) => Promise<TranscriptionResult>;

interface PostCutCaptionData extends Record<string, unknown> {
	source: "edited_video_clip_audio" | "edited_timeline_audio";
	language: string;
	modelId: string;
	captionStyle: EditPlanCaptionStyle;
	captions: EditPlanCaption[];
	trace: Array<{
		mediaId: string;
		timelineStart: number;
		sourceStart: number;
		sourceEnd: number;
		captionCount: number;
	}>;
}

function roundCaptionSeconds(value: number): number {
	return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function isVisibleVideoElement(element: unknown): element is VideoElement {
	return (
		typeof element === "object" &&
		element !== null &&
		"type" in element &&
		element.type === "video" &&
		!("hidden" in element && element.hidden) &&
		!("muted" in element && element.muted)
	);
}

function isAudibleUploadAudioElement(
	element: unknown,
): element is UploadAudioElement {
	return (
		typeof element === "object" &&
		element !== null &&
		"type" in element &&
		element.type === "audio" &&
		"sourceType" in element &&
		element.sourceType === "upload" &&
		!("muted" in element && element.muted)
	);
}

function getCaptionSourceElements({
	tracks,
}: {
	tracks: TimelineTrack[];
}): CaptionSourceElement[] {
	return tracks
		.filter(
			(track) =>
				(track.type === "video" || track.type === "audio") &&
				!("muted" in track && track.muted) &&
				!("hidden" in track && track.hidden),
		)
		.flatMap((track): CaptionSourceElement[] => {
			if (track.type === "video") {
				return track.elements.filter(isVisibleVideoElement);
			}
			return track.elements.filter(isAudibleUploadAudioElement);
		})
		.sort((left, right) => left.startTime - right.startTime);
}

export async function transcribeMediaRangeWithBrowserRuntime({
	mediaAsset,
	language,
	modelId,
	range,
}: {
	mediaAsset: MediaAsset;
	language: TranscriptionLanguage;
	modelId: TranscriptionModelId;
	range: { start: number; end: number };
}): Promise<TranscriptionResult> {
	const duration = roundCaptionSeconds(range.end - range.start);
	if (duration <= 0) {
		throw new Error("Post-cut caption range must have positive duration.");
	}

	const element =
		mediaAsset.type === "audio"
			? {
					...buildUploadAudioElement({
						mediaId: mediaAsset.id,
						name: mediaAsset.name,
						duration,
						startTime: 0,
					}),
					id: "codex-post-cut-caption-audio-range",
					trimStart: range.start,
					trimEnd: range.end,
				}
			: {
					...buildVideoElement({
						mediaId: mediaAsset.id,
						name: mediaAsset.name,
						duration,
						startTime: 0,
					}),
					id: "codex-post-cut-caption-video-range",
					trimStart: range.start,
					trimEnd: range.end,
				};
	const track: TimelineTrack =
		mediaAsset.type === "audio"
			? {
					id: "codex-post-cut-caption-audio-track",
					type: "audio",
					name: "Codex Post-Cut Caption Audio",
					muted: false,
					elements: [element as UploadAudioElement],
				}
			: {
					id: "codex-post-cut-caption-video-track",
					type: "video",
					name: "Codex Post-Cut Caption Video",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [element as VideoElement],
				};
	const audioBlob = await extractTimelineAudio({
		tracks: [track],
		mediaAssets: [mediaAsset],
		totalDuration: duration,
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

async function buildPostCutCaptionsData({
	editor,
	language,
	modelId,
	transcribeMediaRange,
}: {
	editor: PostCutCaptionEditor;
	language: TranscriptionLanguage;
	modelId: TranscriptionModelId;
	transcribeMediaRange: TranscribeMediaRange;
}): Promise<
	{ success: true; data: PostCutCaptionData } | { success: false; message: string }
> {
	const clips = getCaptionSourceElements({ tracks: editor.timeline.getTracks() });

	if (clips.length === 0) {
		return {
			success: false,
			message:
				"No unmuted edited media clips were found for post-cut caption transcription.",
		};
	}

	const source = clips.some((element) => element.type === "audio")
		? "edited_timeline_audio"
		: "edited_video_clip_audio";
	const captions: EditPlanCaption[] = [];
	const trace: PostCutCaptionData["trace"] = [];
	const mediaAssets = editor.media.getAssets();

	for (const element of clips) {
		const mediaAsset = mediaAssets.find((asset) => asset.id === element.mediaId);
		if (!mediaAsset) {
			return {
				success: false,
				message: `Media asset '${element.mediaId}' not found`,
			};
		}
		if (mediaAsset.type !== "video" && mediaAsset.type !== "audio") {
			return {
				success: false,
				message: `Media asset '${mediaAsset.name}' is type '${mediaAsset.type}', expected video or audio`,
			};
		}
		if (element.trimEnd <= element.trimStart) {
			return {
				success: false,
				message: `Timeline ${element.type} element '${element.id}' has an invalid trim range.`,
			};
		}

		const beforeCount = captions.length;
		const result = await transcribeMediaRange({
			mediaAsset,
			language,
			modelId,
			range: { start: element.trimStart, end: element.trimEnd },
		});

		for (const segment of result.segments) {
			const text = segment.text.trim();
			const relativeStart = Math.max(0, segment.start);
			const relativeEnd = Math.min(element.duration, segment.end);
			const startTime = roundCaptionSeconds(element.startTime + relativeStart);
			const endTime = roundCaptionSeconds(element.startTime + relativeEnd);
			captions.push(
				...buildPostCutCaptionEntries({ text, startTime, endTime }),
			);
		}

		trace.push({
			mediaId: element.mediaId,
			timelineStart: element.startTime,
			sourceStart: element.trimStart,
			sourceEnd: element.trimEnd,
			captionCount: captions.length - beforeCount,
		});
	}

	return {
		success: true,
		data: {
			source,
			language,
			modelId,
			captionStyle: {
				preset: "talking-head-pop",
				position: "lower-safe",
			},
			captions,
			trace,
		},
	};
}

export async function executeBuildPostCutCaptionsTool({
	args,
	editor,
	transcribeMediaRange = transcribeMediaRangeWithBrowserRuntime,
}: {
	args: Record<string, unknown>;
	editor: PostCutCaptionEditor;
	transcribeMediaRange?: TranscribeMediaRange;
}): Promise<AgentToolResult> {
	let language: TranscriptionLanguage;
	let modelId: TranscriptionModelId;
	try {
		language = parseTranscriptionLanguage(args.language);
		modelId = parseTranscriptionModelId(args.modelId);
	} catch (error) {
		return {
			success: false,
			message: error instanceof Error ? error.message : "Invalid caption args",
		};
	}

	try {
		const result = await buildPostCutCaptionsData({
			editor,
			language,
			modelId,
			transcribeMediaRange,
		});
		if (!result.success) return result;
		return {
			success: true,
			message: `Built ${result.data.captions.length} post-cut caption(s) from ${result.data.trace.length} video clip(s).`,
			data: result.data,
		};
	} catch (error) {
		return {
			success: false,
			message:
				error instanceof Error
					? error.message
					: "Post-cut caption transcription failed.",
		};
	}
}

export const generateCaptionsTool: AgentTool = {
	name: "generate_captions",
	description:
		"Auto-generate captions/subtitles from the audio in the timeline using speech-to-text. This is a long-running operation that uses the browser's transcription service.",
	parameters: {
		type: "object",
		properties: {
			language: {
				type: "string",
				description:
					"Language code for transcription (e.g. 'en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'it'). Use 'auto' for automatic detection.",
			},
		},
		required: [],
	},
	requiresConfirmation: true,
	async execute() {
		return {
			success: true,
			message:
				"Caption generation needs to be triggered from the UI. Please use the Captions panel in the editor to generate captions.",
		};
	},
};

export const buildPostCutCaptionsTool: AgentTool = {
	name: "build_post_cut_captions",
	description:
		"Transcribe the current edited, unmuted video or uploaded-audio clip ranges and return captions in output timeline time. This tool does not mutate the timeline; copy the returned captions and captionStyle into a final EditPlan, then apply_edit_plan.",
	parameters: {
		type: "object",
		properties: {
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
		required: ["language", "modelId"],
	},
	async execute(args) {
		return executeBuildPostCutCaptionsTool({
			args,
			editor: EditorCore.getInstance(),
		});
	},
};

export const captionTools: AgentTool[] = [
	buildPostCutCaptionsTool,
	generateCaptionsTool,
];
