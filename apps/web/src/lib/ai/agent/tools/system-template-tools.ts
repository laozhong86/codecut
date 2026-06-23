import {
	LocalTemplateScriptSchema,
	localTemplateScriptService,
	type LocalTemplateScriptRecord,
} from "@/lib/template-scripts";
import type { AgentToolResult } from "../types";
import type { AgentTool } from "./types";

interface SystemTemplateScriptService {
	registerTemplate({
		template,
	}: {
		template: LocalTemplateScriptRecord;
	}): Promise<LocalTemplateScriptRecord>;
	listTemplates(): Promise<LocalTemplateScriptRecord[]>;
}

export async function executeImportSystemTemplateScriptTool({
	args,
	service = localTemplateScriptService,
}: {
	args: Record<string, unknown>;
	service?: SystemTemplateScriptService;
}): Promise<AgentToolResult> {
	if (args.confirmedByUser !== true) {
		return {
			success: false,
			message:
				"Template import requires explicit user confirmation before writing to Codecut system templates.",
		};
	}

	const parsed = LocalTemplateScriptSchema.parse(args.template);
	const template = await service.registerTemplate({ template: parsed });
	const templates = await service.listTemplates();

	return {
		success: true,
		message: `Imported system template script "${template.name}" (${template.id}).`,
		data: {
			templateId: template.id,
			name: template.name,
			triggerTypes: template.trigger.types,
			defaultForTypes: template.trigger.defaultForTypes,
			aliases: template.trigger.aliases,
			stepCount: template.script.steps.length,
			verificationCount: template.script.verification.length,
			templateCount: templates.length,
			sourceOfTruth: "codecut-system-template-library",
			visibleInTemplatesUi: true,
		},
	};
}

export const importSystemTemplateScriptTool: AgentTool = {
	name: "import_system_template_script",
	description:
		"Import a user-confirmed reference-derived template draft into the Codecut system template library used by the Templates UI and future Codex planning context. Do not call this before the user explicitly confirms the template draft.",
	requiresConfirmation: true,
	parameters: {
		type: "object",
		properties: {
			confirmedByUser: {
				type: "boolean",
				description:
					"Must be true only after the user explicitly confirmed this exact template draft for import.",
			},
			template: {
				type: "object",
				description:
					"The strict LocalTemplateScript JSON object to import into Codecut system templates.",
			},
		},
		required: ["confirmedByUser", "template"],
	},
	async execute(args) {
		return executeImportSystemTemplateScriptTool({ args });
	},
};

export const systemTemplateTools: AgentTool[] = [importSystemTemplateScriptTool];
