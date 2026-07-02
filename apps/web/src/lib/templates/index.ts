export {
	BUILT_IN_TEMPLATE_IDS,
	builtInTemplates,
	createTemplate,
	getBuiltInTemplate,
	resolveTemplate,
	templateRegistry,
	type BuiltInTemplateId,
	type CreateTemplateInput,
} from "./registry";
export {
	TemplateService,
	templateService,
	type TemplateImportCheck,
} from "./service";
export {
	migrateLegacyTemplateRecord,
	type LegacyTemplateRecord,
} from "./migration";
export {
	TemplateExecutionPathSchema,
	TemplateExecutionSchema,
	TemplatePlanSchema,
	TemplateRequiredEvidenceSchema,
	TemplateSchema,
	TemplateSourceSchema,
	TemplateStepSchema,
	TemplateTriggerSchema,
	TemplateTriggerTypeSchema,
	type Template,
	type TemplateExecution,
	type TemplateExecutionPath,
	type TemplateMaterialFacts,
	type TemplateMaterialPolicy,
	type TemplatePlan,
	type TemplateRequiredEvidence,
	type TemplateResolution,
	type TemplateSource,
	type TemplateStep,
	type TemplateTrigger,
	type TemplateTriggerType,
} from "./schema";
