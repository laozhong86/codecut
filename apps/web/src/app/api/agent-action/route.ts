import { existsSync } from "node:fs";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { handleAgentAction } from "@/lib/codex-agent/character-portrait";

export const runtime = "nodejs";

const MAX_AGENT_ACTION_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
	const contentLength = request.headers.get("content-length");
	if (
		contentLength &&
		Number.parseInt(contentLength, 10) > MAX_AGENT_ACTION_BODY_BYTES
	) {
		return NextResponse.json(
			{ ok: false, error: "Request body is too large" },
			{ status: 413 },
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json(
			{ ok: false, error: "Invalid JSON body" },
			{ status: 400 },
		);
	}

	const cwd = process.cwd();
	const result = await handleAgentAction({
		body,
		cwd,
		publicDir: resolvePublicDir({ cwd }),
	});

	return NextResponse.json(result.body, { status: result.status });
}

function resolvePublicDir({ cwd }: { cwd: string }): string {
	const directPublicDir = join(cwd, "public");
	if (existsSync(directPublicDir)) {
		return directPublicDir;
	}

	return join(cwd, "apps/web/public");
}
