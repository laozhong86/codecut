import type {
	TranscriptionProviderCapabilities,
	TranscriptionQuality,
	TranscriptionResult,
	TranscriptionSegment,
	TranscriptionWord,
} from "@/types/transcription";

export const LOCAL_SEGMENT_ASR_CAPABILITIES: TranscriptionProviderCapabilities =
	{
		segments: true,
		words: false,
		timestamps: {
			segments: true,
			words: false,
		},
		confidence: false,
	};

export const LOCAL_SEGMENT_ASR_QUALITY: TranscriptionQuality = {
	confidence: null,
	warnings: ["word timestamps unavailable"],
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function assertConfidenceValue({
	value,
	context,
}: {
	value: unknown;
	context: string;
}) {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < 0 ||
		value > 1
	) {
		throw new Error(`${context} confidence must be a number between 0 and 1.`);
	}
}

function assertSegmentLike(
	value: unknown,
	context: string,
): asserts value is TranscriptionSegment {
	if (!isObject(value)) {
		throw new Error(`${context} must be an object.`);
	}
	if (typeof value.text !== "string") {
		throw new Error(`${context}.text must be a string.`);
	}
	if (typeof value.start !== "number" || !Number.isFinite(value.start)) {
		throw new Error(`${context}.start must be a finite number.`);
	}
	if (typeof value.end !== "number" || !Number.isFinite(value.end)) {
		throw new Error(`${context}.end must be a finite number.`);
	}
	if (value.end < value.start) {
		throw new Error(`${context}.end must be greater than or equal to start.`);
	}
	if (value.confidence !== undefined) {
		assertConfidenceValue({
			value: value.confidence,
			context: `${context}.confidence`,
		});
	}
}

function assertWordLike(
	value: unknown,
	context: string,
): asserts value is TranscriptionWord {
	assertSegmentLike(value, context);
}

export function assertAsrProviderResult(
	result: unknown,
	context: string,
): asserts result is TranscriptionResult {
	if (!isObject(result)) {
		throw new Error(`ASR provider output for ${context} must be an object.`);
	}
	if (typeof result.text !== "string") {
		throw new Error(`ASR provider output for ${context} must include text.`);
	}
	if (!Array.isArray(result.segments)) {
		throw new Error(
			`ASR provider output for ${context} must include a segments array.`,
		);
	}
	if (typeof result.language !== "string" || !result.language) {
		throw new Error(
			`ASR provider output for ${context} must include language.`,
		);
	}

	const capabilities = result.capabilities;
	if (!isObject(capabilities)) {
		throw new Error(
			`ASR provider output for ${context} must include capabilities.`,
		);
	}
	if (capabilities.segments !== true) {
		throw new Error(
			`ASR provider output for ${context} must declare segment support.`,
		);
	}
	if (typeof capabilities.words !== "boolean") {
		throw new Error(
			`ASR provider output for ${context} must declare word support.`,
		);
	}
	if (typeof capabilities.confidence !== "boolean") {
		throw new Error(
			`ASR provider output for ${context} must declare confidence support.`,
		);
	}
	if (!isObject(capabilities.timestamps)) {
		throw new Error(
			`ASR provider output for ${context} must include timestamp capabilities.`,
		);
	}
	if (capabilities.timestamps.segments !== true) {
		throw new Error(
			`ASR provider output for ${context} must declare segment timestamp support.`,
		);
	}
	if (typeof capabilities.timestamps.words !== "boolean") {
		throw new Error(
			`ASR provider output for ${context} must declare word timestamp support.`,
		);
	}

	const quality = result.quality;
	if (!isObject(quality)) {
		throw new Error(`ASR provider output for ${context} must include quality.`);
	}
	if (!("confidence" in quality)) {
		throw new Error(
			`ASR provider output for ${context} must include quality.confidence.`,
		);
	}
	if (quality.confidence !== null) {
		assertConfidenceValue({
			value: quality.confidence,
			context: `ASR provider output for ${context} quality.confidence`,
		});
	}
	if (capabilities.confidence === false && quality.confidence !== null) {
		throw new Error(
			`ASR provider output for ${context} cannot report confidence when confidence support is false.`,
		);
	}
	if (!Array.isArray(quality.warnings)) {
		throw new Error(
			`ASR provider output for ${context} must include quality.warnings.`,
		);
	}
	for (const warning of quality.warnings) {
		if (typeof warning !== "string") {
			throw new Error(
				`ASR provider output for ${context} quality.warnings must contain strings.`,
			);
		}
	}

	result.segments.forEach((segment, index) => {
		assertSegmentLike(
			segment,
			`ASR provider output for ${context} segments[${index}]`,
		);
	});

	if (result.words !== undefined) {
		if (!Array.isArray(result.words)) {
			throw new Error(
				`ASR provider output for ${context} words must be an array when provided.`,
			);
		}
		if (capabilities.words !== true || capabilities.timestamps.words !== true) {
			throw new Error(
				`ASR provider output for ${context} cannot include words without word timestamp support.`,
			);
		}
		result.words.forEach((word, index) => {
			assertWordLike(
				word,
				`ASR provider output for ${context} words[${index}]`,
			);
		});
	}
}

export function cloneLocalSegmentAsrCapabilities(): TranscriptionProviderCapabilities {
	return {
		...LOCAL_SEGMENT_ASR_CAPABILITIES,
		timestamps: { ...LOCAL_SEGMENT_ASR_CAPABILITIES.timestamps },
	};
}

export function cloneLocalSegmentAsrQuality(): TranscriptionQuality {
	return {
		...LOCAL_SEGMENT_ASR_QUALITY,
		warnings: [...LOCAL_SEGMENT_ASR_QUALITY.warnings],
	};
}
