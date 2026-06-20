import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	getBridgeHeartbeatStatus,
	recordBridgeHeartbeat,
} from "@/lib/agent-bridge/heartbeat";
import { validateBridgeBrowserOrigin } from "@/lib/agent-bridge/origin";

const postBodySchema = z
	.object({
		projectId: z.string().min(1),
	})
	.strict();

function validateBridgeToken(request: NextRequest): NextResponse | null {
	const expectedToken = process.env.CODECUT_AGENT_BRIDGE_TOKEN;
	if (!expectedToken) {
		return NextResponse.json(
			{ error: "CODECUT_AGENT_BRIDGE_TOKEN is required." },
			{ status: 503 },
		);
	}

	const authorization = request.headers.get("authorization");
	if (authorization !== `Bearer ${expectedToken}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return null;
}

export async function POST(request: NextRequest) {
	const originError = validateBridgeBrowserOrigin(request);
	if (originError) return originError;

	const body = await request.json();
	const parsedBody = postBodySchema.safeParse(body);
	if (!parsedBody.success) {
		return NextResponse.json(
			{
				error: "Invalid bridge heartbeat body.",
				details: parsedBody.error.flatten().fieldErrors,
			},
			{ status: 400 },
		);
	}

	const record = recordBridgeHeartbeat({
		projectId: parsedBody.data.projectId,
		origin: request.headers.get("origin"),
		userAgent: request.headers.get("user-agent"),
	});

	return NextResponse.json({
		projectId: record.projectId,
		lastSeenAt: record.lastSeenAt,
	});
}

export async function GET(request: NextRequest) {
	const tokenError = validateBridgeToken(request);
	if (tokenError) return tokenError;

	const projectId = request.nextUrl.searchParams.get("projectId");
	if (!projectId) {
		return NextResponse.json(
			{ error: "projectId query parameter is required." },
			{ status: 400 },
		);
	}

	return NextResponse.json(getBridgeHeartbeatStatus({ projectId }));
}
