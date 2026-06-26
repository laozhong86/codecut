import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateExecutorToken } from "@/lib/codex-executor/auth";
import {
	createExecutorProject,
	listExecutorProjects,
} from "@/lib/codex-executor/executor";
import { ConfirmedSetupSchema } from "@/lib/codex-executor/setup-contract";

const createProjectBodySchema = z
	.object({
		projectId: z.string().min(1),
		name: z.string().min(1),
		confirmedSetup: ConfirmedSetupSchema.optional(),
	})
	.strict();

function editorBaseUrl() {
	return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:4100").replace(
		/\/$/,
		"",
	);
}

export async function POST(request: NextRequest) {
	const tokenError = validateExecutorToken(request);
	if (tokenError) return tokenError;

	const body = await request.json();
	const parsedBody = createProjectBodySchema.safeParse(body);
	if (!parsedBody.success) {
		return NextResponse.json(
			{
				error: "Invalid executor project body.",
				details: parsedBody.error.flatten().fieldErrors,
			},
			{ status: 400 },
		);
	}

	const state = await createExecutorProject(parsedBody.data);
	return NextResponse.json({
		projectId: state.project.id,
		name: state.project.name,
		revision: state.revision,
		editorUrl: `${editorBaseUrl()}/en/editor/${state.project.id}#bridgeToken=${encodeURIComponent(state.browserBridgeToken)}`,
	});
}

export async function GET(request: NextRequest) {
	const tokenError = validateExecutorToken(request);
	if (tokenError) return tokenError;

	return NextResponse.json(await listExecutorProjects());
}
