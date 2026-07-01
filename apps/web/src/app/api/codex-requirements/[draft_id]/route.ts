import { type NextRequest, NextResponse } from "next/server";
import {
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

export async function GET(_request: NextRequest, context: RouteContext) {
	const draftId = await draftIdFromContext(context);
	try {
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
						: "Requirement confirmation not found.",
			},
			{ status: 404 },
		);
	}
}
