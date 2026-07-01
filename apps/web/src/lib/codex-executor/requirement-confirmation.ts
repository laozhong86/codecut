import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
	BuiltInVoicePackIdSchema,
	ConfirmedSetupSchema,
	ConfirmedSetupTaskTypeSchema,
	TemplatePreferenceSchema,
} from "./setup-contract";

const MediaSourceSchema = z.union([
	z
		.object({
			kind: z.literal("filePath"),
			filePath: z.string().trim().min(1),
			mimeType: z.string().trim().min(1).optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("url"),
			url: z.string().trim().min(1),
			mimeType: z.string().trim().min(1).optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("directoryPath"),
			directoryPath: z.string().trim().min(1),
			mimeType: z.string().trim().min(1).optional(),
		})
		.strict(),
]);

const CheckSchema = z
	.object({
		id: z.string().trim().min(1),
		ok: z.boolean(),
		message: z.string().trim().min(1),
	})
	.strict();

export const RequirementDraftInputSchema = z
	.object({
		originalUserMessage: z.string().trim().min(1),
		requestedProjectName: z.string().trim().min(1),
		requestedProjectId: z.string().trim().min(1).optional(),
		mediaSources: z.array(MediaSourceSchema).min(1),
		taskType: ConfirmedSetupTaskTypeSchema,
		timelinePreferences: ConfirmedSetupSchema.shape.timelinePreferences,
		captionPreferences: ConfirmedSetupSchema.shape.captionPreferences,
		voicePreferences: z
			.object({ voicePackId: BuiltInVoicePackIdSchema })
			.strict()
			.optional(),
		templatePreference: TemplatePreferenceSchema.default({ mode: "auto" }),
		exportPreferences: ConfirmedSetupSchema.shape.exportPreferences,
		checks: z.array(CheckSchema),
	})
	.strict();

export const RequirementDraftSchema = RequirementDraftInputSchema.extend({
	version: z.literal(1),
	draftId: z.string().regex(/^ccreq_[a-z0-9_-]+$/),
	status: z.literal("awaiting_user_confirmation"),
	createdAt: z.string().trim().min(1),
	source: z.literal("codecut_requirement_confirmation"),
}).strict();

export const ConfirmedRequirementSchema = z
	.object({
		version: z.literal(1),
		draftId: z.string().regex(/^ccreq_[a-z0-9_-]+$/),
		status: z.literal("confirmed"),
		confirmedAt: z.string().trim().min(1),
		source: z.literal("codecut_requirement_confirmation"),
		confirmedBy: z.literal("local_web_page"),
		confirmedSetup: ConfirmedSetupSchema,
	})
	.strict();

export const CancelledRequirementSchema = z
	.object({
		version: z.literal(1),
		draftId: z.string().regex(/^ccreq_[a-z0-9_-]+$/),
		status: z.literal("cancelled"),
		cancelledAt: z.string().trim().min(1),
		source: z.literal("codecut_requirement_confirmation"),
		reason: z.string().trim().min(1),
	})
	.strict();

export const RequirementConfirmationPatchSchema = z
	.object({
		timelinePreferences:
			ConfirmedSetupSchema.shape.timelinePreferences.optional(),
		captionPreferences:
			ConfirmedSetupSchema.shape.captionPreferences.optional(),
		voicePreferences: z
			.object({ voicePackId: BuiltInVoicePackIdSchema })
			.strict()
			.optional(),
		templatePreference: TemplatePreferenceSchema.optional(),
		exportPreferences: ConfirmedSetupSchema.shape.exportPreferences.optional(),
	})
	.strict();

export type RequirementDraftInput = z.infer<
	typeof RequirementDraftInputSchema
>;
export type RequirementDraft = z.infer<typeof RequirementDraftSchema>;
export type ConfirmedRequirement = z.infer<typeof ConfirmedRequirementSchema>;
export type CancelledRequirement = z.infer<typeof CancelledRequirementSchema>;
export type RequirementConfirmationPatch = z.infer<
	typeof RequirementConfirmationPatchSchema
>;

function nowIso() {
	return new Date().toISOString();
}

function workspaceRoot(root: string) {
	return join(resolve(root), ".codecut-workspace");
}

function findPluginRoot(cwd: string) {
	let current = resolve(cwd);
	while (true) {
		if (hasPluginManifest(current)) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) {
			return resolve(cwd);
		}
		current = parent;
	}
}

function hasPluginManifest(root: string) {
	return existsSync(join(root, ".codex-plugin", "plugin.json"));
}

function sharedRequirementRoot(env: NodeJS.ProcessEnv) {
	const home = env.HOME?.trim() || homedir();
	return resolve(home, ".codex", "codecut");
}

export function resolveRequirementConfirmationRoot({
	cwd = process.cwd(),
	env = process.env,
}: {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
} = {}) {
	const explicitRoot = env.CODECUT_REQUIREMENT_ROOT?.trim();
	if (explicitRoot) return resolve(explicitRoot);
	const pluginRoot = findPluginRoot(cwd);
	if (hasPluginManifest(pluginRoot)) return sharedRequirementRoot(env);
	return pluginRoot;
}

export function requirementRoot(root: string, draftId: string) {
	return join(workspaceRoot(root), "requirements", draftId);
}

function newDraftId(requestedProjectId?: string) {
	const suffix = randomBytes(5).toString("hex");
	const stem = requestedProjectId
		? requestedProjectId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
		: "draft";
	return `ccreq_${stem}_${suffix}`;
}

async function writeJson(filePath: string, value: unknown) {
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendEvent(
	root: string,
	draftId: string,
	event: Record<string, unknown>,
) {
	const directory = requirementRoot(root, draftId);
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(directory, "events.jsonl"),
		`${JSON.stringify({ ...event, at: nowIso() })}\n`,
		{ encoding: "utf8", flag: "a" },
	);
}

export async function createRequirementDraft({
	root,
	input,
}: {
	root: string;
	input: RequirementDraftInput;
}) {
	const parsed = RequirementDraftInputSchema.parse(input);
	const draft = RequirementDraftSchema.parse({
		...parsed,
		version: 1,
		draftId: newDraftId(parsed.requestedProjectId),
		status: "awaiting_user_confirmation",
		createdAt: nowIso(),
		source: "codecut_requirement_confirmation",
	});
	const directory = requirementRoot(root, draft.draftId);
	await mkdir(directory, { recursive: true });
	await writeJson(join(directory, "draft.json"), draft);
	await appendEvent(root, draft.draftId, { type: "draft_created" });
	return draft;
}

export async function readRequirementDraft({
	root,
	draftId,
}: {
	root: string;
	draftId: string;
}) {
	const raw = await readFile(
		join(requirementRoot(root, draftId), "draft.json"),
		"utf8",
	);
	return RequirementDraftSchema.parse(JSON.parse(raw));
}

export async function confirmRequirementDraft({
	root,
	draftId,
	patch = {},
}: {
	root: string;
	draftId: string;
	patch?: RequirementConfirmationPatch;
}) {
	const draft = await readRequirementDraft({ root, draftId });
	const parsedPatch = RequirementConfirmationPatchSchema.parse(patch);
	const confirmedAt = nowIso();
	const confirmed = ConfirmedRequirementSchema.parse({
		version: 1,
		draftId,
		status: "confirmed",
		confirmedAt,
		source: "codecut_requirement_confirmation",
		confirmedBy: "local_web_page",
		confirmedSetup: {
			version: 1,
			taskType: draft.taskType,
			confirmedAt,
			source: "codecut_setup_confirmation",
			timelinePreferences:
				parsedPatch.timelinePreferences ?? draft.timelinePreferences,
			captionPreferences:
				parsedPatch.captionPreferences ?? draft.captionPreferences,
			voicePreferences: parsedPatch.voicePreferences ?? draft.voicePreferences,
			templatePreference:
				parsedPatch.templatePreference ?? draft.templatePreference,
			exportPreferences:
				parsedPatch.exportPreferences ?? draft.exportPreferences,
			changes: [],
		},
	});
	await writeJson(
		join(requirementRoot(root, draftId), "confirmed.json"),
		confirmed,
	);
	await appendEvent(root, draftId, { type: "confirmed" });
	return confirmed;
}

export async function cancelRequirementDraft({
	root,
	draftId,
	reason,
}: {
	root: string;
	draftId: string;
	reason: string;
}) {
	const cancelled = CancelledRequirementSchema.parse({
		version: 1,
		draftId,
		status: "cancelled",
		cancelledAt: nowIso(),
		source: "codecut_requirement_confirmation",
		reason,
	});
	await writeJson(
		join(requirementRoot(root, draftId), "confirmed.json"),
		cancelled,
	);
	await appendEvent(root, draftId, { type: "cancelled", reason });
	return cancelled;
}

export async function readRequirementConfirmation({
	root,
	draftId,
}: {
	root: string;
	draftId: string;
}) {
	const draft = await readRequirementDraft({ root, draftId });
	try {
		const raw = await readFile(
			join(requirementRoot(root, draftId), "confirmed.json"),
			"utf8",
		);
		const data = JSON.parse(raw);
		if (data.status === "confirmed") {
			return {
				status: "confirmed" as const,
				draft,
				confirmed: ConfirmedRequirementSchema.parse(data),
			};
		}
		return {
			status: "cancelled" as const,
			draft,
			cancelled: CancelledRequirementSchema.parse(data),
		};
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return { status: "awaiting_user_confirmation" as const, draft };
		}
		throw error;
	}
}
