import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateExecutorToken } from "@/lib/codex-executor/auth";
import {
	executeCodexExecutorEnvelope,
	isExecutorProjectNotFoundError,
} from "@/lib/codex-executor/executor";

const postBodySchema = z
	.object({
		envelope: z.unknown(),
	})
	.strict();

export async function POST(request: NextRequest) {
	const tokenError = validateExecutorToken(request);
	if (tokenError) return tokenError;

	const body = await request.json();
	const parsedBody = postBodySchema.safeParse(body);
	if (!parsedBody.success) {
		return NextResponse.json(
			{
				error: "Invalid executor command body.",
				details: parsedBody.error.flatten().fieldErrors,
			},
			{ status: 400 },
		);
	}

	try {
		const result = await executeCodexExecutorEnvelope({
			envelope: parsedBody.data.envelope,
		});
		return NextResponse.json(result);
	} catch (error) {
		const status = error instanceof z.ZodError ? 400 : 500;
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Executor command could not be executed.",
			},
			{
				status: isExecutorProjectNotFoundError(error) ? 404 : status,
			},
		);
	}
}
