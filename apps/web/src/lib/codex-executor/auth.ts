import { type NextRequest, NextResponse } from "next/server";
import { EXECUTOR_BROWSER_BRIDGE_TOKEN_HEADER } from "@/lib/codex-executor/browser-bridge-token";
import { getExecutorBrowserBridgeToken } from "@/lib/codex-executor/executor";

export function validateExecutorToken(
	request: NextRequest,
): NextResponse | null {
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

export async function validateExecutorBrowserBridgeToken({
	request,
	projectId,
}: {
	request: NextRequest;
	projectId: string;
}): Promise<NextResponse | null> {
	const suppliedToken = request.headers.get(EXECUTOR_BROWSER_BRIDGE_TOKEN_HEADER);
	if (!suppliedToken) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const expectedToken = await getExecutorBrowserBridgeToken({ projectId });
		if (suppliedToken !== expectedToken) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		return null;
	} catch {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
}

export async function validateExecutorReadAccess({
	request,
	projectId,
}: {
	request: NextRequest;
	projectId: string;
}): Promise<NextResponse | null> {
	if (request.headers.get("authorization")) {
		return validateExecutorToken(request);
	}

	return validateExecutorBrowserBridgeToken({ request, projectId });
}
