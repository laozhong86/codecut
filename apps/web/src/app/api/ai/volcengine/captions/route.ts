import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	queryVolcengineSubtitleTask,
	submitVolcengineSubtitleTask,
} from "@/lib/ai/providers/volcengine-openspeech";

const requestSchema = z
	.object({
		mediaUrl: z
			.string()
			.url("Volcengine media URL must be a valid URL")
			.refine((value) => new URL(value).protocol === "https:", {
				message: "Volcengine media URL must use https",
			}),
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

		const submitted = await submitVolcengineSubtitleTask({
			apiKey,
			mediaUrl: validation.data.mediaUrl,
		});
		const result = await queryVolcengineSubtitleTask({
			apiKey,
			taskId: submitted.taskId,
		});
		return NextResponse.json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("Volcengine captions error:", error);
		return NextResponse.json(
			{ error: "Volcengine captions failed", detail: message },
			{ status: 502 },
		);
	}
}
