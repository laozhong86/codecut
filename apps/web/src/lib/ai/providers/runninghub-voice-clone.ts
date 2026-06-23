import type {
	AIVoiceCloneProvider,
	VoiceCloneRequest,
	VoiceCloneTaskResult,
	VoiceCloneTaskStatus,
} from "./types";
import {
	RUNNINGHUB_API_BASE as SHARED_RUNNINGHUB_API_BASE,
	type RunningHubNodeInfo,
} from "./runninghub-digital-human";

export const RUNNINGHUB_VOICE_CLONE_PROVIDER_ID = "runninghub-voice-clone";
export const RUNNINGHUB_VOICE_CLONE_APP_ID = "2067079167992229890";
export const RUNNINGHUB_API_BASE = SHARED_RUNNINGHUB_API_BASE;

const VOICE_CLONE_DOWNLOAD_ROUTE = "/api/ai/voice-clone/download";
const VOICE_CLONE_GENERATE_ROUTE = "/api/ai/voice-clone/generate";
const VOICE_CLONE_TASK_ROUTE = "/api/ai/voice-clone/task";

const AUDIO_OUTPUT_TYPES = new Set(["mp3", "wav", "m4a", "aac", "ogg", "flac"]);

export interface RunningHubVoiceCloneSubmitBody {
	nodeInfoList: RunningHubNodeInfo[];
	instanceType: "default";
	usePersonalQueue: "false";
}

export interface RunningHubVoiceCloneResultEntry {
	url?: string | null;
	nodeId?: string;
	outputType?: string | null;
	text?: string | null;
}

export function buildRunningHubVoiceCloneSubmitBody({
	audioFileName,
	text,
}: VoiceCloneRequest & {
	audioFileName: string;
}): RunningHubVoiceCloneSubmitBody {
	return {
		nodeInfoList: [
			{
				nodeId: "17",
				fieldName: "audio",
				fieldValue: audioFileName,
				description: "音频",
			},
			{
				nodeId: "24",
				fieldName: "text",
				fieldValue: text,
				description: "文稿",
			},
		],
		instanceType: "default",
		usePersonalQueue: "false",
	};
}

export function normalizeRunningHubVoiceCloneStatus({
	status,
}: {
	status: string;
}): VoiceCloneTaskStatus {
	if (status === "SUCCESS") return "succeeded";
	if (status === "FAILED") return "failed";
	if (status === "RUNNING") return "running";
	if (status === "succeeded") return "succeeded";
	if (status === "failed") return "failed";
	if (status === "running") return "running";
	if (status === "pending") return "pending";
	return "pending";
}

export function extractRunningHubVoiceCloneAudioUrl({
	results,
}: {
	results: RunningHubVoiceCloneResultEntry[] | null | undefined;
}): string {
	const audioResult = results?.find((result) => {
		if (typeof result.url !== "string" || result.url.length === 0) return false;
		const outputType = result.outputType?.toLowerCase();
		return outputType ? AUDIO_OUTPUT_TYPES.has(outputType) : false;
	});
	if (!audioResult?.url) {
		throw new Error("RunningHub task succeeded without an audio result");
	}
	return audioResult.url;
}

async function readJsonResponse({ response }: { response: Response }) {
	const text = await response.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`RunningHub route returned non-JSON response: ${text}`);
	}
}

async function assertOkJson({
	response,
}: {
	response: Response;
}): Promise<Record<string, unknown>> {
	const payload = await readJsonResponse({ response });
	if (!response.ok) {
		const message =
			typeof payload.error === "string"
				? payload.error
				: `RunningHub route failed: ${response.status}`;
		throw new Error(message);
	}
	return payload as Record<string, unknown>;
}

export const runningHubVoiceCloneProvider: AIVoiceCloneProvider = {
	id: RUNNINGHUB_VOICE_CLONE_PROVIDER_ID,
	name: "RunningHub Voice Clone",
	description: "RunningHub fixed AI App reference audio voice clone generation",

	async submitVoiceCloneTask({
		request,
		apiKey,
		referenceAudioFile,
	}: {
		request: VoiceCloneRequest;
		apiKey: string;
		referenceAudioFile: File;
	}): Promise<VoiceCloneTaskResult> {
		if (!apiKey) {
			throw new Error("RUNNINGHUB_API_KEY is not configured");
		}

		const formData = new FormData();
		formData.set("audio", referenceAudioFile);
		formData.set("text", request.text);

		const response = await fetch(VOICE_CLONE_GENERATE_ROUTE, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
			body: formData,
		});

		const payload = await assertOkJson({ response });
		return {
			taskId: String(payload.taskId),
			status: normalizeRunningHubVoiceCloneStatus({
				status: String(payload.status),
			}),
			...(typeof payload.audioUrl === "string"
				? { audioUrl: payload.audioUrl }
				: {}),
			...(typeof payload.error === "string" ? { error: payload.error } : {}),
		};
	},

	async getVoiceCloneTask({
		taskId,
		apiKey,
	}: {
		taskId: string;
		apiKey: string;
	}): Promise<VoiceCloneTaskResult> {
		if (!apiKey) {
			throw new Error("RUNNINGHUB_API_KEY is not configured");
		}

		const params = new URLSearchParams({ taskId });
		const response = await fetch(`${VOICE_CLONE_TASK_ROUTE}?${params}`, {
			headers: { Authorization: `Bearer ${apiKey}` },
		});

		const payload = await assertOkJson({ response });
		return {
			taskId: String(payload.taskId),
			status: normalizeRunningHubVoiceCloneStatus({
				status: String(payload.status),
			}),
			...(typeof payload.audioUrl === "string"
				? { audioUrl: payload.audioUrl }
				: {}),
			...(typeof payload.error === "string" ? { error: payload.error } : {}),
		};
	},

	async downloadVoiceCloneResult({
		audioUrl,
	}: {
		audioUrl: string;
	}): Promise<Blob> {
		const params = new URLSearchParams({ url: audioUrl });
		const response = await fetch(`${VOICE_CLONE_DOWNLOAD_ROUTE}?${params}`);
		if (!response.ok) {
			throw new Error(`RunningHub audio download failed: ${response.status}`);
		}
		return response.blob();
	},
};
