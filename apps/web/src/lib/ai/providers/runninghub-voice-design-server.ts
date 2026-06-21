import {
	RUNNINGHUB_API_BASE,
	RUNNINGHUB_VOICE_DESIGN_APP_ID,
	buildRunningHubVoiceDesignSubmitBody,
	extractRunningHubVoiceDesignAudioUrl,
	normalizeRunningHubVoiceDesignStatus,
	type RunningHubVoiceDesignResultEntry,
} from "./runninghub-voice-design";
import { downloadRunningHubAudioResult } from "./runninghub-result-download";
import type { VoiceDesignRequest, VoiceDesignTaskResult } from "./types";

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
		code !== 0 &&
		code !== 200 &&
		code !== "0" &&
		code !== "200"
	) {
		throw new Error(message || `RunningHub request failed with code ${code}`);
	}
	return payload;
}

export async function submitRunningHubVoiceDesignTask({
	apiKey,
	request,
	fetchImpl = fetch,
}: {
	apiKey: string;
	request: VoiceDesignRequest;
	fetchImpl?: FetchLike;
}): Promise<VoiceDesignTaskResult> {
	if (!request.text.trim()) {
		throw new Error("Voice text is required");
	}
	if (!request.emotionPrompt.trim()) {
		throw new Error("Emotion / voice description is required");
	}

	const response = await fetchImpl(RUNNINGHUB_AI_APP_RUN_ENDPOINT, {
		method: "POST",
		headers: {
			...runningHubHeaders({ apiKey }),
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			webappId: RUNNINGHUB_VOICE_DESIGN_APP_ID,
			...buildRunningHubVoiceDesignSubmitBody({
				text: request.text.trim(),
				emotionPrompt: request.emotionPrompt.trim(),
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
		status: normalizeRunningHubVoiceDesignStatus({ status }),
		...(typeof data?.errorMessage === "string" && data.errorMessage
			? { error: data.errorMessage }
			: {}),
	};
}

export async function queryRunningHubVoiceDesignTask({
	apiKey,
	taskId,
	fetchImpl = fetch,
}: {
	apiKey: string;
	taskId: string;
	fetchImpl?: FetchLike;
}): Promise<VoiceDesignTaskResult> {
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
	const normalizedStatus = normalizeRunningHubVoiceDesignStatus({ status });
	const result: VoiceDesignTaskResult = {
		taskId,
		status: normalizedStatus,
	};

	if (normalizedStatus === "succeeded") {
		result.audioUrl = extractRunningHubVoiceDesignAudioUrl({
			results: payload.results as
				| RunningHubVoiceDesignResultEntry[]
				| null
				| undefined,
		});
	}
	if (normalizedStatus === "failed") {
		result.error =
			(typeof payload.errorMessage === "string" && payload.errorMessage) ||
			(typeof payload.failedReason === "string" && payload.failedReason) ||
			"RunningHub voice design generation failed";
	}
	return result;
}

export async function downloadRunningHubAudio({
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

export async function pollRunningHubVoiceDesignTask({
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
}): Promise<VoiceDesignTaskResult> {
	for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
		const result = await queryRunningHubVoiceDesignTask({
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
