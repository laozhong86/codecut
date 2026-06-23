import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type {
	VoiceCloneRequest,
	VoiceCloneTaskResult,
} from "@/lib/ai/providers";
import {
	submitRunningHubVoiceCloneTask,
} from "@/lib/ai/providers/runninghub-voice-clone-server";
import { uploadRunningHubMediaFile } from "@/lib/ai/providers/runninghub-digital-human-server";

const voiceCloneGenerateSchema = z.object({
	text: z.string().trim().min(1),
});

const ACCEPTED_AUDIO_MIME_TYPES = new Set([
	"audio/mpeg",
	"audio/mp4",
	"audio/wav",
	"audio/x-wav",
]);
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

interface ParsedVoiceCloneGenerateFormData {
	audioFile: File;
	request: VoiceCloneRequest;
}

interface VoiceCloneGenerateRequestInput {
	headers: Headers;
	formData: () => Promise<FormData>;
}

interface VoiceCloneGenerateHandlers {
	uploadAudioFile?: (params: {
		apiKey: string;
		file: File;
	}) => Promise<string>;
	submitVoiceCloneTask?: (params: {
		apiKey: string;
		request: VoiceCloneRequest;
		audioFileName: string;
	}) => Promise<VoiceCloneTaskResult>;
}

function apiKeyFromRequest({
	request,
}: {
	request: VoiceCloneGenerateRequestInput;
}): string {
	const authorization = request.headers.get("authorization");
	const match = authorization?.match(/^Bearer\s+(.+)$/i);
	if (!match?.[1]) {
		throw new Error("Missing Authorization header");
	}
	return match[1];
}

function requireFile({
	formData,
	name,
}: {
	formData: FormData;
	name: string;
}): File {
	const value = formData.get(name);
	if (!(value instanceof File)) {
		throw new Error(`${name} file is required`);
	}
	return value;
}

function validateAudioFile({ file }: { file: File }): void {
	if (file.size <= 0) {
		throw new Error("Audio file is empty");
	}
	if (file.size > MAX_AUDIO_BYTES) {
		throw new Error("Audio file exceeds 100MB");
	}
	if (!ACCEPTED_AUDIO_MIME_TYPES.has(file.type)) {
		throw new Error("Audio file type is not supported");
	}
}

function errorStatus({ message }: { message: string }): number {
	if (message === "Missing Authorization header") return 401;
	if (
		message === "Invalid voice clone generation request" ||
		message.includes("file is required") ||
		message.includes("file is empty") ||
		message.includes("file exceeds") ||
		message.includes("file type is not supported")
	) {
		return 400;
	}
	return 500;
}

export function parseVoiceCloneGenerateFormData({
	formData,
}: {
	formData: FormData;
}): ParsedVoiceCloneGenerateFormData {
	const audioFile = requireFile({ formData, name: "audio" });
	validateAudioFile({ file: audioFile });

	const validation = voiceCloneGenerateSchema.safeParse({
		text: formData.get("text"),
	});
	if (!validation.success) {
		throw new Error("Invalid voice clone generation request");
	}
	return {
		audioFile,
		request: validation.data,
	};
}

export async function handleVoiceCloneGenerateRequest({
	request,
	uploadAudioFile = uploadRunningHubMediaFile,
	submitVoiceCloneTask = submitRunningHubVoiceCloneTask,
}: {
	request: VoiceCloneGenerateRequestInput;
} & VoiceCloneGenerateHandlers): Promise<VoiceCloneTaskResult> {
	const apiKey = apiKeyFromRequest({ request });
	const formData = await request.formData();
	const { audioFile, request: generateRequest } =
		parseVoiceCloneGenerateFormData({ formData });
	const audioFileName = await uploadAudioFile({
		apiKey,
		file: audioFile,
	});
	return submitVoiceCloneTask({
		apiKey,
		request: generateRequest,
		audioFileName,
	});
}

export async function POST(request: NextRequest) {
	try {
		const result = await handleVoiceCloneGenerateRequest({ request });
		return NextResponse.json(result);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Voice clone generation failed";
		return NextResponse.json(
			{ error: message },
			{ status: errorStatus({ message }) },
		);
	}
}
