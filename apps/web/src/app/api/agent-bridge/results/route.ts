import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	completeBridgeQueueItem,
	getBridgeQueueItem,
} from "@/lib/agent-bridge/queue";
import { BridgeCommandResultSchema } from "@/lib/agent-bridge/schema";

const postBodySchema = z
	.object({
		id: z.string().min(1),
		results: z.array(BridgeCommandResultSchema),
	})
	.strict();

function validateBridgeToken(request: NextRequest): NextResponse | null {
	const expectedToken = process.env.CUTIA_AGENT_BRIDGE_TOKEN;
	if (!expectedToken) {
		return NextResponse.json(
			{ error: "CUTIA_AGENT_BRIDGE_TOKEN is required." },
			{ status: 503 },
		);
	}

	const authorization = request.headers.get("authorization");
	if (authorization !== `Bearer ${expectedToken}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return null;
}

function validateSameOrigin(request: NextRequest): NextResponse | null {
	const requestOrigin = request.nextUrl.origin;
	const origin = request.headers.get("origin");
	const referer = request.headers.get("referer");

	if (origin && origin !== requestOrigin) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	if (referer) {
		try {
			if (new URL(referer).origin !== requestOrigin) {
				return NextResponse.json({ error: "Forbidden" }, { status: 403 });
			}
		} catch {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}
	}

	return null;
}

export async function POST(request: NextRequest) {
	const originError = validateSameOrigin(request);
	if (originError) return originError;

	const body = await request.json();
	const parsedBody = postBodySchema.safeParse(body);
	if (!parsedBody.success) {
		return NextResponse.json(
			{
				error: "Invalid bridge result body.",
				details: parsedBody.error.flatten().fieldErrors,
			},
			{ status: 400 },
		);
	}

	try {
		const item = completeBridgeQueueItem(parsedBody.data);
		if (!item) {
			return NextResponse.json(
				{ error: "Bridge command not found." },
				{ status: 404 },
			);
		}

		return NextResponse.json({
			id: item.id,
			status: item.status,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Bridge result could not be stored.",
			},
			{ status: 409 },
		);
	}
}

export async function GET(request: NextRequest) {
	const tokenError = validateBridgeToken(request);
	if (tokenError) return tokenError;

	const id = request.nextUrl.searchParams.get("id");
	if (!id) {
		return NextResponse.json(
			{ error: "id query parameter is required." },
			{ status: 400 },
		);
	}

	const item = getBridgeQueueItem({ id });
	if (!item) {
		return NextResponse.json(
			{ error: "Bridge command not found." },
			{ status: 404 },
		);
	}

	return NextResponse.json({
		id: item.id,
		status: item.status,
		projectId: item.projectId,
		results: item.results ?? [],
	});
}
