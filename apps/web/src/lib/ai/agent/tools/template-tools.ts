import {
	TemplateSchema,
	TemplateTriggerTypeSchema,
	templateService,
	type Template,
	type TemplateImportCheck,
	type TemplateMaterialFacts,
	type TemplateResolution,
} from "@/lib/templates";
import type { AgentToolResult } from "../types";
import type { AgentTool } from "./types";

interface TemplateLibraryService {
	checkTemplateImport({ template }: { template: Template }): Promise<TemplateImportCheck>;
	registerTemplate({ template }: { template: Template }): Promise<Template>;
	updateTemplate({
		id,
		updates,
	}: {
		id: string;
		updates: Partial<
			Omit<Template, "id" | "source" | "readOnly" | "createdAt" | "updatedAt">
		>;
	}): Promise<Template>;
	getTemplate({ id }: { id: string }): Promise<Template | null>;
	deleteTemplate({ id }: { id: string }): Promise<void>;
	listTemplates(): Promise<Template[]>;
	resolveTemplate(args: {
		requestedTemplate?: string;
		triggerType?: Template["trigger"]["types"][number];
		userIntent?: string;
		platformHint?: string;
		materialFacts: TemplateMaterialFacts;
	}): Promise<TemplateResolution>;
}

function templateSummary(template: Template) {
	return {
		templateId: template.id,
		name: template.name,
		description: template.description,
		source: template.source,
		readOnly: template.readOnly,
		triggerTypes: template.trigger.types,
		defaultForTypes: template.trigger.defaultForTypes,
		aliases: template.trigger.aliases,
		stepCount: template.plan.steps.length,
		verificationCount: template.plan.verification.length,
		executionPath: template.execution.path,
		requiredEvidence: template.execution.requiredEvidence,
		sourceOfTruth: "codecut-template-library",
	};
}

function nextActionsForImportCheck(check: TemplateImportCheck): string[] {
	if (check.canImport) {
		return ["Call import_template after explicit user confirmation."];
	}
	if (check.code === "template-id-conflict") {
		return [
			"Call update_template after explicit user confirmation to replace the existing user template.",
			"Change template.id and call import_template to save it as a new template.",
		];
	}
	if (check.code === "reserved-built-in-id") {
		return ["Change template.id before importing the user template."];
	}
	if (check.code === "default-trigger-conflict") {
		return [
			"Remove the conflicting defaultForTypes entry before import.",
			"Update or delete the conflicting user template after explicit user confirmation.",
		];
	}
	return ["Set source to user and readOnly to false before importing."];
}

function templateImportCheckData(check: TemplateImportCheck) {
	return {
		canImport: check.canImport,
		code: check.code,
		message: check.message,
		draft: templateSummary(check.template),
		...(check.canImport
			? {}
			: {
					...(check.existingTemplate
						? { existingTemplate: templateSummary(check.existingTemplate) }
						: {}),
					...(check.conflictTemplate
						? { conflictTemplate: templateSummary(check.conflictTemplate) }
						: {}),
					...(check.triggerType ? { triggerType: check.triggerType } : {}),
				}),
		nextActions: nextActionsForImportCheck(check),
		sourceOfTruth: "codecut-template-library",
	};
}

function requireTemplateId(args: Record<string, unknown>): string {
	if (typeof args.templateId !== "string" || args.templateId.trim() === "") {
		throw new Error("templateId is required to read a Codecut template.");
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

function optionalBooleanArg(
	args: Record<string, unknown>,
	key: string,
): boolean | undefined {
	if (args[key] === undefined) return undefined;
	if (typeof args[key] !== "boolean") {
		throw new Error(`${key} must be a boolean.`);
	}
	return args[key];
}

function materialFactsFromArgs(
	args: Record<string, unknown>,
): TemplateMaterialFacts {
	return {
		hasTranscript: optionalBooleanArg(args, "hasTranscript"),
		hasVisualProof: optionalBooleanArg(args, "hasVisualProof"),
		hasProductFacts: optionalBooleanArg(args, "hasProductFacts"),
		hasExistingNarrationAudio: optionalBooleanArg(
			args,
			"hasExistingNarrationAudio",
		),
		hasVisualBroll: optionalBooleanArg(args, "hasVisualBroll"),
	};
}

export async function executeListTemplatesTool({
	service = templateService,
}: {
	args?: Record<string, unknown>;
	service?: TemplateLibraryService;
}): Promise<AgentToolResult> {
	const templates = await service.listTemplates();
	return {
		success: true,
		message: `Listed ${templates.length} Codecut template${
			templates.length === 1 ? "" : "s"
		}.`,
		data: {
			templateCount: templates.length,
			sourceOfTruth: "codecut-template-library",
			templates: templates.map(templateSummary),
		},
	};
}

export async function executeGetTemplateTool({
	args,
	service = templateService,
}: {
	args: Record<string, unknown>;
	service?: TemplateLibraryService;
}): Promise<AgentToolResult> {
	const templateId = requireTemplateId(args);
	const template = await service.getTemplate({ id: templateId });
	if (!template) {
		return {
			success: false,
			message: `Template not found: ${templateId}.`,
		};
	}

	return {
		success: true,
		message: `Read template "${template.name}" (${template.id}).`,
		data: {
			template,
			sourceOfTruth: "codecut-template-library",
		},
	};
}

export async function executeResolveTemplateTool({
	args,
	service = templateService,
}: {
	args: Record<string, unknown>;
	service?: TemplateLibraryService;
}): Promise<AgentToolResult> {
	const requestedTemplate = optionalStringArg(args, "requestedTemplate");
	const rawTriggerType = optionalStringArg(args, "triggerType");
	const triggerType =
		rawTriggerType === undefined
			? undefined
			: TemplateTriggerTypeSchema.parse(rawTriggerType);
	const userIntent = optionalStringArg(args, "userIntent");
	const platformHint = optionalStringArg(args, "platformHint");
	const resolution = await service.resolveTemplate({
		requestedTemplate,
		triggerType,
		userIntent,
		platformHint,
		materialFacts: materialFactsFromArgs(args),
	});

	return {
		success: resolution.success,
		message: resolution.success
			? `Resolved template "${resolution.template.name}" (${resolution.template.id}).`
			: resolution.message,
		data: {
			resolution,
			sourceOfTruth: "codecut-template-library",
		},
	};
}

export async function executeCheckTemplateImportTool({
	args,
	service = templateService,
}: {
	args: Record<string, unknown>;
	service?: TemplateLibraryService;
}): Promise<AgentToolResult> {
	const parsed = TemplateSchema.parse(args.template);
	const importCheck = await service.checkTemplateImport({ template: parsed });

	return {
		success: importCheck.canImport,
		message: importCheck.canImport
			? `Template "${importCheck.template.name}" (${importCheck.template.id}) can be imported.`
			: importCheck.message,
		data: templateImportCheckData(importCheck),
	};
}

export async function executeImportTemplateTool({
	args,
	service = templateService,
}: {
	args: Record<string, unknown>;
	service?: TemplateLibraryService;
}): Promise<AgentToolResult> {
	if (args.confirmedByUser !== true) {
		return {
			success: false,
			message:
				"Template import requires explicit user confirmation before writing to Codecut templates.",
		};
	}

	const parsed = TemplateSchema.parse(args.template);
	const importCheck = await service.checkTemplateImport({ template: parsed });
	if (!importCheck.canImport) {
		return {
			success: false,
			message: `Template import blocked: ${importCheck.message}`,
			data: templateImportCheckData(importCheck),
		};
	}
	const template = await service.registerTemplate({ template: parsed });
	const templates = await service.listTemplates();

	return {
		success: true,
		message: `Imported template "${template.name}" (${template.id}).`,
		data: {
			templateId: template.id,
			name: template.name,
			source: template.source,
			readOnly: template.readOnly,
			triggerTypes: template.trigger.types,
			defaultForTypes: template.trigger.defaultForTypes,
			aliases: template.trigger.aliases,
			stepCount: template.plan.steps.length,
			verificationCount: template.plan.verification.length,
			templateCount: templates.length,
			sourceOfTruth: "codecut-template-library",
			visibleInTemplatesUi: true,
		},
	};
}

export async function executeUpdateTemplateTool({
	args,
	service = templateService,
}: {
	args: Record<string, unknown>;
	service?: TemplateLibraryService;
}): Promise<AgentToolResult> {
	if (args.confirmedByUser !== true) {
		return {
			success: false,
			message:
				"Template update requires explicit user confirmation before changing Codecut templates.",
		};
	}

	const parsed = TemplateSchema.parse(args.template);
	const existing = await service.getTemplate({ id: parsed.id });
	if (!existing || existing.source !== "user") {
		return {
			success: false,
			message: `User template not found: ${parsed.id}.`,
		};
	}

	const template = await service.updateTemplate({
		id: parsed.id,
		updates: {
			name: parsed.name,
			description: parsed.description,
			trigger: parsed.trigger,
			plan: parsed.plan,
			execution: parsed.execution,
		},
	});
	const templates = await service.listTemplates();

	return {
		success: true,
		message: `Updated template "${template.name}" (${template.id}).`,
		data: {
			templateId: template.id,
			name: template.name,
			source: template.source,
			readOnly: template.readOnly,
			triggerTypes: template.trigger.types,
			defaultForTypes: template.trigger.defaultForTypes,
			aliases: template.trigger.aliases,
			stepCount: template.plan.steps.length,
			verificationCount: template.plan.verification.length,
			templateCount: templates.length,
			sourceOfTruth: "codecut-template-library",
			visibleInTemplatesUi: true,
		},
	};
}

export async function executeDeleteTemplateTool({
	args,
	service = templateService,
}: {
	args: Record<string, unknown>;
	service?: TemplateLibraryService;
}): Promise<AgentToolResult> {
	if (args.confirmedByUser !== true) {
		return {
			success: false,
			message:
				"Template delete requires explicit user confirmation before removing a Codecut template.",
		};
	}

	const templateId = requireTemplateId(args);
	const template = await service.getTemplate({ id: templateId });
	if (!template || template.source !== "user") {
		return {
			success: false,
			message: `User template not found: ${templateId}.`,
		};
	}

	await service.deleteTemplate({ id: templateId });
	const templates = await service.listTemplates();

	return {
		success: true,
		message: `Deleted template "${template.name}" (${template.id}).`,
		data: {
			templateId: template.id,
			name: template.name,
			templateCount: templates.length,
			sourceOfTruth: "codecut-template-library",
			visibleInTemplatesUi: false,
		},
	};
}

export const listTemplatesTool: AgentTool = {
	name: "list_templates",
	description:
		"List Codecut templates from the built-in and browser local template library. Use this before explaining available templates or applying a named template.",
	requiresConfirmation: false,
	parameters: {
		type: "object",
		properties: {},
		required: [],
	},
	async execute(args) {
		return executeListTemplatesTool({ args });
	},
};

export const getTemplateTool: AgentTool = {
	name: "get_template",
	description: "Read one complete Codecut template by exact template ID.",
	requiresConfirmation: false,
	parameters: {
		type: "object",
		properties: {
			templateId: {
				type: "string",
				description: "The exact Codecut template ID to read.",
			},
		},
		required: ["templateId"],
	},
	async execute(args) {
		return executeGetTemplateTool({ args });
	},
};

export const resolveTemplateTool: AgentTool = {
	name: "resolve_template",
	description:
		"Resolve one Codecut template by ID, name, alias, default trigger type, or smart match from user intent and available material evidence.",
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
			userIntent: {
				type: "string",
				description: "User editing intent for smart template matching.",
			},
			platformHint: {
				type: "string",
				description: "Optional platform or aspect-ratio hint.",
			},
			hasTranscript: { type: "boolean" },
			hasVisualProof: { type: "boolean" },
			hasProductFacts: { type: "boolean" },
			hasExistingNarrationAudio: { type: "boolean" },
			hasVisualBroll: { type: "boolean" },
		},
		required: [],
	},
	async execute(args) {
		return executeResolveTemplateTool({ args });
	},
};

export const checkTemplateImportTool: AgentTool = {
	name: "check_template_import",
	description:
		"Check whether a strict Template JSON object can be imported into the Codecut template library without writing it.",
	requiresConfirmation: false,
	parameters: {
		type: "object",
		properties: {
			template: {
				type: "object",
				description: "The strict Template JSON object to check before import.",
			},
		},
		required: ["template"],
	},
	async execute(args) {
		return executeCheckTemplateImportTool({ args });
	},
};

export const importTemplateTool: AgentTool = {
	name: "import_template",
	description:
		"Import a user-confirmed template JSON into the Codecut template library. Do not call this before the user explicitly confirms the template.",
	requiresConfirmation: true,
	parameters: {
		type: "object",
		properties: {
			confirmedByUser: {
				type: "boolean",
				description:
					"Must be true only after the user explicitly confirmed this exact template for import.",
			},
			template: {
				type: "object",
				description: "The strict Template JSON object to import.",
			},
		},
		required: ["confirmedByUser", "template"],
	},
	async execute(args) {
		return executeImportTemplateTool({ args });
	},
};

export const updateTemplateTool: AgentTool = {
	name: "update_template",
	description:
		"Update one user-confirmed Codecut user template in place using a strict Template JSON object with the same template ID.",
	requiresConfirmation: true,
	parameters: {
		type: "object",
		properties: {
			confirmedByUser: {
				type: "boolean",
				description:
					"Must be true only after the user explicitly confirmed updating this exact template.",
			},
			template: {
				type: "object",
				description:
					"The strict Template JSON object to apply to an existing user template with the same ID.",
			},
		},
		required: ["confirmedByUser", "template"],
	},
	async execute(args) {
		return executeUpdateTemplateTool({ args });
	},
};

export const deleteTemplateTool: AgentTool = {
	name: "delete_template",
	description:
		"Delete one user-confirmed Codecut user template from the template library. Built-in templates cannot be deleted.",
	requiresConfirmation: true,
	parameters: {
		type: "object",
		properties: {
			confirmedByUser: {
				type: "boolean",
				description:
					"Must be true only after the user explicitly confirmed deleting this exact template.",
			},
			templateId: {
				type: "string",
				description: "The exact Codecut user template ID to delete.",
			},
		},
		required: ["confirmedByUser", "templateId"],
	},
	async execute(args) {
		return executeDeleteTemplateTool({ args });
	},
};

export const templateTools: AgentTool[] = [
	listTemplatesTool,
	getTemplateTool,
	resolveTemplateTool,
	checkTemplateImportTool,
	importTemplateTool,
	updateTemplateTool,
	deleteTemplateTool,
];
