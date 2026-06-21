import { describe, expect, test } from "bun:test";
import {
	buildCodexExecArgs,
	resolveCodexBin,
	validateModelConfig,
} from "../runner";

describe("Codex exec runner contract", () => {
	test("builds codex exec args with model, reasoning, sandbox, schema, and output file", () => {
		const args = buildCodexExecArgs({
			outputPath: "/tmp/last-message.txt",
			outputSchemaPath: "/tmp/schema.json",
			prompt: "Generate a portrait",
			model: "gpt-5.4-mini",
			reasoningEffort: "low",
			sandbox: "read-only",
		});

		expect(args).toEqual([
			"exec",
			"--skip-git-repo-check",
			"--ephemeral",
			"--model",
			"gpt-5.4-mini",
			"-c",
			'model_reasoning_effort="low"',
			"--sandbox",
			"read-only",
			"--color",
			"never",
			"--output-schema",
			"/tmp/schema.json",
			"--output-last-message",
			"/tmp/last-message.txt",
			"Generate a portrait",
		]);
	});

	test("validates allowed model and reasoning ids", () => {
		expect(
			validateModelConfig({
				model: "gpt-5.5",
				reasoningEffort: "xhigh",
			}),
		).toEqual({
			model: "gpt-5.5",
			reasoningEffort: "xhigh",
		});

		expect(() =>
			validateModelConfig({
				model: "gpt-4",
				reasoningEffort: "low",
			}),
		).toThrow("model must be one of");
	});

	test("honors CODEX_BIN before PATH lookup", () => {
		expect(
			resolveCodexBin({ ...process.env, CODEX_BIN: "/custom/codex" }),
		).toBe("/custom/codex");
	});
});
