import {
	type LocalTemplateScript,
	LocalTemplateScriptSchema,
	type LocalTemplateTriggerType,
} from "./schema";

export type CreateLocalTemplateScriptInput = Omit<
	LocalTemplateScript,
	"createdAt" | "updatedAt"
> & {
	now: Date;
};

export function createLocalTemplateScript({
	now,
	...template
}: CreateLocalTemplateScriptInput): LocalTemplateScript {
	const timestamp = now.toISOString();
	return LocalTemplateScriptSchema.parse({
		...template,
		createdAt: timestamp,
		updatedAt: timestamp,
	});
}

export function updateLocalTemplateScript({
	template,
	updates,
	now,
}: {
	template: LocalTemplateScript;
	updates: Partial<Omit<LocalTemplateScript, "id" | "createdAt" | "updatedAt">>;
	now: Date;
}): LocalTemplateScript {
	return LocalTemplateScriptSchema.parse({
		...template,
		...updates,
		id: template.id,
		createdAt: template.createdAt,
		updatedAt: now.toISOString(),
	});
}

export function resolveLocalTemplateScript({
	templates,
	requestedTemplate,
	triggerType,
}: {
	templates: LocalTemplateScript[];
	requestedTemplate?: string;
	triggerType?: LocalTemplateTriggerType;
}): LocalTemplateScript {
	const validTemplates = templates.map((template) =>
		LocalTemplateScriptSchema.parse(template),
	);
	const normalizedRequestedTemplate = requestedTemplate?.trim().toLowerCase();

	if (normalizedRequestedTemplate) {
		const matchedTemplate = validTemplates.find((template) => {
			if (template.id.toLowerCase() === normalizedRequestedTemplate)
				return true;
			if (template.name.toLowerCase() === normalizedRequestedTemplate)
				return true;
			return template.trigger.aliases.some(
				(alias) => alias.toLowerCase() === normalizedRequestedTemplate,
			);
		});
		if (!matchedTemplate) {
			throw new Error(`Local template script not found: ${requestedTemplate}`);
		}
		return matchedTemplate;
	}

	if (!triggerType) {
		throw new Error(
			"Local template script resolution requires a template or trigger type.",
		);
	}

	const matches = validTemplates.filter((template) =>
		template.trigger.defaultForTypes.includes(triggerType),
	);
	if (matches.length === 0) {
		throw new Error(
			`No local template script matches trigger type: ${triggerType}`,
		);
	}
	if (matches.length > 1) {
		throw new Error(
			`Multiple local template scripts match trigger type: ${triggerType}`,
		);
	}
	return matches[0];
}
