import type { TextRichSpan, TextStroke } from "@/types/timeline";
import { breakCaptionTextIntoLineRanges } from "@/lib/caption-line-breaking";

export interface TextRunStyle {
	color?: string;
	fontScale?: number;
	fontWeight?: "normal" | "bold";
	fontStyle?: "normal" | "italic";
	stroke?: TextStroke;
}

export interface TextLayoutRun {
	text: string;
	style: TextRunStyle;
}

export interface TextLayoutLine {
	runs: TextLayoutRun[];
	width: number;
}

export interface TextLayout {
	lines: TextLayoutLine[];
}

export function getTextLayoutLineHeightScale(line: TextLayoutLine): number {
	return Math.max(1, ...line.runs.map((run) => run.style.fontScale ?? 1));
}

export function getTextLayoutHeight({
	lines,
	lineHeight,
}: {
	lines: TextLayoutLine[];
	lineHeight: number;
}): number {
	return lines.reduce(
		(total, line) => total + lineHeight * getTextLayoutLineHeightScale(line),
		0,
	);
}

function sameStyle(a: TextRunStyle, b: TextRunStyle): boolean {
	return (
		a.color === b.color &&
		a.fontScale === b.fontScale &&
		a.fontWeight === b.fontWeight &&
		a.fontStyle === b.fontStyle &&
		a.stroke?.color === b.stroke?.color &&
		a.stroke?.width === b.stroke?.width
	);
}

function spanToStyle(span: TextRichSpan): TextRunStyle {
	return {
		...(span.color !== undefined ? { color: span.color } : {}),
		...(span.fontScale !== undefined ? { fontScale: span.fontScale } : {}),
		...(span.fontWeight !== undefined ? { fontWeight: span.fontWeight } : {}),
		...(span.fontStyle !== undefined ? { fontStyle: span.fontStyle } : {}),
		...(span.stroke !== undefined ? { stroke: span.stroke } : {}),
	};
}

export function validateTextRichSpans({
	content,
	richSpans,
}: {
	content: string;
	richSpans: TextRichSpan[];
}): void {
	const length = Array.from(content).length;
	let previousEnd = 0;

	for (const span of richSpans) {
		if (!Number.isInteger(span.start) || !Number.isInteger(span.end)) {
			throw new Error("Text rich span indexes must be integers.");
		}
		if (span.start < 0 || span.end > length || span.end <= span.start) {
			throw new Error("Text rich span range is out of bounds.");
		}
		if (span.start < previousEnd) {
			throw new Error("Text rich spans must be sorted and non-overlapping.");
		}
		previousEnd = span.end;
	}
}

export function sanitizeTextRichSpansForContent({
	content,
	richSpans,
}: {
	content: string;
	richSpans: TextRichSpan[];
}): TextRichSpan[] {
	const length = Array.from(content).length;

	return richSpans.flatMap((span) => {
		const end = Math.min(span.end, length);
		if (span.start < 0 || span.start >= end) {
			return [];
		}

		return [{ ...span, end }];
	});
}

function getStyleAt({
	index,
	richSpans,
}: {
	index: number;
	richSpans: TextRichSpan[];
}): TextRunStyle {
	const span = richSpans.find(
		(candidate) => index >= candidate.start && index < candidate.end,
	);
	return span ? spanToStyle(span) : {};
}

function appendChar({
	runs,
	char,
	style,
}: {
	runs: TextLayoutRun[];
	char: string;
	style: TextRunStyle;
}): void {
	const lastRun = runs.at(-1);
	if (lastRun && sameStyle(lastRun.style, style)) {
		lastRun.text += char;
		return;
	}
	runs.push({ text: char, style });
}

function measureStyledRange({
	chars,
	start,
	end,
	richSpans,
	measureText,
}: {
	chars: string[];
	start: number;
	end: number;
	richSpans: TextRichSpan[];
	measureText: (text: string, style: TextRunStyle) => number;
}): number {
	let width = 0;
	let currentText = "";
	let currentStyle: TextRunStyle | undefined;
	const flush = () => {
		if (!currentText || !currentStyle) return;
		width += measureText(currentText, currentStyle);
		currentText = "";
		currentStyle = undefined;
	};

	for (let index = start; index < end; index += 1) {
		const style = getStyleAt({ index, richSpans });
		if (currentStyle && !sameStyle(currentStyle, style)) {
			flush();
		}
		currentStyle = style;
		currentText += chars[index];
	}
	flush();
	return width;
}

function buildRunsForRange({
	chars,
	start,
	end,
	richSpans,
}: {
	chars: string[];
	start: number;
	end: number;
	richSpans: TextRichSpan[];
}): TextLayoutRun[] {
	const runs: TextLayoutRun[] = [];
	for (let index = start; index < end; index += 1) {
		appendChar({
			runs,
			char: chars[index],
			style: getStyleAt({ index, richSpans }),
		});
	}
	return runs;
}

export function createTextLayout({
	content,
	richSpans,
	maxWidth,
	measureText,
}: {
	content: string;
	richSpans: TextRichSpan[];
	maxWidth: number | undefined;
	measureText: (text: string, style: TextRunStyle) => number;
}): TextLayout {
	validateTextRichSpans({ content, richSpans });

	const chars = Array.from(content);
	const ranges = breakCaptionTextIntoLineRanges({
		text: content,
		maxWidth,
		measureRange: (start, end) =>
			measureStyledRange({ chars, start, end, richSpans, measureText }),
		strictCjkOrphanLastLine: false,
	});
	const lines: TextLayoutLine[] = ranges.map((range) => ({
		width: range.width,
		runs: buildRunsForRange({
			chars,
			start: range.start,
			end: range.end,
			richSpans,
		}),
	}));

	return { lines };
}
