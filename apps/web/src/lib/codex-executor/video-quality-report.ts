import { createCanvas } from "@napi-rs/canvas";
import { FONT_SIZE_SCALE_REFERENCE } from "@/constants/text-constants";
import { auditCaptions } from "@/lib/agent-bridge/caption-quality";
import type { EditPlan } from "@/lib/agent-bridge/edit-plan/schema";
import { validateEditPlan } from "@/lib/agent-bridge/edit-plan/validate";
import { calculateTotalDuration } from "@/lib/timeline";
import {
	buildCanvasFont,
	scaleBoxWidth,
} from "@/services/renderer/nodes/text-node";
import {
	createTextLayout,
	type TextLayoutLine,
	type TextRunStyle,
} from "@/services/renderer/nodes/text-layout";
import type { MediaAsset } from "@/types/assets";
import type {
	TextElement,
	TimelineTrack,
	TrackTransition,
	VideoElement,
} from "@/types/timeline";
import type { ExecutorProjectState } from "./executor";
import {
	type InspectTimelineArgs,
	inspectTimelineWithNodeRenderer,
} from "./timeline-inspection";

type ReportStatus = "pass" | "warning" | "fail";
type CheckStatus = ReportStatus | "unknown";
type Category =
	| "edit_plan"
	| "timeline_readback"
	| "layout"
	| "caption_quality"
	| "voice_consistency"
	| "visual_evidence"
	| "title_quality"
	| "export_probe"
	| "audio_spotcheck";
type Severity = "info" | "warning" | "critical";

interface Check {
	id: string;
	category: Category;
	status: CheckStatus;
	severity: Severity;
	message: string;
	evidence?: Record<string, unknown>;
}

interface ExpectedText {
	kind: "title" | "caption";
	index: number;
	text: string;
	startTime: number;
	duration: number;
}

interface MatchedText extends ExpectedText {
	element: TextElement;
}

interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

type TitleQualityPlatform =
	| "youtube"
	| "tiktok"
	| "instagram"
	| "linkedin"
	| "generic";

interface TitleQualityRubric {
	platform: TitleQualityPlatform;
	primaryKeyword?: string;
}

interface ExportProbeResult {
	format: string;
	duration: number;
	width: number;
	height: number;
	videoTrackCount: number;
	audioTrackCount: number;
}

interface ExportedFileReview {
	outputFile: string;
	format: string;
	includeAudio: boolean;
	outputProbe?: ExportProbeResult;
	probeError?: string;
}

const TIME_TOLERANCE_SECONDS = 0.001;
const BOUNDS_TOLERANCE_PX = 0.5;
const CAPTION_MAX_LINES = 2;
const CAPTION_MIN_LAST_LINE_CHARACTERS = 3;
const CAPTION_VISUAL_WARNING_HEIGHT_RATIO = 0.13;
const CAPTION_VISUAL_FAIL_HEIGHT_RATIO = 0.16;
const CAPTION_VISUAL_FAIL_STROKE_PX = 7;
const TITLE_RUBRIC_MAX_CHARACTERS: Record<TitleQualityPlatform, number> = {
	youtube: 60,
	tiktok: 80,
	instagram: 80,
	linkedin: 120,
	generic: 80,
};
const GENERIC_TITLE_PATTERN =
	/^(ok|test|draft|untitled|title|video|about|about this|new video|标题|视频)$/i;
const HOOK_SIGNAL_PATTERN =
	/(\b(how|why|what|stop|avoid|before|after|mistake|secret|proof|truth|save|never)\b|[0-9?!:：]|为什么|如何|怎么|别|不要|真相|方法|避坑|关键|对比|省)/i;
const QUALITY_REPORT_LIMITATIONS = [
	{
		id: "ocr",
		status: "not_available",
		message: "VideoQualityReport P0 does not use OCR for pixel text detection.",
	},
	{
		id: "face_detection",
		status: "not_available",
		message: "VideoQualityReport P0 does not use face detection.",
	},
	{
		id: "subject_safety",
		status: "conservative_unknown",
		message:
			"Subject-safe crop cannot be certified without face or subject detection.",
	},
	{
		id: "burned_caption_detection",
		status: "not_available",
		message: "VideoQualityReport P0 does not detect burned-in captions.",
	},
] as const;

function statusFrom(checks: Check[]): ReportStatus {
	if (checks.some((check) => check.status === "fail")) return "fail";
	if (checks.some((check) => check.status === "warning")) return "warning";
	return "pass";
}

function elementsOf<T extends TextElement | VideoElement>(
	tracks: TimelineTrack[],
	type: T["type"],
): T[] {
	return tracks.flatMap((track) =>
		track.elements.filter((element): element is T => element.type === type),
	);
}

function transitionsOf(tracks: TimelineTrack[]): TrackTransition[] {
	return tracks.flatMap((track) =>
		track.type === "video" ? (track.transitions ?? []) : [],
	);
}

function near(left: number, right: number): boolean {
	return Math.abs(left - right) <= TIME_TOLERANCE_SECONDS;
}

function expectedTextFor(plan: EditPlan): ExpectedText[] {
	return [
		...(plan.title
			? [
					{
						kind: "title" as const,
						index: 0,
						text: plan.title.text,
						startTime: plan.title.startTime,
						duration: plan.title.duration,
					},
				]
			: []),
		...(plan.captions ?? []).map((caption, index) => ({
			kind: "caption" as const,
			index,
			text: caption.text,
			startTime: caption.startTime,
			duration: caption.duration,
		})),
	];
}

function findExpectedText({
	expected,
	textElements,
	usedIds,
}: {
	expected: ExpectedText;
	textElements: TextElement[];
	usedIds: Set<string>;
}): TextElement | null {
	const element = textElements.find(
		(candidate) =>
			!usedIds.has(candidate.id) &&
			!candidate.hidden &&
			candidate.content === expected.text &&
			near(candidate.startTime, expected.startTime) &&
			near(candidate.duration, expected.duration),
	);
	if (!element) return null;
	usedIds.add(element.id);
	return element;
}

function checkTimedTextGroup({
	id,
	emptyMessage,
	expected,
	missingMessage,
	passMessage,
	textElements,
	usedIds,
}: {
	id: "timeline.titleReadback" | "timeline.captionReadback";
	emptyMessage: string;
	expected: ExpectedText[];
	missingMessage: (missingCount: number) => string;
	passMessage: (matchedIds: string[]) => string;
	textElements: TextElement[];
	usedIds: Set<string>;
}): { check: Check; matches: MatchedText[] } {
	if (expected.length === 0) {
		return {
			check: {
				id,
				category: "timeline_readback",
				status: "pass",
				severity: "info",
				message: emptyMessage,
			},
			matches: [],
		};
	}

	const matches: MatchedText[] = [];
	const missing: ExpectedText[] = [];
	for (const item of expected) {
		const element = findExpectedText({ expected: item, textElements, usedIds });
		if (element) {
			matches.push({ ...item, element });
		} else {
			missing.push(item);
		}
	}

	if (missing.length > 0) {
		return {
			check: {
				id,
				category: "timeline_readback",
				status: "fail",
				severity: "critical",
				message: missingMessage(missing.length),
				evidence: { missing },
			},
			matches,
		};
	}

	const matchedIds = matches.map((match) => match.element.id);
	return {
		check: {
			id,
			category: "timeline_readback",
			status: "pass",
			severity: "info",
			message: passMessage(matchedIds),
			evidence:
				id === "timeline.titleReadback"
					? { elementId: matchedIds[0] }
					: { elementIds: matchedIds },
		},
		matches,
	};
}

function clipDuration(clip: EditPlan["clips"][number]): number {
	return clip.sourceEnd - clip.sourceStart;
}

function buildClipElementMap({
	plan,
	videos,
}: {
	plan: EditPlan;
	videos: VideoElement[];
}): Map<string, string> {
	const used = new Set<string>();
	const map = new Map<string, string>();
	for (const clip of plan.clips) {
		const element = videos.find(
			(candidate) =>
				!used.has(candidate.id) &&
				!candidate.hidden &&
				candidate.mediaId === plan.sourceMediaId &&
				near(candidate.startTime, clip.timelineStart) &&
				near(candidate.duration, clipDuration(clip)) &&
				near(candidate.trimStart, clip.sourceStart) &&
				near(candidate.trimEnd, clip.sourceEnd),
		);
		if (!element) continue;
		used.add(element.id);
		map.set(clip.id, element.id);
	}
	return map;
}

function checkTransitionReadback({
	plan,
	tracks,
}: {
	plan: EditPlan;
	tracks: TimelineTrack[];
}): Check {
	const expected = plan.transitions ?? [];
	if (expected.length === 0) {
		return {
			id: "timeline.transitionReadback",
			category: "timeline_readback",
			status: "pass",
			severity: "info",
			message: "EditPlan has no transitions to verify.",
		};
	}

	const clipElementIds = buildClipElementMap({
		plan,
		videos: elementsOf<VideoElement>(tracks, "video"),
	});
	const readback = transitionsOf(tracks);
	const missing = expected.filter((transition) => {
		const fromElementId = clipElementIds.get(transition.fromClipId);
		const toElementId = clipElementIds.get(transition.toClipId);
		if (!fromElementId || !toElementId) return true;
		return !readback.some(
			(candidate) =>
				candidate.fromElementId === fromElementId &&
				candidate.toElementId === toElementId &&
				candidate.type === transition.type &&
				near(candidate.duration, transition.duration),
		);
	});

	if (missing.length > 0) {
		return {
			id: "timeline.transitionReadback",
			category: "timeline_readback",
			status: "fail",
			severity: "critical",
			message: `${missing.length} EditPlan transition(s) were not found in timeline readback.`,
			evidence: {
				missing,
				clipElementIds: Object.fromEntries(clipElementIds.entries()),
			},
		};
	}

	return {
		id: "timeline.transitionReadback",
		category: "timeline_readback",
		status: "pass",
		severity: "info",
		message: `All ${expected.length} EditPlan transition(s) were found in timeline readback.`,
		evidence: {
			clipElementIds: Object.fromEntries(clipElementIds.entries()),
		},
	};
}

function canvasFont({
	element,
	style,
	fontSize,
}: {
	element: TextElement;
	style: TextRunStyle;
	fontSize: number;
}): string {
	return buildCanvasFont({
		fontStyle:
			style.fontStyle ?? (element.fontStyle === "italic" ? "italic" : "normal"),
		fontWeight:
			style.fontWeight ?? (element.fontWeight === "bold" ? "bold" : "normal"),
		fontSize: fontSize * (style.fontScale ?? 1),
		fontFamily: element.fontFamily,
	});
}

function lineText(line: TextLayoutLine) {
	return line.runs.map((run) => run.text).join("");
}

function roundMetric(value: number): number {
	return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function lineX({
	element,
	lineWidth,
	boxWidth,
}: {
	element: TextElement;
	lineWidth: number;
	boxWidth: number | undefined;
}): number {
	if (element.textAlign === "left") return boxWidth ? -boxWidth / 2 : 0;
	if (element.textAlign === "right") {
		return boxWidth ? boxWidth / 2 - lineWidth : -lineWidth;
	}
	return -lineWidth / 2;
}

function textLayoutForElement({
	element,
	canvasHeight,
}: {
	element: TextElement;
	canvasHeight: number;
}) {
	const context = createCanvas(1, 1).getContext("2d");
	if (!context) {
		throw new Error("VideoQualityReport could not create text measure canvas.");
	}
	const fontSize =
		element.fontSize * (canvasHeight / FONT_SIZE_SCALE_REFERENCE);
	const boxWidth =
		element.boxWidth && element.boxWidth > 0
			? scaleBoxWidth({ boxWidth: element.boxWidth, canvasHeight })
			: undefined;
	const layout = createTextLayout({
		content: element.content,
		richSpans: element.richSpans,
		maxWidth: boxWidth,
		measureText: (text, style) => {
			context.font = canvasFont({ element, style, fontSize });
			return context.measureText(text).width;
		},
	});
	return { layout, fontSize, boxWidth };
}

function localTextBounds({
	element,
	canvasHeight,
}: {
	element: TextElement;
	canvasHeight: number;
}): Bounds {
	const { layout, fontSize, boxWidth } = textLayoutForElement({
		element,
		canvasHeight,
	});

	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	for (const line of layout.lines) {
		const startX = lineX({ element, lineWidth: line.width, boxWidth });
		minX = Math.min(minX, startX);
		maxX = Math.max(maxX, startX + line.width);
	}
	const totalHeight = layout.lines.length * fontSize * 1.3;
	return {
		minX,
		maxX,
		minY: -totalHeight / 2,
		maxY: totalHeight / 2,
	};
}

function toCanvasBounds({
	bounds,
	element,
	canvasSize,
}: {
	bounds: Bounds;
	element: TextElement;
	canvasSize: { width: number; height: number };
}): Bounds {
	const angle = (element.transform.rotate * Math.PI) / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const scale = element.transform.scale;
	const centerX = canvasSize.width / 2 + element.transform.position.x;
	const centerY = canvasSize.height / 2 + element.transform.position.y;
	const corners = [
		{ x: bounds.minX, y: bounds.minY },
		{ x: bounds.maxX, y: bounds.minY },
		{ x: bounds.maxX, y: bounds.maxY },
		{ x: bounds.minX, y: bounds.maxY },
	].map((corner) => {
		const x = corner.x * scale;
		const y = corner.y * scale;
		return {
			x: centerX + x * cos - y * sin,
			y: centerY + x * sin + y * cos,
		};
	});
	return {
		minX: Math.min(...corners.map((corner) => corner.x)),
		minY: Math.min(...corners.map((corner) => corner.y)),
		maxX: Math.max(...corners.map((corner) => corner.x)),
		maxY: Math.max(...corners.map((corner) => corner.y)),
	};
}

function checkTextBounds({
	matches,
	canvasSize,
}: {
	matches: MatchedText[];
	canvasSize: { width: number; height: number };
}): Check {
	const outOfCanvas = matches.flatMap((match) => {
		const bounds = toCanvasBounds({
			bounds: localTextBounds({
				element: match.element,
				canvasHeight: canvasSize.height,
			}),
			element: match.element,
			canvasSize,
		});
		const outside =
			bounds.minX < -BOUNDS_TOLERANCE_PX ||
			bounds.minY < -BOUNDS_TOLERANCE_PX ||
			bounds.maxX > canvasSize.width + BOUNDS_TOLERANCE_PX ||
			bounds.maxY > canvasSize.height + BOUNDS_TOLERANCE_PX;
		return outside
			? [
					{
						kind: match.kind,
						index: match.index,
						elementId: match.element.id,
						bounds,
					},
				]
			: [];
	});

	if (outOfCanvas.length > 0) {
		return {
			id: "layout.textBounds",
			category: "layout",
			status: "fail",
			severity: "critical",
			message: `${outOfCanvas.length} plan text element(s) render outside the canvas.`,
			evidence: { outOfCanvas, canvasSize },
		};
	}

	return {
		id: "layout.textBounds",
		category: "layout",
		status: "pass",
		severity: "info",
		message: `All ${matches.length} plan text element(s) render inside the canvas.`,
		evidence: { checkedElementIds: matches.map((match) => match.element.id) },
	};
}

function checkCaptionLines({
	matches,
	canvasSize,
}: {
	matches: MatchedText[];
	canvasSize: { width: number; height: number };
}): Check {
	const invalidCaptions = matches
		.filter((match) => match.kind === "caption")
		.flatMap((match) => {
			const { layout } = textLayoutForElement({
				element: match.element,
				canvasHeight: canvasSize.height,
			});
			const lines = layout.lines.map(lineText);
			const lastLineCharacters = Array.from(lines.at(-1) ?? "").length;
			const tooManyLines = lines.length > CAPTION_MAX_LINES;
			const orphanLastLine =
				lines.length > 1 &&
				lastLineCharacters < CAPTION_MIN_LAST_LINE_CHARACTERS;
			if (!tooManyLines && !orphanLastLine) return [];
			return [
				{
					kind: match.kind,
					index: match.index,
					elementId: match.element.id,
					text: match.text,
					lineCount: lines.length,
					lines,
					lastLineCharacters,
					reason: tooManyLines ? "too_many_lines" : "orphan_last_line",
				},
			];
		});

	if (invalidCaptions.length > 0) {
		const overLimit = invalidCaptions.filter(
			(caption) => caption.reason === "too_many_lines",
		);
		const orphanLastLines = invalidCaptions.filter(
			(caption) => caption.reason === "orphan_last_line",
		);
		return {
			id: "layout.captionLines",
			category: "layout",
			status: "fail",
			severity: "critical",
			message: `${invalidCaptions.length} caption text element(s) render with too many lines or orphan last lines.`,
			evidence: { overLimit, orphanLastLines, canvasSize },
		};
	}

	return {
		id: "layout.captionLines",
		category: "layout",
		status: "pass",
		severity: "info",
		message: `All ${matches.filter((match) => match.kind === "caption").length} caption text element(s) stay within line-count limits.`,
		evidence: {
			maxLines: CAPTION_MAX_LINES,
			minLastLineCharacters: CAPTION_MIN_LAST_LINE_CHARACTERS,
		},
	};
}

function maxRunFontPx({
	layout,
	fontSize,
	scale,
}: {
	layout: ReturnType<typeof createTextLayout>;
	fontSize: number;
	scale: number;
}): number {
	const runFontSizes = layout.lines.flatMap((line) =>
		line.runs.map((run) => fontSize * (run.style.fontScale ?? 1)),
	);
	return Math.max(fontSize, ...runFontSizes) * scale;
}

function maxStrokePx({
	element,
	layout,
	scale,
}: {
	element: TextElement;
	layout: ReturnType<typeof createTextLayout>;
	scale: number;
}): number {
	const strokeWidths = [
		element.stroke?.width ?? 0,
		...layout.lines.flatMap((line) =>
			line.runs.map((run) => run.style.stroke?.width ?? 0),
		),
	];
	return Math.max(0, ...strokeWidths) * 2 * scale;
}

function textBoxHeightPx({
	element,
	layout,
	fontSize,
}: {
	element: TextElement;
	layout: ReturnType<typeof createTextLayout>;
	fontSize: number;
}): number {
	const lineCount = Math.max(1, layout.lines.length);
	const textHeight = lineCount * fontSize * 1.3;
	const hasBackground =
		!!element.backgroundColor && element.backgroundColor !== "transparent";
	const backgroundPadding = hasBackground
		? (element.backgroundPaddingY ?? 4) * 2
		: 0;
	return (textHeight + backgroundPadding) * element.transform.scale;
}

function checkCaptionStyleVisualFootprint({
	matches,
	canvasSize,
}: {
	matches: MatchedText[];
	canvasSize: { width: number; height: number };
}): Check {
	const captions = matches.filter((match) => match.kind === "caption");
	if (captions.length === 0) {
		return {
			id: "captionStyle.visualFootprint",
			category: "layout",
			status: "pass",
			severity: "info",
			message:
				"EditPlan has no caption text elements requiring visual footprint checks.",
			evidence: { captionCount: 0 },
		};
	}

	if (canvasSize.width >= canvasSize.height) {
		return {
			id: "captionStyle.visualFootprint",
			category: "layout",
			status: "pass",
			severity: "info",
			message:
				"Caption visual footprint thresholds apply only to vertical 9:16 outputs.",
			evidence: { captionCount: captions.length, canvasSize },
		};
	}

	const measured = captions.map((match) => {
		const { layout, fontSize } = textLayoutForElement({
			element: match.element,
			canvasHeight: canvasSize.height,
		});
		const scale = match.element.transform.scale;
		const fontPx = maxRunFontPx({ layout, fontSize, scale });
		const strokePx = maxStrokePx({ element: match.element, layout, scale });
		const heightPx = textBoxHeightPx({
			element: match.element,
			layout,
			fontSize,
		});
		const heightRatio = heightPx / canvasSize.height;
		const reason =
			heightRatio > CAPTION_VISUAL_FAIL_HEIGHT_RATIO
				? "height_ratio_fail"
				: strokePx > CAPTION_VISUAL_FAIL_STROKE_PX
					? "stroke_px_fail"
					: heightRatio > CAPTION_VISUAL_WARNING_HEIGHT_RATIO
						? "height_ratio_warning"
						: null;
		return {
			id: match.element.id,
			content: match.element.content,
			fontPx: roundMetric(fontPx),
			strokePx: roundMetric(strokePx),
			heightRatio: roundMetric(heightRatio),
			reason,
		};
	});
	const failed = measured.filter(
		(caption) =>
			caption.reason === "height_ratio_fail" ||
			caption.reason === "stroke_px_fail",
	);
	const warnings = measured.filter(
		(caption) => caption.reason === "height_ratio_warning",
	);

	if (failed.length > 0) {
		return {
			id: "captionStyle.visualFootprint",
			category: "layout",
			status: "fail",
			severity: "critical",
			message: `${failed.length} caption text element(s) exceed visual footprint limits.`,
			evidence: {
				offendingCaptions: failed,
				warningCaptions: warnings,
				thresholds: {
					warningHeightRatio: CAPTION_VISUAL_WARNING_HEIGHT_RATIO,
					failHeightRatio: CAPTION_VISUAL_FAIL_HEIGHT_RATIO,
					failStrokePx: CAPTION_VISUAL_FAIL_STROKE_PX,
				},
			},
		};
	}

	if (warnings.length > 0) {
		return {
			id: "captionStyle.visualFootprint",
			category: "layout",
			status: "warning",
			severity: "warning",
			message: `${warnings.length} caption text element(s) approach visual footprint limits.`,
			evidence: {
				offendingCaptions: warnings,
				thresholds: {
					warningHeightRatio: CAPTION_VISUAL_WARNING_HEIGHT_RATIO,
					failHeightRatio: CAPTION_VISUAL_FAIL_HEIGHT_RATIO,
					failStrokePx: CAPTION_VISUAL_FAIL_STROKE_PX,
				},
			},
		};
	}

	return {
		id: "captionStyle.visualFootprint",
		category: "layout",
		status: "pass",
		severity: "info",
		message: `All ${captions.length} caption text element(s) stay within visual footprint limits.`,
		evidence: {
			captions: measured.map(({ reason: _reason, ...caption }) => caption),
			thresholds: {
				warningHeightRatio: CAPTION_VISUAL_WARNING_HEIGHT_RATIO,
				failHeightRatio: CAPTION_VISUAL_FAIL_HEIGHT_RATIO,
				failStrokePx: CAPTION_VISUAL_FAIL_STROKE_PX,
			},
		},
	};
}

async function inspectTimeline({
	state,
	mediaAssets,
	inspection,
	outputDirectory,
}: {
	state: ExecutorProjectState;
	mediaAssets: MediaAsset[];
	inspection: InspectTimelineArgs;
	outputDirectory: string;
}) {
	try {
		const result = await inspectTimelineWithNodeRenderer({
			state,
			mediaAssets,
			args: inspection,
			outputDirectory,
		});
		return {
			check: {
				id: "visual.timelineContactSheet",
				category: "visual_evidence" as const,
				status: "pass" as const,
				severity: "info" as const,
				message: `Rendered ${result.frameTimes.length} timeline frame(s) for conservative visual review.`,
				evidence: { frameTimes: result.frameTimes },
			},
			artifacts: [
				{
					kind: "timeline_contact_sheet" as const,
					path: result.artifactPath,
					mimeType: "image/png" as const,
					width: result.sheetSize.width,
					height: result.sheetSize.height,
				},
			],
			frames: result.frameTimes.map((timeSeconds) => ({ timeSeconds })),
		};
	} catch (error) {
		return {
			check: {
				id: "visual.timelineContactSheet",
				category: "visual_evidence" as const,
				status: "fail" as const,
				severity: "critical" as const,
				message: "Timeline contact sheet could not be rendered.",
				evidence: {
					error: error instanceof Error ? error.message : String(error),
				},
			},
			artifacts: [],
			frames: [],
		};
	}
}

function reportProject(state: ExecutorProjectState) {
	return {
		id: state.project.id,
		name: state.project.name,
		canvasSize: state.project.settings.canvasSize,
		fps: state.project.settings.fps,
	};
}

function validationFailureReport({
	state,
	message,
	path,
}: {
	state: ExecutorProjectState;
	message: string;
	path?: string;
}) {
	const checks: Check[] = [
		{
			id: "editPlan.validation",
			category: "edit_plan",
			status: "fail",
			severity: "critical",
			message,
			...(path ? { evidence: { path } } : {}),
		},
	];
	return {
		schemaVersion: 2,
		status: statusFrom(checks),
		revision: state.revision,
		project: reportProject(state),
		summary: {
			message: "EditPlan validation failed; timeline inspection was skipped.",
			totalDuration: calculateTotalDuration({ tracks: state.tracks }),
			trackCount: state.tracks.length,
		},
		checks,
		artifacts: [],
		frames: [],
		limitations: QUALITY_REPORT_LIMITATIONS,
	};
}

function checkCaptionQuality({
	plan,
	state,
}: {
	plan: EditPlan;
	state: ExecutorProjectState;
}): Check {
	const captions = plan.captions ?? [];
	if (captions.length === 0 || !plan.captionStyle) {
		return {
			id: "captionQuality.contract",
			category: "caption_quality",
			status: "pass",
			severity: "info",
			message: "EditPlan has no captions requiring caption quality checks.",
			evidence: { captionCount: captions.length },
		};
	}
	const report = auditCaptions({
		captions,
		captionStyle: plan.captionStyle,
		aspectRatio: plan.target.aspectRatio,
		canvasSize: state.project.settings.canvasSize,
		timelineDuration: plan.target.durationSec,
	});
	if (!report.ok) {
		return {
			id: "captionQuality.contract",
			category: "caption_quality",
			status: "fail",
			severity: "critical",
			message: `${report.issueCount} caption quality issue(s) were found.`,
			evidence: { captionQuality: report },
		};
	}
	return {
		id: "captionQuality.contract",
		category: "caption_quality",
		status: "pass",
		severity: "info",
		message: `All ${captions.length} EditPlan caption(s) satisfy caption quality constraints.`,
		evidence: report.metrics,
	};
}

function referencedMediaIds(tracks: TimelineTrack[]): Set<string> {
	const ids = new Set<string>();
	for (const track of tracks) {
		for (const element of track.elements) {
			if ("mediaId" in element && typeof element.mediaId === "string") {
				ids.add(element.mediaId);
			}
		}
	}
	return ids;
}

function normalizeSpokenText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function normalizeTitleText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function includesText({ text, value }: { text: string; value: string }) {
	return text.toLocaleLowerCase().includes(value.toLocaleLowerCase());
}

function checkTitleQuality({
	plan,
	rubric,
}: {
	plan: EditPlan;
	rubric?: TitleQualityRubric;
}): Check {
	if (!plan.title) {
		return {
			id: "titleQuality.planningRubric",
			category: "title_quality",
			status: "unknown",
			severity: "info",
			message: "EditPlan has no title to evaluate.",
			evidence: { titlePresent: false },
		};
	}

	const title = normalizeTitleText(plan.title.text);
	const characterCount = Array.from(title).length;
	if (!rubric) {
		return {
			id: "titleQuality.planningRubric",
			category: "title_quality",
			status: "unknown",
			severity: "info",
			message:
				"Title quality rubric was not provided; business title quality was not evaluated.",
			evidence: { titlePresent: true, characterCount },
		};
	}

	const maxCharacters = TITLE_RUBRIC_MAX_CHARACTERS[rubric.platform];
	const issues: Array<{
		code: string;
		message: string;
		evidence?: Record<string, unknown>;
	}> = [];
	if (characterCount > maxCharacters) {
		issues.push({
			code: "title_too_long",
			message: `Title exceeds the ${rubric.platform} rubric length.`,
			evidence: { characterCount, maxCharacters },
		});
	}
	const keyword = rubric.primaryKeyword?.trim();
	if (keyword && !includesText({ text: title, value: keyword })) {
		issues.push({
			code: "title_missing_keyword",
			message: "Title does not include the provided primary keyword.",
			evidence: { primaryKeyword: keyword },
		});
	}
	const hasHookSignal = HOOK_SIGNAL_PATTERN.test(title);
	if (!hasHookSignal) {
		issues.push({
			code: "title_weak_hook",
			message:
				"Title has no clear hook signal such as a question, number, contrast, warning, or action verb.",
		});
	}
	const genericTitle = characterCount < 6 || GENERIC_TITLE_PATTERN.test(title);
	if (genericTitle) {
		issues.push({
			code: "title_generic",
			message: "Title is too generic to act as a planning or publish hook.",
			evidence: { characterCount },
		});
	}

	return {
		id: "titleQuality.planningRubric",
		category: "title_quality",
		status: issues.length > 0 ? "warning" : "pass",
		severity: issues.length > 0 ? "warning" : "info",
		message:
			issues.length > 0
				? `${issues.length} title quality issue(s) were found.`
				: "Title satisfies the provided planning rubric.",
		evidence: {
			platform: rubric.platform,
			characterCount,
			maxCharacters,
			primaryKeyword: keyword,
			hasHookSignal,
			genericTitle,
			issues,
		},
	};
}

function checkVoiceConsistency({
	plan,
	state,
}: {
	plan: EditPlan;
	state: ExecutorProjectState;
}): Check {
	const mediaIds = referencedMediaIds(state.tracks);
	const scriptedAssets = state.mediaAssets.filter(
		(asset) => mediaIds.has(asset.id) && asset.spokenScript?.source === "tts",
	);
	if (scriptedAssets.length === 0) {
		return {
			id: "voiceConsistency.scriptedTts",
			category: "voice_consistency",
			status: "pass",
			severity: "info",
			message: "No scripted TTS media is referenced by the current timeline.",
			evidence: { scriptedMediaCount: 0 },
		};
	}

	const captionText = normalizeSpokenText(
		(plan.captions ?? []).map((caption) => caption.text).join(" "),
	);
	const mismatches = scriptedAssets.flatMap((asset) => {
		const scriptCaptions = asset.spokenScript?.captions ?? [];
		const missingScriptCaptionLineCount = scriptCaptions.filter(
			(caption) => !captionText.includes(normalizeSpokenText(caption)),
		).length;
		const protectedTerms = asset.spokenScript?.protectedTerms ?? [];
		const missingProtectedTermCount = protectedTerms.filter(
			(term) => !captionText.includes(normalizeSpokenText(term)),
		).length;
		return missingScriptCaptionLineCount > 0 || missingProtectedTermCount > 0
			? [
					{
						mediaId: asset.id,
						provider: asset.spokenScript?.provider ?? "imported-tts",
						scriptCaptionLineCount: scriptCaptions.length,
						protectedTermCount: protectedTerms.length,
						missingScriptCaptionLineCount,
						missingProtectedTermCount,
					},
				]
			: [];
	});
	if (mismatches.length > 0) {
		return {
			id: "voiceConsistency.scriptedTts",
			category: "voice_consistency",
			status: "fail",
			severity: "critical",
			message:
				"Scripted TTS captions or protected terms are missing from EditPlan captions.",
			evidence: { mismatches },
		};
	}
	return {
		id: "voiceConsistency.scriptedTts",
		category: "voice_consistency",
		status: "pass",
		severity: "info",
		message: `All ${scriptedAssets.length} scripted TTS media asset(s) match EditPlan captions within protected-term coverage.`,
		evidence: {
			scriptedMediaCount: scriptedAssets.length,
			assets: scriptedAssets.map((asset) => ({
				mediaId: asset.id,
				provider: asset.spokenScript?.provider ?? "imported-tts",
				scriptCaptionLineCount: asset.spokenScript?.captions.length ?? 0,
				protectedTermCount: asset.spokenScript?.protectedTerms?.length ?? 0,
			})),
		},
	};
}

function checkExportProbe({
	exportedFile,
}: {
	exportedFile?: ExportedFileReview;
}): Check {
	if (!exportedFile) {
		return {
			id: "finalReview.outputProbe",
			category: "export_probe",
			status: "unknown",
			severity: "info",
			message: "No exported file was provided; export file probe was skipped.",
		};
	}
	if (exportedFile.probeError) {
		return {
			id: "finalReview.outputProbe",
			category: "export_probe",
			status: "fail",
			severity: "critical",
			message: "Exported file probe failed.",
			evidence: {
				outputFile: exportedFile.outputFile,
				format: exportedFile.format,
				error: exportedFile.probeError,
			},
		};
	}
	if (
		!exportedFile.outputProbe ||
		exportedFile.outputProbe.videoTrackCount <= 0
	) {
		return {
			id: "finalReview.outputProbe",
			category: "export_probe",
			status: "fail",
			severity: "critical",
			message: "Exported file probe did not return a video track.",
			evidence: {
				outputFile: exportedFile.outputFile,
				format: exportedFile.format,
				outputProbe: exportedFile.outputProbe,
			},
		};
	}
	return {
		id: "finalReview.outputProbe",
		category: "export_probe",
		status: "pass",
		severity: "info",
		message: "Exported file probe passed.",
		evidence: {
			outputFile: exportedFile.outputFile,
			...exportedFile.outputProbe,
		},
	};
}

function checkExportAudioPresence({
	exportedFile,
}: {
	exportedFile?: ExportedFileReview;
}): Check {
	if (!exportedFile) {
		return {
			id: "finalReview.audioPresence",
			category: "audio_spotcheck",
			status: "unknown",
			severity: "info",
			message:
				"No exported file was provided; audio presence check was skipped.",
		};
	}
	if (exportedFile.probeError || !exportedFile.outputProbe) {
		return {
			id: "finalReview.audioPresence",
			category: "audio_spotcheck",
			status: "unknown",
			severity: "info",
			message:
				"Export audio presence could not be checked without a valid probe.",
			evidence: {
				includeAudio: exportedFile.includeAudio,
				error: exportedFile.probeError,
			},
		};
	}
	const audioTrackCount = exportedFile.outputProbe.audioTrackCount;
	if (exportedFile.includeAudio && audioTrackCount <= 0) {
		return {
			id: "finalReview.audioPresence",
			category: "audio_spotcheck",
			status: "fail",
			severity: "critical",
			message:
				"Exported file was expected to include audio but no audio track was found.",
			evidence: { includeAudio: exportedFile.includeAudio, audioTrackCount },
		};
	}
	if (!exportedFile.includeAudio && audioTrackCount > 0) {
		return {
			id: "finalReview.audioPresence",
			category: "audio_spotcheck",
			status: "warning",
			severity: "warning",
			message:
				"Exported file includes audio even though includeAudio was false.",
			evidence: { includeAudio: exportedFile.includeAudio, audioTrackCount },
		};
	}
	return {
		id: "finalReview.audioPresence",
		category: "audio_spotcheck",
		status: "pass",
		severity: "info",
		message: exportedFile.includeAudio
			? "Exported file includes an audio track."
			: "Exported file has no audio track as requested.",
		evidence: { includeAudio: exportedFile.includeAudio, audioTrackCount },
	};
}

export async function buildVideoQualityReport({
	state,
	mediaAssets,
	plan,
	inspection,
	outputDirectory,
	titleRubric,
	exportedFile,
}: {
	state: ExecutorProjectState;
	mediaAssets: MediaAsset[];
	plan: unknown;
	inspection: Required<InspectTimelineArgs>;
	outputDirectory: string;
	titleRubric?: TitleQualityRubric;
	exportedFile?: ExportedFileReview;
}) {
	const validation = validateEditPlan({
		plan,
		projectId: state.project.id,
		mediaAssets,
	});
	if (!validation.success) {
		return validationFailureReport({
			state,
			message: validation.message,
			path: validation.path,
		});
	}

	const normalizedPlan = validation.normalizedPlan;
	const textElements = elementsOf<TextElement>(state.tracks, "text");
	const expectedTexts = expectedTextFor(normalizedPlan);
	const usedTextIds = new Set<string>();
	const titleReadback = checkTimedTextGroup({
		id: "timeline.titleReadback",
		emptyMessage: "EditPlan has no title to verify.",
		expected: expectedTexts.filter((item) => item.kind === "title"),
		missingMessage: () => "EditPlan title was not found in timeline readback.",
		passMessage: () => "EditPlan title was found in timeline readback.",
		textElements,
		usedIds: usedTextIds,
	});
	const captionReadback = checkTimedTextGroup({
		id: "timeline.captionReadback",
		emptyMessage: "EditPlan has no captions to verify.",
		expected: expectedTexts.filter((item) => item.kind === "caption"),
		missingMessage: (count) =>
			`${count} EditPlan caption(s) were not found in timeline readback.`,
		passMessage: (ids) =>
			`All ${ids.length} EditPlan caption(s) were found in timeline readback.`,
		textElements,
		usedIds: usedTextIds,
	});
	const matchedText = [...titleReadback.matches, ...captionReadback.matches];
	const contactSheet = await inspectTimeline({
		state,
		mediaAssets,
		inspection,
		outputDirectory,
	});
	const checks: Check[] = [
		{
			id: "editPlan.validation",
			category: "edit_plan",
			status: "pass",
			severity: "info",
			message: "EditPlan is valid.",
		},
		titleReadback.check,
		captionReadback.check,
		checkTransitionReadback({ plan: normalizedPlan, tracks: state.tracks }),
		checkTextBounds({
			matches: matchedText,
			canvasSize: state.project.settings.canvasSize,
		}),
		checkCaptionLines({
			matches: matchedText,
			canvasSize: state.project.settings.canvasSize,
		}),
		checkCaptionStyleVisualFootprint({
			matches: matchedText,
			canvasSize: state.project.settings.canvasSize,
		}),
		checkCaptionQuality({ plan: normalizedPlan, state }),
		checkVoiceConsistency({ plan: normalizedPlan, state }),
		checkTitleQuality({ plan: normalizedPlan, rubric: titleRubric }),
		checkExportProbe({ exportedFile }),
		checkExportAudioPresence({ exportedFile }),
		contactSheet.check,
	];
	const status = statusFrom(checks);

	return {
		schemaVersion: 2,
		status,
		revision: state.revision,
		project: reportProject(state),
		summary: {
			message:
				status === "pass"
					? "Timeline readback matches the EditPlan within VideoQualityReport P0 coverage."
					: "One or more VideoQualityReport P0 checks failed.",
			totalDuration: calculateTotalDuration({ tracks: state.tracks }),
			trackCount: state.tracks.length,
			expectedTextCount: expectedTexts.length,
			matchedTextCount: matchedText.length,
			transitionCount: normalizedPlan.transitions?.length ?? 0,
			conservativeRisk:
				"OCR, face detection, subject safety, and burned-in caption detection are not available in P0.",
			exportedFileReviewed: Boolean(exportedFile),
		},
		checks,
		artifacts: contactSheet.artifacts,
		frames: contactSheet.frames,
		limitations: QUALITY_REPORT_LIMITATIONS,
	};
}
