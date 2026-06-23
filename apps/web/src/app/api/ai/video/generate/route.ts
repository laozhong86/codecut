import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	requireAllowedHttpsUrl,
	UnsafeOutboundUrlError,
} from "@/lib/security/outbound-url";

const SEEDANCE_TASKS_API_URL =
	"https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";

const proxyRequestSchema = z.object({
	url: z.string().url(),
	headers: z.record(z.string()).optional(),
	body: z.record(z.unknown()),
});

function providerHeaders({
	headers = {},
}: {
	headers?: Record<string, string>;
}): Record<string, string> {
	const outgoing: Record<string, string> = {
		"Content-Type": "application/json",
	};

	for (const [name, value] of Object.entries(headers)) {
		if (name.toLowerCase() !== "authorization") {
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
			allowedExactUrls: [SEEDANCE_TASKS_API_URL],
		});

		const response = await fetch(providerUrl.href, {
			method: "POST",
			headers: providerHeaders({ headers }),
			body: JSON.stringify(body),
		});
		const responseText = await response.text();

		let responseData: unknown;
		try {
			responseData = JSON.parse(responseText);
		} catch {
			return NextResponse.json(
				{
					error: "Upstream returned non-JSON response",
					status: response.status,
					body: responseText.slice(0, 500),
				},
				{ status: 502 },
			);
		}

		if (!response.ok) {
			return NextResponse.json(responseData, { status: response.status });
		}

		return NextResponse.json(responseData);
	} catch (error) {
		if (error instanceof UnsafeOutboundUrlError) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		const message =
			error instanceof Error ? error.message : "Unknown error";
		console.error("AI video proxy error:", error);
		return NextResponse.json(
			{ error: "Proxy request failed", detail: message },
			{ status: 500 },
		);
	}
}
