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
	getTemplate({
		id,
	}: {
		id: string;
	}): Promise<LocalTemplateScriptRecord | null>;
	deleteTemplate({ id }: { id: string }): Promise<void>;
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

export async function executeDeleteSystemTemplateScriptTool({
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
				"Template delete requires explicit user confirmation before removing a Codecut system template.",
		};
	}

	if (typeof args.templateId !== "string" || args.templateId.trim() === "") {
		return {
			success: false,
			message: "templateId is required to delete a Codecut system template.",
		};
	}

	const templateId = args.templateId.trim();
	const template = await service.getTemplate({ id: templateId });
	if (!template) {
		return {
			success: false,
			message: `System template script not found: ${templateId}.`,
		};
	}

	await service.deleteTemplate({ id: templateId });
	const templates = await service.listTemplates();

	return {
		success: true,
		message: `Deleted system template script "${template.name}" (${template.id}).`,
		data: {
			templateId: template.id,
			name: template.name,
			templateCount: templates.length,
			sourceOfTruth: "codecut-system-template-library",
			visibleInTemplatesUi: false,
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

export const deleteSystemTemplateScriptTool: AgentTool = {
	name: "delete_system_template_script",
	description:
		"Delete one user-confirmed Codecut system template script from the Templates UI library. Use only for explicit cleanup or user-requested removal.",
	requiresConfirmation: true,
	parameters: {
		type: "object",
		properties: {
			confirmedByUser: {
				type: "boolean",
				description:
					"Must be true only after the user explicitly confirmed deleting this exact system template.",
			},
			templateId: {
				type: "string",
				description: "The exact Codecut system template script ID to delete.",
			},
		},
		required: ["confirmedByUser", "templateId"],
	},
	async execute(args) {
		return executeDeleteSystemTemplateScriptTool({ args });
	},
};

export const systemTemplateTools: AgentTool[] = [
	importSystemTemplateScriptTool,
	deleteSystemTemplateScriptTool,
];
