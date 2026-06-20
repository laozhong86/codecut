import { z } from "zod";
import {
	runCodexExec,
	validateModelConfig,
	type CodexExecRunner,
	type CodexModelId,
	type CodexReasoningEffort,
} from "./runner";
import {
	publishGeneratedImage,
	type PublishedGeneratedImage,
} from "./publisher";
import {
	CHARACTER_AGE_RANGES,
	CHARACTER_GENDERS,
	type CharacterAgeRange,
	type CharacterGender,
} from "@/types/character";

const ACTION_NAME = "generate_character_portrait";

const characterPortraitInputSchema = z
	.object({
		model: z.string().min(1),
		reasoningEffort: z.string().min(1),
		name: z.string().max(120).optional(),
		gender: z.enum(CHARACTER_GENDERS).optional(),
		age: z.enum(CHARACTER_AGE_RANGES).optional(),
		description: z.string().trim().min(1).max(4000),
		styleDescription: z.string().trim().max(2000).optional(),
	})
	.strict();

const agentActionRequestSchema = z
	.object({
		action: z.string().min(1),
		input: z.unknown(),
	})
	.strict();

const codexPortraitAnswerSchema = z
	.object({
		status: z.string().min(1),
		imagePath: z
			.string()
			.min(1)
			.refine(
				(value) =>
					value.startsWith("/") &&
					value.includes("/.codex/generated_images/") &&
					value.endsWith(".png"),
				"Codex did not return a generated image path under ~/.codex/generated_images",
			),
		highestRiskAssumption: z.string().min(1),
	})
	.strict();

export interface CharacterPortraitInput {
	model: string;
	reasoningEffort: string;
	name?: string;
	gender?: CharacterGender;
	age?: CharacterAgeRange;
	description: string;
	styleDescription?: string;
}

export type AgentActionResponseBody =
	| {
			ok: false;
			error: string;
	  }
	| {
			ok: true;
			model: CodexModelId;
			reasoningEffort: CodexReasoningEffort;
			answer: string;
			prompt: string;
			assets: PublishedGeneratedImage[];
			durationMs: number;
			highestRiskAssumption: string;
	  };

export function buildCharacterPortraitImagePrompt({
	name,
	gender,
	age,
	description,
	styleDescription,
}: Pick<
	CharacterPortraitInput,
	"name" | "gender" | "age" | "description" | "styleDescription"
>): string {
	const parts = [
		"Character portrait reference image.",
		"Purpose: reusable character identity photo for consistent AI generation.",
		"Composition: front-facing, centered character, full body from head to feet, nothing cropped, arms relaxed at sides, clean neutral background.",
		"Quality: high resolution, clean silhouette, no text, no watermark, no logo.",
		"If no style lock is provided, use a realistic photographic look.",
		name?.trim() ? `Character name: ${name.trim()}` : null,
		gender ? `Gender: ${gender}` : null,
		age ? `Age range: ${age}` : null,
		`Character description: ${description.trim()}`,
		styleDescription?.trim()
			? `Style lock: ${styleDescription.trim()}`
			: null,
	];

	return parts.filter(Boolean).join("\n");
}

export function buildCharacterPortraitCodexPrompt(
	input: Pick<
		CharacterPortraitInput,
		"name" | "gender" | "age" | "description" | "styleDescription"
	>,
): string {
	const imagePrompt = buildCharacterPortraitImagePrompt(input);

	return [
		"You are running as a plugin-triggered Codex agent.",
		`Action: ${ACTION_NAME}`,
		"",
		"Task:",
		"- Generate exactly one image for the character portrait prompt below.",
		"- After generating, inspect the local filesystem and find the newest PNG created for this run under ~/.codex/generated_images.",
		"- Return that absolute local PNG path in imagePath.",
		"- Never return placeholders such as unknown, N/A, or unavailable.",
		"- Do not edit files.",
		"- Do not run unrelated commands.",
		"",
		"Business success criteria:",
		"- The image can be used as a reusable character reference.",
		"- The visual identity follows the form description and style lock.",
		"- The result is simple, clear, and suitable for future image/video generation references.",
		"",
		"Image prompt:",
		"---",
		imagePrompt,
		"---",
		"",
		"Output JSON only. Required shape:",
		'{"status":"generated","imagePath":"/absolute/path/to/generated.png","highestRiskAssumption":"short text"}',
	].join("\n");
}

export function parseCharacterPortraitCodexAnswer(answer: string): {
	status: string;
	imagePath: string;
	highestRiskAssumption: string;
} {
	const parsed = JSON.parse(answer);
	return codexPortraitAnswerSchema.parse(parsed);
}

export async function handleAgentAction({
	body,
	cwd,
	publicDir,
	runner = runCodexExec,
	publisher = publishGeneratedImage,
	generatedRoot,
}: {
	body: unknown;
	cwd: string;
	publicDir: string;
	runner?: CodexExecRunner;
	publisher?: typeof publishGeneratedImage;
	generatedRoot?: string;
}): Promise<{ status: number; body: AgentActionResponseBody }> {
	const request = agentActionRequestSchema.safeParse(body);
	if (!request.success) {
		return {
			status: 400,
			body: { ok: false, error: "Invalid request" },
		};
	}

	if (request.data.action !== ACTION_NAME) {
		return {
			status: 400,
			body: { ok: false, error: "Action is not allowed" },
		};
	}

	const input = characterPortraitInputSchema.safeParse(request.data.input);
	if (!input.success) {
		return {
			status: 400,
			body: { ok: false, error: "Invalid character portrait input" },
		};
	}

	let modelConfig: ReturnType<typeof validateModelConfig>;
	try {
		modelConfig = validateModelConfig(input.data);
	} catch (error) {
		return {
			status: 400,
			body: {
				ok: false,
				error: error instanceof Error ? error.message : "Invalid model config",
			},
		};
	}

	const imagePrompt = buildCharacterPortraitImagePrompt(input.data);
	const prompt = buildCharacterPortraitCodexPrompt(input.data);
	const startedAt = Date.now();

	try {
		const codexResult = await runner({
			prompt,
			cwd,
			model: modelConfig.model,
			reasoningEffort: modelConfig.reasoningEffort,
			sandbox: "read-only",
		});
		const portrait = parseCharacterPortraitCodexAnswer(codexResult.answer);
		const asset = await publisher({
			imagePath: portrait.imagePath,
			generatedRoot,
			publicDir,
		});

		return {
			status: 200,
			body: {
				ok: true,
				model: modelConfig.model,
				reasoningEffort: modelConfig.reasoningEffort,
				answer: codexResult.answer,
				prompt: imagePrompt,
				assets: [asset],
				durationMs: Date.now() - startedAt,
				highestRiskAssumption: portrait.highestRiskAssumption,
			},
		};
	} catch (error) {
		return {
			status: 500,
			body: {
				ok: false,
				error:
					error instanceof Error
						? error.message
						: "Codex character portrait generation failed",
			},
		};
	}
}
