import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import {
	RUNNINGHUB_API_BASE,
	RUNNINGHUB_VOICE_CLONE_APP_ID,
	buildRunningHubVoiceCloneSubmitBody,
	extractRunningHubVoiceCloneAudioUrl,
	normalizeRunningHubVoiceCloneStatus,
	type RunningHubVoiceCloneResultEntry,
} from "./runninghub-voice-clone";
import { uploadRunningHubMediaFile } from "./runninghub-digital-human-server";
import { downloadRunningHubAudioResult } from "./runninghub-result-download";
import type { VoiceCloneRequest, VoiceCloneTaskResult } from "./types";

type FetchLike = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

const RUNNINGHUB_POLL_INTERVAL_MS = 5000;
const RUNNINGHUB_MAX_POLL_ATTEMPTS = 120;
const RUNNINGHUB_AI_APP_RUN_ENDPOINT = `${RUNNINGHUB_API_BASE}/openapi/v2/run/ai-app/${RUNNINGHUB_VOICE_CLONE_APP_ID}`;

export interface RunningHubGeneratedVoiceClone {
	taskId: string;
	audioBytes: Buffer;
	mimeType: string;
}

const AUDIO_MIME_TYPES = new Map([
	[".mp3", "audio/mpeg"],
	[".wav", "audio/wav"],
	[".m4a", "audio/mp4"],
	[".aac", "audio/aac"],
	[".ogg", "audio/ogg"],
	[".flac", "audio/flac"],
]);

function runningHubHeaders({ apiKey }: { apiKey: string }) {
	if (!apiKey) {
		throw new Error("RUNNINGHUB_API_KEY is required");
	}
	return { Authorization: `Bearer ${apiKey}` };
}

function audioMimeTypeForPath({ path }: { path: string }): string {
	const mimeType = AUDIO_MIME_TYPES.get(extname(path).toLowerCase());
	if (!mimeType) {
		throw new Error("Reference audio file type is not supported");
	}
	return mimeType;
}

function bufferToFile({
	bytes,
	name,
	mimeType,
}: {
	bytes: Buffer;
	name: string;
	mimeType: string;
}): File {
	const arrayBuffer = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
	return new File([arrayBuffer], name, { type: mimeType });
}

async function parseRunningHubJson({
	response,
}: {
	response: Response;
}): Promise<Record<string, unknown>> {
	const text = await response.text();
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(text);
	} catch {
		throw new Error(`RunningHub returned non-JSON response: ${text}`);
	}

	const message =
		(typeof payload.errorMessage === "string" && payload.errorMessage) ||
		(typeof payload.message === "string" && payload.message) ||
		(typeof payload.msg === "string" && payload.msg) ||
		(typeof payload.error === "string" && payload.error) ||
		(typeof payload.failedReason === "string" && payload.failedReason) ||
		null;
	if (!response.ok) {
		throw new Error(message || `RunningHub request failed: ${response.status}`);
	}
	const code = payload.code ?? payload.errorCode ?? payload.statusCode;
	if (
		code !== undefined &&
		code !== null &&
		code !== "" &&
		code !== 0 &&
		code !== 200 &&
		code !== "0" &&
		code !== "200"
	) {
		throw new Error(message || `RunningHub request failed with code ${code}`);
	}
	return payload;
}

export async function submitRunningHubVoiceCloneTask({
	apiKey,
	request,
	audioFileName,
	fetchImpl = fetch,
}: {
	apiKey: string;
	request: VoiceCloneRequest;
	audioFileName: string;
	fetchImpl?: FetchLike;
}): Promise<VoiceCloneTaskResult> {
	const trimmedAudioFileName = audioFileName.trim();
	const trimmedText = request.text.trim();
	if (!trimmedAudioFileName) {
		throw new Error("Reference audio upload file name is required");
	}
	if (!trimmedText) {
		throw new Error("Voice text is required");
	}

	const response = await fetchImpl(RUNNINGHUB_AI_APP_RUN_ENDPOINT, {
		method: "POST",
		headers: {
			...runningHubHeaders({ apiKey }),
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			...buildRunningHubVoiceCloneSubmitBody({
				audioFileName: trimmedAudioFileName,
				text: trimmedText,
			}),
		}),
	});
	const payload = await parseRunningHubJson({ response });
	const data =
		payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
			? (payload.data as Record<string, unknown>)
			: payload;
	const typedData = data as {
		taskId?: unknown;
		taskStatus?: unknown;
		status?: unknown;
		errorMessage?: unknown;
	};
	const taskId = typedData.taskId;
	if (typeof taskId !== "string" || !taskId) {
		throw new Error("RunningHub submit returned no task ID");
	}
	const status = String(typedData.taskStatus ?? typedData.status ?? "QUEUED");
	return {
		taskId,
		status: normalizeRunningHubVoiceCloneStatus({ status }),
		...(typeof typedData.errorMessage === "string" && typedData.errorMessage
			? { error: typedData.errorMessage }
			: {}),
	};
}

export async function queryRunningHubVoiceCloneTask({
	apiKey,
	taskId,
	fetchImpl = fetch,
}: {
	apiKey: string;
	taskId: string;
	fetchImpl?: FetchLike;
}): Promise<VoiceCloneTaskResult> {
	if (!taskId.trim()) {
		throw new Error("RunningHub task ID is required");
	}

	const response = await fetchImpl(`${RUNNINGHUB_API_BASE}/openapi/v2/query`, {
		method: "POST",
		headers: {
			...runningHubHeaders({ apiKey }),
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ taskId }),
	});
	const payload = await parseRunningHubJson({ response });
	const status = String(payload.status ?? "QUEUED");
	const normalizedStatus = normalizeRunningHubVoiceCloneStatus({ status });
	const result: VoiceCloneTaskResult = {
		taskId,
		status: normalizedStatus,
	};

	if (normalizedStatus === "succeeded") {
		result.audioUrl = extractRunningHubVoiceCloneAudioUrl({
			results: payload.results as
				| RunningHubVoiceCloneResultEntry[]
				| null
				| undefined,
		});
	}
	if (normalizedStatus === "failed") {
		result.error =
			(typeof payload.errorMessage === "string" && payload.errorMessage) ||
			(typeof payload.failedReason === "string" && payload.failedReason) ||
			"RunningHub voice clone generation failed";
	}
	return result;
}

export async function downloadRunningHubVoiceCloneAudio({
	audioUrl,
	fetchImpl = fetch,
}: {
	audioUrl: string;
	fetchImpl?: FetchLike;
}): Promise<{ bytes: Buffer; mimeType: string }> {
	const downloaded = await downloadRunningHubAudioResult({
		url: audioUrl,
		fetchImpl,
	});
	return {
		bytes: Buffer.from(downloaded.bytes),
		mimeType: downloaded.contentType,
	};
}

function sleep({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollRunningHubVoiceCloneTask({
	apiKey,
	taskId,
	fetchImpl = fetch,
	pollIntervalMs = RUNNINGHUB_POLL_INTERVAL_MS,
	maxPollAttempts = RUNNINGHUB_MAX_POLL_ATTEMPTS,
}: {
	apiKey: string;
	taskId: string;
	fetchImpl?: FetchLike;
	pollIntervalMs?: number;
	maxPollAttempts?: number;
}): Promise<VoiceCloneTaskResult> {
	for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
		const result = await queryRunningHubVoiceCloneTask({
			apiKey,
			taskId,
			fetchImpl,
		});
		if (result.status === "succeeded" || result.status === "failed") {
			return result;
		}
		await sleep({ ms: pollIntervalMs });
	}
	throw new Error(`RunningHub task ${taskId} did not finish before timeout`);
}

export async function generateRunningHubVoiceCloneFromReferenceAudioPath({
	apiKey,
	referenceAudioPath,
	request,
	fetchImpl = fetch,
	pollIntervalMs,
	maxPollAttempts,
}: {
	apiKey: string;
	referenceAudioPath: string;
	request: VoiceCloneRequest;
	fetchImpl?: FetchLike;
	pollIntervalMs?: number;
	maxPollAttempts?: number;
}): Promise<RunningHubGeneratedVoiceClone> {
	const referenceAudioBytes = await readFile(referenceAudioPath);
	if (referenceAudioBytes.byteLength <= 0) {
		throw new Error("Reference audio file is empty");
	}
	const referenceAudioFile = bufferToFile({
		bytes: referenceAudioBytes,
		name: basename(referenceAudioPath),
		mimeType: audioMimeTypeForPath({ path: referenceAudioPath }),
	});
	const audioFileName = await uploadRunningHubMediaFile({
		apiKey,
		file: referenceAudioFile,
		fetchImpl,
	});
	const submitted = await submitRunningHubVoiceCloneTask({
		apiKey,
		request,
		audioFileName,
		fetchImpl,
	});
	const finished =
		submitted.status === "succeeded"
			? submitted
			: await pollRunningHubVoiceCloneTask({
					apiKey,
					taskId: submitted.taskId,
					fetchImpl,
					pollIntervalMs,
					maxPollAttempts,
				});
	if (finished.status === "failed") {
		throw new Error(finished.error ?? "RunningHub voice clone generation failed");
	}
	if (!finished.audioUrl) {
		throw new Error("RunningHub task succeeded without an audio URL");
	}

	const downloaded = await downloadRunningHubVoiceCloneAudio({
		audioUrl: finished.audioUrl,
		fetchImpl,
	});
	return {
		taskId: finished.taskId,
		audioBytes: downloaded.bytes,
		mimeType: downloaded.mimeType,
	};
}
