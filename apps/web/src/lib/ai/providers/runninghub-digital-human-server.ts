import { readFile } from "node:fs/promises";
import {
	RUNNINGHUB_API_BASE,
	RUNNINGHUB_DIGITAL_HUMAN_APP_ID,
	buildRunningHubDigitalHumanSubmitBody,
	extractRunningHubDigitalHumanVideoUrl,
	normalizeRunningHubDigitalHumanStatus,
	type RunningHubDigitalHumanResultEntry,
} from "./runninghub-digital-human";
import { downloadRunningHubVideoResult } from "./runninghub-result-download";
import type {
	DigitalHumanGenerationRequest,
	DigitalHumanTaskResult,
} from "./types";

export interface RunningHubExecutorMediaAsset {
	id: string;
	name: string;
	mimeType: string;
	path: string;
	duration?: number;
}

export interface RunningHubGeneratedDigitalHuman {
	taskId: string;
	videoBytes: Buffer;
	mimeType: string;
	duration?: number;
}

type FetchLike = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

const RUNNINGHUB_POLL_INTERVAL_MS = 5000;
const RUNNINGHUB_MAX_POLL_ATTEMPTS = 120;
const RUNNINGHUB_AI_APP_RUN_ENDPOINT = `${RUNNINGHUB_API_BASE}/task/openapi/ai-app/run`;

function runningHubHeaders({ apiKey }: { apiKey: string }) {
	if (!apiKey) {
		throw new Error("RUNNINGHUB_API_KEY is required");
	}
	return { Authorization: `Bearer ${apiKey}` };
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

export async function uploadRunningHubMediaFile({
	apiKey,
	file,
	fetchImpl = fetch,
}: {
	apiKey: string;
	file: File;
	fetchImpl?: FetchLike;
}): Promise<string> {
	const formData = new FormData();
	formData.set("file", file);

	const response = await fetchImpl(
		`${RUNNINGHUB_API_BASE}/openapi/v2/media/upload/binary`,
		{
			method: "POST",
			headers: runningHubHeaders({ apiKey }),
			body: formData,
		},
	);
	const payload = await parseRunningHubJson({ response });
	const data = payload.data as {
		fileName?: string;
		filename?: string;
		download_url?: string;
	} | null;
	const fileName = data?.fileName ?? data?.filename ?? data?.download_url;
	if (!fileName) {
		throw new Error("RunningHub upload returned no file name");
	}
	return fileName;
}

export async function submitRunningHubDigitalHumanTask({
	apiKey,
	request,
	imageFileName,
	audioFileName,
	fetchImpl = fetch,
}: {
	apiKey: string;
	request: DigitalHumanGenerationRequest;
	imageFileName: string;
	audioFileName: string;
	fetchImpl?: FetchLike;
}): Promise<DigitalHumanTaskResult> {
	const response = await fetchImpl(RUNNINGHUB_AI_APP_RUN_ENDPOINT, {
		method: "POST",
		headers: {
			...runningHubHeaders({ apiKey }),
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			webappId: RUNNINGHUB_DIGITAL_HUMAN_APP_ID,
			apiKey,
			...buildRunningHubDigitalHumanSubmitBody({
				imageFileName,
				audioFileName,
				scriptText: request.scriptText,
				motionPrompt: request.motionPrompt,
				width: request.width,
				height: request.height,
				fps: request.fps,
			}),
		}),
	});
	const payload = await parseRunningHubJson({ response });
	const data = payload.data as {
		taskId?: unknown;
		taskStatus?: unknown;
		status?: unknown;
		errorMessage?: unknown;
	} | null;
	const taskId = data?.taskId;
	if (typeof taskId !== "string" || !taskId) {
		throw new Error("RunningHub submit returned no task ID");
	}
	const status = String(data?.taskStatus ?? data?.status ?? "QUEUED");
	return {
		taskId,
		status: normalizeRunningHubDigitalHumanStatus({ status }),
		...(typeof data?.errorMessage === "string" && data.errorMessage
			? { error: data.errorMessage }
			: {}),
	};
}

export async function queryRunningHubDigitalHumanTask({
	apiKey,
	taskId,
	fetchImpl = fetch,
}: {
	apiKey: string;
	taskId: string;
	fetchImpl?: FetchLike;
}): Promise<DigitalHumanTaskResult> {
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
	const normalizedStatus = normalizeRunningHubDigitalHumanStatus({ status });
	const result: DigitalHumanTaskResult = {
		taskId,
		status: normalizedStatus,
	};

	if (normalizedStatus === "succeeded") {
		result.videoUrl = extractRunningHubDigitalHumanVideoUrl({
			results: payload.results as
				| RunningHubDigitalHumanResultEntry[]
				| null
				| undefined,
		});
	}
	if (normalizedStatus === "failed") {
		result.error =
			(typeof payload.errorMessage === "string" && payload.errorMessage) ||
			(typeof payload.failedReason === "string" && payload.failedReason) ||
			"RunningHub digital human generation failed";
	}
	return result;
}

export async function downloadRunningHubVideo({
	videoUrl,
	fetchImpl = fetch,
}: {
	videoUrl: string;
	fetchImpl?: FetchLike;
}): Promise<{ bytes: Buffer; mimeType: string }> {
	const downloaded = await downloadRunningHubVideoResult({
		url: videoUrl,
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

export async function pollRunningHubDigitalHumanTask({
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
}): Promise<DigitalHumanTaskResult> {
	for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
		const result = await queryRunningHubDigitalHumanTask({
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

export async function generateRunningHubDigitalHumanFromExecutorMedia({
	apiKey,
	imageAsset,
	audioAsset,
	request,
	fetchImpl = fetch,
	pollIntervalMs,
	maxPollAttempts,
}: {
	apiKey: string;
	imageAsset: RunningHubExecutorMediaAsset;
	audioAsset: RunningHubExecutorMediaAsset;
	request: DigitalHumanGenerationRequest;
	fetchImpl?: FetchLike;
	pollIntervalMs?: number;
	maxPollAttempts?: number;
}): Promise<RunningHubGeneratedDigitalHuman> {
	const imageBytes = await readFile(imageAsset.path);
	const audioBytes = await readFile(audioAsset.path);
	const imageFile = bufferToFile({
		bytes: imageBytes,
		name: imageAsset.name,
		mimeType: imageAsset.mimeType,
	});
	const audioFile = bufferToFile({
		bytes: audioBytes,
		name: audioAsset.name,
		mimeType: audioAsset.mimeType,
	});
	const imageFileName = await uploadRunningHubMediaFile({
		apiKey,
		file: imageFile,
		fetchImpl,
	});
	const audioFileName = await uploadRunningHubMediaFile({
		apiKey,
		file: audioFile,
		fetchImpl,
	});
	const submitted = await submitRunningHubDigitalHumanTask({
		apiKey,
		request,
		imageFileName,
		audioFileName,
		fetchImpl,
	});
	const finished =
		submitted.status === "succeeded"
			? submitted
			: await pollRunningHubDigitalHumanTask({
					apiKey,
					taskId: submitted.taskId,
					fetchImpl,
					pollIntervalMs,
					maxPollAttempts,
				});
	if (finished.status === "failed") {
		throw new Error(
			finished.error ?? "RunningHub digital human generation failed",
		);
	}
	if (!finished.videoUrl) {
		throw new Error("RunningHub task succeeded without a video URL");
	}

	const downloaded = await downloadRunningHubVideo({
		videoUrl: finished.videoUrl,
		fetchImpl,
	});
	return {
		taskId: finished.taskId,
		videoBytes: downloaded.bytes,
		mimeType: downloaded.mimeType,
		duration: audioAsset.duration,
	};
}
