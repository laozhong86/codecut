import { type NextRequest, NextResponse } from "next/server";

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
