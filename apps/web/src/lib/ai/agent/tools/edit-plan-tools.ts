import { EditorCore } from "@/core";
import {
	applyEditPlanToEditor,
	type EditPlanEditor,
} from "@/lib/agent-bridge/edit-plan/apply";
import type { AgentToolResult } from "../types";
import type { AgentTool } from "./types";

export function executeApplyEditPlanTool({
	args,
	projectId,
	editor,
}: {
	args: Record<string, unknown>;
	projectId?: string;
	editor: EditPlanEditor;
}): AgentToolResult {
	const plan = args.plan;
	const planProjectId =
		plan && typeof plan === "object" && "projectId" in plan
			? (plan.projectId as unknown)
			: undefined;
	const activeProjectId =
		projectId ?? (typeof planProjectId === "string" ? planProjectId : "");
	const replaceExisting = args.replaceExisting === true;

	const result = applyEditPlanToEditor({
		plan,
		projectId: activeProjectId,
		replaceExisting,
		editor,
	});

	if (!result.success) {
		return {
			success: false,
			message: result.message,
			...(result.path ? { data: { path: result.path } } : {}),
		};
	}

	return {
		success: true,
		message: `Applied EditPlan with ${result.summary.clipCount} clip(s).`,
		data: result.summary,
	};
}

export const applyEditPlanTool: AgentTool = {
	name: "apply_edit_plan",
	description:
		"Validate and apply a Codex-generated EditPlan to the current Codecut timeline. P0 video template ids that can use this path are talking-head-short, tutorial-demo, and product-proof-ad. This tool does not generate plans, call an LLM, apply template marketplace effects, or silently repair unsupported template requests.",
	parameters: {
		type: "object",
		properties: {
			plan: {
				type: "object",
				description: "The Codex-generated EditPlan JSON to validate and apply.",
			},
			replaceExisting: {
				type: "boolean",
				description:
					"Whether to replace existing timeline content. Required for non-empty timelines.",
			},
		},
		required: ["plan", "replaceExisting"],
	},
	async execute(args) {
		return executeApplyEditPlanTool({
			args,
			editor: EditorCore.getInstance(),
		});
	},
};

export const editPlanTools: AgentTool[] = [applyEditPlanTool];
