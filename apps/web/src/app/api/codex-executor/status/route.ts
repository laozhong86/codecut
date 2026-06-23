import { type NextRequest, NextResponse } from "next/server";
import { validateExecutorReadAccess } from "@/lib/codex-executor/auth";
import { getExecutorStatus } from "@/lib/codex-executor/executor";

export async function GET(request: NextRequest) {
	const projectId = request.nextUrl.searchParams.get("projectId");
	if (!projectId) {
		return NextResponse.json(
			{ error: "projectId query parameter is required." },
			{ status: 400 },
		);
	}

	const tokenError = await validateExecutorReadAccess({ request, projectId });
	if (tokenError) return tokenError;

	try {
		return NextResponse.json(await getExecutorStatus({ projectId }));
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Project not found." },
			{ status: 404 },
		);
	}
}
