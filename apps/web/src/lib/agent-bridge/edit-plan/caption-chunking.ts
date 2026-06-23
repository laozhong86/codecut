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
const POST_CUT_CAPTION_MAX_LINES = 2;
const LATIN_AVERAGE_GLYPH_WIDTH_FACTOR = 0.38;

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
	const maxReadableCharacters = containsCjk(normalizedText)
		? maxCharacters
		: maxCharacters * POST_CUT_CAPTION_MAX_LINES;
	const minimumParts = Math.max(
		1,
		Math.ceil(duration / POST_CUT_CAPTION_MAX_DURATION_SECONDS),
		Math.ceil(countCharacters(normalizedText) / maxReadableCharacters),
	);
	const chunks = splitCaptionTextIntoChunks({
		text: normalizedText,
		maxWidth: maxCharacters,
		minimumChunks: minimumParts,
		maxLines: POST_CUT_CAPTION_MAX_LINES,
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
