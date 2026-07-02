export type NetworkMaterialSearchTextSource =
	| "voiceoverScript"
	| "spokenScript"
	| "asrTranscript";

export interface NetworkMaterialSearchTermPromptInput {
	voiceoverScript?: string;
	spokenScript?: {
		text?: string;
		captions?: string[];
	};
	asrTranscript?: {
		text?: string;
		segments?: Array<{
			text: string;
			start: number;
			end: number;
		}>;
	};
	maxTerms?: number;
}

export interface NetworkMaterialSearchTermPrompt {
	source: NetworkMaterialSearchTextSource;
	sourceText: string;
	prompt: string;
	maxTerms: number;
}

export function buildNetworkMaterialSearchTermPrompt({
	voiceoverScript,
	spokenScript,
	asrTranscript,
	maxTerms = 8,
}: NetworkMaterialSearchTermPromptInput): NetworkMaterialSearchTermPrompt {
	const source = selectSearchTextSource({
		voiceoverScript,
		spokenScript,
		asrTranscript,
	});
	const boundedMaxTerms = normalizeMaxTerms(maxTerms);
	return {
		...source,
		maxTerms: boundedMaxTerms,
		prompt: [
			"# Role: Video Search Terms Generator",
			"",
			"Generate chronological stock-video search terms that follow the order of topics in the voiceover text.",
			"",
			"Constraints:",
			`1. Return exactly one json-array of strings with 1-${boundedMaxTerms} items.`,
			"2. Each term must be 1-3 English words.",
			"3. Keep terms in the same order as the narration; earlier terms describe earlier visual moments.",
			"4. Use english search terms only.",
			"5. Do not include explanations, markdown, numbering, or the script.",
			"",
			"Output example:",
			'["startup office", "mobile app", "growth chart"]',
			"",
			"Voiceover text:",
			source.sourceText,
		].join("\n"),
	};
}

export function parseNetworkMaterialSearchTerms(response: string): string[] {
	const trimmed = stripCodeFence(response);
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		throw new Error("network material search terms must be a JSON array.");
	}
	if (!Array.isArray(parsed)) {
		throw new Error("network material search terms must be a JSON array.");
	}
	const terms = parsed.map((term) => String(term).trim()).filter(Boolean);
	if (terms.length === 0) {
		throw new Error("network material search terms must not be empty.");
	}
	if (terms.some((term) => /[\u3400-\u9fff]/.test(term))) {
		throw new Error("network material search terms must be English.");
	}
	return terms;
}

function selectSearchTextSource({
	voiceoverScript,
	spokenScript,
	asrTranscript,
}: NetworkMaterialSearchTermPromptInput): {
	source: NetworkMaterialSearchTextSource;
	sourceText: string;
} {
	const voiceoverText = voiceoverScript?.trim();
	if (voiceoverText) {
		return { source: "voiceoverScript", sourceText: voiceoverText };
	}
	const spokenScriptText =
		spokenScript?.text?.trim() || spokenScript?.captions?.join("\n").trim();
	if (spokenScriptText) {
		return { source: "spokenScript", sourceText: spokenScriptText };
	}
	const asrText =
		asrTranscript?.text?.trim() ||
		asrTranscript?.segments
			?.map((segment) => segment.text.trim())
			.filter(Boolean)
			.join("\n")
			.trim();
	if (asrText) {
		return { source: "asrTranscript", sourceText: asrText };
	}
	throw new Error(
		"network material matching requires voiceover, spokenScript, or ASR text.",
	);
}

function normalizeMaxTerms(value: number): number {
	if (!Number.isInteger(value) || value < 1 || value > 20) {
		throw new Error(
			"network material search term count must be between 1 and 20.",
		);
	}
	return value;
}

function stripCodeFence(value: string): string {
	const trimmed = value.trim();
	if (!trimmed.startsWith("```")) return trimmed;
	return trimmed
		.replace(/^```[a-zA-Z0-9]*\s*/, "")
		.replace(/\s*```$/, "")
		.trim();
}
