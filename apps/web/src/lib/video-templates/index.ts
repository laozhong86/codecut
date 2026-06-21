export {
	VIDEO_TEMPLATE_IDS,
	getVideoTemplate,
	videoTemplateRegistry,
} from "./registry";
export {
	resolveVideoTemplate,
	type VideoTemplateMaterialFacts,
	type VideoTemplateResolveResult,
} from "./resolve";
export {
	VideoTemplateExecutionPathSchema,
	VideoTemplateIdSchema,
	VideoTemplateManifestSchema,
	VideoTemplateRequiredEvidenceSchema,
	type VideoTemplateExecutionPath,
	type VideoTemplateId,
	type VideoTemplateManifest,
	type VideoTemplateRequiredEvidence,
} from "./schema";
