import { type NextRequest, NextResponse } from "next/server";
import { parseDigitalHumanGenerateFormData } from "@/lib/ai/runninghub-generation-route-inputs";
import {
	submitRunningHubDigitalHumanTask,
	uploadRunningHubMediaFile,
} from "@/lib/ai/providers/runninghub-digital-human-server";

function apiKeyFromRequest({ request }: { request: NextRequest }): string {
	const authorization = request.headers.get("authorization");
	const match = authorization?.match(/^Bearer\s+(.+)$/i);
	if (!match?.[1]) {
		throw new Error("Missing Authorization header");
	}
	return match[1];
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
