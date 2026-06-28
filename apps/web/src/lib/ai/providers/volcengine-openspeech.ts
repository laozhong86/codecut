import { z } from "zod";
import {
	cloneLocalSegmentAsrCapabilities,
	cloneLocalSegmentAsrQuality,
} from "@/lib/transcription/asr-provider-contract";
import type {
	TranscriptionResult,
	TranscriptionSegment,
} from "@/types/transcription";

export const VOLCENGINE_VOICE_CLONE_PROVIDER_ID = "volcengine-voice-clone";
export const VOLCENGINE_ASR_MODEL_ID = "volcengine-bigmodel";

const OPEN_SPEECH_BASE_URL = "https://openspeech.bytedance.com";
const OPEN_SPEECH_UID = "豆包语音";

type FetchLike = typeof fetch;

export interface VolcengineCaption {
	text: string;
	startTime: number;
	duration: number;
}

const voiceSynthesisArgsSchema = z
	.object({
		apiKey: z.string().trim().min(1, "Volcengine API key is required"),
		voiceType: z.string().trim().min(1, "Volcengine voice_type is required"),
		text: z.string().trim().min(1, "Voice text is required"),
		reqid: z.string().trim().min(1).optional(),
		speedRatio: z.number().positive().optional(),
		fetchImpl: z.custom<FetchLike>().optional(),
	})
	.strict();

const asrSubmitArgsSchema = z
	.object({
		apiKey: z.string().trim().min(1, "Volcengine API key is required"),
		audioUrl: z.string().url("Volcengine ASR URL must be a valid URL"),
		requestId: z.string().trim().min(1).optional(),
		fetchImpl: z.custom<FetchLike>().optional(),
	})
	.strict();

const asrQueryArgsSchema = z
	.object({
		apiKey: z.string().trim().min(1, "Volcengine API key is required"),
		requestId: z
			.string()
			.trim()
			.min(1, "Volcengine ASR request id is required"),
		fetchImpl: z.custom<FetchLike>().optional(),
	})
	.strict();

const subtitleSubmitArgsSchema = z
	.object({
		apiKey: z.string().trim().min(1, "Volcengine API key is required"),
		mediaUrl: z.string().url("Volcengine subtitle URL must be a valid URL"),
		fetchImpl: z.custom<FetchLike>().optional(),
	})
	.strict();

const subtitleQueryArgsSchema = z
	.object({
		apiKey: z.string().trim().min(1, "Volcengine API key is required"),
		taskId: z.string().trim().min(1, "Volcengine subtitle task id is required"),
		fetchImpl: z.custom<FetchLike>().optional(),
	})
	.strict();

const ttsResponseSchema = z
	.object({
		reqid: z.string().optional(),
		data: z.string().min(1),
	})
	.passthrough();

const subtitleSubmitResponseSchema = z
	.object({
		id: z.string().min(1).optional(),
		data: z
			.object({
				id: z.string().min(1).optional(),
			})
			.passthrough()
			.optional(),
	})
	.passthrough();

function assertHttpsUrl({ url, context }: { url: string; context: string }) {
	const parsed = new URL(url);
	if (parsed.protocol !== "https:") {
		throw new Error(`${context} must use https.`);
	}
}

function getFetch(fetchImpl?: FetchLike): FetchLike {
	if (fetchImpl) return fetchImpl;
	if (typeof fetch !== "function") {
		throw new Error("Global fetch is unavailable.");
	}
	return fetch;
}

async function readVolcengineJson(response: Response): Promise<unknown> {
	const text = await response.text();
	let payload: unknown;
	try {
		payload = JSON.parse(text);
	} catch {
		throw new Error("Volcengine returned non-JSON response");
	}
	if (!response.ok) {
		const detail = extractVolcengineErrorDetail(payload);
		throw new Error(
			`Volcengine request failed: ${response.status}${detail ? ` - ${detail}` : ""}`,
		);
	}
	return payload;
}

function extractVolcengineErrorDetail(payload: unknown): string {
	if (typeof payload !== "object" || payload === null) {
		return "";
	}
	const record = payload as Record<string, unknown>;
	for (const key of ["error", "message"]) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return "";
}

function assertSuccessfulPayload(payload: unknown, context: string) {
	if (typeof payload !== "object" || payload === null) {
		throw new Error(`${context} returned an invalid payload.`);
	}
	const record = payload as Record<string, unknown>;
	if (typeof record.error === "string" && record.error.trim()) {
		throw new Error(`${context} failed: ${record.error}`);
	}
	if (typeof record.message === "string" && record.message.trim()) {
		const code = record.code;
		if (
			(typeof code === "number" && code !== 0) ||
			(typeof code === "string" && code !== "0")
		) {
			throw new Error(`${context} failed: ${record.message}`);
		}
	}
}

function toSeconds(value: unknown, context: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${context} must be a finite number.`);
	}
	return Math.round((value / 1000 + Number.EPSILON) * 1000) / 1000;
}

function normalizeUtterances(payload: unknown): TranscriptionSegment[] {
	if (typeof payload !== "object" || payload === null) {
		throw new Error("Volcengine utterances payload must be an object.");
	}
	const record = payload as Record<string, unknown>;
	const result = record.result;
	const resultRecord =
		typeof result === "object" && result !== null
			? (result as Record<string, unknown>)
			: record;
	const utterances = resultRecord.utterances;
	if (!Array.isArray(utterances)) {
		throw new Error("Volcengine result must include utterances.");
	}
	return utterances.map((utterance, index) => {
		if (typeof utterance !== "object" || utterance === null) {
			throw new Error(`Volcengine utterances[${index}] must be an object.`);
		}
		const item = utterance as Record<string, unknown>;
		if (typeof item.text !== "string" || !item.text.trim()) {
			throw new Error(`Volcengine utterances[${index}].text is required.`);
		}
		const start = toSeconds(
			item.start_time,
			`Volcengine utterances[${index}].start_time`,
		);
		const end = toSeconds(
			item.end_time,
			`Volcengine utterances[${index}].end_time`,
		);
		if (end < start) {
			throw new Error(
				`Volcengine utterances[${index}] end_time must be after start_time.`,
			);
		}
		return {
			text: item.text,
			start,
			end,
		};
	});
}

function normalizeText(
	payload: unknown,
	segments: TranscriptionSegment[],
): string {
	if (typeof payload === "object" && payload !== null) {
		const record = payload as Record<string, unknown>;
		const result = record.result;
		const resultRecord =
			typeof result === "object" && result !== null
				? (result as Record<string, unknown>)
				: record;
		if (typeof resultRecord.text === "string") {
			return resultRecord.text;
		}
	}
	return segments.map((segment) => segment.text).join("");
}

export async function synthesizeVolcengineClonedVoice(input: unknown): Promise<{
	taskId: string;
	audioBytes: Buffer;
	mimeType: "audio/mpeg";
}> {
	const args = voiceSynthesisArgsSchema.parse(input);
	const reqid = args.reqid ?? crypto.randomUUID();
	const response = await getFetch(args.fetchImpl)(
		`${OPEN_SPEECH_BASE_URL}/api/v1/tts`,
		{
			method: "POST",
			headers: {
				"x-api-key": args.apiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				app: {
					cluster: "volcano_icl",
				},
				user: {
					uid: OPEN_SPEECH_UID,
				},
				audio: {
					voice_type: args.voiceType,
					encoding: "mp3",
					speed_ratio: args.speedRatio ?? 1,
				},
				request: {
					reqid,
					text: args.text,
					operation: "query",
				},
			}),
		},
	);
	const payload = await readVolcengineJson(response);
	assertSuccessfulPayload(payload, "Volcengine TTS");
	const parsed = ttsResponseSchema.parse(payload);
	return {
		taskId: parsed.reqid ?? reqid,
		audioBytes: Buffer.from(parsed.data, "base64"),
		mimeType: "audio/mpeg",
	};
}

export async function submitVolcengineAsrTask(input: unknown): Promise<{
	taskId: string;
	status: "submitted";
}> {
	const args = asrSubmitArgsSchema.parse(input);
	assertHttpsUrl({ url: args.audioUrl, context: "Volcengine ASR URL" });
	const requestId = args.requestId ?? crypto.randomUUID();
	const response = await getFetch(args.fetchImpl)(
		`${OPEN_SPEECH_BASE_URL}/api/v3/auc/bigmodel/submit`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": args.apiKey,
				"X-Api-Resource-Id": "volc.seedasr.auc",
				"X-Api-Request-Id": requestId,
				"X-Api-Sequence": "-1",
			},
			body: JSON.stringify({
				user: {
					uid: OPEN_SPEECH_UID,
				},
				audio: {
					url: args.audioUrl,
					format: "mp3",
					codec: "raw",
					rate: 16000,
					bits: 16,
					channel: 1,
				},
				request: {
					model_name: "bigmodel",
					enable_itn: true,
					enable_punc: false,
					enable_ddc: false,
					enable_speaker_info: false,
					enable_channel_split: false,
					show_utterances: false,
					vad_segment: false,
					sensitive_words_filter: "",
				},
			}),
		},
	);
	const payload = await readVolcengineJson(response);
	assertSuccessfulPayload(payload, "Volcengine ASR submit");
	return {
		taskId: requestId,
		status: "submitted",
	};
}

export async function queryVolcengineAsrTask(input: unknown): Promise<
	TranscriptionResult & {
		taskId: string;
		status: "succeeded";
		modelId: typeof VOLCENGINE_ASR_MODEL_ID;
	}
> {
	const args = asrQueryArgsSchema.parse(input);
	const response = await getFetch(args.fetchImpl)(
		`${OPEN_SPEECH_BASE_URL}/api/v3/auc/bigmodel/query`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": args.apiKey,
				"X-Api-Resource-Id": "volc.seedasr.auc",
				"X-Api-Request-Id": args.requestId,
				"X-Api-Sequence": "-1",
			},
			body: JSON.stringify({}),
		},
	);
	const payload = await readVolcengineJson(response);
	assertSuccessfulPayload(payload, "Volcengine ASR query");
	const segments = normalizeUtterances(payload);
	return {
		taskId: args.requestId,
		status: "succeeded",
		text: normalizeText(payload, segments),
		language: "zh-CN",
		modelId: VOLCENGINE_ASR_MODEL_ID,
		segments,
		capabilities: cloneLocalSegmentAsrCapabilities(),
		quality: cloneLocalSegmentAsrQuality(),
	};
}

export async function submitVolcengineSubtitleTask(input: unknown): Promise<{
	taskId: string;
	status: "submitted";
}> {
	const args = subtitleSubmitArgsSchema.parse(input);
	assertHttpsUrl({ url: args.mediaUrl, context: "Volcengine subtitle URL" });
	const params = new URLSearchParams({
		language: "zh-CN",
		use_itn: "True",
		use_capitalize: "True",
		max_lines: "1",
		words_per_line: "15",
	});
	const response = await getFetch(args.fetchImpl)(
		`${OPEN_SPEECH_BASE_URL}/api/v1/vc/submit?${params}`,
		{
			method: "POST",
			headers: {
				Accept: "*/*",
				"x-api-key": args.apiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ url: args.mediaUrl }),
		},
	);
	const payload = await readVolcengineJson(response);
	assertSuccessfulPayload(payload, "Volcengine subtitle submit");
	const parsed = subtitleSubmitResponseSchema.parse(payload);
	const taskId = parsed.id ?? parsed.data?.id;
	if (!taskId) {
		throw new Error("Volcengine subtitle submit response is missing id.");
	}
	return {
		taskId,
		status: "submitted",
	};
}

export async function queryVolcengineSubtitleTask(input: unknown): Promise<{
	taskId: string;
	status: "succeeded";
	captions: VolcengineCaption[];
}> {
	const args = subtitleQueryArgsSchema.parse(input);
	const response = await getFetch(args.fetchImpl)(
		`${OPEN_SPEECH_BASE_URL}/api/v1/vc/query?id=${encodeURIComponent(args.taskId)}`,
		{
			method: "GET",
			headers: {
				Accept: "*/*",
				"x-api-key": args.apiKey,
			},
		},
	);
	const payload = await readVolcengineJson(response);
	assertSuccessfulPayload(payload, "Volcengine subtitle query");
	const captions = normalizeUtterances(payload).map((segment) => ({
		text: segment.text,
		startTime: segment.start,
		duration:
			Math.round((segment.end - segment.start + Number.EPSILON) * 1000) / 1000,
	}));
	return {
		taskId: args.taskId,
		status: "succeeded",
		captions,
	};
}
