import type { EditPlanCaption } from "./schema";

const POST_CUT_CAPTION_MAX_DURATION_SECONDS = 4;
const POST_CUT_CAPTION_MAX_LATIN_CHARS = 52;
const POST_CUT_CAPTION_MAX_CJK_CHARS = 22;

function roundCaptionSeconds(value: number): number {
	return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function countCharacters(text: string): number {
	return Array.from(text).length;
}

function captionCharacterLimit(text: string): number {
	return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
		text,
	)
		? POST_CUT_CAPTION_MAX_CJK_CHARS
		: POST_CUT_CAPTION_MAX_LATIN_CHARS;
}

function splitByCharacters(text: string, maxCharacters: number): string[] {
	const characters = Array.from(text);
	const chunks: string[] = [];
	for (let index = 0; index < characters.length; index += maxCharacters) {
		chunks.push(characters.slice(index, index + maxCharacters).join(""));
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
	if (!/\s/.test(text)) return splitByCharacters(text, maxCharacters);

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

function splitChunkOnce(chunk: string): string[] {
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
}: {
	text: string;
	startTime: number;
	endTime: number;
}): EditPlanCaption[] {
	const normalizedText = text.trim().replace(/\s+/g, " ");
	const roundedStart = roundCaptionSeconds(startTime);
	const roundedEnd = roundCaptionSeconds(endTime);
	const duration = roundCaptionSeconds(roundedEnd - roundedStart);
	if (!normalizedText || duration <= 0) return [];

	const maxCharacters = captionCharacterLimit(normalizedText);
	const minimumParts = Math.max(
		1,
		Math.ceil(duration / POST_CUT_CAPTION_MAX_DURATION_SECONDS),
		Math.ceil(countCharacters(normalizedText) / maxCharacters),
	);
	const chunks = splitToMinimumParts({
		chunks: splitByCharacterLimit({
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
