import { z } from "zod";

export const BridgeToolNameSchema = z.enum([
	"get_project_info",
	"update_project_settings",
	"list_media_assets",
	"import_media_file",
	"get_timeline_state",
	"add_video_to_timeline",
	"add_text_to_timeline",
	"add_audio_to_timeline",
	"update_element",
	"delete_element",
	"move_element",
	"export_project",
	"transcribe_media",
	"build_post_cut_captions",
	"apply_edit_plan",
	"apply_narrated_remix_plan",
	"create_text_background_effect",
	"create_human_pip_effect",
	"generate_digital_human",
	"generate_runninghub_voice_design",
	"generate_runninghub_voice_clone",
	"generate_volcengine_cloned_voice",
	"transcribe_volcengine_url",
	"build_volcengine_url_captions",
	"import_system_template_script",
	"update_system_template_script",
	"delete_system_template_script",
]);

export const BridgeCommandSchema = z
	.object({
		id: z.string().min(1),
		tool: BridgeToolNameSchema,
		args: z.record(z.string(), z.unknown()),
	})
	.strict();

export const BridgeEnvelopeSchema = z
	.object({
		version: z.literal(1),
		projectId: z.string().min(1),
		source: z.literal("codex"),
		commands: z.array(BridgeCommandSchema).min(1).max(20),
	})
	.strict();

export const BridgeCommandResultSchema = z
	.object({
		commandId: z.string().min(1),
		tool: BridgeToolNameSchema,
		success: z.boolean(),
		message: z.string(),
		data: z.record(z.string(), z.unknown()).optional(),
		skipped: z.boolean().optional(),
	})
	.strict();

export const BridgeEnvelopeResultSchema = z
	.object({
		envelopeProjectId: z.string().min(1),
		results: z.array(BridgeCommandResultSchema),
	})
	.strict();

export type BridgeToolName = z.infer<typeof BridgeToolNameSchema>;
export type BridgeCommand = z.infer<typeof BridgeCommandSchema>;
export type BridgeEnvelope = z.infer<typeof BridgeEnvelopeSchema>;
export type BridgeCommandResult = z.infer<typeof BridgeCommandResultSchema>;
export type BridgeEnvelopeResult = z.infer<typeof BridgeEnvelopeResultSchema>;
