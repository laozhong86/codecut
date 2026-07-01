import { type NextRequest, NextResponse } from "next/server";
import {
	confirmRequirementDraft,
	readRequirementConfirmation,
	resolveRequirementConfirmationRoot,
} from "@/lib/codex-executor/requirement-confirmation";

type RouteContext = {
	params: Promise<{ draft_id: string }> | { draft_id: string };
};

async function draftIdFromContext(context: RouteContext) {
	const params = await context.params;
	return params.draft_id;
}

async function readJsonBody(request: NextRequest) {
	try {
		return await request.json();
	} catch {
		return {};
	}
}

export async function POST(request: NextRequest, context: RouteContext) {
	const draftId = await draftIdFromContext(context);
	const body = await readJsonBody(request);
	try {
		await confirmRequirementDraft({
			root: resolveRequirementConfirmationRoot(),
			draftId,
			patch: body?.patch ?? {},
		});
		return NextResponse.json(
			await readRequirementConfirmation({
				root: resolveRequirementConfirmationRoot(),
				draftId,
			}),
		);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Requirement confirmation failed.",
			},
			{ status: 400 },
		);
	}
}
