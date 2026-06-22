import type {
	VideoRangeFrame,
	VideoRangeInspection,
} from "@/lib/codex-executor/video-range-inspection";

export const VISUAL_CONTEXT_WINDOW_SECONDS = 60;
export const VISUAL_CONTEXT_FRAMES_PER_WINDOW = 6;

export type VisualTargetAspectRatio = "9:16" | "16:9" | "1:1";
export type SourceOrientation = "landscape" | "portrait" | "square";
export type VisualReframeRisk = "none" | "needs_review";

export interface ExecutorVisualContextMediaAsset {
	id: string;
	name: string;
	type: string;
	durationSeconds?: number;
	width?: number;
	height?: number;
	path?: string;
}

export interface VisualContextWindow {
	id: string;
	index: number;
	startSeconds: number;
	endSeconds: number;
}

export interface CompletedVisualContextWindow extends VisualContextWindow {
	frameCount: number;
	artifact: VideoRangeInspection["artifact"];
	frames: VideoRangeFrame[];
	audio: VideoRangeInspection["audio"];
	warnings: string[];
}

export interface VisualPreflight {
	requiresReframe: boolean;
	reframeRisk: VisualReframeRisk;
	recommendedReframeTemplate:
		| "vertical_face_safe_crop_above_burned_captions"
		| null;
	captionPolicy:
		| "inspect_artifacts_before_lower_safe_captions"
		| "standard_caption_safe_area";
	subjectSafeArea: "unverified";
	burnedCaptionRegion: "unverified";
}

export interface VisualContext {
	version: 1;
	mediaId: string;
	name: string;
	qualityLevel: "L3_visual_evidence";
	target: { aspectRatio: VisualTargetAspectRatio };
	metadata: {
		durationSeconds: number;
		width: number;
		height: number;
		sourceOrientation: SourceOrientation;
	};
	analysisWindows: CompletedVisualContextWindow[];
	visualPreflight: VisualPreflight;
	warnings: string[];
}

export type InspectVisualRange = ({
	mediaAsset,
	startSeconds,
	endSeconds,
	frameCount,
	outputDirectory,
}: {
	mediaAsset: ExecutorVisualContextMediaAsset;
	startSeconds: number;
	endSeconds: number;
	frameCount: number;
	outputDirectory: string;
}) => Promise<VideoRangeInspection>;

function floorToMillis(value: number): number {
	return Math.floor(value * 1000) / 1000;
}

function targetAspectRatioValue(targetAspectRatio: VisualTargetAspectRatio) {
	if (targetAspectRatio === "9:16") return 9 / 16;
	if (targetAspectRatio === "16:9") return 16 / 9;
	return 1;
}

export function buildVisualContextWindows({
	durationSeconds,
}: {
	durationSeconds: number;
}): VisualContextWindow[] {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		throw new Error("VisualContext requires a positive duration.");
	}

	const boundedDurationSeconds = floorToMillis(durationSeconds);
	if (boundedDurationSeconds <= 0) {
		throw new Error("VisualContext requires a duration of at least 1ms.");
	}

	const windows: VisualContextWindow[] = [];
	let startSeconds = 0;
	let index = 1;
	while (startSeconds < boundedDurationSeconds) {
		const endSeconds = Math.min(
			startSeconds + VISUAL_CONTEXT_WINDOW_SECONDS,
			boundedDurationSeconds,
		);
		windows.push({
			id: `window-${index}`,
			index,
			startSeconds,
			endSeconds,
		});
		startSeconds = endSeconds;
		index += 1;
	}
	return windows;
}

export function classifySourceOrientation({
	width,
	height,
}: {
	width: number;
	height: number;
}): SourceOrientation {
	if (!Number.isFinite(width) || width <= 0) {
		throw new Error("VisualContext width must be positive.");
	}
	if (!Number.isFinite(height) || height <= 0) {
		throw new Error("VisualContext height must be positive.");
	}

	const aspectRatio = width / height;
	if (aspectRatio > 1.05) return "landscape";
	if (aspectRatio < 1 / 1.05) return "portrait";
	return "square";
}

export function buildVisualPreflight({
	width,
	height,
	targetAspectRatio,
}: {
	width: number;
	height: number;
	targetAspectRatio: VisualTargetAspectRatio;
}): VisualPreflight {
	const sourceAspectRatio = width / height;
	const targetRatio = targetAspectRatioValue(targetAspectRatio);
	const requiresReframe =
		Math.abs(sourceAspectRatio - targetRatio) / sourceAspectRatio >= 0.2;
	const isLandscapeToVertical =
		classifySourceOrientation({ width, height }) === "landscape" &&
		targetAspectRatio === "9:16";

	return {
		requiresReframe,
		reframeRisk: requiresReframe ? "needs_review" : "none",
		recommendedReframeTemplate: isLandscapeToVertical
			? "vertical_face_safe_crop_above_burned_captions"
			: null,
		captionPolicy: requiresReframe
			? "inspect_artifacts_before_lower_safe_captions"
			: "standard_caption_safe_area",
		subjectSafeArea: "unverified",
		burnedCaptionRegion: "unverified",
	};
}

function assertVisualContextMediaAsset(
	mediaAsset: ExecutorVisualContextMediaAsset,
): asserts mediaAsset is ExecutorVisualContextMediaAsset & {
	durationSeconds: number;
	width: number;
	height: number;
	path: string;
} {
	if (mediaAsset.type !== "video") {
		throw new Error("VisualContext requires video media.");
	}
	if (
		!Number.isFinite(mediaAsset.durationSeconds) ||
		!mediaAsset.durationSeconds
	) {
		throw new Error("VisualContext requires media duration.");
	}
	if (!Number.isFinite(mediaAsset.width) || !mediaAsset.width) {
		throw new Error("VisualContext requires media width.");
	}
	if (!Number.isFinite(mediaAsset.height) || !mediaAsset.height) {
		throw new Error("VisualContext requires media height.");
	}
	if (!mediaAsset.path) {
		throw new Error("VisualContext media path is required.");
	}
}

export async function buildVisualContextWithInspector({
	mediaAsset,
	targetAspectRatio,
	outputDirectory,
	inspectRange,
}: {
	mediaAsset: ExecutorVisualContextMediaAsset;
	targetAspectRatio: VisualTargetAspectRatio;
	outputDirectory: string;
	inspectRange: InspectVisualRange;
}): Promise<VisualContext> {
	assertVisualContextMediaAsset(mediaAsset);

	const windows = buildVisualContextWindows({
		durationSeconds: mediaAsset.durationSeconds,
	});
	const analysisWindows: CompletedVisualContextWindow[] = [];

	for (const window of windows) {
		try {
			const inspection = await inspectRange({
				mediaAsset,
				startSeconds: window.startSeconds,
				endSeconds: window.endSeconds,
				frameCount: VISUAL_CONTEXT_FRAMES_PER_WINDOW,
				outputDirectory,
			});
			analysisWindows.push({
				...window,
				frameCount: VISUAL_CONTEXT_FRAMES_PER_WINDOW,
				artifact: inspection.artifact,
				frames: inspection.frames,
				audio: inspection.audio,
				warnings: inspection.warnings,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				`VisualContext window ${window.index} failed for source range ${window.startSeconds.toFixed(2)}s-${window.endSeconds.toFixed(2)}s: ${message}`,
			);
		}
	}

	return {
		version: 1,
		mediaId: mediaAsset.id,
		name: mediaAsset.name,
		qualityLevel: "L3_visual_evidence",
		target: { aspectRatio: targetAspectRatio },
		metadata: {
			durationSeconds: mediaAsset.durationSeconds,
			width: mediaAsset.width,
			height: mediaAsset.height,
			sourceOrientation: classifySourceOrientation({
				width: mediaAsset.width,
				height: mediaAsset.height,
			}),
		},
		analysisWindows,
		visualPreflight: buildVisualPreflight({
			width: mediaAsset.width,
			height: mediaAsset.height,
			targetAspectRatio,
		}),
		warnings: [
			"OCR not run",
			"subject detection not run",
			"burned caption detection not run",
			"semantic scene detection not run",
		],
	};
}
