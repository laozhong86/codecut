import { EditorCore } from "@/core";
import {
	applyNarratedRemixPlanToEditor,
	type NarratedRemixEditor,
} from "@/lib/agent-bridge/narrated-remix/apply";
import type { AgentToolResult } from "../types";
import type { AgentTool } from "./types";

export function executeApplyNarratedRemixPlanTool({
	args,
	projectId,
	editor,
}: {
	args: Record<string, unknown>;
	projectId?: string;
	editor: NarratedRemixEditor;
}): AgentToolResult {
	const plan = args.plan;
	const planProjectId =
		plan && typeof plan === "object" && "projectId" in plan
			? (plan.projectId as unknown)
			: undefined;
	const activeProjectId =
		projectId ?? (typeof planProjectId === "string" ? planProjectId : "");
	const replaceExisting = args.replaceExisting === true;

	const result = applyNarratedRemixPlanToEditor({
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
		message: `Applied NarratedRemixPlan with ${result.summary.visualBeatCount} visual beat(s).`,
		data: result.summary,
	};
}

export const applyNarratedRemixPlanTool: AgentTool = {
	name: "apply_narrated_remix_plan",
	description:
		"Validate and apply a Codex-generated NarratedRemixPlan to the current Codecut timeline for the narrated-broll P0 video template. This tool consumes existing narration audio, muted video or image B-roll, optional independent controlled text overlays, and captions; it does not call an LLM, generate speech, and does not support TTS, BGM, SFX, effects, or append mode.",
	parameters: {
		type: "object",
		properties: {
			plan: {
				type: "object",
				description:
					"The Codex-generated NarratedRemixPlan JSON to validate and apply.",
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
		return executeApplyNarratedRemixPlanTool({
			args,
			editor: EditorCore.getInstance(),
		});
	},
};

export const narratedRemixTools: AgentTool[] = [applyNarratedRemixPlanTool];
