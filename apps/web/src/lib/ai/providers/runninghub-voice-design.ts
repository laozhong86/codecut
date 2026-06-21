import type {
	AIVoiceDesignProvider,
	VoiceDesignRequest,
	VoiceDesignTaskResult,
	VoiceDesignTaskStatus,
} from "./types";
import {
	RUNNINGHUB_API_BASE as SHARED_RUNNINGHUB_API_BASE,
	type RunningHubNodeInfo,
} from "./runninghub-digital-human";

export const RUNNINGHUB_VOICE_DESIGN_PROVIDER_ID =
	"runninghub-voice-design";
export const RUNNINGHUB_VOICE_DESIGN_APP_ID = "2049802245339918337";
export const RUNNINGHUB_API_BASE = SHARED_RUNNINGHUB_API_BASE;

const VOICE_DESIGN_DOWNLOAD_ROUTE = "/api/ai/voice-design/download";
const VOICE_DESIGN_GENERATE_ROUTE = "/api/ai/voice-design/generate";
const VOICE_DESIGN_TASK_ROUTE = "/api/ai/voice-design/task";

const AUDIO_OUTPUT_TYPES = new Set(["mp3", "wav", "m4a", "aac", "ogg", "flac"]);

export interface RunningHubVoiceDesignSubmitBody {
	nodeInfoList: RunningHubNodeInfo[];
	instanceType: "default";
	usePersonalQueue: "false";
}

export interface RunningHubVoiceDesignResultEntry {
	url?: string | null;
	nodeId?: string;
	outputType?: string | null;
	text?: string | null;
}

export function buildRunningHubVoiceDesignSubmitBody({
	text,
	emotionPrompt,
}: VoiceDesignRequest): RunningHubVoiceDesignSubmitBody {
	return {
		nodeInfoList: [
			{
				nodeId: "24",
				fieldName: "text",
				fieldValue: text,
				description: "语音内容",
			},
			{
				nodeId: "21",
				fieldName: "text",
				fieldValue: emotionPrompt,
				description: "声音描述",
			},
		],
		instanceType: "default",
		usePersonalQueue: "false",
	};
}

export function normalizeRunningHubVoiceDesignStatus({
	status,
}: {
	status: string;
}): VoiceDesignTaskStatus {
	if (status === "SUCCESS") return "succeeded";
	if (status === "FAILED") return "failed";
	if (status === "RUNNING") return "running";
	if (status === "succeeded") return "succeeded";
	if (status === "failed") return "failed";
	if (status === "running") return "running";
	if (status === "pending") return "pending";
	return "pending";
}

export function extractRunningHubVoiceDesignAudioUrl({
	results,
}: {
	results: RunningHubVoiceDesignResultEntry[] | null | undefined;
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

export const runningHubVoiceDesignProvider: AIVoiceDesignProvider = {
	id: RUNNINGHUB_VOICE_DESIGN_PROVIDER_ID,
	name: "RunningHub Voice Design",
	description: "RunningHub fixed AI App voice design generation",

	async submitVoiceDesignTask({
		request,
		apiKey,
	}: {
		request: VoiceDesignRequest;
		apiKey: string;
	}): Promise<VoiceDesignTaskResult> {
		if (!apiKey) {
			throw new Error("RUNNINGHUB_API_KEY is not configured");
		}

		const response = await fetch(VOICE_DESIGN_GENERATE_ROUTE, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(request),
		});

		const payload = await assertOkJson({ response });
		return {
			taskId: String(payload.taskId),
			status: normalizeRunningHubVoiceDesignStatus({
				status: String(payload.status),
			}),
			...(typeof payload.audioUrl === "string"
				? { audioUrl: payload.audioUrl }
				: {}),
			...(typeof payload.error === "string" ? { error: payload.error } : {}),
		};
	},

	async getVoiceDesignTask({
		taskId,
		apiKey,
	}: {
		taskId: string;
		apiKey: string;
	}): Promise<VoiceDesignTaskResult> {
		if (!apiKey) {
			throw new Error("RUNNINGHUB_API_KEY is not configured");
		}

		const params = new URLSearchParams({ taskId });
		const response = await fetch(`${VOICE_DESIGN_TASK_ROUTE}?${params}`, {
			headers: { Authorization: `Bearer ${apiKey}` },
		});

		const payload = await assertOkJson({ response });
		return {
			taskId: String(payload.taskId),
			status: normalizeRunningHubVoiceDesignStatus({
				status: String(payload.status),
			}),
			...(typeof payload.audioUrl === "string"
				? { audioUrl: payload.audioUrl }
				: {}),
			...(typeof payload.error === "string" ? { error: payload.error } : {}),
		};
	},

	async downloadVoiceDesignResult({
		audioUrl,
	}: {
		audioUrl: string;
	}): Promise<Blob> {
		const params = new URLSearchParams({ url: audioUrl });
		const response = await fetch(`${VOICE_DESIGN_DOWNLOAD_ROUTE}?${params}`);
		if (!response.ok) {
			throw new Error(`RunningHub audio download failed: ${response.status}`);
		}
		return response.blob();
	},
};
