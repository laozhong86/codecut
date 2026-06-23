import { assertAsrProviderResult } from "@/lib/transcription/asr-provider-contract";
import type {
	TranscriptionProviderCapabilities,
	TranscriptionQuality,
	TranscriptionResult,
	TranscriptionSegment,
	TranscriptionWord,
} from "@/types/transcription";

export const VIDEO_CONTEXT_CHUNK_SECONDS = 300;

export interface ExecutorVideoContextMediaAsset {
	id: string;
	name: string;
	type: string;
	durationSeconds?: number;
	width?: number;
	height?: number;
}

export interface AnalysisChunk {
	index: number;
	start: number;
	end: number;
}

export interface CompletedAnalysisChunk extends AnalysisChunk {
	status: "succeeded";
	segmentCount: number;
}

export type VideoContextAssetTypeGuess = "oral_candidate" | "mixed_or_unknown";

export interface VideoContext {
	version: 1;
	mediaId: string;
	name: string;
	qualityLevel: "L2_transcript";
	metadata: {
		durationSeconds: number;
		width?: number;
		height?: number;
		hasAudio: boolean;
	};
	transcript: {
		fullText: string;
		language: string;
		modelId: string;
		segments: TranscriptionSegment[];
		words?: TranscriptionWord[];
		capabilities: TranscriptionProviderCapabilities;
		quality: TranscriptionQuality;
	};
	analysisChunks: CompletedAnalysisChunk[];
	assetTypeGuess: VideoContextAssetTypeGuess;
	editingHints: {
		suggestTrimFillers: boolean;
		hasTalkingHeadSignal: boolean;
		canBeBroll: false;
	};
	warnings: string[];
}

export type ProbeAudio = ({
	mediaAsset,
}: {
	mediaAsset: ExecutorVideoContextMediaAsset;
}) => Promise<{ hasAudio: boolean }>;

export type TranscribeRange = ({
	mediaAsset,
	startSeconds,
	endSeconds,
	chunk,
}: {
	mediaAsset: ExecutorVideoContextMediaAsset;
	startSeconds: number;
	endSeconds: number;
	chunk: AnalysisChunk;
}) => Promise<TranscriptionResult & { modelId: string }>;

function roundToMillis(value: number): number {
	return Number(value.toFixed(3));
}

export function buildAnalysisChunks({
	durationSeconds,
}: {
	durationSeconds: number;
}): AnalysisChunk[] {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		throw new Error("VideoContext requires a positive duration.");
	}

	const chunks: AnalysisChunk[] = [];
	let start = 0;
	let index = 1;
	while (start < durationSeconds) {
		const end = Math.min(start + VIDEO_CONTEXT_CHUNK_SECONDS, durationSeconds);
		chunks.push({ index, start, end });
		start = end;
		index += 1;
	}
	return chunks;
}

export function offsetTranscriptSegments({
	offsetSeconds,
	segments,
}: {
	offsetSeconds: number;
	segments: TranscriptionSegment[];
}): TranscriptionSegment[] {
	return segments.map((segment) => ({
		...segment,
		start: roundToMillis(segment.start + offsetSeconds),
		end: roundToMillis(segment.end + offsetSeconds),
	}));
}

export function offsetTranscriptWords({
	offsetSeconds,
	words,
}: {
	offsetSeconds: number;
	words: TranscriptionWord[];
}): TranscriptionWord[] {
	return words.map((word) => ({
		...word,
		start: roundToMillis(word.start + offsetSeconds),
		end: roundToMillis(word.end + offsetSeconds),
	}));
}

export function guessVideoContextAssetType({
	text,
	segmentCount,
}: {
	text: string;
	segmentCount: number;
}): VideoContextAssetTypeGuess {
	const normalizedText = text.trim();
	if (segmentCount >= 3 && normalizedText.length >= 20) {
		return "oral_candidate";
	}
	return "mixed_or_unknown";
}

const FILLER_MARKERS = ["嗯", "啊", "呃", "额", "然后", "就是"];

export function shouldSuggestTrimFillers(text: string): boolean {
	const matchedMarkers = new Set<string>();
	for (const marker of FILLER_MARKERS) {
		if (text.includes(marker)) {
			matchedMarkers.add(marker);
		}
		if (matchedMarkers.size >= 2) {
			return true;
		}
	}
	return false;
}

export async function buildVideoContextWithTranscriber({
	mediaAsset,
	probeAudio,
	transcribeRange,
}: {
	mediaAsset: ExecutorVideoContextMediaAsset;
	probeAudio: ProbeAudio;
	transcribeRange: TranscribeRange;
}): Promise<VideoContext> {
	if (mediaAsset.type !== "video" && mediaAsset.type !== "audio") {
		throw new Error("VideoContext only supports video or audio media.");
	}
	if (
		!Number.isFinite(mediaAsset.durationSeconds) ||
		!mediaAsset.durationSeconds
	) {
		throw new Error("VideoContext requires media duration.");
	}

	const audioProbe = await probeAudio({ mediaAsset });
	if (!audioProbe.hasAudio) {
		throw new Error("VideoContext requires audio content.");
	}

	const chunks = buildAnalysisChunks({
		durationSeconds: mediaAsset.durationSeconds,
	});
	const analysisChunks: CompletedAnalysisChunk[] = [];
	const segments: TranscriptionSegment[] = [];
	const words: TranscriptionWord[] = [];
	const textParts: string[] = [];
	let language = "";
	let modelId = "";
	let capabilities: TranscriptionProviderCapabilities | null = null;
	const qualityWarnings = new Set<string>();
	let confidenceTotal = 0;
	let confidenceCount = 0;

	for (const chunk of chunks) {
		try {
			const transcription = await transcribeRange({
				mediaAsset,
				startSeconds: chunk.start,
				endSeconds: chunk.end,
				chunk,
			});
			assertAsrProviderResult(
				transcription,
				`build_video_context chunk ${chunk.index}`,
			);
			const chunkSegments = offsetTranscriptSegments({
				offsetSeconds: chunk.start,
				segments: transcription.segments,
			});
			const chunkWords = transcription.words
				? offsetTranscriptWords({
						offsetSeconds: chunk.start,
						words: transcription.words,
					})
				: [];

			segments.push(...chunkSegments);
			words.push(...chunkWords);
			textParts.push(transcription.text.trim());
			if (!language) {
				language = transcription.language;
			}
			if (!modelId) {
				modelId = transcription.modelId;
			}
			capabilities ??= transcription.capabilities;
			for (const warning of transcription.quality.warnings) {
				qualityWarnings.add(warning);
			}
			if (transcription.quality.confidence !== null) {
				confidenceTotal += transcription.quality.confidence;
				confidenceCount += 1;
			}
			analysisChunks.push({
				...chunk,
				status: "succeeded",
				segmentCount: chunkSegments.length,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				`VideoContext chunk ${chunk.index} failed for source range ${chunk.start.toFixed(2)}s-${chunk.end.toFixed(2)}s: ${message}`,
			);
		}
	}

	const text = textParts.filter(Boolean).join("\n");
	const assetTypeGuess = guessVideoContextAssetType({
		text,
		segmentCount: segments.length,
	});
	const transcriptQuality: TranscriptionQuality = {
		confidence:
			confidenceCount > 0
				? roundToMillis(confidenceTotal / confidenceCount)
				: null,
		warnings: [...qualityWarnings],
	};
	if (!capabilities) {
		throw new Error("VideoContext did not receive ASR provider capabilities.");
	}
	return {
		version: 1,
		mediaId: mediaAsset.id,
		name: mediaAsset.name,
		qualityLevel: "L2_transcript",
		metadata: {
			durationSeconds: mediaAsset.durationSeconds,
			width: mediaAsset.width,
			height: mediaAsset.height,
			hasAudio: true,
		},
		transcript: {
			fullText: text,
			language,
			modelId,
			segments,
			...(words.length > 0 ? { words } : {}),
			capabilities,
			quality: transcriptQuality,
		},
		analysisChunks,
		assetTypeGuess,
		editingHints: {
			suggestTrimFillers: shouldSuggestTrimFillers(text),
			hasTalkingHeadSignal: assetTypeGuess === "oral_candidate",
			canBeBroll: false,
		},
		warnings: [
			"visual analysis not run",
			"OCR skipped",
			"scene detection not run",
		],
	};
}
