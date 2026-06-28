import {
	auditCaptions,
	type CaptionQualityReport,
} from "@/lib/agent-bridge/caption-quality";
import { buildPostCutCaptionEntries } from "@/lib/agent-bridge/edit-plan/caption-chunking";
import type {
	EditPlan,
	EditPlanCaption,
	EditPlanCaptionStyle,
} from "@/lib/agent-bridge/edit-plan/schema";
import { isBottomAlignedSubtitleText } from "@/lib/timeline/text-utils";
import { assertAsrProviderResult } from "@/lib/transcription/asr-provider-contract";
import type {
	TranscriptionLanguage,
	TranscriptionModelId,
	TranscriptionResult,
	TranscriptionSegment,
	TranscriptionWord,
} from "@/types/transcription";
import type {
	TimelineTrack,
	UploadAudioElement,
	VideoElement,
} from "@/types/timeline";

export const CAPTION_DIAGNOSTICS_LOW_CONFIDENCE_THRESHOLD = 0.6;

export type CaptionDiagnosticsStatus = "ready" | "warning" | "blocked";

export interface CaptionDiagnosticsMediaAsset {
	id: string;
	name: string;
	type: string;
	duration?: number;
	width?: number;
	height?: number;
	path?: string;
}

export type CaptionDiagnosticsSource =
	| "edited_video_clip_audio"
	| "edited_timeline_audio";

export type CaptionDiagnosticsSkippedReason =
	| "track_muted"
	| "track_hidden"
	| "clip_muted"
	| "clip_hidden"
	| "unsupported_audio_source";

export interface CaptionDiagnosticsSkippedClip {
	clipId: string;
	trackId: string;
	mediaId?: string;
	reason: CaptionDiagnosticsSkippedReason;
	timelineStart: number;
	sourceStart: number;
	sourceEnd: number;
}

export interface CaptionDiagnosticsSourceIssue {
	clipId: string;
	trackId: string;
	mediaId?: string;
	message: string;
}

export interface CaptionDiagnosticsEligibleClip {
	clipId: string;
	trackId: string;
	mediaId: string;
	timelineStart: number;
	sourceStart: number;
	sourceEnd: number;
}

export interface CaptionDiagnosticsSourceCoverage {
	source: CaptionDiagnosticsSource | null;
	eligibleClipCount: number;
	eligibleClips: CaptionDiagnosticsEligibleClip[];
	skippedClipCount: number;
	skippedClips: CaptionDiagnosticsSkippedClip[];
	issues: CaptionDiagnosticsSourceIssue[];
}

export interface CaptionDiagnosticsTraceEntry {
	clipId: string;
	trackId: string;
	mediaId: string;
	timelineStart: number;
	sourceStart: number;
	sourceEnd: number;
	captionCount: number;
	segmentCount: number;
}

export interface CaptionDiagnosticsTranscriptionError {
	clipId: string;
	trackId: string;
	mediaId: string;
	sourceStart: number;
	sourceEnd: number;
	message: string;
}

export interface CaptionDiagnosticsTranscription {
	language: string;
	modelId: string;
	attemptedClipCount: number;
	successfulClipCount: number;
	segmentCount: number;
	wordCount: number;
	warnings: string[];
	errorCount: number;
	errors: CaptionDiagnosticsTranscriptionError[];
	trace: CaptionDiagnosticsTraceEntry[];
}

export interface CaptionDiagnosticsLowConfidenceItem {
	kind: "segment" | "word";
	clipId: string;
	mediaId: string;
	text: string;
	confidence: number;
	timelineStart: number;
	timelineEnd: number;
	sourceStart: number;
	sourceEnd: number;
}

export interface CaptionDiagnosticsConfidence {
	confidenceAvailable: boolean;
	averageConfidence: number | null;
	lowConfidenceThreshold: number;
	lowConfidenceItems: CaptionDiagnosticsLowConfidenceItem[];
}

export interface CaptionDiagnosticsExistingSubtitles {
	editableCaptionCount: number;
	editableCaptionElementIds: string[];
	blocksGeneration: boolean;
}

export interface CaptionDiagnosticsBurnedSubtitleRisk {
	status: "unverified";
	severity: "info" | "warning";
	message: string;
	recommendedPolicy:
		| "inspect_artifacts_before_lower_safe_captions"
		| "standard_caption_safe_area";
}

export interface CaptionDiagnosticsSummary {
	eligibleClipCount: number;
	skippedClipCount: number;
	transcriptionErrorCount: number;
	candidateCaptionCount: number;
	captionIssueCount: number;
	existingEditableCaptionCount: number;
	lowConfidenceCount: number;
}

export interface CaptionDiagnosticsReport {
	status: CaptionDiagnosticsStatus;
	summary: CaptionDiagnosticsSummary;
	sourceCoverage: CaptionDiagnosticsSourceCoverage;
	transcription: CaptionDiagnosticsTranscription;
	captionQuality: CaptionQualityReport;
	confidence: CaptionDiagnosticsConfidence;
	existingSubtitles: CaptionDiagnosticsExistingSubtitles;
	burnedSubtitleRisk: CaptionDiagnosticsBurnedSubtitleRisk;
	recommendations: string[];
	revision?: number;
	candidateCaptions: EditPlanCaption[];
}

type CaptionSourceElement = VideoElement | UploadAudioElement;

interface CaptionSourceClip {
	trackId: string;
	element: CaptionSourceElement;
}

type TranscribeMediaRange = ({
	mediaAsset,
	language,
	modelId,
	range,
	clipId,
}: {
	mediaAsset: CaptionDiagnosticsMediaAsset;
	language: TranscriptionLanguage;
	modelId: TranscriptionModelId;
	range: { start: number; end: number };
	clipId: string;
}) => Promise<TranscriptionResult & { modelId?: string }>;

export interface BuildCaptionDiagnosticsReportArgs {
	tracks: TimelineTrack[];
	mediaAssets: readonly CaptionDiagnosticsMediaAsset[];
	language: TranscriptionLanguage;
	modelId: TranscriptionModelId;
	captionStyle: EditPlanCaptionStyle;
	aspectRatio: EditPlan["target"]["aspectRatio"];
	canvasSize: { width: number; height: number };
	timelineDuration: number;
	revision?: number;
	transcribeMediaRange: TranscribeMediaRange;
}

function roundCaptionSeconds(value: number): number {
	return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function isVisibleVideoElement(element: unknown): element is VideoElement {
	return (
		typeof element === "object" &&
		element !== null &&
		"type" in element &&
		element.type === "video"
	);
}

function isUploadAudioElement(element: unknown): element is UploadAudioElement {
	return (
		typeof element === "object" &&
		element !== null &&
		"type" in element &&
		element.type === "audio" &&
		"sourceType" in element &&
		element.sourceType === "upload"
	);
}

function sourceTimesFor(element: CaptionSourceElement) {
	return {
		sourceStart: element.trimStart,
		sourceEnd: element.trimEnd,
	};
}

function skippedClipFor({
	trackId,
	element,
	reason,
}: {
	trackId: string;
	element: CaptionSourceElement;
	reason: CaptionDiagnosticsSkippedReason;
}): CaptionDiagnosticsSkippedClip {
	const { sourceStart, sourceEnd } = sourceTimesFor(element);
	return {
		clipId: element.id,
		trackId,
		mediaId: element.mediaId,
		reason,
		timelineStart: element.startTime,
		sourceStart,
		sourceEnd,
	};
}

function collectCaptionSources({
	tracks,
}: {
	tracks: TimelineTrack[];
}): {
	clips: CaptionSourceClip[];
	skippedClips: CaptionDiagnosticsSkippedClip[];
} {
	const clips: CaptionSourceClip[] = [];
	const skippedClips: CaptionDiagnosticsSkippedClip[] = [];

	for (const track of tracks) {
		if (track.type === "video") {
			for (const element of track.elements) {
				if (!isVisibleVideoElement(element)) continue;
				if (track.muted) {
					skippedClips.push(
						skippedClipFor({
							trackId: track.id,
							element,
							reason: "track_muted",
						}),
					);
					continue;
				}
				if (track.hidden) {
					skippedClips.push(
						skippedClipFor({
							trackId: track.id,
							element,
							reason: "track_hidden",
						}),
					);
					continue;
				}
				if (element.muted) {
					skippedClips.push(
						skippedClipFor({
							trackId: track.id,
							element,
							reason: "clip_muted",
						}),
					);
					continue;
				}
				if (element.hidden) {
					skippedClips.push(
						skippedClipFor({
							trackId: track.id,
							element,
							reason: "clip_hidden",
						}),
					);
					continue;
				}
				clips.push({ trackId: track.id, element });
			}
			continue;
		}

		if (track.type !== "audio") continue;
		for (const element of track.elements) {
			if (!isUploadAudioElement(element)) continue;
			if (track.muted) {
				skippedClips.push(
					skippedClipFor({
						trackId: track.id,
						element,
						reason: "track_muted",
					}),
				);
				continue;
			}
			if (element.muted) {
				skippedClips.push(
					skippedClipFor({
						trackId: track.id,
						element,
						reason: "clip_muted",
					}),
				);
				continue;
			}
			clips.push({ trackId: track.id, element });
		}
	}

	return { clips, skippedClips };
}

function collectExistingSubtitles({
	tracks,
}: {
	tracks: TimelineTrack[];
}): CaptionDiagnosticsExistingSubtitles {
	const editableCaptionElementIds = tracks.flatMap((track) => {
		if (track.type !== "text" || track.hidden) return [];
		return track.elements
			.filter(
				(element) =>
					!element.hidden && isBottomAlignedSubtitleText({ element }),
			)
			.map((element) => element.id);
	});

	return {
		editableCaptionCount: editableCaptionElementIds.length,
		editableCaptionElementIds,
		blocksGeneration: editableCaptionElementIds.length > 0,
	};
}

function sourceOrientation({
	width,
	height,
}: {
	width: number;
	height: number;
}): "landscape" | "portrait" | "square" {
	const ratio = width / height;
	if (ratio > 1.05) return "landscape";
	if (ratio < 1 / 1.05) return "portrait";
	return "square";
}

function burnedSubtitleRiskFor({
	mediaAssets,
	aspectRatio,
}: {
	mediaAssets: readonly CaptionDiagnosticsMediaAsset[];
	aspectRatio: EditPlan["target"]["aspectRatio"];
}): CaptionDiagnosticsBurnedSubtitleRisk {
	const hasLandscapeVideo = mediaAssets.some(
		(asset) =>
			asset.type === "video" &&
			typeof asset.width === "number" &&
			asset.width > 0 &&
			typeof asset.height === "number" &&
			asset.height > 0 &&
			sourceOrientation({ width: asset.width, height: asset.height }) ===
				"landscape",
	);
	const needsReview = hasLandscapeVideo && aspectRatio === "9:16";
	return {
		status: "unverified",
		severity: needsReview ? "warning" : "info",
		message: "Burned-in subtitle detection is not available in V1.",
		recommendedPolicy: needsReview
			? "inspect_artifacts_before_lower_safe_captions"
			: "standard_caption_safe_area",
	};
}

function initialCaptionQualityReport(): CaptionQualityReport {
	return {
		ok: true,
		issueCount: 0,
		issues: [],
		metrics: {
			captionCount: 0,
			minDuration: null,
			maxDuration: null,
			maxLineCount: 0,
		},
	};
}

function confidenceValuesFrom({
	segments,
	words,
}: {
	segments: TranscriptionSegment[];
	words?: TranscriptionWord[];
}) {
	return [...segments, ...(words ?? [])]
		.map((unit) => unit.confidence)
		.filter((confidence): confidence is number => confidence !== undefined);
}

function averageConfidence(values: number[]): number | null {
	if (values.length === 0) return null;
	const total = values.reduce((sum, value) => sum + value, 0);
	return roundCaptionSeconds(total / values.length);
}

function pushLowConfidenceItems({
	items,
	kind,
	units,
	clip,
	mediaAsset,
}: {
	items: CaptionDiagnosticsLowConfidenceItem[];
	kind: "segment" | "word";
	units: Array<TranscriptionSegment | TranscriptionWord>;
	clip: CaptionSourceClip;
	mediaAsset: CaptionDiagnosticsMediaAsset;
}) {
	for (const unit of units) {
		if (
			unit.confidence === undefined ||
			unit.confidence >= CAPTION_DIAGNOSTICS_LOW_CONFIDENCE_THRESHOLD
		) {
			continue;
		}
		items.push({
			kind,
			clipId: clip.element.id,
			mediaId: mediaAsset.id,
			text: unit.text,
			confidence: roundCaptionSeconds(unit.confidence),
			timelineStart: roundCaptionSeconds(
				clip.element.startTime + Math.max(0, unit.start),
			),
			timelineEnd: roundCaptionSeconds(
				clip.element.startTime + Math.max(0, unit.end),
			),
			sourceStart: roundCaptionSeconds(clip.element.trimStart + unit.start),
			sourceEnd: roundCaptionSeconds(clip.element.trimStart + unit.end),
		});
	}
}

function blockedReport({
	sourceCoverage,
	transcription,
	existingSubtitles,
	burnedSubtitleRisk,
	recommendations,
	revision,
}: {
	sourceCoverage: CaptionDiagnosticsSourceCoverage;
	transcription: CaptionDiagnosticsTranscription;
	existingSubtitles: CaptionDiagnosticsExistingSubtitles;
	burnedSubtitleRisk: CaptionDiagnosticsBurnedSubtitleRisk;
	recommendations: string[];
	revision?: number;
}): CaptionDiagnosticsReport {
	const captionQuality = initialCaptionQualityReport();
	return {
		status: "blocked",
		summary: {
			eligibleClipCount: sourceCoverage.eligibleClipCount,
			skippedClipCount: sourceCoverage.skippedClipCount,
			transcriptionErrorCount: transcription.errorCount,
			candidateCaptionCount: 0,
			captionIssueCount: captionQuality.issueCount,
			existingEditableCaptionCount: existingSubtitles.editableCaptionCount,
			lowConfidenceCount: 0,
		},
		sourceCoverage,
		transcription,
		captionQuality,
		confidence: {
			confidenceAvailable: false,
			averageConfidence: null,
			lowConfidenceThreshold: CAPTION_DIAGNOSTICS_LOW_CONFIDENCE_THRESHOLD,
			lowConfidenceItems: [],
		},
		existingSubtitles,
		burnedSubtitleRisk,
		recommendations,
		...(revision === undefined ? {} : { revision }),
		candidateCaptions: [],
	};
}

export async function buildCaptionDiagnosticsReport({
	tracks,
	mediaAssets,
	language,
	modelId,
	captionStyle,
	aspectRatio,
	canvasSize,
	timelineDuration,
	revision,
	transcribeMediaRange,
}: BuildCaptionDiagnosticsReportArgs): Promise<CaptionDiagnosticsReport> {
	const { clips, skippedClips } = collectCaptionSources({ tracks });
	const source = clips.some((clip) => clip.element.type === "audio")
		? "edited_timeline_audio"
		: clips.length > 0
			? "edited_video_clip_audio"
			: null;
	const sourceCoverage: CaptionDiagnosticsSourceCoverage = {
		source,
		eligibleClipCount: clips.length,
		eligibleClips: clips.map((clip) => ({
			clipId: clip.element.id,
			trackId: clip.trackId,
			mediaId: clip.element.mediaId,
			timelineStart: clip.element.startTime,
			sourceStart: clip.element.trimStart,
			sourceEnd: clip.element.trimEnd,
		})),
		skippedClipCount: skippedClips.length,
		skippedClips,
		issues: [],
	};
	const existingSubtitles = collectExistingSubtitles({ tracks });
	const burnedSubtitleRisk = burnedSubtitleRiskFor({ mediaAssets, aspectRatio });
	const transcription: CaptionDiagnosticsTranscription = {
		language,
		modelId,
		attemptedClipCount: clips.length,
		successfulClipCount: 0,
		segmentCount: 0,
		wordCount: 0,
		warnings: [],
		errorCount: 0,
		errors: [],
		trace: [],
	};

	if (existingSubtitles.blocksGeneration) {
		return blockedReport({
			sourceCoverage,
			transcription,
			existingSubtitles,
			burnedSubtitleRisk,
			recommendations: [
				"Remove or replace existing editable captions before generating new captions.",
			],
			revision,
		});
	}

	if (clips.length === 0) {
		return blockedReport({
			sourceCoverage,
			transcription,
			existingSubtitles,
			burnedSubtitleRisk,
			recommendations: [
				"Add an unmuted video or uploaded audio clip before generating captions.",
			],
			revision,
		});
	}

	const mediaById = new Map(mediaAssets.map((asset) => [asset.id, asset]));
	const candidateCaptions: EditPlanCaption[] = [];
	const warnings = new Set<string>();
	const allConfidenceValues: number[] = [];
	const lowConfidenceItems: CaptionDiagnosticsLowConfidenceItem[] = [];
	let confidenceAvailable = false;

	for (const clip of clips) {
		const mediaAsset = mediaById.get(clip.element.mediaId);
		if (!mediaAsset) {
			sourceCoverage.issues.push({
				clipId: clip.element.id,
				trackId: clip.trackId,
				mediaId: clip.element.mediaId,
				message: `Media asset '${clip.element.mediaId}' not found.`,
			});
			continue;
		}
		if (mediaAsset.type !== "video" && mediaAsset.type !== "audio") {
			sourceCoverage.issues.push({
				clipId: clip.element.id,
				trackId: clip.trackId,
				mediaId: mediaAsset.id,
				message: `Media asset '${mediaAsset.name}' is type '${mediaAsset.type}', expected video or audio.`,
			});
			continue;
		}
		if (clip.element.trimEnd <= clip.element.trimStart) {
			sourceCoverage.issues.push({
				clipId: clip.element.id,
				trackId: clip.trackId,
				mediaId: mediaAsset.id,
				message: `Timeline ${clip.element.type} element '${clip.element.id}' has an invalid trim range.`,
			});
			continue;
		}

		const beforeCount = candidateCaptions.length;
		try {
			const result = await transcribeMediaRange({
				mediaAsset,
				language,
				modelId,
				range: {
					start: clip.element.trimStart,
					end: clip.element.trimEnd,
				},
				clipId: clip.element.id,
			});
			assertAsrProviderResult(
				result,
				`build_caption_diagnostics element ${clip.element.id}`,
			);

			transcription.segmentCount += result.segments.length;
			transcription.wordCount += result.words?.length ?? 0;
			transcription.language = result.language;
			transcription.modelId = result.modelId ?? modelId;
			for (const warning of result.quality.warnings) {
				warnings.add(warning);
			}
			if (result.capabilities.confidence) {
				confidenceAvailable = true;
				allConfidenceValues.push(
					...confidenceValuesFrom({
						segments: result.segments,
						words: result.words,
					}),
				);
				pushLowConfidenceItems({
					items: lowConfidenceItems,
					kind: "segment",
					units: result.segments,
					clip,
					mediaAsset,
				});
				pushLowConfidenceItems({
					items: lowConfidenceItems,
					kind: "word",
					units: result.words ?? [],
					clip,
					mediaAsset,
				});
			}

			for (const segment of result.segments) {
				const text = segment.text.trim();
				const relativeStart = Math.max(0, segment.start);
				const relativeEnd = Math.min(clip.element.duration, segment.end);
				const startTime = roundCaptionSeconds(
					clip.element.startTime + relativeStart,
				);
				const endTime = roundCaptionSeconds(
					clip.element.startTime + relativeEnd,
				);
				candidateCaptions.push(
					...buildPostCutCaptionEntries({
						text,
						startTime,
						endTime,
						captionStyle,
						aspectRatio,
						canvasSize,
					}),
				);
			}

			transcription.trace.push({
				clipId: clip.element.id,
				trackId: clip.trackId,
				mediaId: mediaAsset.id,
				timelineStart: clip.element.startTime,
				sourceStart: clip.element.trimStart,
				sourceEnd: clip.element.trimEnd,
				captionCount: candidateCaptions.length - beforeCount,
				segmentCount: result.segments.length,
			});
			transcription.successfulClipCount += 1;
		} catch (error) {
			transcription.errors.push({
				clipId: clip.element.id,
				trackId: clip.trackId,
				mediaId: mediaAsset.id,
				sourceStart: clip.element.trimStart,
				sourceEnd: clip.element.trimEnd,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	transcription.warnings = [...warnings];
	transcription.errorCount = transcription.errors.length;

	if (sourceCoverage.issues.length > 0 || transcription.errorCount > 0) {
		return blockedReport({
			sourceCoverage,
			transcription,
			existingSubtitles,
			burnedSubtitleRisk,
			recommendations: [
				"Fix the listed source or transcription errors before generating captions.",
			],
			revision,
		});
	}

	if (candidateCaptions.length === 0) {
		return blockedReport({
			sourceCoverage,
			transcription,
			existingSubtitles,
			burnedSubtitleRisk,
			recommendations: [
				"Transcription returned no usable caption text for the edited timeline.",
			],
			revision,
		});
	}

	const captionQuality = auditCaptions({
		captions: candidateCaptions,
		captionStyle,
		aspectRatio,
		canvasSize,
		timelineDuration,
	});
	const confidence: CaptionDiagnosticsConfidence = {
		confidenceAvailable,
		averageConfidence: confidenceAvailable
			? averageConfidence(allConfidenceValues)
			: null,
		lowConfidenceThreshold: CAPTION_DIAGNOSTICS_LOW_CONFIDENCE_THRESHOLD,
		lowConfidenceItems,
	};
	const status: CaptionDiagnosticsStatus = !captionQuality.ok
		? "blocked"
		: lowConfidenceItems.length > 0
			? "warning"
			: "ready";
	const recommendations = [
		...(captionQuality.ok
			? []
			: ["Fix caption timing or line breaks before generating captions."]),
		...(lowConfidenceItems.length > 0
			? ["Review low-confidence transcript text before applying captions."]
			: []),
	];

	return {
		status,
		summary: {
			eligibleClipCount: sourceCoverage.eligibleClipCount,
			skippedClipCount: sourceCoverage.skippedClipCount,
			transcriptionErrorCount: transcription.errorCount,
			candidateCaptionCount: candidateCaptions.length,
			captionIssueCount: captionQuality.issueCount,
			existingEditableCaptionCount: existingSubtitles.editableCaptionCount,
			lowConfidenceCount: lowConfidenceItems.length,
		},
		sourceCoverage,
		transcription,
		captionQuality,
		confidence,
		existingSubtitles,
		burnedSubtitleRisk,
		recommendations,
		...(revision === undefined ? {} : { revision }),
		candidateCaptions,
	};
}
