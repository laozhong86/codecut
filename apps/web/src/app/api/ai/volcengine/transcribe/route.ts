import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	queryVolcengineAsrTask,
	submitVolcengineAsrTask,
} from "@/lib/ai/providers/volcengine-openspeech";

const requestSchema = z
	.object({
		mediaUrl: z
			.string()
			.url("Volcengine media URL must be a valid URL")
			.refine((value) => new URL(value).protocol === "https:", {
				message: "Volcengine media URL must use https",
			}),
		requestId: z.string().trim().min(1).optional(),
	})
	.strict();

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const validation = requestSchema.safeParse(body);
		if (!validation.success) {
			return NextResponse.json(
				{
					error: "Invalid request",
					details: validation.error.flatten().fieldErrors,
				},
				{ status: 400 },
			);
		}

		const apiKey = process.env.VOLCENGINE_OPEN_SPEECH_API_KEY?.trim();
		if (!apiKey) {
			return NextResponse.json(
				{ error: "VOLCENGINE_OPEN_SPEECH_API_KEY is required" },
				{ status: 503 },
			);
		}

		const submitted = await submitVolcengineAsrTask({
			apiKey,
			audioUrl: validation.data.mediaUrl,
			requestId: validation.data.requestId,
		});
		const result = await queryVolcengineAsrTask({
			apiKey,
			requestId: submitted.taskId,
		});
		return NextResponse.json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("Volcengine transcribe error:", error);
		return NextResponse.json(
			{ error: "Volcengine transcribe failed", detail: message },
			{ status: 502 },
		);
	}
}
