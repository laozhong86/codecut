import { type NextRequest, NextResponse } from "next/server";
import { validateExecutorReadAccess } from "@/lib/codex-executor/auth";
import { readExecutorMedia } from "@/lib/codex-executor/executor";

export async function GET(request: NextRequest) {
	const projectId = request.nextUrl.searchParams.get("projectId");
	const mediaId = request.nextUrl.searchParams.get("mediaId");
	if (!projectId || !mediaId) {
		return NextResponse.json(
			{ error: "projectId and mediaId query parameters are required." },
			{ status: 400 },
		);
	}

	const tokenError = await validateExecutorReadAccess({ request, projectId });
	if (tokenError) return tokenError;

	try {
		const { asset, bytes } = await readExecutorMedia({ projectId, mediaId });
		return new NextResponse(bytes, {
			headers: {
				"content-type": asset.mimeType,
				"content-length": String(bytes.byteLength),
			},
		});
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Media not found." },
			{ status: 404 },
		);
	}
}
