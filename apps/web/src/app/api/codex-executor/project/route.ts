import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	validateExecutorReadAccess,
	validateExecutorToken,
} from "@/lib/codex-executor/auth";
import {
	deleteExecutorProject,
	getExecutorProjectSnapshot,
	renameExecutorProject,
} from "@/lib/codex-executor/executor";

const renameProjectBodySchema = z
	.object({
		projectId: z.string().min(1),
		name: z.string().min(1),
	})
	.strict();

const projectIdBodySchema = z
	.object({
		projectId: z.string().min(1),
	})
	.strict();

export async function GET(request: NextRequest) {
	const projectId = request.nextUrl.searchParams.get("projectId");
	if (!projectId) {
		return NextResponse.json(
			{ error: "projectId query parameter is required." },
			{ status: 400 },
		);
	}

	const tokenError = await validateExecutorReadAccess({ request, projectId });
	if (tokenError) return tokenError;

	try {
		return NextResponse.json(await getExecutorProjectSnapshot({ projectId }));
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Project not found." },
			{ status: 404 },
		);
	}
}

export async function PATCH(request: NextRequest) {
	const tokenError = validateExecutorToken(request);
	if (tokenError) return tokenError;

	const body = await request.json();
	const parsedBody = renameProjectBodySchema.safeParse(body);
	if (!parsedBody.success) {
		return NextResponse.json(
			{
				error: "Invalid executor project rename body.",
				details: parsedBody.error.flatten().fieldErrors,
			},
			{ status: 400 },
		);
	}

	try {
		return NextResponse.json(await renameExecutorProject(parsedBody.data));
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Project not found." },
			{ status: 404 },
		);
	}
}

export async function DELETE(request: NextRequest) {
	const tokenError = validateExecutorToken(request);
	if (tokenError) return tokenError;

	const body = await request.json();
	const parsedBody = projectIdBodySchema.safeParse(body);
	if (!parsedBody.success) {
		return NextResponse.json(
			{
				error: "Invalid executor project delete body.",
				details: parsedBody.error.flatten().fieldErrors,
			},
			{ status: 400 },
		);
	}

	try {
		return NextResponse.json(await deleteExecutorProject(parsedBody.data));
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Project not found." },
			{ status: 404 },
		);
	}
}
