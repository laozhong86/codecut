import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	requireAllowedHttpsUrl,
	UnsafeOutboundUrlError,
} from "@/lib/security/outbound-url";

const SEEDREAM_API_URL =
	"https://ark.ap-southeast.bytepluses.com/api/v3/images/generations";
const GEMINI_API_PREFIX =
	"https://generativelanguage.googleapis.com/v1beta/models/";

const proxyRequestSchema = z.object({
	url: z.string().url(),
	headers: z.record(z.string()).optional(),
	body: z.record(z.unknown()),
});

function providerHeaders({
	url,
	headers = {},
}: {
	url: URL;
	headers?: Record<string, string>;
}): Record<string, string> {
	const allowedHeaderNames =
		url.href === SEEDREAM_API_URL ? ["authorization"] : ["x-goog-api-key"];
	const outgoing: Record<string, string> = {
		"Content-Type": "application/json",
	};

	for (const [name, value] of Object.entries(headers)) {
		if (!allowedHeaderNames.includes(name.toLowerCase())) {
			throw new UnsafeOutboundUrlError(
				`Header "${name}" is not allowed for this provider.`,
			);
		}
		outgoing[name] = value;
	}

	return outgoing;
}

export async function POST(request: NextRequest) {
	try {
		const json = await request.json();

		const validation = proxyRequestSchema.safeParse(json);
		if (!validation.success) {
			return NextResponse.json(
				{
					error: "Invalid request",
					details: validation.error.flatten().fieldErrors,
				},
				{ status: 400 },
			);
		}

		const { url, headers, body } = validation.data;
		const providerUrl = requireAllowedHttpsUrl({
			value: url,
			allowedExactUrls: [SEEDREAM_API_URL],
			allowedPrefixes: [GEMINI_API_PREFIX],
		});

		const response = await fetch(providerUrl.href, {
			method: "POST",
			headers: providerHeaders({ url: providerUrl, headers }),
			body: JSON.stringify(body),
		});

		const responseData = await response.json();

		if (!response.ok) {
			return NextResponse.json(responseData, { status: response.status });
		}

		return NextResponse.json(responseData);
	} catch (error) {
		if (error instanceof UnsafeOutboundUrlError) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		console.error("AI image proxy error:", error);
		return NextResponse.json(
			{ error: "Proxy request failed" },
			{ status: 500 },
		);
	}
}
