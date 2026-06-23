import type { LanguageCode } from "./language";

export type TranscriptionLanguage = LanguageCode | "auto";

export type TranscriptionSubtask = "transcribe" | "translate";

export interface TranscriptionSegment {
	text: string;
	start: number;
	end: number;
	confidence?: number;
}

export interface TranscriptionWord {
	text: string;
	start: number;
	end: number;
	confidence?: number;
}

export interface TranscriptionTimestampCapabilities {
	segments: boolean;
	words: boolean;
}

export interface TranscriptionProviderCapabilities {
	segments: boolean;
	words: boolean;
	timestamps: TranscriptionTimestampCapabilities;
	confidence: boolean;
}

export interface TranscriptionQuality {
	confidence: number | null;
	warnings: string[];
}

export interface TranscriptionChunk {
	text: string;
	timestamp: [number, number | null];
	finalised: boolean;
	offset: number;
}

export interface TranscriptionStreamingData {
	text: string;
	chunks: TranscriptionChunk[];
	tps: number;
}

export interface TranscriptionResult {
	text: string;
	segments: TranscriptionSegment[];
	words?: TranscriptionWord[];
	language: string;
	capabilities: TranscriptionProviderCapabilities;
	quality: TranscriptionQuality;
	tps?: number;
}

export type TranscriptionStatus =
	| "idle"
	| "loading-model"
	| "transcribing"
	| "complete"
	| "error";

export interface TranscriptionProgress {
	status: TranscriptionStatus;
	progress: number;
	message?: string;
}

export type TranscriptionModelId =
	| "whisper-tiny"
	| "whisper-base"
	| "whisper-small"
	| "whisper-large-v3-turbo"
	| "distil-small.en";

export interface TranscriptionModel {
	id: TranscriptionModelId;
	name: string;
	huggingFaceId: string;
	description: string;
	encoderDtype: "fp16" | "fp32";
}

export interface CaptionChunk {
	text: string;
	startTime: number;
	duration: number;
}
