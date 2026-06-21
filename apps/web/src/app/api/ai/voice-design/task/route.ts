import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryRunningHubVoiceDesignTask } from "@/lib/ai/providers/runninghub-voice-design-server";

const querySchema = z.object({
	taskId: z.string().min(1),
});

function apiKeyFromRequest({ request }: { request: NextRequest }): string {
	const authorization = request.headers.get("authorization");
	const match = authorization?.match(/^Bearer\s+(.+)$/i);
	if (!match?.[1]) {
		throw new Error("Missing Authorization header");
	}
	return match[1];
}

export async function GET(request: NextRequest) {
	try {
		const apiKey = apiKeyFromRequest({ request });
		const validation = querySchema.safeParse({
			taskId: request.nextUrl.searchParams.get("taskId"),
		});
		if (!validation.success) {
			return NextResponse.json(
				{ error: "Invalid request", details: validation.error.flatten() },
				{ status: 400 },
			);
		}

		const result = await queryRunningHubVoiceDesignTask({
			apiKey,
			taskId: validation.data.taskId,
		});
		return NextResponse.json(result);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Voice design task query failed";
		const status = message === "Missing Authorization header" ? 401 : 500;
		return NextResponse.json({ error: message }, { status });
	}
}
