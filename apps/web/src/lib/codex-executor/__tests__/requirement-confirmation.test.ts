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
		templatePreference: {
			mode: "specified",
			requestedTemplate: "TikTok 解说视频模板",
		},
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
	test("uses explicit requirement root before shared plugin storage", () => {
		const explicitRoot = join(tmpdir(), "codecut-explicit-req-root");

		expect(
			resolveRequirementConfirmationRoot({
				cwd: "/different/cwd",
				env: { CODECUT_REQUIREMENT_ROOT: explicitRoot, NODE_ENV: "test" },
			}),
		).toBe(explicitRoot);
	});

	test("resolves source and cache plugin cwd to the same shared root", async () => {
		const root = await mkdtemp(join(tmpdir(), "codecut-req-root-"));
		const sourceRoot = join(root, "source");
		const cacheRoot = join(root, "cache");
		const homeRoot = join(root, "home");
		for (const pluginRoot of [sourceRoot, cacheRoot]) {
			await mkdir(join(pluginRoot, ".codex-plugin"), { recursive: true });
			await writeFile(
				join(pluginRoot, ".codex-plugin", "plugin.json"),
				"{}\n",
				"utf8",
			);
			await mkdir(join(pluginRoot, "apps", "web"), { recursive: true });
		}

		const expectedRoot = join(homeRoot, ".codex", "codecut");
		expect(
			resolveRequirementConfirmationRoot({
				cwd: join(sourceRoot, "apps", "web"),
				env: { HOME: homeRoot, NODE_ENV: "test" },
			}),
		).toBe(expectedRoot);
		expect(
			resolveRequirementConfirmationRoot({
				cwd: join(cacheRoot, "apps", "web"),
				env: { HOME: homeRoot, NODE_ENV: "test" },
			}),
		).toBe(expectedRoot);
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
		expect(readback.draft.templatePreference).toEqual({
			mode: "specified",
			requestedTemplate: "TikTok 解说视频模板",
		});
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
		expect(confirmed.confirmedSetup.templatePreference).toEqual({
			mode: "specified",
			requestedTemplate: "TikTok 解说视频模板",
		});

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
		expect(file.confirmedSetup.templatePreference).toEqual({
			mode: "specified",
			requestedTemplate: "TikTok 解说视频模板",
		});
	});

	test("confirmation patch can update template preference", async () => {
		const root = await mkdtemp(join(tmpdir(), "codecut-req-"));
		const draft = await createRequirementDraft({
			root,
			input: validDraftInput(),
		});

		const confirmed = await confirmRequirementDraft({
			root,
			draftId: draft.draftId,
			patch: {
				templatePreference: { mode: "auto" },
			},
		});

		expect(confirmed.confirmedSetup.templatePreference).toEqual({
			mode: "auto",
		});
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
