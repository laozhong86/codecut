import { type NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
	return NextResponse.json(
		{ error: "Server-side media download proxy is disabled." },
		{ status: 410 },
	);
}
