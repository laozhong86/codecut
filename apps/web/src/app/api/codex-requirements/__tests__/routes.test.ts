import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import {
	createRequirementDraft,
	type RequirementDraftInput,
} from "@/lib/codex-executor/requirement-confirmation";
import { GET as getRequirement } from "../[draft_id]/route";
import { POST as confirmRequirement } from "../[draft_id]/confirm/route";
import { POST as cancelRequirement } from "../[draft_id]/cancel/route";

const origin = "http://localhost:4100";

function request({
	url,
	method = "GET",
	body,
}: {
	url: string;
	method?: "GET" | "POST";
	body?: unknown;
}) {
	return new NextRequest(url, {
		method,
		headers: body ? { "content-type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});
}

function routeContext(draftId: string) {
	return { params: Promise.resolve({ draft_id: draftId }) };
}

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
		titlePreferences: { enabled: false },
		captionPreferences: {
			enabled: true,
			language: "zh-CN",
			font: "auto",
			size: "medium",
			stylePreset: "short-form-bold",
		},
		voicePreferences: { enabled: false, voicePackId: "none" },
		characterPreferences: { characterId: "none" },
		bgmPreferences: { mode: "none" },
		templatePreference: {
			mode: "specified",
			requestedTemplate: "talking-head-broll-split",
		},
		networkMaterialMatching: {
			enabled: false,
			placement: "background",
			providers: ["pexels"],
			resolvedTemplateId: "talking-head-short",
			decisionSource: "template",
		},
		exportPreferences: {
			format: "mp4",
			quality: "high",
			includeAudio: true,
		},
		checks: [{ id: "source-duration", ok: true, message: "Ready." }],
	};
}

describe("codex requirement confirmation API routes", () => {
	let root: string;
	let previousRoot: string | undefined;

	beforeEach(async () => {
		previousRoot = process.env.CODECUT_REQUIREMENT_ROOT;
		root = await mkdtemp(join(tmpdir(), "codecut-req-api-"));
		process.env.CODECUT_REQUIREMENT_ROOT = root;
	});

	afterEach(async () => {
		if (previousRoot === undefined) {
			delete process.env.CODECUT_REQUIREMENT_ROOT;
		} else {
			process.env.CODECUT_REQUIREMENT_ROOT = previousRoot;
		}
		await rm(root, { recursive: true, force: true });
	});

	test("reads pending requirement draft", async () => {
		const draft = await createRequirementDraft({
			root,
			input: validDraftInput(),
		});

		const response = await getRequirement(
			request({
				url: `${origin}/api/codex-requirements/${draft.draftId}`,
			}),
			routeContext(draft.draftId),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "awaiting_user_confirmation",
			draft: {
				draftId: draft.draftId,
				requestedProjectName: "22号解说口播保留原片时长",
				templatePreference: {
					mode: "specified",
					requestedTemplate: "talking-head-broll-split",
				},
			},
		});
	});

	test("confirms requirement and writes confirmed.json", async () => {
		const draft = await createRequirementDraft({
			root,
			input: validDraftInput(),
		});

		const response = await confirmRequirement(
			request({
				url: `${origin}/api/codex-requirements/${draft.draftId}/confirm`,
				method: "POST",
				body: {
					patch: {
						titlePreferences: {
							enabled: true,
							mode: "custom",
							text: "别乱花钱",
							stylePreset: "hook_title",
						},
						voicePreferences: {
							enabled: true,
							voicePackId: "podcast-female",
						},
						characterPreferences: {
							characterId: "ugc-female-host",
						},
						bgmPreferences: {
							mode: "smart_match",
						},
						templatePreference: { mode: "auto" },
					},
				},
			}),
			routeContext(draft.draftId),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "confirmed",
			confirmed: {
				confirmedSetup: {
					titlePreferences: {
						enabled: true,
						mode: "custom",
						text: "别乱花钱",
						stylePreset: "hook_title",
					},
					voicePreferences: {
						enabled: true,
						voicePackId: "podcast-female",
					},
					characterPreferences: {
						characterId: "ugc-female-host",
					},
					bgmPreferences: {
						mode: "smart_match",
					},
					templatePreference: { mode: "auto" },
				},
			},
		});

		const confirmedFile = JSON.parse(
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
		expect(confirmedFile.status).toBe("confirmed");
		expect(confirmedFile.confirmedSetup.templatePreference).toEqual({
			mode: "auto",
		});
	});

	test("cancels requirement and returns cancelled readback", async () => {
		const draft = await createRequirementDraft({
			root,
			input: validDraftInput(),
		});

		const response = await cancelRequirement(
			request({
				url: `${origin}/api/codex-requirements/${draft.draftId}/cancel`,
				method: "POST",
				body: { reason: "User cancelled." },
			}),
			routeContext(draft.draftId),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: "cancelled",
			cancelled: { reason: "User cancelled." },
		});
	});
});
