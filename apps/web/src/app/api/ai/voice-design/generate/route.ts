import { type NextRequest, NextResponse } from "next/server";
import { parseVoiceDesignGenerateBody } from "@/lib/ai/runninghub-generation-route-inputs";
import { submitRunningHubVoiceDesignTask } from "@/lib/ai/providers/runninghub-voice-design-server";

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
	if (message === "Invalid voice design generation request") return 400;
	return 500;
}

export async function POST(request: NextRequest) {
	try {
		const apiKey = apiKeyFromRequest({ request });
		const generateRequest = parseVoiceDesignGenerateBody({
			body: await request.json(),
		});
		const result = await submitRunningHubVoiceDesignTask({
			apiKey,
			request: generateRequest,
		});
		return NextResponse.json(result);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Voice design generation failed";
		return NextResponse.json(
			{ error: message },
			{ status: errorStatus({ message }) },
		);
	}
}
