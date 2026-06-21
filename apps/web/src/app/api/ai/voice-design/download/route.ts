import { type NextRequest, NextResponse } from "next/server";
import {
	assertAllowedRunningHubAudioUrl,
	downloadRunningHubAudioResult,
} from "@/lib/ai/providers/runninghub-result-download";

export { assertAllowedRunningHubAudioUrl, downloadRunningHubAudioResult };

export async function GET(request: NextRequest) {
	const url = request.nextUrl.searchParams.get("url");
	if (!url) {
		return NextResponse.json(
			{ error: "Missing url parameter" },
			{ status: 400 },
		);
	}

	try {
		const { bytes, contentType } = await downloadRunningHubAudioResult({ url });
		return new NextResponse(bytes, {
			status: 200,
			headers: {
				"Content-Type": contentType,
			},
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "RunningHub result download failed";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
