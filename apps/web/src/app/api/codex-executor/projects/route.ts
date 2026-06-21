import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateExecutorToken } from "@/lib/codex-executor/auth";
import {
	createExecutorProject,
	listExecutorProjects,
} from "@/lib/codex-executor/executor";

const createProjectBodySchema = z
	.object({
		projectId: z.string().min(1),
		name: z.string().min(1),
	})
	.strict();

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
		editorUrl: `http://127.0.0.1:4100/en/editor/${state.project.id}`,
	});
}

export async function GET(request: NextRequest) {
	const tokenError = validateExecutorToken(request);
	if (tokenError) return tokenError;

	return NextResponse.json(await listExecutorProjects());
}
