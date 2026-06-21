import type {
	AIDigitalHumanProvider,
	DigitalHumanGenerationRequest,
	DigitalHumanTaskResult,
	DigitalHumanTaskStatus,
} from "./types";

export const RUNNINGHUB_DIGITAL_HUMAN_PROVIDER_ID =
	"runninghub-digital-human";
export const RUNNINGHUB_DIGITAL_HUMAN_APP_ID = "2052014238952108033";
export const RUNNINGHUB_API_BASE = "https://www.runninghub.cn";

const DIGITAL_HUMAN_DOWNLOAD_ROUTE = "/api/ai/digital-human/download";
const DIGITAL_HUMAN_GENERATE_ROUTE = "/api/ai/digital-human/generate";
const DIGITAL_HUMAN_TASK_ROUTE = "/api/ai/digital-human/task";

export interface RunningHubNodeInfo {
	nodeId: string;
	fieldName: string;
	fieldValue: string;
	description: string;
}

export interface RunningHubDigitalHumanSubmitBody {
	nodeInfoList: RunningHubNodeInfo[];
	instanceType: "default";
	usePersonalQueue: "false";
}

export interface RunningHubDigitalHumanResultEntry {
	url?: string | null;
	nodeId?: string;
	outputType?: string | null;
	text?: string | null;
}

export function buildRunningHubDigitalHumanSubmitBody({
	imageFileName,
	audioFileName,
	scriptText,
	motionPrompt,
	width,
	height,
	fps,
}: {
	imageFileName: string;
	audioFileName: string;
	scriptText: string;
	motionPrompt: string;
	width: number;
	height: number;
	fps: number;
}): RunningHubDigitalHumanSubmitBody {
	return {
		nodeInfoList: [
			{
				nodeId: "54",
				fieldName: "value",
				fieldValue: String(width),
				description: "宽",
			},
			{
				nodeId: "55",
				fieldName: "value",
				fieldValue: String(height),
				description: "高",
			},
			{
				nodeId: "182",
				fieldName: "value",
				fieldValue: String(fps),
				description: "帧率",
			},
			{
				nodeId: "17",
				fieldName: "image",
				fieldValue: imageFileName,
				description: "图",
			},
			{
				nodeId: "156",
				fieldName: "audio",
				fieldValue: audioFileName,
				description: "参考音频",
			},
			{
				nodeId: "230",
				fieldName: "text",
				fieldValue: scriptText,
				description: "说话内容",
			},
			{
				nodeId: "58",
				fieldName: "text",
				fieldValue: motionPrompt,
				description: "提示词",
			},
		],
		instanceType: "default",
		usePersonalQueue: "false",
	};
}

export function normalizeRunningHubDigitalHumanStatus({
	status,
}: {
	status: string;
}): DigitalHumanTaskStatus {
	if (status === "SUCCESS") return "succeeded";
	if (status === "FAILED") return "failed";
	if (status === "RUNNING") return "running";
	if (status === "succeeded") return "succeeded";
	if (status === "failed") return "failed";
	if (status === "running") return "running";
	if (status === "pending") return "pending";
	return "pending";
}

export function extractRunningHubDigitalHumanVideoUrl({
	results,
}: {
	results: RunningHubDigitalHumanResultEntry[] | null | undefined;
}): string {
	const videoResult = results?.find(
		(result) =>
			typeof result.url === "string" &&
			result.url.length > 0 &&
			result.outputType?.toLowerCase() === "mp4",
	);
	if (!videoResult?.url) {
		throw new Error("RunningHub task succeeded without an mp4 result");
	}
	return videoResult.url;
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

export const runningHubDigitalHumanProvider: AIDigitalHumanProvider = {
	id: RUNNINGHUB_DIGITAL_HUMAN_PROVIDER_ID,
	name: "RunningHub Digital Human",
	description: "RunningHub fixed AI App digital human generation",

	async submitDigitalHumanTask({
		request,
		apiKey,
		imageFile,
		audioFile,
	}: {
		request: DigitalHumanGenerationRequest;
		apiKey: string;
		imageFile: File;
		audioFile: File;
	}): Promise<DigitalHumanTaskResult> {
		if (!apiKey) {
			throw new Error("RUNNINGHUB_API_KEY is not configured");
		}

		const formData = new FormData();
		formData.set("image", imageFile);
		formData.set("audio", audioFile);
		formData.set("scriptText", request.scriptText);
		formData.set("motionPrompt", request.motionPrompt);
		formData.set("width", String(request.width));
		formData.set("height", String(request.height));
		formData.set("fps", String(request.fps));

		const response = await fetch(DIGITAL_HUMAN_GENERATE_ROUTE, {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}` },
			body: formData,
		});

		const payload = await assertOkJson({ response });
		return {
			taskId: String(payload.taskId),
			status: normalizeRunningHubDigitalHumanStatus({
				status: String(payload.status),
			}),
			...(typeof payload.videoUrl === "string"
				? { videoUrl: payload.videoUrl }
				: {}),
			...(typeof payload.error === "string" ? { error: payload.error } : {}),
		};
	},

	async getDigitalHumanTask({
		taskId,
		apiKey,
	}: {
		taskId: string;
		apiKey: string;
	}): Promise<DigitalHumanTaskResult> {
		if (!apiKey) {
			throw new Error("RUNNINGHUB_API_KEY is not configured");
		}

		const params = new URLSearchParams({ taskId });
		const response = await fetch(`${DIGITAL_HUMAN_TASK_ROUTE}?${params}`, {
			headers: { Authorization: `Bearer ${apiKey}` },
		});

		const payload = await assertOkJson({ response });
		return {
			taskId: String(payload.taskId),
			status: normalizeRunningHubDigitalHumanStatus({
				status: String(payload.status),
			}),
			...(typeof payload.videoUrl === "string"
				? { videoUrl: payload.videoUrl }
				: {}),
			...(typeof payload.error === "string" ? { error: payload.error } : {}),
		};
	},

	async downloadDigitalHumanResult({
		videoUrl,
	}: {
		videoUrl: string;
	}): Promise<Blob> {
		const params = new URLSearchParams({ url: videoUrl });
		const response = await fetch(`${DIGITAL_HUMAN_DOWNLOAD_ROUTE}?${params}`);
		if (!response.ok) {
			throw new Error(`RunningHub video download failed: ${response.status}`);
		}
		return response.blob();
	},
};
