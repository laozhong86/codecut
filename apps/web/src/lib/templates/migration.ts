import { z } from "zod";
import { getBuiltInTemplate } from "./registry";
import {
	TemplatePlanSchema,
	TemplateSchema,
	TemplateTriggerSchema,
	TemplateTriggerTypeSchema,
	type Template,
	type TemplateExecution,
	type TemplateTriggerType,
} from "./schema";

const LegacyTemplateRecordSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1),
		description: z.string().optional(),
		trigger: TemplateTriggerSchema,
		script: TemplatePlanSchema,
		createdAt: z.string().datetime(),
		updatedAt: z.string().datetime(),
	})
	.strict();

export type LegacyTemplateRecord = z.infer<typeof LegacyTemplateRecordSchema>;

const mappableTriggerTypes = new Set<TemplateTriggerType>([
	"talking-head-short",
	"tutorial-demo",
	"product-proof-ad",
	"narrated-broll",
]);

export function migrateLegacyTemplateRecord(
	legacyTemplate: LegacyTemplateRecord,
): Template {
	const parsed = LegacyTemplateRecordSchema.parse(legacyTemplate);
	const execution = resolveLegacyExecutionProfile(parsed);
	return TemplateSchema.parse({
		id: parsed.id,
		name: parsed.name,
		description: parsed.description,
		trigger: parsed.trigger,
		plan: parsed.script,
		createdAt: parsed.createdAt,
		updatedAt: parsed.updatedAt,
		source: "user",
		readOnly: false,
		execution,
	});
}

function resolveLegacyExecutionProfile(
	legacyTemplate: LegacyTemplateRecord,
): TemplateExecution {
	const matches = legacyTemplate.trigger.types.filter((type) =>
		mappableTriggerTypes.has(TemplateTriggerTypeSchema.parse(type)),
	);
	const uniqueMatches = [...new Set(matches)];
	if (uniqueMatches.length !== 1) {
		throw new Error(
			`Legacy template ${legacyTemplate.id} cannot be migrated because no unique execution profile matches trigger types: ${legacyTemplate.trigger.types.join(", ")}.`,
		);
	}
	const builtIn = getBuiltInTemplate(uniqueMatches[0]);
	if (!builtIn) {
		throw new Error(
			`Legacy template ${legacyTemplate.id} cannot be migrated because execution profile ${uniqueMatches[0]} is not registered.`,
		);
	}
	return builtIn.execution;
}
