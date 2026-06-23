export interface CaptionLineRange {
	start: number;
	end: number;
	text: string;
	width: number;
}

type MeasureText = (text: string) => number;
type MeasureRange = (start: number, end: number, text: string) => number;

type SegmenterSegment = {
	segment: string;
	isWordLike?: boolean;
};

type SegmenterInstance = {
	segment(text: string): Iterable<SegmenterSegment>;
};

type SegmenterConstructor = new (
	locale: string,
	options: { granularity: "word" },
) => SegmenterInstance;

const CJK_RE =
	/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const PUNCTUATION_RE = /[，。！？、；：,.!?;:]/u;
const LINE_EPSILON = 0.000001;
const COMMON_LATIN_ABBREVIATIONS = new Set([
	"co",
	"corp",
	"dr",
	"etc",
	"fig",
	"inc",
	"jr",
	"ltd",
	"mr",
	"mrs",
	"ms",
	"no",
	"prof",
	"sr",
	"st",
	"vs",
]);

function characters(text: string): string[] {
	return Array.from(text);
}

function characterCount(text: string): number {
	return characters(text).length;
}

function hasCjk(text: string): boolean {
	return CJK_RE.test(text);
}

function isShortCjkLine(text: string): boolean {
	return hasCjk(text) && characterCount(text.trim()) <= 2;
}

function isDecimalPoint(text: string, index: number): boolean {
	return /\d/u.test(text[index - 1] ?? "") && /\d/u.test(text[index + 1] ?? "");
}

function isAbbreviationPoint(text: string, index: number): boolean {
	const previous = text[index - 1] ?? "";
	const next = text[index + 1] ?? "";
	if (
		/[A-Za-z]/u.test(previous) &&
		(/[A-Za-z]/u.test(next) || text[index - 2] === ".")
	) {
		return true;
	}
	const token = text.slice(0, index).match(/([A-Za-z]+)$/u)?.[1]?.toLowerCase();
	return token ? COMMON_LATIN_ABBREVIATIONS.has(token) : false;
}

function canBreakAfterPunctuation({
	text,
	index,
}: {
	text: string;
	index: number;
}): boolean {
	const char = text[index];
	return char !== "." || (!isDecimalPoint(text, index) && !isAbbreviationPoint(text, index));
}

function setBreakpointPenalty({
	breakpoints,
	index,
	penalty,
}: {
	breakpoints: Map<number, number>;
	index: number;
	penalty: number;
}): void {
	const previous = breakpoints.get(index);
	if (previous === undefined || penalty < previous) {
		breakpoints.set(index, penalty);
	}
}

function segmenterForLocale(locale: string): SegmenterInstance {
	const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor })
		.Segmenter;
	if (!Segmenter) {
		throw new Error("Intl.Segmenter is required for CJK caption breaking.");
	}
	return new Segmenter(locale, { granularity: "word" });
}

function collectBreakpointPenalties({
	text,
	locale,
}: {
	text: string;
	locale: string;
}): Map<number, number> {
	const chars = characters(text);
	const breakpoints = new Map<number, number>();
	const cjk = hasCjk(text);

	if (cjk) {
		let cursor = 0;
		for (const segment of segmenterForLocale(locale).segment(text)) {
			cursor += characterCount(segment.segment);
			if (cursor > 0 && cursor < chars.length) {
				setBreakpointPenalty({
					breakpoints,
					index: cursor,
					penalty: segment.isWordLike === false ? 3 : 0,
				});
			}
		}
	}

	for (let index = 1; index < chars.length; index += 1) {
		const previous = chars[index - 1];
		const next = chars[index];
		if (/\s/u.test(previous)) {
			setBreakpointPenalty({ breakpoints, index, penalty: 2 });
		}
		if (
			PUNCTUATION_RE.test(previous) &&
			canBreakAfterPunctuation({ text, index: index - 1 })
		) {
			setBreakpointPenalty({ breakpoints, index, penalty: -20 });
		}
		const fallbackPenalty = PUNCTUATION_RE.test(next) ? 32 : 18;
		setBreakpointPenalty({ breakpoints, index, penalty: fallbackPenalty });
	}

	return breakpoints;
}

function lineRange({
	chars,
	start,
	end,
	measureRange,
}: {
	chars: string[];
	start: number;
	end: number;
	measureRange: MeasureRange;
}): CaptionLineRange {
	const text = chars.slice(start, end).join("");
	return {
		start,
		end,
		text,
		width: measureRange(start, end, text),
	};
}

function breakParagraphIntoRanges({
	text,
	offset,
	maxWidth,
	measureRange,
	maxLines,
	strictCjkOrphanLastLine,
	locale,
}: {
	text: string;
	offset: number;
	maxWidth: number | undefined;
	measureRange: MeasureRange;
	maxLines: number | undefined;
	strictCjkOrphanLastLine: boolean;
	locale: string;
}): CaptionLineRange[] {
	const chars = characters(text);
	if (chars.length === 0) {
		return [{ start: offset, end: offset, text: "", width: 0 }];
	}
	if (maxWidth === undefined || maxWidth <= 0) {
		return [
			{
				...lineRange({
					chars,
					start: 0,
					end: chars.length,
					measureRange,
				}),
				start: offset,
				end: offset + chars.length,
			},
		];
	}

	const breakpoints = collectBreakpointPenalties({ text, locale });
	const lineLimit = maxLines ?? chars.length;
	const cjk = hasCjk(text);
	const memo = new Map<string, { cost: number; ranges: CaptionLineRange[] } | null>();

	const solve = (
		start: number,
		linesUsed: number,
	): { cost: number; ranges: CaptionLineRange[] } | null => {
		if (start === chars.length) return { cost: 0, ranges: [] };
		if (linesUsed >= lineLimit) return null;
		const key = `${start}:${linesUsed}`;
		if (memo.has(key)) return memo.get(key) ?? null;

		let best: { cost: number; ranges: CaptionLineRange[] } | null = null;
		for (let end = start + 1; end <= chars.length; end += 1) {
			if (end < chars.length && !breakpoints.has(end)) continue;
			const range = lineRange({ chars, start, end, measureRange });
			if (range.width > maxWidth + LINE_EPSILON && end > start + 1) {
				break;
			}
			const isLastLine = end === chars.length;
			const hasPreviousLine = linesUsed > 0;
			if (
				isLastLine &&
				hasPreviousLine &&
				cjk &&
				strictCjkOrphanLastLine &&
				isShortCjkLine(range.text)
			) {
				continue;
			}
			const rest = solve(end, linesUsed + 1);
			if (!rest) continue;

			const widthSlack = Math.max(0, maxWidth - range.width) / maxWidth;
			const widthCost = widthSlack * widthSlack * 10;
			const breakCost = end === chars.length ? 0 : (breakpoints.get(end) ?? 18);
			const lineContinuationCost = end === chars.length ? 0 : 40;
			const orphanCost =
				isLastLine &&
				hasPreviousLine &&
				cjk &&
				isShortCjkLine(range.text)
					? 100_000
					: 0;
			const cost =
				widthCost + breakCost + lineContinuationCost + orphanCost + rest.cost;
			if (!best || cost < best.cost) {
				best = { cost, ranges: [range, ...rest.ranges] };
			}
		}

		memo.set(key, best);
		return best;
	};

	const result = solve(0, 0);
	if (!result) {
		throw new Error("Caption text cannot be broken within the line limits.");
	}
	return result.ranges.map((range) => ({
		...range,
		start: offset + range.start,
		end: offset + range.end,
	}));
}

export function breakCaptionTextIntoLineRanges({
	text,
	maxWidth,
	measureText,
	measureRange,
	maxLines,
	strictCjkOrphanLastLine = false,
	locale = "zh",
}: {
	text: string;
	maxWidth: number | undefined;
	measureText?: MeasureText;
	measureRange?: MeasureRange;
	maxLines?: number;
	strictCjkOrphanLastLine?: boolean;
	locale?: string;
}): CaptionLineRange[] {
	const chars = characters(text);
	const measure =
		measureRange ??
		((start: number, end: number, lineText: string) =>
			measureText ? measureText(lineText) : end - start);
	const ranges: CaptionLineRange[] = [];
	let paragraphStart = 0;

	for (let index = 0; index <= chars.length; index += 1) {
		if (index < chars.length && chars[index] !== "\n") continue;
		const paragraph = chars.slice(paragraphStart, index).join("");
		if (paragraph === "" && index === chars.length && chars[index - 1] === "\n") {
			break;
		}
		ranges.push(
			...breakParagraphIntoRanges({
				text: paragraph,
				offset: paragraphStart,
				maxWidth,
				measureRange: (start, end, lineText) =>
					measure(paragraphStart + start, paragraphStart + end, lineText),
				maxLines,
				strictCjkOrphanLastLine,
				locale,
			}),
		);
		paragraphStart = index + 1;
	}

	return ranges;
}

export function breakCaptionTextIntoLines(
	options: Parameters<typeof breakCaptionTextIntoLineRanges>[0],
): string[] {
	return breakCaptionTextIntoLineRanges(options).map((range) => range.text);
}

export function splitCaptionTextIntoChunks({
	text,
	maxWidth,
	minimumChunks,
	maxLines = 2,
	measureText,
	locale = "zh",
}: {
	text: string;
	maxWidth: number;
	minimumChunks: number;
	maxLines?: number;
	measureText?: MeasureText;
	locale?: string;
}): string[] {
	const trimmedText = text.trim();
	if (!trimmedText) return [];
	const chars = characters(trimmedText);
	const widthMeasure = measureText ?? ((value: string) => characterCount(value));
	const breakpoints = collectBreakpointPenalties({ text: trimmedText, locale });
	const cjk = hasCjk(trimmedText);
	const startPartCount = Math.max(1, minimumChunks);
	const maxChunkWidth = cjk ? maxWidth : maxWidth * maxLines;

	for (
		let partCount = startPartCount;
		partCount <= chars.length;
		partCount += 1
	) {
		const targetLength = chars.length / partCount;
		const memo = new Map<string, { cost: number; chunks: string[] } | null>();

		const solve = (
			start: number,
			partsRemaining: number,
		): { cost: number; chunks: string[] } | null => {
			if (partsRemaining === 0) {
				return start === chars.length ? { cost: 0, chunks: [] } : null;
			}
			const key = `${start}:${partsRemaining}`;
			if (memo.has(key)) return memo.get(key) ?? null;
			let best: { cost: number; chunks: string[] } | null = null;
			const minEnd = start + 1;
			const maxEnd = chars.length - (partsRemaining - 1);

			for (let end = minEnd; end <= maxEnd; end += 1) {
				if (end < chars.length && !breakpoints.has(end)) continue;
				const chunk = chars.slice(start, end).join("").trim();
				if (!chunk) continue;
				if (
					cjk &&
					chars.length > 2 &&
					isShortCjkLine(chunk)
				) {
					continue;
				}
				if (widthMeasure(chunk) > maxChunkWidth) {
					continue;
				}
				const rest = solve(end, partsRemaining - 1);
				if (!rest) continue;

				const lengthSlack = Math.abs(characterCount(chunk) - targetLength);
				const balanceCost =
					(lengthSlack / Math.max(1, targetLength)) *
					(lengthSlack / Math.max(1, targetLength)) *
					8;
				const breakCost = end === chars.length ? 0 : (breakpoints.get(end) ?? 18);
				const cost = balanceCost + breakCost + rest.cost;
				if (!best || cost < best.cost) {
					best = { cost, chunks: [chunk, ...rest.chunks] };
				}
			}

			memo.set(key, best);
			return best;
		};

		const result = solve(0, partCount);
		if (result) return result.chunks;
	}

	throw new Error("Caption text cannot be split into readable timed captions.");
}
