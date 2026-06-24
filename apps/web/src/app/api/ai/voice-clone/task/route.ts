import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryRunningHubVoiceCloneTask } from "@/lib/ai/providers/runninghub-voice-clone-server";
import { runningHubApiKeyFromRequest } from "@/lib/ai/runninghub-route-auth";

const querySchema = z.object({
	taskId: z.string().min(1),
});

export async function GET(request: NextRequest) {
	try {
		const apiKey = runningHubApiKeyFromRequest({ request });
		const validation = querySchema.safeParse({
			taskId: request.nextUrl.searchParams.get("taskId"),
		});
		if (!validation.success) {
			return NextResponse.json(
				{ error: "Invalid request", details: validation.error.flatten() },
				{ status: 400 },
			);
		}

		const result = await queryRunningHubVoiceCloneTask({
			apiKey,
			taskId: validation.data.taskId,
		});
		return NextResponse.json(result);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Voice clone task query failed";
		const status = message === "Missing Authorization header" ? 401 : 500;
		return NextResponse.json({ error: message }, { status });
	}
}
