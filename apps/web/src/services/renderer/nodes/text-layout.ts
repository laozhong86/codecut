import type { TextRichSpan, TextStroke } from "@/types/timeline";

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

	const lines: TextLayoutLine[] = [];
	let currentRuns: TextLayoutRun[] = [];
	let currentText = "";
	let currentWidth = 0;
	const chars = Array.from(content);

	const pushLine = () => {
		lines.push({ runs: currentRuns, width: currentWidth });
		currentRuns = [];
		currentText = "";
		currentWidth = 0;
	};

	for (let index = 0; index < chars.length; index += 1) {
		const char = chars[index];
		if (char === "\n") {
			pushLine();
			continue;
		}

		const style = getStyleAt({ index, richSpans });
		const nextText = currentText + char;
		const nextWidth = measureText(nextText, {});
		if (
			maxWidth !== undefined &&
			maxWidth > 0 &&
			nextWidth > maxWidth &&
			currentText !== ""
		) {
			pushLine();
		}

		appendChar({ runs: currentRuns, char, style });
		currentText += char;
		currentWidth = measureText(currentText, {});
	}

	if (currentRuns.length > 0 || lines.length === 0) {
		pushLine();
	}

	return { lines };
}
