import type { SpokenScriptData } from "@/services/storage/types";

const ASCII_SENTENCE_END = new Set([".", "!", "?"]);
const CJK_SENTENCE_END = new Set(["。", "！", "？"]);
const CLOSING_PUNCTUATION = new Set(['"', "'", ")", "]", "}", "”", "’"]);

function isDigit(value: string | undefined): boolean {
	return typeof value === "string" && value >= "0" && value <= "9";
}

function findSegmentEnd({ text, index }: { text: string; index: number }) {
	let end = index;
	while (
		end + 1 < text.length &&
		(ASCII_SENTENCE_END.has(text[end + 1]) ||
			CJK_SENTENCE_END.has(text[end + 1]) ||
			CLOSING_PUNCTUATION.has(text[end + 1]))
	) {
		end += 1;
	}
	return end;
}

function shouldSplitAt({ text, index }: { text: string; index: number }) {
	const char = text[index];
	if (char === "." && isDigit(text[index - 1]) && isDigit(text[index + 1])) {
		return false;
	}
	if (CJK_SENTENCE_END.has(char)) {
		return true;
	}
	if (!ASCII_SENTENCE_END.has(char)) {
		return false;
	}
	const segmentEnd = findSegmentEnd({ text, index });
	return segmentEnd === text.length - 1 || /\s/.test(text[segmentEnd + 1] ?? "");
}

export function splitTtsScriptIntoCaptionLines({ text }: { text: string }) {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) {
		throw new Error("TTS spokenScript text is required.");
	}

	const captions: string[] = [];
	let segmentStart = 0;
	for (let index = 0; index < normalized.length; index += 1) {
		if (!shouldSplitAt({ text: normalized, index })) continue;
		const segmentEnd = findSegmentEnd({ text: normalized, index });
		const caption = normalized.slice(segmentStart, segmentEnd + 1).trim();
		if (caption) {
			captions.push(caption);
		}
		segmentStart = segmentEnd + 1;
		while (normalized[segmentStart] === " ") {
			segmentStart += 1;
		}
		index = segmentStart - 1;
	}

	const tail = normalized.slice(segmentStart).trim();
	if (tail) {
		captions.push(tail);
	}
	if (captions.length === 0) {
		throw new Error("TTS spokenScript captions are required.");
	}
	return captions;
}

function normalizeCaptionLines({
	text,
	captionLines,
}: {
	text: string;
	captionLines?: string[];
}) {
	if (captionLines === undefined) {
		return splitTtsScriptIntoCaptionLines({ text });
	}
	const captions = captionLines
		.map((caption) => caption.replace(/\s+/g, " ").trim())
		.filter(Boolean);
	if (captions.length === 0) {
		throw new Error("TTS spokenScript captions are required.");
	}
	return captions;
}

function normalizeProtectedTerms({
	text,
	captions,
	protectedTerms,
}: {
	text: string;
	captions: string[];
	protectedTerms?: string[];
}) {
	if (protectedTerms === undefined) {
		return undefined;
	}
	const normalizedTerms = protectedTerms
		.map((term) => term.trim())
		.filter(Boolean);
	const captionText = captions.join(" ");
	for (const term of normalizedTerms) {
		if (!text.includes(term) || !captionText.includes(term)) {
			throw new Error(`TTS spokenScript is missing protected term '${term}'.`);
		}
	}
	return normalizedTerms.length > 0 ? normalizedTerms : undefined;
}

export function buildTtsSpokenScript({
	text,
	captionLines,
	protectedTerms,
	provider,
	providerTaskId,
}: {
	text: string;
	captionLines?: string[];
	protectedTerms?: string[];
	provider?: SpokenScriptData["provider"];
	providerTaskId?: string;
}): SpokenScriptData {
	const normalizedText = text.replace(/\s+/g, " ").trim();
	if (!normalizedText) {
		throw new Error("TTS spokenScript text is required.");
	}
	const captions = normalizeCaptionLines({
		text: normalizedText,
		captionLines,
	});
	const normalizedProtectedTerms = normalizeProtectedTerms({
		text: normalizedText,
		captions,
		protectedTerms,
	});

	return {
		source: "tts",
		text: normalizedText,
		captions,
		...(normalizedProtectedTerms
			? { protectedTerms: normalizedProtectedTerms }
			: {}),
		...(provider ? { provider } : {}),
		...(providerTaskId ? { providerTaskId } : {}),
	};
}

export function parseSpokenScriptPayload({
	value,
}: {
	value: unknown;
}):
	| { success: true; spokenScript?: SpokenScriptData }
	| { success: false; message: string } {
	if (value === undefined) {
		return { success: true };
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return { success: false, message: "spokenScript must be an object." };
	}
	const candidate = value as Record<string, unknown>;
	if (candidate.source !== "tts") {
		return { success: false, message: "spokenScript.source must be 'tts'." };
	}
	if (typeof candidate.text !== "string") {
		return { success: false, message: "spokenScript.text is required." };
	}
	if (
		!Array.isArray(candidate.captions) ||
		!candidate.captions.every((caption) => typeof caption === "string")
	) {
		return {
			success: false,
			message: "spokenScript.captions must be an array of strings.",
		};
	}
	if (
		candidate.protectedTerms !== undefined &&
		(!Array.isArray(candidate.protectedTerms) ||
			!candidate.protectedTerms.every((term) => typeof term === "string"))
	) {
		return {
			success: false,
			message: "spokenScript.protectedTerms must be an array of strings.",
		};
	}
	if (
		candidate.provider !== undefined &&
		candidate.provider !== "imported-tts" &&
		candidate.provider !== "runninghub-voice-design" &&
		candidate.provider !== "runninghub-voice-clone"
	) {
		return {
			success: false,
			message: "spokenScript.provider is invalid.",
		};
	}
	if (
		candidate.providerTaskId !== undefined &&
		typeof candidate.providerTaskId !== "string"
	) {
		return {
			success: false,
			message: "spokenScript.providerTaskId must be a string.",
		};
	}
	const provider = candidate.provider as SpokenScriptData["provider"] | undefined;
	const providerTaskId = candidate.providerTaskId as string | undefined;

	try {
		return {
			success: true,
			spokenScript: buildTtsSpokenScript({
				text: candidate.text,
				captionLines: candidate.captions,
				protectedTerms: candidate.protectedTerms,
				provider,
				providerTaskId,
			}),
		};
	} catch (error) {
		return {
			success: false,
			message:
				error instanceof Error ? error.message : "Invalid spokenScript payload.",
		};
	}
}
