import {
	TemplateSchema,
	type Template,
	type TemplateMaterialFacts,
	type TemplateRequiredEvidence,
	type TemplateResolution,
	type TemplateTriggerType,
} from "./schema";

export const BUILT_IN_TEMPLATE_IDS = [
	"talking-head-short",
	"tutorial-demo",
	"product-proof-ad",
	"narrated-broll",
] as const;

export type BuiltInTemplateId = (typeof BUILT_IN_TEMPLATE_IDS)[number];

export type CreateTemplateInput = Omit<
	Template,
	"createdAt" | "updatedAt"
> & {
	now: Date;
};

export function createTemplate({
	now,
	...template
}: CreateTemplateInput): Template {
	const timestamp = now.toISOString();
	return TemplateSchema.parse({
		...template,
		createdAt: timestamp,
		updatedAt: timestamp,
	});
}

const builtInTimestamp = "2026-07-01T00:00:00.000Z";

export const builtInTemplates = [
	{
		id: "talking-head-short",
		name: "Talking-head short",
		description:
			"Tighten a talking-head source into a short-form draft with a clear hook and retained meaning.",
		source: "built-in",
		readOnly: true,
		trigger: {
			types: ["talking-head-short"],
			defaultForTypes: ["talking-head-short"],
			aliases: ["talking head", "口播精剪", "口播短视频"],
		},
		plan: {
			objective:
				"Tighten a talking-head source into a short-form draft with a clear hook and retained meaning.",
			steps: [
				{
					id: "select-hook",
					label: "Select hook",
					instruction:
						"Use transcript evidence to put the clearest hook or strongest statement first.",
				},
				{
					id: "tighten-speech",
					label: "Tighten speech",
					instruction:
						"Remove filler, restarts, repeated setup, and dead air without changing meaning.",
				},
				{
					id: "caption-after-cut",
					label: "Caption after cut",
					instruction:
						"Add readable captions only after the spoken timeline is stable.",
				},
			],
			verification: [
				"SpeechCleanupPlan validates and projects to EditPlan v1.",
				"apply_edit_plan succeeds.",
				"get_timeline_state verifies clip count, caption count, trim ranges, and final duration.",
			],
		},
		execution: {
			path: "speech-cleanup-to-edit-plan-v1",
			requiredEvidence: ["transcript"],
			defaultStructure: [
				"hook",
				"strongest statement",
				"supporting beats",
				"loop/CTA",
			],
			captionPreset: "talking-head-pop",
			stopConditions: [
				"Transcript is missing or unusable.",
				"The requested cleanup depends on silence or word-level detection that is not available.",
			],
		},
		createdAt: builtInTimestamp,
		updatedAt: builtInTimestamp,
	},
	{
		id: "tutorial-demo",
		name: "Tutorial / demo",
		description:
			"Preserve a teachable sequence from a tutorial, screen recording, or software demo.",
		source: "built-in",
		readOnly: true,
		trigger: {
			types: ["tutorial-demo"],
			defaultForTypes: ["tutorial-demo"],
			aliases: ["tutorial", "demo", "教程", "演示"],
		},
		plan: {
			objective:
				"Preserve a teachable sequence from a tutorial, screen recording, or software demo.",
			steps: [
				{
					id: "preserve-sequence",
					label: "Preserve sequence",
					instruction:
						"Keep the logical problem, steps, and result order from source evidence.",
				},
				{
					id: "label-steps",
					label: "Label steps",
					instruction:
						"Use readable labels or captions only for steps supported by transcript or visible proof.",
				},
			],
			verification: [
				"EditingDecisionLedger maps source evidence to each step.",
				"apply_edit_plan succeeds.",
				"get_timeline_state verifies chronological clips and readable captions.",
			],
		},
		execution: {
			path: "edit-plan-v1",
			requiredEvidence: ["transcript", "visual-proof"],
			defaultStructure: ["problem", "step 1", "step 2", "result"],
			captionPreset: "tutorial-clean",
			stopConditions: [
				"Transcript or visible step context is missing.",
				"The request needs OCR or scene detection that is not available.",
			],
		},
		createdAt: builtInTimestamp,
		updatedAt: builtInTimestamp,
	},
	{
		id: "product-proof-ad",
		name: "Product proof ad",
		description:
			"Build a conversion-oriented UGC or product proof draft without inventing claims.",
		source: "built-in",
		readOnly: true,
		trigger: {
			types: ["product-proof-ad"],
			defaultForTypes: ["product-proof-ad"],
			aliases: ["ugc ad", "product proof", "带货广告", "商品证明"],
		},
		plan: {
			objective:
				"Build a conversion-oriented UGC or product proof draft without inventing claims.",
			steps: [
				{
					id: "open-with-proof",
					label: "Open with proof",
					instruction:
						"Open with the strongest visible or spoken proof before making claims.",
				},
				{
					id: "map-claims",
					label: "Map claims",
					instruction:
						"Map every claim to transcript, visual proof, or supplied product facts.",
				},
			],
			verification: [
				"EditingDecisionLedger maps every claim to transcript, visual proof, or product facts.",
				"apply_edit_plan succeeds.",
				"get_timeline_state verifies the hook, proof beats, CTA timing, and captions.",
			],
		},
		execution: {
			path: "edit-plan-v1",
			requiredEvidence: ["transcript", "visual-proof", "product-facts"],
			defaultStructure: ["hook", "pain/proof", "demo/process", "CTA"],
			captionPreset: "product-punch",
			stopConditions: [
				"Product facts, offer facts, or visual proof are missing.",
				"The requested claim cannot be tied to spoken or visible evidence.",
			],
		},
		createdAt: builtInTimestamp,
		updatedAt: builtInTimestamp,
	},
	{
		id: "narrated-broll",
		name: "Narrated B-roll",
		description:
			"Combine existing narration audio with imported muted video or image B-roll and captions.",
		source: "built-in",
		readOnly: true,
		trigger: {
			types: ["narrated-broll"],
			defaultForTypes: ["narrated-broll"],
			aliases: ["voiceover b-roll", "旁白混剪", "配音混剪"],
		},
		plan: {
			objective:
				"Combine existing narration audio with imported muted video or image B-roll and captions.",
			steps: [
				{
					id: "verify-narration",
					label: "Verify narration",
					instruction:
						"Confirm an existing narration audio asset before planning visual beats.",
				},
				{
					id: "align-broll",
					label: "Align B-roll",
					instruction:
						"Align imported muted video or image B-roll to narration beats.",
				},
			],
			verification: [
				"apply_narrated_remix_plan succeeds.",
				"get_timeline_state verifies separate video, audio, and text tracks.",
			],
		},
		execution: {
			path: "narrated-remix-v1",
			requiredEvidence: ["existing-narration-audio", "visual-broll"],
			defaultStructure: ["intro beat", "supporting visual beats", "closing beat"],
			stopConditions: [
				"Existing narration audio is missing.",
				"Visual B-roll is missing.",
				"The request requires TTS, BGM, SFX, effects, or append mode.",
			],
		},
		createdAt: builtInTimestamp,
		updatedAt: builtInTimestamp,
	},
] satisfies Template[];

export const templateRegistry = builtInTemplates.map((template) =>
	TemplateSchema.parse(template),
);

const builtInById = new Map<string, Template>(
	templateRegistry.map((template) => [template.id, template]),
);

export function getBuiltInTemplate(id: string): Template | undefined {
	return builtInById.get(id);
}

export function resolveTemplate({
	userTemplates,
	requestedTemplate,
	triggerType,
	userIntent,
	platformHint,
	materialFacts,
}: {
	userTemplates: Template[];
	requestedTemplate?: string;
	triggerType?: TemplateTriggerType;
	userIntent?: string;
	platformHint?: string;
	materialFacts: TemplateMaterialFacts;
}): TemplateResolution {
	const validUserTemplates = userTemplates.map((template) =>
		TemplateSchema.parse(template),
	);

	if (requestedTemplate?.trim()) {
		const requested = requestedTemplate.trim();
		const matches = [...validUserTemplates, ...templateRegistry].filter(
			(template) => templateMatchesRequest({ template, requested }),
		);
		if (matches.length === 0) {
			return {
				success: false,
				code: "not-found",
				message: `Template not found: ${requested}.`,
			};
		}
		if (matches.length > 1) {
			return {
				success: false,
				code: "ambiguous-default",
				message: `Multiple templates match ${requested}: ${matches
					.map((template) => template.id)
					.join(", ")}.`,
				templateIds: matches.map((template) => template.id),
			};
		}
		return requireTemplateEvidence({
			template: matches[0],
			materialFacts,
			match: { mode: "specified", requestedTemplate: requested },
		});
	}

	const resolvedTriggerType =
		triggerType ?? chooseTemplateTriggerType({ userIntent, platformHint });
	if (!resolvedTriggerType) {
		return {
			success: false,
			code: "no-trigger-match",
			message: "No template trigger matches the user intent.",
		};
	}

	const userDefaults = validUserTemplates.filter((template) =>
		template.trigger.defaultForTypes.includes(resolvedTriggerType),
	);
	if (userDefaults.length > 1) {
		return {
			success: false,
			code: "ambiguous-default",
			message: `Multiple user templates are default for trigger ${resolvedTriggerType}: ${userDefaults
				.map((template) => template.id)
				.join(", ")}.`,
			triggerType: resolvedTriggerType,
			templateIds: userDefaults.map((template) => template.id),
		};
	}

	const template =
		userDefaults[0] ??
		templateRegistry.find((candidate) =>
			candidate.trigger.defaultForTypes.includes(resolvedTriggerType),
		);
	if (!template) {
		return {
			success: false,
			code: "not-found",
			message: `No template is default for trigger ${resolvedTriggerType}.`,
			triggerType: resolvedTriggerType,
		};
	}

	return requireTemplateEvidence({
		template,
		materialFacts,
		match: { mode: "auto", triggerType: resolvedTriggerType },
	});
}

function templateMatchesRequest({
	template,
	requested,
}: {
	template: Template;
	requested: string;
}): boolean {
	const normalized = requested.toLowerCase();
	if (template.id.toLowerCase() === normalized) return true;
	if (template.name.toLowerCase() === normalized) return true;
	return template.trigger.aliases.some(
		(alias) => alias.toLowerCase() === normalized,
	);
}

function chooseTemplateTriggerType({
	userIntent,
	platformHint,
}: {
	userIntent?: string;
	platformHint?: string;
}): TemplateTriggerType | null {
	const text = `${userIntent ?? ""} ${platformHint ?? ""}`.toLowerCase();
	if (/(商品|带货|ugc|广告|转化|product|conversion|ad\b)/i.test(text)) {
		return "product-proof-ad";
	}
	if (/(教程|demo|演示|步骤|tutorial|walkthrough|software demo)/i.test(text)) {
		return "tutorial-demo";
	}
	if (/(旁白|配音|b-roll|b roll|混剪|narration|voiceover)/i.test(text)) {
		return "narrated-broll";
	}
	if (
		/(去废话|口播|精剪|剪紧凑|talking[- ]?head|filler|polish|shorts?|tiktok|reels|竖屏)/i.test(
			text,
		)
	) {
		return "talking-head-short";
	}
	return null;
}

function requireTemplateEvidence({
	template,
	materialFacts,
	match,
}: {
	template: Template;
	materialFacts: TemplateMaterialFacts;
	match: {
		mode: "specified" | "auto";
		requestedTemplate?: string;
		triggerType?: TemplateTriggerType;
	};
}): TemplateResolution {
	const missingEvidence = getMissingEvidence({
		requiredEvidence: template.execution.requiredEvidence,
		materialFacts,
	});
	if (missingEvidence.length > 0) {
		return {
			success: false,
			code: "missing-evidence",
			templateId: template.id,
			message: `Template ${template.id} requires ${formatEvidenceList(
				missingEvidence,
			)}.`,
			missingEvidence,
		};
	}
	return { success: true, template, match };
}

function getMissingEvidence({
	requiredEvidence,
	materialFacts,
}: {
	requiredEvidence: TemplateRequiredEvidence[];
	materialFacts: TemplateMaterialFacts;
}): TemplateRequiredEvidence[] {
	const available: Record<TemplateRequiredEvidence, boolean | undefined> = {
		transcript: materialFacts.hasTranscript,
		"visual-proof": materialFacts.hasVisualProof,
		"product-facts": materialFacts.hasProductFacts,
		"existing-narration-audio": materialFacts.hasExistingNarrationAudio,
		"visual-broll": materialFacts.hasVisualBroll,
	};
	return requiredEvidence.filter((evidence) => !available[evidence]);
}

function formatEvidenceList(evidence: TemplateRequiredEvidence[]): string {
	if (evidence.length <= 1) return evidence.join("");
	return `${evidence.slice(0, -1).join(", ")} and ${evidence.at(-1)}`;
}
