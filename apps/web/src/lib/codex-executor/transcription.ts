import { spawn } from "node:child_process";
import {
	DEFAULT_CHUNK_LENGTH_SECONDS,
	DEFAULT_STRIDE_SECONDS,
	TRANSCRIPTION_LANGUAGES,
	TRANSCRIPTION_MODELS,
} from "@/constants/transcription-constants";
import type {
	TranscriptionLanguage,
	TranscriptionModelId,
	TranscriptionResult,
	TranscriptionSegment,
} from "@/types/transcription";

const SAMPLE_RATE = 16000;
const MAX_AUDIO_BYTES = 512 * 1024 * 1024;

export interface ExecutorTranscriptionMedia {
	id: string;
	name: string;
	path: string;
	duration?: number;
}

export type ExecutorTranscribeMedia = ({
	mediaAsset,
	language,
	modelId,
}: {
	mediaAsset: ExecutorTranscriptionMedia;
	language: TranscriptionLanguage;
	modelId: TranscriptionModelId;
}) => Promise<TranscriptionResult & { modelId?: string }>;

export function parseExecutorTranscriptionLanguage(
	value: unknown,
): TranscriptionLanguage {
	if (value === undefined) {
		throw new Error("language is required");
	}
	if (value === "auto") return "auto";
	if (
		typeof value === "string" &&
		TRANSCRIPTION_LANGUAGES.some((language) => language.code === value)
	) {
		return value as TranscriptionLanguage;
	}
	throw new Error("language must be auto or a supported transcription language");
}

export function parseExecutorTranscriptionModelId(
	value: unknown,
): TranscriptionModelId {
	if (value === undefined) {
		throw new Error("modelId is required");
	}
	if (
		typeof value === "string" &&
		TRANSCRIPTION_MODELS.some((model) => model.id === value)
	) {
		return value as TranscriptionModelId;
	}
	throw new Error("modelId must be a supported transcription model");
}

async function extractAudioSamples({
	filePath,
}: {
	filePath: string;
}): Promise<Float32Array> {
	return new Promise((resolve, reject) => {
		const ffmpeg = spawn("ffmpeg", [
			"-v",
			"error",
			"-i",
			filePath,
			"-vn",
			"-ac",
			"1",
			"-ar",
			String(SAMPLE_RATE),
			"-f",
			"f32le",
			"pipe:1",
		]);
		const chunks: Buffer[] = [];
		let totalBytes = 0;
		let stderr = "";
		let settled = false;

		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			ffmpeg.kill();
			reject(error);
		};

		ffmpeg.stdout.on("data", (chunk: Buffer) => {
			totalBytes += chunk.byteLength;
			if (totalBytes > MAX_AUDIO_BYTES) {
				fail(new Error("Extracted audio is too large for local transcription."));
				return;
			}
			chunks.push(chunk);
		});
		ffmpeg.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		ffmpeg.on("error", (error) => {
			fail(new Error(`Failed to start ffmpeg: ${error.message}`));
		});
		ffmpeg.on("close", (code) => {
			if (settled) return;
			settled = true;
			if (code !== 0) {
				reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
				return;
			}

			const bytes = Buffer.concat(chunks, totalBytes);
			const alignedBytes = bytes.byteLength - (bytes.byteLength % 4);
			if (alignedBytes === 0) {
				reject(new Error("No audio samples were extracted from media."));
				return;
			}
			const view = new Float32Array(
				bytes.buffer,
				bytes.byteOffset,
				alignedBytes / 4,
			);
			resolve(new Float32Array(view));
		});
	});
}

function normalizeSegments(output: unknown): TranscriptionSegment[] {
	const chunks =
		typeof output === "object" && output && "chunks" in output
			? (output as { chunks?: unknown }).chunks
			: undefined;
	if (!Array.isArray(chunks)) return [];

	const segments: TranscriptionSegment[] = [];
	for (const chunk of chunks) {
		if (!chunk || typeof chunk !== "object") continue;
		const text =
			"text" in chunk && typeof chunk.text === "string" ? chunk.text : "";
		const timestamp =
			"timestamp" in chunk && Array.isArray(chunk.timestamp)
				? chunk.timestamp
				: null;
		if (!timestamp || timestamp.length < 2) continue;
		const start = Number(timestamp[0] ?? 0);
		const end = Number(timestamp[1] ?? timestamp[0] ?? 0);
		if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
		segments.push({ text, start, end });
	}
	return segments;
}

export const transcribeMediaWithNodeRuntime: ExecutorTranscribeMedia = async ({
	mediaAsset,
	language,
	modelId,
}) => {
	const model = TRANSCRIPTION_MODELS.find((entry) => entry.id === modelId);
	if (!model) {
		throw new Error(`Unknown model: ${modelId}`);
	}

	const audio = await extractAudioSamples({ filePath: mediaAsset.path });
	const { pipeline } = await import("@huggingface/transformers");
	const transcriber = await pipeline(
		"automatic-speech-recognition",
		model.huggingFaceId,
		{
			dtype: {
				encoder_model: model.encoderDtype,
				decoder_model_merged: "q4",
			},
		},
	);
	const isDistilWhisper = model.huggingFaceId.includes("distil");
	const output = await transcriber(audio, {
		top_k: 0,
		do_sample: false,
		chunk_length_s: isDistilWhisper ? 20 : DEFAULT_CHUNK_LENGTH_SECONDS,
		stride_length_s: isDistilWhisper ? 3 : DEFAULT_STRIDE_SECONDS,
		language: language === "auto" ? undefined : language,
		task: "transcribe",
		return_timestamps: true,
		force_full_sequences: false,
	});
	const result = Array.isArray(output) ? output[0] : output;
	const text =
		typeof result === "object" &&
		result &&
		"text" in result &&
		typeof result.text === "string"
			? result.text
			: "";

	return {
		text,
		segments: normalizeSegments(result),
		language,
		modelId,
	};
};
