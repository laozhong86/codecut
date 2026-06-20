import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
	buildCharacterPortraitCodexPrompt,
	buildCharacterPortraitImagePrompt,
	type CharacterPortraitInput,
	handleAgentAction,
	parseCharacterPortraitCodexAnswer,
} from "../character-portrait";
import type { PublishedGeneratedImage } from "../publisher";
import type { CodexExecRunner } from "../runner";

const validInput = {
	model: "gpt-5.4-mini",
	reasoningEffort: "low",
	name: "测试",
	gender: "female",
	age: "young adult",
	description: "young woman, blonde hair, white tank top",
	styleDescription: "photorealistic, soft warm indoor light",
} satisfies CharacterPortraitInput;
const middlewarePath = join(
	process.cwd(),
	"apps/web/src/middleware.ts",
);

describe("character portrait Codex action", () => {
	test("builds the image prompt from the master prompt, description, and style lock", () => {
		const prompt = buildCharacterPortraitImagePrompt(validInput);

		expect(prompt).toContain("Character portrait reference image");
		expect(prompt).toContain("Gender: female");
		expect(prompt).toContain("Age range: young adult");
		expect(prompt).toContain("young woman, blonde hair, white tank top");
		expect(prompt).toContain("Style lock");
		expect(prompt).toContain("photorealistic, soft warm indoor light");
	});

	test("builds a Codex prompt that requires strict JSON with an image path", () => {
		const prompt = buildCharacterPortraitCodexPrompt(validInput);

		expect(prompt).toContain("Action: generate_character_portrait");
		expect(prompt).toContain("Generate exactly one image");
		expect(prompt).toContain('"imagePath"');
		expect(prompt).toContain("Do not edit files");
	});

	test("parses only strict Codex portrait JSON", () => {
		const parsed = parseCharacterPortraitCodexAnswer(
			JSON.stringify({
				status: "generated",
				imagePath: "/Users/x/.codex/generated_images/run/portrait.png",
				highestRiskAssumption: "The visual description is enough.",
			}),
		);

		expect(parsed.imagePath).toEndWith("portrait.png");
	});

	test("rejects placeholder image paths from Codex", () => {
		expect(() =>
			parseCharacterPortraitCodexAnswer(
				JSON.stringify({
					status: "generated",
					imagePath: "unknown",
					highestRiskAssumption: "No local path was available.",
				}),
			),
		).toThrow("Codex did not return a generated image path");
	});

	test("rejects unsupported actions before running Codex", async () => {
		let runCount = 0;
		const runner: CodexExecRunner = async () => {
			runCount += 1;
			return { answer: "{}" };
		};

		const result = await handleAgentAction({
			body: { action: "summarize_file", input: validInput },
			cwd: process.cwd(),
			publicDir: process.cwd(),
			runner,
			publisher: async () => {
				throw new Error("publisher should not run");
			},
		});

		expect(result.status).toBe(400);
		expect(result.body).toEqual({
			ok: false,
			error: "Action is not allowed",
		});
		expect(runCount).toBe(0);
	});

	test("rejects unsupported models before running Codex", async () => {
		let runCount = 0;
		const runner: CodexExecRunner = async () => {
			runCount += 1;
			return { answer: "{}" };
		};

		const result = await handleAgentAction({
			body: {
				action: "generate_character_portrait",
				input: { ...validInput, model: "unknown-model" },
			},
			cwd: process.cwd(),
			publicDir: process.cwd(),
			runner,
			publisher: async () => {
				throw new Error("publisher should not run");
			},
		});

		expect(result.status).toBe(400);
		expect(result.body.ok).toBe(false);
		if (result.body.ok) throw new Error("Expected model validation to fail");
		expect(result.body.error).toContain("model must be one of");
		expect(runCount).toBe(0);
	});

	test("runs Codex and returns a plugin-relative image URL", async () => {
		const generatedHome = await mkdtemp(join(tmpdir(), "codex-home-"));
		const generatedRoot = join(generatedHome, ".codex/generated_images");
		await mkdir(generatedRoot, { recursive: true });
		const publicDir = await mkdtemp(join(tmpdir(), "codecut-public-"));
		const generatedImagePath = join(generatedRoot, "portrait.png");
		await writeFile(
			generatedImagePath,
			Buffer.from([
				0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
				0x00, 0x00, 0x00, 0x0d,
			]),
		);

		let capturedPrompt = "";
		const runner: CodexExecRunner = async ({ prompt, model, reasoningEffort }) => {
			capturedPrompt = prompt;
			expect(model).toBe("gpt-5.4-mini");
			expect(reasoningEffort).toBe("low");
			return {
				answer: JSON.stringify({
					status: "generated",
					imagePath: generatedImagePath,
					highestRiskAssumption: "The description is concise.",
				}),
			};
		};
		const publisher = async ({
			imagePath,
		}: {
			imagePath: string;
		}): Promise<PublishedGeneratedImage> => ({
			type: "image",
			path: imagePath,
			url: "/generated/codex/portrait.png",
		});

		const result = await handleAgentAction({
			body: { action: "generate_character_portrait", input: validInput },
			cwd: process.cwd(),
			publicDir,
			runner,
			publisher,
			generatedRoot,
		});

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			ok: true,
			model: "gpt-5.4-mini",
			reasoningEffort: "low",
			assets: [{ type: "image", url: "/generated/codex/portrait.png" }],
		});
		if (!result.body.ok) throw new Error("Expected portrait generation to pass");
		expect(result.body.prompt).toContain("young woman, blonde hair");
		expect(capturedPrompt).toContain("photorealistic");
	});

	test("allows generated Codex assets to be served as static files", async () => {
		const middleware = await Bun.file(middlewarePath).text();

		expect(middleware).toContain("generated");
	});
});
