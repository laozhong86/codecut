import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
	cancelRequirementDraft,
	confirmRequirementDraft,
	createRequirementDraft,
	readRequirementConfirmation,
	RequirementDraftSchema,
	resolveRequirementConfirmationRoot,
	type RequirementDraftInput,
} from "../requirement-confirmation";

function validDraftInput(): RequirementDraftInput {
	return {
		originalUserMessage: "22号解说口播保留原片时长",
		requestedProjectName: "22号解说口播保留原片时长",
		requestedProjectId: "22-abc123",
			mediaSources: [
				{
					kind: "filePath",
					filePath: "/Users/x/Downloads/22.mp4",
					mimeType: "video/mp4",
				},
			],
		taskType: "edit_execution",
		timelinePreferences: {
			aspectRatio: "9:16",
			durationGoal: { mode: "auto" },
			durationContract: {
				totalDurationMode: "preserve_source",
				sourceCoverageMode: "full_source",
				sourceDurationSeconds: 28.866667,
				toleranceSeconds: 0.05,
			},
			transitionPreference: "none",
			generateIntroCover: false,
			requirements: "保留源视频完整长度，不删减原片，新增中文配音和同步字幕。",
		},
		captionPreferences: {
			language: "zh-CN",
			font: "auto",
			size: "medium",
			stylePreset: "short-form-bold",
		},
		voicePreferences: { voicePackId: "none" },
		exportPreferences: {
			format: "mp4",
			quality: "high",
			includeAudio: true,
		},
		checks: [
			{
				id: "source-duration",
				ok: true,
				message: "Source duration is available.",
			},
		],
	};
}

describe("requirement confirmation store", () => {
	test("resolves a nested web cwd to the plugin root", async () => {
		const root = await mkdtemp(join(tmpdir(), "codecut-req-root-"));
		await mkdir(join(root, ".codex-plugin"), { recursive: true });
		await writeFile(join(root, ".codex-plugin", "plugin.json"), "{}\n", "utf8");
		await mkdir(join(root, "apps", "web"), { recursive: true });

		expect(
			resolveRequirementConfirmationRoot({
				cwd: join(root, "apps", "web"),
				env: { NODE_ENV: "test" },
			}),
		).toBe(root);
	});

	test("creates and reads a pending requirement draft", async () => {
		const root = await mkdtemp(join(tmpdir(), "codecut-req-"));
		const draft = await createRequirementDraft({
			root,
			input: validDraftInput(),
		});

		const readback = await readRequirementConfirmation({
			root,
			draftId: draft.draftId,
		});

		expect(readback.status).toBe("awaiting_user_confirmation");
		expect(readback.draft.requestedProjectName).toBe(
			"22号解说口播保留原片时长",
		);
	});

	test("writes confirmed requirement with embedded confirmed setup", async () => {
		const root = await mkdtemp(join(tmpdir(), "codecut-req-"));
		const draft = await createRequirementDraft({
			root,
			input: validDraftInput(),
		});

		const confirmed = await confirmRequirementDraft({
			root,
			draftId: draft.draftId,
			patch: {
				voicePreferences: { voicePackId: "podcast-female" },
			},
		});

		expect(confirmed.status).toBe("confirmed");
		expect(confirmed.confirmedSetup.voicePreferences?.voicePackId).toBe(
			"podcast-female",
		);

		const file = JSON.parse(
			await readFile(
				join(
					root,
					".codecut-workspace",
					"requirements",
					draft.draftId,
					"confirmed.json",
				),
				"utf8",
			),
		);
		expect(file.status).toBe("confirmed");
	});

	test("writes cancelled status", async () => {
		const root = await mkdtemp(join(tmpdir(), "codecut-req-"));
		const draft = await createRequirementDraft({
			root,
			input: validDraftInput(),
		});

		const cancelled = await cancelRequirementDraft({
			root,
			draftId: draft.draftId,
			reason: "User cancelled setup.",
		});

		expect(cancelled.status).toBe("cancelled");
	});

	test("rejects unknown built-in voice choices", () => {
		const result = RequirementDraftSchema.safeParse({
			...validDraftInput(),
			version: 1,
			draftId: "ccreq_bad",
			status: "awaiting_user_confirmation",
			createdAt: new Date().toISOString(),
			source: "codecut_requirement_confirmation",
			voicePreferences: { voicePackId: "random-voice" },
		});

		expect(result.success).toBe(false);
	});
});
