import { splitCaptionTextIntoChunks } from "@/lib/caption-line-breaking";
import type {
	EditPlan,
	EditPlanCaption,
	EditPlanCaptionStyle,
} from "./schema";
import { resolveCaptionStylePreset } from "./text-presets";

const POST_CUT_CAPTION_MAX_DURATION_SECONDS = 4;
const POST_CUT_CAPTION_MAX_LATIN_CHARS = 52;
const POST_CUT_CAPTION_MAX_CJK_CHARS = 8;
export const POST_CUT_CAPTION_MAX_LINES = 2;
const LATIN_AVERAGE_GLYPH_WIDTH_FACTOR = 0.38;
const CAPTION_PHRASE_BREAK_PUNCTUATION_RE = /[，。！？、；：,.!?;:]/u;
const CAPTION_DISPLAY_TRAILING_PUNCTUATION_RE = /[，。；：、,.;:]/u;
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

function captionDisplayWidth(text: string): number {
	return Array.from(text).reduce((total, char) => {
		if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char)) {
			return total + 1;
		}
		if (/[0-9.,%$￥¥㎡²/-]/u.test(char)) {
			return total + 0.5;
		}
		return total + 1;
	}, 0);
}

function containsCjk(text: string): boolean {
	return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
		text,
	);
}

function isProtectedDecimalPoint(text: string, index: number): boolean {
	return /\d/u.test(text[index - 1] ?? "") && /\d/u.test(text[index + 1] ?? "");
}

function isProtectedThousandsComma(text: string, index: number): boolean {
	return /\d/u.test(text[index - 1] ?? "") && /\d/u.test(text[index + 1] ?? "");
}

function isProtectedAbbreviationPoint(text: string, index: number): boolean {
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

function isProtectedPunctuation(text: string, index: number): boolean {
	const char = text[index];
	if (char === ".") {
		return (
			isProtectedDecimalPoint(text, index) ||
			isProtectedAbbreviationPoint(text, index)
		);
	}
	if (char === ",") return isProtectedThousandsComma(text, index);
	return false;
}

function splitCaptionTextIntoPhraseSegments(text: string): string[] {
	const segments: string[] = [];
	let current = "";
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index] ?? "";
		current += char;
		if (
			CAPTION_PHRASE_BREAK_PUNCTUATION_RE.test(char) &&
			!isProtectedPunctuation(text, index)
		) {
			const segment = current.trim();
			if (segment) segments.push(segment);
			current = "";
		}
	}
	const finalSegment = current.trim();
	if (finalSegment) segments.push(finalSegment);
	return segments.length ? segments : [text];
}

function stripCaptionDisplayTrailingPunctuation(text: string): string {
	let cleaned = text.trim();
	while (cleaned.length > 0) {
		const index = cleaned.length - 1;
		const char = cleaned[index];
		if (!char || !CAPTION_DISPLAY_TRAILING_PUNCTUATION_RE.test(char)) break;
		if (isProtectedPunctuation(cleaned, index)) break;
		cleaned = cleaned.slice(0, index).trimEnd();
	}
	return cleaned;
}

function defaultCaptionCharacterLimit(text: string): number {
	return containsCjk(text)
		? POST_CUT_CAPTION_MAX_CJK_CHARS
		: POST_CUT_CAPTION_MAX_LATIN_CHARS;
}

export function computeCaptionCharacterLimit({
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

	const maxCharacters = computeCaptionCharacterLimit({
		text: normalizedText,
		captionStyle,
		aspectRatio,
		canvasSize,
	});
	const maxReadableCharacters = containsCjk(normalizedText)
		? maxCharacters
		: maxCharacters * POST_CUT_CAPTION_MAX_LINES;
	const minimumParts = Math.max(
		1,
		Math.ceil(duration / POST_CUT_CAPTION_MAX_DURATION_SECONDS),
		Math.ceil(captionDisplayWidth(normalizedText) / maxReadableCharacters),
	);
	const phraseSegments = splitCaptionTextIntoPhraseSegments(normalizedText)
		.map(stripCaptionDisplayTrailingPunctuation)
		.filter(Boolean);
	if (phraseSegments.length === 0) return [];
	const phrasePartCounts = phraseSegments.map((phrase) =>
		Math.max(1, Math.ceil(captionDisplayWidth(phrase) / maxReadableCharacters)),
	);
	while (
		phrasePartCounts.reduce((total, count) => total + count, 0) < minimumParts
	) {
		const widestPhraseIndex = phraseSegments.reduce((widestIndex, phrase, index) => {
			const currentWidth = captionDisplayWidth(phrase) / phrasePartCounts[index];
			const widestWidth =
				captionDisplayWidth(phraseSegments[widestIndex]) /
				phrasePartCounts[widestIndex];
			return currentWidth > widestWidth ? index : widestIndex;
		}, 0);
		phrasePartCounts[widestPhraseIndex] += 1;
	}
	const chunks = phraseSegments.flatMap((phrase, index) =>
		splitCaptionTextIntoChunks({
			text: phrase,
			maxWidth: maxCharacters,
			minimumChunks: phrasePartCounts[index],
			maxLines: POST_CUT_CAPTION_MAX_LINES,
			measureText: captionDisplayWidth,
		}),
	);
	const displayChunks = chunks
		.map(stripCaptionDisplayTrailingPunctuation)
		.filter(Boolean);

	let cursor = roundedStart;
	return displayChunks.flatMap((chunk, index) => {
		const nextEnd =
			index === displayChunks.length - 1
				? roundedEnd
				: roundCaptionSeconds(
						roundedStart + (duration * (index + 1)) / displayChunks.length,
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
