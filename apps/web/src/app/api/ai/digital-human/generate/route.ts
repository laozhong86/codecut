import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	submitRunningHubDigitalHumanTask,
	uploadRunningHubMediaFile,
} from "@/lib/ai/providers/runninghub-digital-human-server";

const digitalHumanGenerateSchema = z.object({
	scriptText: z.string().min(1),
	motionPrompt: z.string().min(1),
	width: z.number().finite().positive(),
	height: z.number().finite().positive(),
	fps: z.number().finite().positive(),
});

const ACCEPTED_IMAGE_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
]);
const ACCEPTED_AUDIO_MIME_TYPES = new Set([
	"audio/mpeg",
	"audio/mp4",
	"audio/wav",
	"audio/x-wav",
]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

interface ParsedDigitalHumanGenerateFormData {
	imageFile: File;
	audioFile: File;
	request: z.infer<typeof digitalHumanGenerateSchema>;
}

function apiKeyFromRequest({ request }: { request: NextRequest }): string {
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

function validateUploadFile({
	file,
	label,
	acceptedMimeTypes,
	maxBytes,
}: {
	file: File;
	label: string;
	acceptedMimeTypes: Set<string>;
	maxBytes: number;
}): void {
	if (file.size <= 0) {
		throw new Error(`${label} file is empty`);
	}
	if (file.size > maxBytes) {
		throw new Error(`${label} file exceeds ${Math.round(maxBytes / 1024 / 1024)}MB`);
	}
	if (!acceptedMimeTypes.has(file.type)) {
		throw new Error(`${label} file type is not supported`);
	}
}

function parseRequiredNumber({
	formData,
	name,
}: {
	formData: FormData;
	name: string;
}): number {
	const value = formData.get(name);
	if (typeof value !== "string" || !value.trim()) {
		return Number.NaN;
	}
	return Number(value);
}

function errorStatus({ message }: { message: string }): number {
	if (message === "Missing Authorization header") return 401;
	if (
		message === "Invalid digital human generation request" ||
		message.includes("file is required") ||
		message.includes("file is empty") ||
		message.includes("file exceeds") ||
		message.includes("file type is not supported")
	) {
		return 400;
	}
	return 500;
}

export function parseDigitalHumanGenerateFormData({
	formData,
}: {
	formData: FormData;
}): ParsedDigitalHumanGenerateFormData {
	const imageFile = requireFile({ formData, name: "image" });
	const audioFile = requireFile({ formData, name: "audio" });
	validateUploadFile({
		file: imageFile,
		label: "Image",
		acceptedMimeTypes: ACCEPTED_IMAGE_MIME_TYPES,
		maxBytes: MAX_IMAGE_BYTES,
	});
	validateUploadFile({
		file: audioFile,
		label: "Audio",
		acceptedMimeTypes: ACCEPTED_AUDIO_MIME_TYPES,
		maxBytes: MAX_AUDIO_BYTES,
	});

	const validation = digitalHumanGenerateSchema.safeParse({
		scriptText: formData.get("scriptText"),
		motionPrompt: formData.get("motionPrompt"),
		width: parseRequiredNumber({ formData, name: "width" }),
		height: parseRequiredNumber({ formData, name: "height" }),
		fps: parseRequiredNumber({ formData, name: "fps" }),
	});
	if (!validation.success) {
		throw new Error("Invalid digital human generation request");
	}
	return {
		imageFile,
		audioFile,
		request: validation.data,
	};
}

export async function POST(request: NextRequest) {
	try {
		const apiKey = apiKeyFromRequest({ request });
		const formData = await request.formData();
		const { imageFile, audioFile, request: generateRequest } =
			parseDigitalHumanGenerateFormData({ formData });

		const imageFileName = await uploadRunningHubMediaFile({
			apiKey,
			file: imageFile,
		});
		const audioFileName = await uploadRunningHubMediaFile({
			apiKey,
			file: audioFile,
		});
		const result = await submitRunningHubDigitalHumanTask({
			apiKey,
			request: {
				imageMediaId: "uploaded-image",
				audioMediaId: "uploaded-audio",
				...generateRequest,
			},
			imageFileName,
			audioFileName,
		});

		return NextResponse.json(result);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Digital human generation failed";
		const status = errorStatus({ message });
		return NextResponse.json({ error: message }, { status });
	}
}
