import { type NextRequest, NextResponse } from "next/server";

function getRequestOriginCandidates(request: NextRequest): Set<string> {
	const origins = new Set<string>([request.nextUrl.origin]);
	const protocol =
		request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
		request.nextUrl.protocol.replace(":", "");

	for (const headerName of ["host", "x-forwarded-host"]) {
		const host = request.headers.get(headerName)?.split(",")[0]?.trim();
		if (host) {
			origins.add(`${protocol}://${host}`);
		}
	}

	return origins;
}

export function validateBridgeBrowserOrigin(
	request: NextRequest,
): NextResponse | null {
	const allowedOrigins = getRequestOriginCandidates(request);
	const origin = request.headers.get("origin");
	const referer = request.headers.get("referer");

	if (origin && !allowedOrigins.has(origin)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	if (referer) {
		try {
			if (!allowedOrigins.has(new URL(referer).origin)) {
				return NextResponse.json({ error: "Forbidden" }, { status: 403 });
			}
		} catch {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}
	}

	return null;
}
