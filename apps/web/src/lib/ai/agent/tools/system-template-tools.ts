import {
	LocalTemplateTriggerTypeSchema,
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
	updateTemplate({
		id,
		updates,
	}: {
		id: string;
		updates: Partial<
			Omit<LocalTemplateScriptRecord, "id" | "createdAt" | "updatedAt">
		>;
	}): Promise<LocalTemplateScriptRecord>;
	getTemplate({
		id,
	}: {
		id: string;
	}): Promise<LocalTemplateScriptRecord | null>;
	deleteTemplate({ id }: { id: string }): Promise<void>;
	listTemplates(): Promise<LocalTemplateScriptRecord[]>;
	resolveTemplate({
		requestedTemplate,
		triggerType,
	}: {
		requestedTemplate?: string;
		triggerType?: LocalTemplateScriptRecord["trigger"]["types"][number];
	}): Promise<LocalTemplateScriptRecord>;
}

function templateSummary(template: LocalTemplateScriptRecord) {
	return {
		templateId: template.id,
		name: template.name,
		description: template.description,
		triggerTypes: template.trigger.types,
		defaultForTypes: template.trigger.defaultForTypes,
		aliases: template.trigger.aliases,
		stepCount: template.script.steps.length,
		verificationCount: template.script.verification.length,
		sourceOfTruth: "codecut-system-template-library",
	};
}

function requireTemplateId(args: Record<string, unknown>): string {
	if (typeof args.templateId !== "string" || args.templateId.trim() === "") {
		throw new Error("templateId is required to read a Codecut system template.");
	}
	return args.templateId.trim();
}

function optionalStringArg(
	args: Record<string, unknown>,
	key: string,
): string | undefined {
	if (args[key] === undefined) return undefined;
	if (typeof args[key] !== "string") {
		throw new Error(`${key} must be a string.`);
	}
	const value = args[key].trim();
	return value === "" ? undefined : value;
}

export async function executeListSystemTemplateScriptsTool({
	service = localTemplateScriptService,
}: {
	args?: Record<string, unknown>;
	service?: SystemTemplateScriptService;
}): Promise<AgentToolResult> {
	const templates = await service.listTemplates();
	return {
		success: true,
		message: `Listed ${templates.length} Codecut system template script${
			templates.length === 1 ? "" : "s"
		}.`,
		data: {
			templateCount: templates.length,
			sourceOfTruth: "codecut-system-template-library",
			templates: templates.map(templateSummary),
		},
	};
}

export async function executeGetSystemTemplateScriptTool({
	args,
	service = localTemplateScriptService,
}: {
	args: Record<string, unknown>;
	service?: SystemTemplateScriptService;
}): Promise<AgentToolResult> {
	const templateId = requireTemplateId(args);
	const template = await service.getTemplate({ id: templateId });
	if (!template) {
		return {
			success: false,
			message: `System template script not found: ${templateId}.`,
		};
	}

	return {
		success: true,
		message: `Read system template script "${template.name}" (${template.id}).`,
		data: {
			template,
			sourceOfTruth: "codecut-system-template-library",
		},
	};
}

export async function executeResolveSystemTemplateScriptTool({
	args,
	service = localTemplateScriptService,
}: {
	args: Record<string, unknown>;
	service?: SystemTemplateScriptService;
}): Promise<AgentToolResult> {
	const requestedTemplate = optionalStringArg(args, "requestedTemplate");
	const rawTriggerType = optionalStringArg(args, "triggerType");
	const triggerType =
		rawTriggerType === undefined
			? undefined
			: LocalTemplateTriggerTypeSchema.parse(rawTriggerType);
	const template = await service.resolveTemplate({
		requestedTemplate,
		triggerType,
	});

	return {
		success: true,
		message: `Resolved system template script "${template.name}" (${template.id}).`,
		data: {
			template,
			sourceOfTruth: "codecut-system-template-library",
			match: {
				...(requestedTemplate === undefined ? {} : { requestedTemplate }),
				...(triggerType === undefined ? {} : { triggerType }),
			},
		},
	};
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

export async function executeUpdateSystemTemplateScriptTool({
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
				"Template update requires explicit user confirmation before changing Codecut system templates.",
		};
	}

	const parsed = LocalTemplateScriptSchema.parse(args.template);
	const existing = await service.getTemplate({ id: parsed.id });
	if (!existing) {
		return {
			success: false,
			message: `System template script not found: ${parsed.id}.`,
		};
	}

	const template = await service.updateTemplate({
		id: parsed.id,
		updates: {
			name: parsed.name,
			description: parsed.description,
			trigger: parsed.trigger,
			script: parsed.script,
		},
	});
	const templates = await service.listTemplates();

	return {
		success: true,
		message: `Updated system template script "${template.name}" (${template.id}).`,
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

export const listSystemTemplateScriptsTool: AgentTool = {
	name: "list_system_template_scripts",
	description:
		"List Codecut system template scripts from the browser local Templates UI library. Use this before explaining available named templates, using a saved template, or falling back to built-in video template IDs.",
	requiresConfirmation: false,
	parameters: {
		type: "object",
		properties: {},
		required: [],
	},
	async execute(args) {
		return executeListSystemTemplateScriptsTool({ args });
	},
};

export const getSystemTemplateScriptTool: AgentTool = {
	name: "get_system_template_script",
	description:
		"Read one complete Codecut system template script by exact template ID from the browser local Templates UI library.",
	requiresConfirmation: false,
	parameters: {
		type: "object",
		properties: {
			templateId: {
				type: "string",
				description: "The exact Codecut system template script ID to read.",
			},
		},
		required: ["templateId"],
	},
	async execute(args) {
		return executeGetSystemTemplateScriptTool({ args });
	},
};

export const resolveSystemTemplateScriptTool: AgentTool = {
	name: "resolve_system_template_script",
	description:
		"Resolve one Codecut system template script by ID, name, alias, or default trigger type from the browser local Templates UI library.",
	requiresConfirmation: false,
	parameters: {
		type: "object",
		properties: {
			requestedTemplate: {
				type: "string",
				description: "Template ID, exact name, or alias mentioned by the user.",
			},
			triggerType: {
				type: "string",
				enum: [
					"talking-head-short",
					"tutorial-demo",
					"product-proof-ad",
					"narrated-broll",
					"subtitle-pass",
					"timeline-inspection",
					"custom",
				],
				description:
					"Template trigger type to use when no explicit template name was provided.",
			},
		},
		required: [],
	},
	async execute(args) {
		return executeResolveSystemTemplateScriptTool({ args });
	},
};

export const updateSystemTemplateScriptTool: AgentTool = {
	name: "update_system_template_script",
	description:
		"Update one user-confirmed Codecut system template script in place using a strict LocalTemplateScript JSON object with the same template ID. Do not call this before the user explicitly confirms the update.",
	requiresConfirmation: true,
	parameters: {
		type: "object",
		properties: {
			confirmedByUser: {
				type: "boolean",
				description:
					"Must be true only after the user explicitly confirmed updating this exact system template.",
			},
			template: {
				type: "object",
				description:
					"The strict LocalTemplateScript JSON object to apply to an existing Codecut system template with the same ID.",
			},
		},
		required: ["confirmedByUser", "template"],
	},
	async execute(args) {
		return executeUpdateSystemTemplateScriptTool({ args });
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
	listSystemTemplateScriptsTool,
	getSystemTemplateScriptTool,
	resolveSystemTemplateScriptTool,
	importSystemTemplateScriptTool,
	updateSystemTemplateScriptTool,
	deleteSystemTemplateScriptTool,
];
