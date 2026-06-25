import {
	type VideoTemplateId,
	type VideoTemplateManifest,
	VideoTemplateManifestSchema,
} from "./schema";

export const VIDEO_TEMPLATE_IDS = [
	"talking-head-short",
	"tutorial-demo",
	"product-proof-ad",
	"narrated-broll",
] as const satisfies readonly VideoTemplateId[];

const templates = [
	{
		id: "talking-head-short",
		label: "Talking-head short",
		intent:
			"Tighten a talking-head source into a short-form draft with a clear hook and retained meaning.",
		requiredEvidence: ["transcript"],
		defaultStructure: [
			"hook",
			"strongest statement",
			"supporting beats",
			"loop/CTA",
		],
		captionPreset: "talking-head-pop",
		executionPath: "speech-cleanup-to-edit-plan-v1",
		stopConditions: [
			"Transcript is missing or unusable.",
			"The requested cleanup depends on silence or word-level detection that is not available.",
		],
		verification: [
			"SpeechCleanupPlan validates and projects to EditPlan v1.",
			"apply_edit_plan succeeds.",
			"get_timeline_state verifies clip count, caption count, trim ranges, and final duration.",
		],
	},
	{
		id: "tutorial-demo",
		label: "Tutorial / demo",
		intent:
			"Preserve a teachable sequence from a tutorial, screen recording, or software demo.",
		requiredEvidence: ["transcript", "visual-proof"],
		defaultStructure: ["problem", "step 1", "step 2", "result"],
		captionPreset: "tutorial-clean",
		executionPath: "edit-plan-v1",
		stopConditions: [
			"Transcript or visible step context is missing.",
			"The request needs OCR or scene detection that is not available.",
		],
		verification: [
			"EditingDecisionLedger maps source evidence to each step.",
			"apply_edit_plan succeeds.",
			"get_timeline_state verifies chronological clips and readable captions.",
		],
	},
	{
		id: "product-proof-ad",
		label: "Product proof ad",
		intent:
			"Build a conversion-oriented UGC or product proof draft without inventing claims.",
		requiredEvidence: ["transcript", "visual-proof", "product-facts"],
		defaultStructure: ["hook", "pain/proof", "demo/process", "CTA"],
		captionPreset: "product-punch",
		executionPath: "edit-plan-v1",
		stopConditions: [
			"Product facts, offer facts, or visual proof are missing.",
			"The requested claim cannot be tied to spoken or visible evidence.",
		],
		verification: [
			"EditingDecisionLedger maps every claim to transcript, visual proof, or product facts.",
			"apply_edit_plan succeeds.",
			"get_timeline_state verifies the hook, proof beats, CTA timing, and captions.",
		],
	},
	{
		id: "narrated-broll",
		label: "Narrated B-roll",
		intent:
			"Combine existing narration audio with imported muted video or image B-roll and captions.",
		requiredEvidence: ["existing-narration-audio", "visual-broll"],
		defaultStructure: ["intro beat", "supporting visual beats", "closing beat"],
		executionPath: "narrated-remix-v1",
		stopConditions: [
			"Existing narration audio is missing.",
			"Visual B-roll is missing.",
			"The request requires TTS, BGM, SFX, effects, or append mode.",
		],
		verification: [
			"apply_narrated_remix_plan succeeds.",
			"get_timeline_state verifies separate video, audio, and text tracks.",
		],
	},
] satisfies VideoTemplateManifest[];

export const videoTemplateRegistry = templates.map((template) =>
	VideoTemplateManifestSchema.parse(template),
);

const videoTemplatesById = new Map<VideoTemplateId, VideoTemplateManifest>(
	videoTemplateRegistry.map((template) => [template.id, template]),
);

export function getVideoTemplate(
	id: VideoTemplateId,
): VideoTemplateManifest | undefined {
	return videoTemplatesById.get(id);
}
