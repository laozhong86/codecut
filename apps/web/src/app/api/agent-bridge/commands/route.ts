import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	enqueueBridgeEnvelope,
	takePendingBridgeQueueItems,
} from "@/lib/agent-bridge/queue";
import { validateBridgeBrowserOrigin } from "@/lib/agent-bridge/origin";
import { BridgeEnvelopeSchema } from "@/lib/agent-bridge/schema";

const postBodySchema = z
	.object({
		envelope: BridgeEnvelopeSchema,
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
	const tokenError = validateBridgeToken(request);
	if (tokenError) return tokenError;

	const body = await request.json();
	const parsedBody = postBodySchema.safeParse(body);
	if (!parsedBody.success) {
		return NextResponse.json(
			{
				error: "Invalid bridge command envelope.",
				details: parsedBody.error.flatten().fieldErrors,
			},
			{ status: 400 },
		);
	}

	const item = enqueueBridgeEnvelope({
		envelope: parsedBody.data.envelope,
	});

	return NextResponse.json({
		id: item.id,
		status: item.status,
		projectId: item.projectId,
	});
}

export async function GET(request: NextRequest) {
	const originError = validateBridgeBrowserOrigin(request);
	if (originError) return originError;

	const projectId = request.nextUrl.searchParams.get("projectId");
	if (!projectId) {
		return NextResponse.json(
			{ error: "projectId query parameter is required." },
			{ status: 400 },
		);
	}

	const items = takePendingBridgeQueueItems({
		projectId,
		limit: 5,
	});

	return NextResponse.json({
		items: items.map((item) => ({
			id: item.id,
			envelope: item.envelope,
			status: item.status,
		})),
	});
}
