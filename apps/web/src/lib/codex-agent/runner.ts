import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export const MODEL_OPTIONS = [
	{ id: "gpt-5.5", label: "GPT-5.5" },
	{ id: "gpt-5.4", label: "GPT-5.4" },
	{ id: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
	{ id: "gpt-5.3-codex-spark", label: "GPT-5.3-Codex-Spark" },
] as const;

export const REASONING_OPTIONS = [
	{ id: "low", label: "Low" },
	{ id: "medium", label: "Medium" },
	{ id: "high", label: "High" },
	{ id: "xhigh", label: "Extra high" },
] as const;

export type CodexModelId = (typeof MODEL_OPTIONS)[number]["id"];
export type CodexReasoningEffort = (typeof REASONING_OPTIONS)[number]["id"];

export interface CodexExecRunnerParams {
	prompt: string;
	cwd: string;
	model: CodexModelId;
	reasoningEffort: CodexReasoningEffort;
	sandbox?: "read-only" | "workspace-write" | "danger-full-access";
	timeoutMs?: number;
}

export type CodexExecRunner = (
	params: CodexExecRunnerParams,
) => Promise<{ answer: string }>;

const allowedModelIds = new Set<string>(MODEL_OPTIONS.map((model) => model.id));
const allowedReasoningIds = new Set<string>(
	REASONING_OPTIONS.map((option) => option.id),
);

const CHARACTER_PORTRAIT_OUTPUT_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["status", "imagePath", "highestRiskAssumption"],
	properties: {
		status: { type: "string", minLength: 1 },
		imagePath: { type: "string", minLength: 1 },
		highestRiskAssumption: { type: "string", minLength: 1 },
	},
};

export function validateModelConfig(input: {
	model: unknown;
	reasoningEffort: unknown;
}): { model: CodexModelId; reasoningEffort: CodexReasoningEffort } {
	const model = requiredText(input.model, "model");
	if (!allowedModelIds.has(model)) {
		throw new Error(
			`model must be one of ${[...allowedModelIds].join(", ")}`,
		);
	}

	const reasoningEffort = requiredText(
		input.reasoningEffort,
		"reasoningEffort",
	);
	if (!allowedReasoningIds.has(reasoningEffort)) {
		throw new Error(
			`reasoningEffort must be one of ${[...allowedReasoningIds].join(", ")}`,
		);
	}

	return {
		model: model as CodexModelId,
		reasoningEffort: reasoningEffort as CodexReasoningEffort,
	};
}

export async function runCodexExec({
	prompt,
	cwd,
	model,
	reasoningEffort,
	sandbox = "read-only",
	timeoutMs = 180000,
}: CodexExecRunnerParams): Promise<{ answer: string }> {
	const tempDir = await mkdtemp(join(tmpdir(), "codecut-codex-"));
	const outputPath = join(tempDir, "last-message.json");
	const outputSchemaPath = join(tempDir, "schema.json");
	const codexBin = resolveCodexBin(process.env);

	try {
		await writeFile(
			outputSchemaPath,
			JSON.stringify(CHARACTER_PORTRAIT_OUTPUT_SCHEMA),
			"utf8",
		);
		await runProcess(
			codexBin,
			buildCodexExecArgs({
				outputPath,
				outputSchemaPath,
				prompt,
				model,
				reasoningEffort,
				sandbox,
			}),
			{ cwd, timeoutMs },
		);

		const answer = (await readFile(outputPath, "utf8")).trim();
		if (!answer) {
			throw new Error("Codex returned an empty answer");
		}

		return { answer };
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export function buildCodexExecArgs({
	outputPath,
	outputSchemaPath,
	prompt,
	model,
	reasoningEffort,
	sandbox = "read-only",
}: {
	outputPath: string;
	outputSchemaPath: string;
	prompt: string;
	model: CodexModelId;
	reasoningEffort: CodexReasoningEffort;
	sandbox?: "read-only" | "workspace-write" | "danger-full-access";
}): string[] {
	return [
		"exec",
		"--skip-git-repo-check",
		"--ephemeral",
		"--model",
		requiredText(model, "model"),
		"-c",
		`model_reasoning_effort="${requiredText(reasoningEffort, "reasoningEffort")}"`,
		"--sandbox",
		requiredText(sandbox, "sandbox"),
		"--color",
		"never",
		"--output-schema",
		requiredText(outputSchemaPath, "outputSchemaPath"),
		"--output-last-message",
		requiredText(outputPath, "outputPath"),
		requiredText(prompt, "prompt"),
	];
}

export function resolveCodexBin(env: NodeJS.ProcessEnv = process.env): string {
	if (env.CODEX_BIN) {
		return env.CODEX_BIN;
	}

	const pluginAppserverBin = join(
		homedir(),
		".codex/plugins/.plugin-appserver/codex",
	);
	if (existsSync(pluginAppserverBin)) {
		return pluginAppserverBin;
	}

	return "codex";
}

function requiredText(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`${label} is required`);
	}
	return value.trim();
}

function runProcess(
	command: string,
	args: string[],
	{ cwd, timeoutMs }: { cwd: string; timeoutMs: number },
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env: {
				...process.env,
				PWD: cwd,
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let settled = false;

		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill("SIGTERM");
			reject(new Error(`Codex timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		child.stdout.on("data", (chunk) => {
			stdout = appendLog(stdout, chunk);
		});

		child.stderr.on("data", (chunk) => {
			stderr = appendLog(stderr, chunk);
		});

		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(error);
		});

		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);

			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}

			reject(new Error(`Codex exited with code ${code}\nstderr:\n${stderr}`));
		});
	});
}

function appendLog(current: string, chunk: Buffer): string {
	return `${current}${chunk.toString("utf8")}`.slice(-12000);
}
