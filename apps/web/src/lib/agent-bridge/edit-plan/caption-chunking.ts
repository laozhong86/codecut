import type {
	EditPlan,
	EditPlanCaption,
	EditPlanCaptionStyle,
} from "./schema";
import { resolveCaptionStylePreset } from "./text-presets";

const POST_CUT_CAPTION_MAX_DURATION_SECONDS = 4;
const POST_CUT_CAPTION_MAX_LATIN_CHARS = 52;
const POST_CUT_CAPTION_MAX_CJK_CHARS = 8;
const CAPTION_MAX_LINES = 2;
const CAPTION_MIN_LAST_LINE_CHARACTERS = 3;
const LATIN_AVERAGE_GLYPH_WIDTH_FACTOR = 0.38;
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

type CaptionChunkingLayout = {
	captionStyle?: EditPlanCaptionStyle;
	aspectRatio?: EditPlan["target"]["aspectRatio"];
	canvasSize?: { width: number; height: number };
};

function roundCaptionSeconds(value: number): number {
	return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function countCharacters(text: string): number {
	return Array.from(text).length;
}

function containsCjk(text: string): boolean {
	return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
		text,
	);
}

function defaultCaptionCharacterLimit(text: string): number {
	return containsCjk(text)
		? POST_CUT_CAPTION_MAX_CJK_CHARS
		: POST_CUT_CAPTION_MAX_LATIN_CHARS;
}

function captionCharacterLimit({
	text,
	captionStyle,
	aspectRatio,
	canvasSize,
}: {
	text: string;
} & CaptionChunkingLayout): number {
	const defaultLimit = defaultCaptionCharacterLimit(text);
	if (!captionStyle || !aspectRatio || !canvasSize) return defaultLimit;
	const raw = resolveCaptionStylePreset({ captionStyle, aspectRatio });
	if (!raw.boxWidth || !raw.fontSize) return defaultLimit;
	const scaledBoxWidth = raw.boxWidth * (canvasSize.height / 90);
	const scaledFontSize = raw.fontSize * (canvasSize.height / 90);
	const averageGlyphWidth =
		scaledFontSize * (containsCjk(text) ? 1 : LATIN_AVERAGE_GLYPH_WIDTH_FACTOR);
	const layoutLimit = Math.floor(scaledBoxWidth / averageGlyphWidth);
	return Math.max(1, Math.min(defaultLimit, layoutLimit));
}

function splitByCharacters(text: string, maxCharacters: number): string[] {
	const characters = Array.from(text);
	const chunks: string[] = [];
	for (let index = 0; index < characters.length; index += maxCharacters) {
		chunks.push(characters.slice(index, index + maxCharacters).join(""));
	}
	return chunks;
}

function splitByBalancedCharacters(
	text: string,
	maxCharacters: number,
): string[] {
	const characters = Array.from(text);
	const partCount = Math.ceil(characters.length / maxCharacters);
	const chunks: string[] = [];
	for (let index = 0; index < partCount; index += 1) {
		const start = Math.round((characters.length * index) / partCount);
		const end = Math.round((characters.length * (index + 1)) / partCount);
		chunks.push(characters.slice(start, end).join(""));
	}
	return chunks;
}

function splitByCharacterLimit({
	text,
	maxCharacters,
}: {
	text: string;
	maxCharacters: number;
}): string[] {
	if (countCharacters(text) <= maxCharacters) return [text];
	if (!/\s/.test(text)) return splitByBalancedCharacters(text, maxCharacters);

	const chunks: string[] = [];
	let current = "";
	for (const word of text.split(/\s+/)) {
		const wordChunks =
			countCharacters(word) > maxCharacters
				? splitByCharacters(word, maxCharacters)
				: [word];
		for (const wordChunk of wordChunks) {
			const next = current ? `${current} ${wordChunk}` : wordChunk;
			if (current && countCharacters(next) > maxCharacters) {
				chunks.push(current);
				current = wordChunk;
				continue;
			}
			current = next;
		}
	}
	if (current) chunks.push(current);
	return chunks;
}

function isDecimalPoint(text: string, index: number): boolean {
	return /\d/.test(text[index - 1] ?? "") && /\d/.test(text[index + 1] ?? "");
}

function isAbbreviationPoint(text: string, index: number): boolean {
	const previous = text[index - 1] ?? "";
	const next = text[index + 1] ?? "";
	if (/[A-Za-z]/.test(previous) && (/[A-Za-z]/.test(next) || text[index - 2] === ".")) {
		return true;
	}
	const token = text.slice(0, index).match(/([A-Za-z]+)$/)?.[1]?.toLowerCase();
	return token ? COMMON_LATIN_ABBREVIATIONS.has(token) : false;
}

function validBoundary({
	text,
	index,
}: {
	text: string;
	index: number;
}): boolean {
	const left = text.slice(0, index + 1).trim();
	const right = text.slice(index + 1).trim();
	return left.length >= 2 && right.length >= 2;
}

function findNaturalBoundary({
	text,
	pattern,
}: {
	text: string;
	pattern: RegExp;
}): number | null {
	const matches = Array.from(text.matchAll(pattern))
		.map((match) =>
			match.index === undefined ? -1 : match.index + match[0].length - 1,
		)
		.filter((index) => index >= 0);
	if (matches.length === 0) return null;
	const midpoint = Math.floor(Array.from(text).length / 2);
	let best: number | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const index of matches) {
		const char = text[index];
		if (
			char === "." &&
			(isDecimalPoint(text, index) || isAbbreviationPoint(text, index))
		) {
			continue;
		}
		if (!validBoundary({ text, index })) continue;
		const distance = Math.abs(index + 1 - midpoint);
		if (distance < bestDistance) {
			best = index + 1;
			bestDistance = distance;
		}
	}
	return best;
}

function splitAtNaturalBoundary(text: string): string[] | null {
	const sentenceBoundary = findNaturalBoundary({
		text,
		pattern: /[。！？!?]|(?<!\d)\.(?!\d)/g,
	});
	if (sentenceBoundary !== null) {
		return [
			text.slice(0, sentenceBoundary).trim(),
			text.slice(sentenceBoundary).trim(),
		].filter(Boolean);
	}
	const clauseBoundary = findNaturalBoundary({
		text,
		pattern: /[，,；;：:]/g,
	});
	if (clauseBoundary !== null) {
		return [
			text.slice(0, clauseBoundary).trim(),
			text.slice(clauseBoundary).trim(),
		].filter(Boolean);
	}
	return null;
}

function captionLineCount({
	text,
	maxCharacters,
}: {
	text: string;
	maxCharacters: number;
}): { lineCount: number; lastLineCharacters: number } {
	const characters = Array.from(text);
	const lineCount = Math.max(1, Math.ceil(characters.length / maxCharacters));
	const lastLineCharacters =
		characters.length === 0
			? 0
			: characters.length - maxCharacters * (lineCount - 1);
	return { lineCount, lastLineCharacters };
}

function captionFitsReadability({
	text,
	maxCharacters,
}: {
	text: string;
	maxCharacters: number;
}): boolean {
	if (countCharacters(text) <= maxCharacters) return true;
	const { lineCount, lastLineCharacters } = captionLineCount({
		text,
		maxCharacters,
	});
	return (
		lineCount <= CAPTION_MAX_LINES &&
		(lineCount === 1 ||
			lastLineCharacters >= CAPTION_MIN_LAST_LINE_CHARACTERS)
	);
}

function splitByReadability({
	text,
	maxCharacters,
}: {
	text: string;
	maxCharacters: number;
}): string[] {
	const naturalSplit = splitAtNaturalBoundary(text);
	if (naturalSplit && countCharacters(text) > maxCharacters) {
		return naturalSplit.flatMap((part) =>
			splitByReadability({ text: part, maxCharacters }),
		);
	}
	if (captionFitsReadability({ text, maxCharacters })) return [text];
	const parts =
		naturalSplit ??
		splitByCharacterLimit({
			text,
			maxCharacters,
		});
	return parts.flatMap((part) =>
		splitByReadability({ text: part, maxCharacters }),
	);
}

function splitChunkOnce(chunk: string): string[] {
	const naturalSplit = splitAtNaturalBoundary(chunk);
	if (naturalSplit && naturalSplit.length > 1) return naturalSplit;
	if (countCharacters(chunk) <= 1) return [chunk];
	if (/\s/.test(chunk)) {
		const words = chunk.split(/\s+/);
		if (words.length > 1) {
			const midpoint = Math.ceil(words.length / 2);
			return [
				words.slice(0, midpoint).join(" "),
				words.slice(midpoint).join(" "),
			].filter(Boolean);
		}
	}

	const characters = Array.from(chunk);
	const midpoint = Math.ceil(characters.length / 2);
	return [
		characters.slice(0, midpoint).join(""),
		characters.slice(midpoint).join(""),
	].filter(Boolean);
}

function splitToMinimumParts({
	chunks,
	minimumParts,
}: {
	chunks: string[];
	minimumParts: number;
}): string[] {
	const result = [...chunks];
	while (result.length < minimumParts) {
		let longestIndex = -1;
		let longestLength = 1;
		for (let index = 0; index < result.length; index += 1) {
			const length = countCharacters(result[index]);
			if (length > longestLength) {
				longestIndex = index;
				longestLength = length;
			}
		}
		if (longestIndex === -1) break;
		const split = splitChunkOnce(result[longestIndex]);
		if (split.length < 2) break;
		result.splice(longestIndex, 1, ...split);
	}
	return result;
}

export function buildPostCutCaptionEntries({
	text,
	startTime,
	endTime,
	captionStyle,
	aspectRatio,
	canvasSize,
}: {
	text: string;
	startTime: number;
	endTime: number;
} & CaptionChunkingLayout): EditPlanCaption[] {
	const normalizedText = text.trim().replace(/\s+/g, " ");
	const roundedStart = roundCaptionSeconds(startTime);
	const roundedEnd = roundCaptionSeconds(endTime);
	const duration = roundCaptionSeconds(roundedEnd - roundedStart);
	if (!normalizedText || duration <= 0) return [];

	const maxCharacters = captionCharacterLimit({
		text: normalizedText,
		captionStyle,
		aspectRatio,
		canvasSize,
	});
	const maxReadableCharacters = maxCharacters * CAPTION_MAX_LINES;
	const minimumParts = Math.max(
		1,
		Math.ceil(duration / POST_CUT_CAPTION_MAX_DURATION_SECONDS),
		Math.ceil(countCharacters(normalizedText) / maxReadableCharacters),
	);
	const chunks = splitToMinimumParts({
		chunks: splitByReadability({
			text: normalizedText,
			maxCharacters,
		}),
		minimumParts,
	});

	let cursor = roundedStart;
	return chunks.flatMap((chunk, index) => {
		const nextEnd =
			index === chunks.length - 1
				? roundedEnd
				: roundCaptionSeconds(
						roundedStart + (duration * (index + 1)) / chunks.length,
					);
		const chunkDuration = roundCaptionSeconds(nextEnd - cursor);
		if (chunkDuration <= 0) return [];
		const caption = {
			text: chunk,
			startTime: cursor,
			duration: chunkDuration,
		};
		cursor = nextEnd;
		return [caption];
	});
}
