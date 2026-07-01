# CodeCut Requirement Confirmation Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable CodeCut requirement confirmation page so new creative jobs confirm requirements before project creation and no longer rely on automatic follow-up messages as the business handoff.

**Architecture:** Create a local requirement store under `.codecut-workspace/requirements/<draftId>`, expose MCP tools to open and read the confirmation state, add a Next.js page/API for user confirmation, and route project creation from the confirmed requirement record. Keep the existing setup widget as a compatibility path until the new flow is fresh-session verified.

**Tech Stack:** Node.js, Bun test, Zod, Next.js App Router, existing CodeCut MCP server, existing `ConfirmedSetupSchema`, local `.codecut-workspace` files, existing plugin freshness tooling.

---

## File Structure

- Create `apps/web/src/lib/codex-executor/requirement-confirmation.ts`
  - Owns `RequirementDraftSchema`, `ConfirmedRequirementSchema`, storage paths,
    draft creation, confirmation, cancellation, and readback.

- Create `apps/web/src/lib/codex-executor/__tests__/requirement-confirmation.test.ts`
  - Tests schema validation and local storage behavior.

- Modify `mcp/server.mjs`
  - Adds `open_codecut_requirement_confirmation`,
    `get_codecut_requirement_confirmation`, and later
    `create_codecut_project_from_requirement`.
  - Keeps `open_codecut_workspace` and `submit_codecut_setup` intact.

- Modify `mcp/server.test.mjs`
  - Tests new MCP tool schemas, no-project side-effect behavior, and readback.

- Create `apps/web/src/app/[locale]/requirements/[draft_id]/page.tsx`
  - Renders the durable requirement confirmation page.

- Create `apps/web/src/app/[locale]/requirements/[draft_id]/requirement-confirmation-client.tsx`
  - Client component for editing fields and submitting confirmation.

- Create `apps/web/src/app/api/codex-requirements/[draft_id]/route.ts`
  - Reads a requirement draft or confirmed result.

- Create `apps/web/src/app/api/codex-requirements/[draft_id]/confirm/route.ts`
  - Validates and writes `confirmed.json`.

- Create `apps/web/src/app/api/codex-requirements/[draft_id]/cancel/route.ts`
  - Writes cancelled status.

- Create `apps/web/src/app/[locale]/requirements/__tests__/requirement-confirmation-page.test.tsx`
  - Tests page rendering of key fields.

- Modify `scripts/verify-codecut-widget-intake-thread.mjs`
  - Adds a durable requirement-confirmation mode.
  - Stops requiring visible follow-up for the new path.

- Modify `scripts/__tests__/verify-codecut-widget-intake-thread.test.mjs`
  - Tests the new verifier mode and keeps old follow-up checks as
    compatibility-only cases.

- Modify `skills/codecut/SKILL.md`
  - Routes new creative jobs through requirement confirmation before project
    creation.

- Modify `docs/codecut-widget-intake-fresh-thread.md`
  - Updates the validation contract from visible continuation-message proof to
    confirmed requirement readback.

- Modify `docs/codecut-workspace.md`
  - Documents `.codecut-workspace/requirements/<draftId>`.

- Modify `docs/codex-driven-editing.md`
  - Documents the new pre-project confirmation order.

## Task 1: Add Requirement Confirmation Store

**Files:**
- Create: `apps/web/src/lib/codex-executor/requirement-confirmation.ts`
- Create: `apps/web/src/lib/codex-executor/__tests__/requirement-confirmation.test.ts`

- [ ] **Step 1: Write the failing storage test**

Create `apps/web/src/lib/codex-executor/__tests__/requirement-confirmation.test.ts` with tests for draft creation, confirmation, cancellation, and invalid voice choices.

```ts
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
	createRequirementDraft,
	confirmRequirementDraft,
	cancelRequirementDraft,
	readRequirementConfirmation,
	RequirementDraftSchema,
} from "../requirement-confirmation";

function validDraftInput() {
	return {
		originalUserMessage: "22号解说口播保留原片时长",
		requestedProjectName: "22号解说口播保留原片时长",
		requestedProjectId: "22-abc123",
		mediaSources: [{ kind: "filePath", filePath: "/Users/x/Downloads/22.mp4" }],
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/requirement-confirmation.test.ts
```

Expected: FAIL because `../requirement-confirmation` does not exist.

- [ ] **Step 3: Implement the requirement store**

Create `apps/web/src/lib/codex-executor/requirement-confirmation.ts` with:

```ts
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
	BuiltInVoicePackIdSchema,
	ConfirmedSetupSchema,
	ConfirmedSetupTaskTypeSchema,
} from "./setup-contract";

const RequirementStatusSchema = z.enum([
	"awaiting_user_confirmation",
	"confirmed",
	"cancelled",
]);

const MediaSourceSchema = z.union([
	z.object({ kind: z.literal("filePath"), filePath: z.string().trim().min(1) }).strict(),
	z.object({ kind: z.literal("url"), url: z.string().trim().min(1) }).strict(),
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

export type RequirementDraftInput = z.infer<typeof RequirementDraftInputSchema>;
export type RequirementDraft = z.infer<typeof RequirementDraftSchema>;
export type ConfirmedRequirement = z.infer<typeof ConfirmedRequirementSchema>;
export type CancelledRequirement = z.infer<typeof CancelledRequirementSchema>;

function nowIso() {
	return new Date().toISOString();
}

function workspaceRoot(root: string) {
	return join(resolve(root), ".codecut-workspace");
}

function requirementRoot(root: string, draftId: string) {
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

async function appendEvent(root: string, draftId: string, event: Record<string, unknown>) {
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

export async function readRequirementDraft({ root, draftId }: { root: string; draftId: string }) {
	return RequirementDraftSchema.parse(
		JSON.parse(await readFile(join(requirementRoot(root, draftId), "draft.json"), "utf8")),
	);
}

export async function confirmRequirementDraft({
	root,
	draftId,
	patch = {},
}: {
	root: string;
	draftId: string;
	patch?: Partial<Pick<RequirementDraft, "timelinePreferences" | "captionPreferences" | "voicePreferences" | "exportPreferences">>;
}) {
	const draft = await readRequirementDraft({ root, draftId });
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
			timelinePreferences: patch.timelinePreferences ?? draft.timelinePreferences,
			captionPreferences: patch.captionPreferences ?? draft.captionPreferences,
			voicePreferences: patch.voicePreferences ?? draft.voicePreferences,
			exportPreferences: patch.exportPreferences ?? draft.exportPreferences,
			changes: [],
		},
	});
	await writeJson(join(requirementRoot(root, draftId), "confirmed.json"), confirmed);
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
	await writeJson(join(requirementRoot(root, draftId), "confirmed.json"), cancelled);
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
		const data = JSON.parse(
			await readFile(join(requirementRoot(root, draftId), "confirmed.json"), "utf8"),
		);
		if (data.status === "confirmed") {
			return { status: "confirmed" as const, draft, confirmed: ConfirmedRequirementSchema.parse(data) };
		}
		return { status: "cancelled" as const, draft, cancelled: CancelledRequirementSchema.parse(data) };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { status: "awaiting_user_confirmation" as const, draft };
		}
		throw error;
	}
}
```

- [ ] **Step 4: Run the storage test**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/requirement-confirmation.test.ts
```

Expected: PASS.

## Task 2: Add MCP Requirement Confirmation Tools

**Files:**
- Modify: `mcp/server.mjs`
- Modify: `mcp/server.test.mjs`

- [ ] **Step 1: Add failing MCP tests**

Add tests to `mcp/server.test.mjs` that assert:

- tool list includes `open_codecut_requirement_confirmation`;
- tool list includes `get_codecut_requirement_confirmation`;
- opening a requirement draft does not call `create_project`;
- reading a pending draft returns `awaiting_user_confirmation`.

Use the existing `callCodecutWorkspaceTool` test style and a fake
`bridgeToolImpl` that throws if `create_project`, `import_media`, or timeline
tools are called.

- [ ] **Step 2: Run focused MCP tests and verify failure**

Run:

```bash
bun test mcp/server.test.mjs
```

Expected: FAIL because the tools are not registered yet.

- [ ] **Step 3: Register the tools**

Modify `mcp/server.mjs`:

- import the requirement store module;
- add tool definitions for `open_codecut_requirement_confirmation` and
  `get_codecut_requirement_confirmation`;
- map CodeCut setup intent fields into `RequirementDraftInputSchema`;
- return `confirmationUrl` using `CODECUT_AGENT_BRIDGE_URL` or
  `http://127.0.0.1:4100`;
- do not call the bridge `create_project` tool from the open/get tools.

- [ ] **Step 4: Run MCP tests**

Run:

```bash
bun test mcp/server.test.mjs
```

Expected: PASS.

## Task 3: Add Local Requirement Confirmation Page

**Files:**
- Create: `apps/web/src/app/[locale]/requirements/[draft_id]/page.tsx`
- Create: `apps/web/src/app/[locale]/requirements/[draft_id]/requirement-confirmation-client.tsx`
- Create: `apps/web/src/app/api/codex-requirements/[draft_id]/route.ts`
- Create: `apps/web/src/app/api/codex-requirements/[draft_id]/confirm/route.ts`
- Create: `apps/web/src/app/api/codex-requirements/[draft_id]/cancel/route.ts`
- Create: `apps/web/src/app/[locale]/requirements/__tests__/requirement-confirmation-page.test.tsx`

- [ ] **Step 1: Add failing page and route tests**

Test that the page renders:

- project name;
- media source path;
- voice options: no voice, podcast female, podcast male;
- output format;
- confirm button.

Test that the confirm API writes a confirmed result.

- [ ] **Step 2: Run page tests and verify failure**

Run:

```bash
bun test apps/web/src/app/[locale]/requirements/__tests__/requirement-confirmation-page.test.tsx
```

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement the API routes**

Implement the three API routes using the requirement store module. All routes
must fail fast with a JSON error and HTTP 400/404 when `draft_id` is invalid or
the draft cannot be found.

- [ ] **Step 4: Implement the page**

Use existing UI components from `apps/web/src/components/ui`. Keep the first
screen as the actual confirmation form, not a marketing or explanation page.

Required controls:

- select for aspect ratio;
- select for duration mode;
- select for subtitle language;
- select for subtitle style;
- select for built-in voice;
- textarea for requirements;
- select for output quality;
- confirm button;
- cancel button.

- [ ] **Step 5: Run page tests**

Run:

```bash
bun test apps/web/src/app/[locale]/requirements/__tests__/requirement-confirmation-page.test.tsx
```

Expected: PASS.

## Task 4: Route Project Creation From Confirmed Requirement

**Files:**
- Modify: `mcp/server.mjs`
- Modify: `mcp/server.test.mjs`
- Modify: `scripts/codecut-confirmation-gate.mjs` only if a separate requirement token is needed.

- [ ] **Step 1: Add failing tests**

Add tests that:

- `create_codecut_project_from_requirement` fails when the draft is pending;
- it fails when the draft is cancelled;
- it creates the project only when the draft is confirmed;
- it initializes project workspace after project creation;
- it persists recovery data without requiring a visible host follow-up.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
bun test mcp/server.test.mjs
```

Expected: FAIL because the create-from-requirement tool does not exist.

- [ ] **Step 3: Implement create-from-requirement**

The implementation should reuse as much of `submitCodecutSetup` as possible,
but move validation input from widget payload to `confirmedSetup` readback.

Do not call `sendFollowUpMessage` as a required step. If the page or widget
environment sends a notification, catch and surface it as best-effort metadata
only.

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun test mcp/server.test.mjs
```

Expected: PASS.

## Task 5: Update Verifier And Docs

**Files:**
- Modify: `scripts/verify-codecut-widget-intake-thread.mjs`
- Modify: `scripts/__tests__/verify-codecut-widget-intake-thread.test.mjs`
- Modify: `skills/codecut/SKILL.md`
- Modify: `docs/codecut-widget-intake-fresh-thread.md`
- Modify: `docs/codecut-workspace.md`
- Modify: `docs/codex-driven-editing.md`

- [ ] **Step 1: Add failing verifier tests**

Add a verifier fixture where a fresh thread contains:

- one `open_codecut_requirement_confirmation` call;
- zero project creation side effects before confirmation;
- a later `get_codecut_requirement_confirmation` result with
  `status: confirmed`;
- no visible follow-up message.

Expected verifier result: PASS in requirement-confirmation mode.

- [ ] **Step 2: Run verifier tests and verify failure**

Run:

```bash
bun test scripts/__tests__/verify-codecut-widget-intake-thread.test.mjs
```

Expected: FAIL because the verifier still treats follow-up as the core proof.

- [ ] **Step 3: Implement verifier mode**

Add a flag:

```bash
--require-confirmed-requirement
```

When the flag is present, the verifier should require durable confirmation
readback and should not require a visible follow-up message.

- [ ] **Step 4: Update docs and skill routing**

Update the CodeCut router guidance so new creative jobs use requirement
confirmation before `submit_codecut_setup` or the replacement
`create_codecut_project_from_requirement` tool.

- [ ] **Step 5: Run verifier tests**

Run:

```bash
bun test scripts/__tests__/verify-codecut-widget-intake-thread.test.mjs
```

Expected: PASS.

## Task 6: Full Verification And Plugin Sync

**Files:**
- No new source files unless tests expose a real gap.

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/requirement-confirmation.test.ts
bun test mcp/server.test.mjs
bun test scripts/__tests__/verify-codecut-widget-intake-thread.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run formatting and type checks**

Run:

```bash
git diff --check
bun run typecheck:web
```

Expected: PASS.

- [ ] **Step 3: Run plugin freshness**

Run:

```bash
bun run plugin:freshness
```

Expected: source/cache/config status is reported. If cache is stale, sync only
after the PR is landed or when explicitly validating a local plugin build.

- [ ] **Step 4: Fresh-session validation**

Create a fresh CodeCut validation thread with a normal user-style request. The
proof must show:

- the new requirement confirmation tool path was used;
- no project was created before requirement confirmation;
- confirmed requirement readback exists;
- follow-up message visibility is not required.

- [ ] **Step 5: Merge and cache sync**

After review and remote merge, run these from the protected main checkout, not
from the feature worktree:

```bash
git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
git merge --ff-only origin/main
node scripts/sync-codex-local-plugin.mjs
bun run plugin:freshness
```

Expected: local main matches origin/main, installed plugin cache matches source,
and a fresh session can discover the new tool surface.
