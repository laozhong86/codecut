import { type NextRequest, NextResponse } from "next/server";
import { handleVoiceCloneGenerateRequest } from "@/lib/ai/runninghub-generation-route-inputs";

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
