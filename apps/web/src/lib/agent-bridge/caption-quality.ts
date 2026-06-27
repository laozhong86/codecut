import { breakCaptionTextIntoLineRanges } from "@/lib/caption-line-breaking";
import {
	computeCaptionCharacterLimit,
	POST_CUT_CAPTION_MAX_LINES,
} from "./edit-plan/caption-chunking";
import type {
	EditPlan,
	EditPlanCaption,
	EditPlanCaptionStyle,
} from "./edit-plan/schema";

export const CAPTION_QUALITY_MIN_DURATION_SECONDS = 0.5;
export const CAPTION_QUALITY_MAX_DURATION_SECONDS = 4;
export const CAPTION_QUALITY_MAX_LINES = POST_CUT_CAPTION_MAX_LINES;
export const CAPTION_QUALITY_MIN_LAST_LINE_CHARACTERS = 3;
export const CAPTION_QUALITY_TIME_TOLERANCE_SECONDS = 0.001;

export type CaptionQualityIssueCode =
	| "caption_too_short"
	| "caption_too_long"
	| "caption_overlap"
	| "caption_line_break_failed"
	| "caption_outside_timeline";

export interface CaptionQualityIssue {
	code: CaptionQualityIssueCode;
	path: string;
	message: string;
	captionIndex: number;
	evidence?: Record<string, unknown>;
}

export interface CaptionQualityReport {
	ok: boolean;
	issueCount: number;
	issues: CaptionQualityIssue[];
	metrics: {
		captionCount: number;
		minDuration: number | null;
		maxDuration: number | null;
		maxLineCount: number;
	};
}

type CaptionQualityCaption = Pick<
	EditPlanCaption,
	"text" | "startTime" | "duration"
>;

export function canonicalCaptionCanvasSizeForAspectRatio({
	aspectRatio,
}: {
	aspectRatio: EditPlan["target"]["aspectRatio"];
}) {
	if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
	if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
	return { width: 1920, height: 1080 };
}

function roundMetric(value: number): number {
	return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function addIssue({
	issues,
	issue,
}: {
	issues: CaptionQualityIssue[];
	issue: CaptionQualityIssue;
}) {
	issues.push(issue);
}

function auditCaptionLineFit({
	caption,
	index,
	captionStyle,
	captionTextRaw,
	aspectRatio,
	canvasSize,
}: {
	caption: CaptionQualityCaption;
	index: number;
	captionStyle: EditPlanCaptionStyle;
	captionTextRaw?: {
		boxWidth?: number;
		fontSize?: number;
	};
	aspectRatio: EditPlan["target"]["aspectRatio"];
	canvasSize: { width: number; height: number };
}): { lineCount: number; issue?: CaptionQualityIssue } {
	const maxWidth = computeCaptionCharacterLimit({
		text: caption.text,
		captionStyle,
		captionTextRaw,
		aspectRatio,
		canvasSize,
	});

	try {
		const lines = breakCaptionTextIntoLineRanges({
			text: caption.text,
			maxWidth,
			maxLines: CAPTION_QUALITY_MAX_LINES,
			strictCjkOrphanLastLine: true,
		});
		const lineTexts = lines.map((line) => line.text);
		const lastLineCharacterCount = Array.from(lineTexts.at(-1) ?? "").length;
		if (
			lineTexts.length > 1 &&
			lastLineCharacterCount < CAPTION_QUALITY_MIN_LAST_LINE_CHARACTERS
		) {
			return {
				lineCount: lineTexts.length,
				issue: {
					code: "caption_line_break_failed",
					path: `captions[${index}].text`,
					message:
						"Caption text cannot fit the selected preset without an orphan last line.",
					captionIndex: index,
					evidence: { lines: lineTexts, maxWidth, lastLineCharacterCount },
				},
			};
		}
		return { lineCount: lineTexts.length };
	} catch (error) {
		return {
			lineCount: 0,
			issue: {
				code: "caption_line_break_failed",
				path: `captions[${index}].text`,
				message:
					"Caption text cannot fit the selected preset within the line limits.",
				captionIndex: index,
				evidence: {
					maxWidth,
					error: error instanceof Error ? error.message : String(error),
				},
			},
		};
	}
}

export function auditCaptions({
	captions,
	captionStyle,
	captionTextRaw,
	aspectRatio,
	canvasSize,
	timelineDuration,
}: {
	captions: CaptionQualityCaption[];
	captionStyle: EditPlanCaptionStyle;
	captionTextRaw?: {
		boxWidth?: number;
		fontSize?: number;
	};
	aspectRatio: EditPlan["target"]["aspectRatio"];
	canvasSize: { width: number; height: number };
	timelineDuration: number;
}): CaptionQualityReport {
	const issues: CaptionQualityIssue[] = [];
	let minDuration: number | null = null;
	let maxDuration: number | null = null;
	let maxLineCount = 0;

	captions.forEach((caption, index) => {
		minDuration =
			minDuration === null
				? caption.duration
				: Math.min(minDuration, caption.duration);
		maxDuration =
			maxDuration === null
				? caption.duration
				: Math.max(maxDuration, caption.duration);

		if (
			caption.duration <
			CAPTION_QUALITY_MIN_DURATION_SECONDS -
				CAPTION_QUALITY_TIME_TOLERANCE_SECONDS
		) {
			addIssue({
				issues,
				issue: {
					code: "caption_too_short",
					path: `captions[${index}].duration`,
					message: "EditPlan caption duration is below the readable minimum.",
					captionIndex: index,
					evidence: {
						duration: caption.duration,
						minDuration: CAPTION_QUALITY_MIN_DURATION_SECONDS,
					},
				},
			});
		}
		if (
			caption.duration >
			CAPTION_QUALITY_MAX_DURATION_SECONDS +
				CAPTION_QUALITY_TIME_TOLERANCE_SECONDS
		) {
			addIssue({
				issues,
				issue: {
					code: "caption_too_long",
					path: `captions[${index}].duration`,
					message: "EditPlan caption duration exceeds the readable maximum.",
					captionIndex: index,
					evidence: {
						duration: caption.duration,
						maxDuration: CAPTION_QUALITY_MAX_DURATION_SECONDS,
					},
				},
			});
		}
		if (
			caption.startTime + caption.duration >
			timelineDuration + CAPTION_QUALITY_TIME_TOLERANCE_SECONDS
		) {
			addIssue({
				issues,
				issue: {
					code: "caption_outside_timeline",
					path: `captions[${index}]`,
					message: "EditPlan caption exceeds the generated timeline duration.",
					captionIndex: index,
					evidence: {
						captionEnd: roundMetric(caption.startTime + caption.duration),
						timelineDuration,
					},
				},
			});
		}

		const lineFit = auditCaptionLineFit({
			caption,
			index,
			captionStyle,
			captionTextRaw,
			aspectRatio,
			canvasSize,
		});
		maxLineCount = Math.max(maxLineCount, lineFit.lineCount);
		if (lineFit.issue) {
			addIssue({ issues, issue: lineFit.issue });
		}
	});

	const orderedCaptions = captions
		.map((caption, index) => ({ ...caption, index }))
		.sort((left, right) => left.startTime - right.startTime);
	for (let index = 1; index < orderedCaptions.length; index += 1) {
		const previous = orderedCaptions[index - 1];
		const current = orderedCaptions[index];
		if (!previous || !current) continue;
		const previousEnd = previous.startTime + previous.duration;
		if (
			previousEnd >
			current.startTime + CAPTION_QUALITY_TIME_TOLERANCE_SECONDS
		) {
			addIssue({
				issues,
				issue: {
					code: "caption_overlap",
					path: `captions[${current.index}].startTime`,
					message: "EditPlan captions must not overlap.",
					captionIndex: current.index,
					evidence: {
						previousCaptionIndex: previous.index,
						previousEnd: roundMetric(previousEnd),
						currentStart: current.startTime,
					},
				},
			});
		}
	}

	return {
		ok: issues.length === 0,
		issueCount: issues.length,
		issues,
		metrics: {
			captionCount: captions.length,
			minDuration: minDuration === null ? null : roundMetric(minDuration),
			maxDuration: maxDuration === null ? null : roundMetric(maxDuration),
			maxLineCount,
		},
	};
}
