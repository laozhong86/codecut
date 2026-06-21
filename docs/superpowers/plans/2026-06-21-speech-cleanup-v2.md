# Speech Cleanup v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local SpeechCleanup v2 contract that lets Codex produce explainable keep/drop decisions and lets CodeCut project them into the current EditPlan v1 executor.

**Architecture:** Implement a focused `apps/web/src/lib/speech-cleanup/` module. The module validates Codex-labeled decisions, rebuilds contiguous clips and captions, returns stats and verification, and projects the result to the existing strict EditPlan v1 shape. No UI, storage migration, cloud API, or ASR model change is part of this plan.

**Tech Stack:** TypeScript, Zod, Bun test runner, existing EditPlan validator

---

## Repository Constraint

`CLAUDE.md` says not to run `git add`, `git commit`, or `git push` unless the
user explicitly asks. This plan intentionally uses verification checkpoints
instead of commit steps.

## File Structure

```text
apps/web/src/lib/speech-cleanup/
├── schema.ts
├── rebuild.ts
├── index.ts
└── __tests__/
    ├── schema.test.ts
    └── rebuild.test.ts
```

**Create:**
- `apps/web/src/lib/speech-cleanup/schema.ts` defines the Zod schemas and exported types.
- `apps/web/src/lib/speech-cleanup/rebuild.ts` contains the pure rebuild and projection logic.
- `apps/web/src/lib/speech-cleanup/index.ts` re-exports the public module surface.
- `apps/web/src/lib/speech-cleanup/__tests__/schema.test.ts` covers contract validation.
- `apps/web/src/lib/speech-cleanup/__tests__/rebuild.test.ts` covers timeline rebuild, stats, verification, and EditPlan v1 projection.

**Modify:**
- `docs/codex-driven-editing.md` adds a short section explaining how Codex uses SpeechCleanup before `apply_edit_plan`.

---

### Task 1: Add SpeechCleanup Schema Tests

**Files:**
- Create: `apps/web/src/lib/speech-cleanup/__tests__/schema.test.ts`
- Create later: `apps/web/src/lib/speech-cleanup/schema.ts`

- [ ] **Step 1: Write the failing schema tests**

```typescript
import { describe, expect, test } from "bun:test";
import { SpeechCleanupPlanSchema } from "../schema";

function validPlan() {
	return {
		version: 2,
		projectId: "project-1",
		sourceMediaId: "media-1",
		target: {
			durationSec: 8,
			aspectRatio: "16:9",
		},
		decisions: [
			{
				id: "seg-1",
				text: "嗯我重新说一下",
				sourceStart: 0,
				sourceEnd: 1.2,
				action: "drop",
				dropReason: "restart",
				reason: "Speaker restarts the sentence.",
			},
			{
				id: "seg-2",
				text: "平台红利不等于个人实力",
				sourceStart: 1.2,
				sourceEnd: 4.2,
				action: "keep",
				reason: "Core claim.",
			},
		],
		rationale: "Remove restart and keep the core claim.",
	};
}

describe("SpeechCleanupPlanSchema", () => {
	test("accepts a valid speech cleanup plan", () => {
		const result = SpeechCleanupPlanSchema.safeParse(validPlan());

		expect(result.success).toBe(true);
	});

	test("rejects a drop decision without dropReason", () => {
		const plan = validPlan();
		delete plan.decisions[0].dropReason;

		const result = SpeechCleanupPlanSchema.safeParse(plan);

		expect(result.success).toBe(false);
	});

	test("rejects a keep decision with dropReason", () => {
		const plan = validPlan();
		plan.decisions[1] = {
			...plan.decisions[1],
			dropReason: "filler",
		};

		const result = SpeechCleanupPlanSchema.safeParse(plan);

		expect(result.success).toBe(false);
	});

	test("rejects reversed source ranges", () => {
		const plan = validPlan();
		plan.decisions[1] = {
			...plan.decisions[1],
			sourceStart: 4.2,
			sourceEnd: 1.2,
		};

		const result = SpeechCleanupPlanSchema.safeParse(plan);

		expect(result.success).toBe(false);
	});
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
bun test apps/web/src/lib/speech-cleanup/__tests__/schema.test.ts
```

Expected:

```text
FAIL
Cannot find module '../schema'
```

---

### Task 2: Implement SpeechCleanup Schema

**Files:**
- Create: `apps/web/src/lib/speech-cleanup/schema.ts`

- [ ] **Step 1: Add the schema implementation**

```typescript
import { z } from "zod";
import { EditPlanAspectRatioSchema } from "@/lib/agent-bridge/edit-plan/schema";

export const SpeechCleanupActionSchema = z.enum(["keep", "drop"]);

export const SpeechCleanupDropReasonSchema = z.enum([
	"filler",
	"mistake",
	"repeat",
	"restart",
	"pause",
	"other",
]);

const BaseDecisionSchema = z.object({
	id: z.string().min(1),
	text: z.string().min(1),
	sourceStart: z.number().min(0),
	sourceEnd: z.number().min(0),
	reason: z.string().min(1),
});

export const KeepDecisionSchema = BaseDecisionSchema.extend({
	action: z.literal("keep"),
	dropReason: z.never().optional(),
}).strict();

export const DropDecisionSchema = BaseDecisionSchema.extend({
	action: z.literal("drop"),
	dropReason: SpeechCleanupDropReasonSchema,
}).strict();

export const SpeechCleanupDecisionSchema = z
	.discriminatedUnion("action", [KeepDecisionSchema, DropDecisionSchema])
	.superRefine((decision, ctx) => {
		if (decision.sourceEnd <= decision.sourceStart) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "sourceEnd must be greater than sourceStart",
				path: ["sourceEnd"],
			});
		}
	});

export const SpeechCleanupPlanSchema = z
	.object({
		version: z.literal(2),
		projectId: z.string().min(1),
		sourceMediaId: z.string().min(1),
		target: z
			.object({
				durationSec: z.number().positive(),
				aspectRatio: EditPlanAspectRatioSchema,
			})
			.strict(),
		decisions: z.array(SpeechCleanupDecisionSchema).min(1),
		rationale: z.string().min(1),
	})
	.strict();

export type SpeechCleanupAction = z.infer<typeof SpeechCleanupActionSchema>;
export type SpeechCleanupDropReason = z.infer<
	typeof SpeechCleanupDropReasonSchema
>;
export type SpeechCleanupDecision = z.infer<
	typeof SpeechCleanupDecisionSchema
>;
export type SpeechCleanupPlan = z.infer<typeof SpeechCleanupPlanSchema>;

export interface RebuiltSpeechCaption {
	id: string;
	text: string;
	startTime: number;
	duration: number;
	sourceStart: number;
	sourceEnd: number;
}

export interface SpeechCleanupStats {
	total: number;
	keep: number;
	drop: number;
	dropReasons: Partial<Record<SpeechCleanupDropReason, number>>;
}

export interface SpeechCleanupVerification {
	timelineContiguous: boolean;
	captionsWithinTimeline: boolean;
	sourceTraceAvailable: boolean;
	warnings: string[];
}
```

- [ ] **Step 2: Run the schema tests and verify they pass**

Run:

```bash
bun test apps/web/src/lib/speech-cleanup/__tests__/schema.test.ts
```

Expected:

```text
PASS
```

---

### Task 3: Add Rebuild Tests

**Files:**
- Create: `apps/web/src/lib/speech-cleanup/__tests__/rebuild.test.ts`
- Create later: `apps/web/src/lib/speech-cleanup/rebuild.ts`

- [ ] **Step 1: Write failing rebuild tests**

```typescript
import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import { validateEditPlan } from "@/lib/agent-bridge/edit-plan/validate";
import { rebuildTimelineFromSpeechCleanup } from "../rebuild";
import type { SpeechCleanupPlan } from "../schema";

function mediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return {
		id: "media-1",
		name: "talking-head.mp4",
		type: "video",
		duration: 20,
		width: 1920,
		height: 1080,
		file: new File(["video"], "talking-head.mp4", { type: "video/mp4" }),
		...overrides,
	};
}

function speechCleanupPlan(): SpeechCleanupPlan {
	return {
		version: 2,
		projectId: "project-1",
		sourceMediaId: "media-1",
		target: {
			durationSec: 6,
			aspectRatio: "16:9",
		},
		decisions: [
			{
				id: "seg-1",
				text: "嗯我重新说一下",
				sourceStart: 0,
				sourceEnd: 1.2,
				action: "drop",
				dropReason: "restart",
				reason: "Speaker restarts.",
			},
			{
				id: "seg-2",
				text: "平台红利不等于个人实力",
				sourceStart: 1.2,
				sourceEnd: 4.2,
				action: "keep",
				reason: "Core claim.",
			},
			{
				id: "seg-3",
				text: "啊这个地方很关键",
				sourceStart: 4.2,
				sourceEnd: 5.4,
				action: "drop",
				dropReason: "filler",
				reason: "Filler phrase.",
			},
			{
				id: "seg-4",
				text: "真正的议价能力来自客户资产",
				sourceStart: 5.4,
				sourceEnd: 8.4,
				action: "keep",
				reason: "Core conclusion.",
			},
		],
		rationale: "Remove restart and filler while preserving the argument.",
	};
}

describe("rebuildTimelineFromSpeechCleanup", () => {
	test("rebuilds contiguous clips and captions from keep decisions", () => {
		const result = rebuildTimelineFromSpeechCleanup({
			plan: speechCleanupPlan(),
			sourceDuration: 20,
		});

		expect(result.clips).toEqual([
			{
				id: "clip-1",
				sourceStart: 1.2,
				sourceEnd: 4.2,
				timelineStart: 0,
				reason: "Core claim.",
			},
			{
				id: "clip-2",
				sourceStart: 5.4,
				sourceEnd: 8.4,
				timelineStart: 3,
				reason: "Core conclusion.",
			},
		]);
		expect(result.rebuiltCaptions).toEqual([
			{
				id: "caption-1",
				text: "平台红利不等于个人实力",
				startTime: 0,
				duration: 3,
				sourceStart: 1.2,
				sourceEnd: 4.2,
			},
			{
				id: "caption-2",
				text: "真正的议价能力来自客户资产",
				startTime: 3,
				duration: 3,
				sourceStart: 5.4,
				sourceEnd: 8.4,
			},
		]);
	});

	test("returns stats and verification", () => {
		const result = rebuildTimelineFromSpeechCleanup({
			plan: speechCleanupPlan(),
			sourceDuration: 20,
		});

		expect(result.stats).toEqual({
			total: 4,
			keep: 2,
			drop: 2,
			dropReasons: {
				restart: 1,
				filler: 1,
			},
		});
		expect(result.verification).toEqual({
			timelineContiguous: true,
			captionsWithinTimeline: true,
			sourceTraceAvailable: true,
			warnings: [],
		});
	});

	test("projects to a current EditPlan v1 shape accepted by validateEditPlan", () => {
		const result = rebuildTimelineFromSpeechCleanup({
			plan: speechCleanupPlan(),
			sourceDuration: 20,
		});

		const validation = validateEditPlan({
			plan: result.editPlan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(validation.success).toBe(true);
	});

	test("fails when all decisions are dropped", () => {
		const plan = speechCleanupPlan();
		plan.decisions = plan.decisions.map((decision) => ({
			id: decision.id,
			text: decision.text,
			sourceStart: decision.sourceStart,
			sourceEnd: decision.sourceEnd,
			action: "drop",
			dropReason: "other",
			reason: decision.reason,
		}));

		expect(() =>
			rebuildTimelineFromSpeechCleanup({ plan, sourceDuration: 20 }),
		).toThrow("SpeechCleanupPlan must keep at least one segment.");
	});

	test("fails when a decision exceeds source duration", () => {
		const plan = speechCleanupPlan();
		plan.decisions[1] = {
			...plan.decisions[1],
			sourceEnd: 22,
		};

		expect(() =>
			rebuildTimelineFromSpeechCleanup({ plan, sourceDuration: 20 }),
		).toThrow("SpeechCleanupDecision sourceEnd exceeds source duration.");
	});
});
```

- [ ] **Step 2: Run the rebuild tests and verify they fail**

Run:

```bash
bun test apps/web/src/lib/speech-cleanup/__tests__/rebuild.test.ts
```

Expected:

```text
FAIL
Cannot find module '../rebuild'
```

---

### Task 4: Implement Rebuild and Projection Logic

**Files:**
- Create: `apps/web/src/lib/speech-cleanup/rebuild.ts`

- [ ] **Step 1: Add the rebuild implementation**

```typescript
import type { EditPlan, EditPlanClip } from "@/lib/agent-bridge/edit-plan/schema";
import {
	SpeechCleanupPlanSchema,
	type RebuiltSpeechCaption,
	type SpeechCleanupDecision,
	type SpeechCleanupDropReason,
	type SpeechCleanupPlan,
	type SpeechCleanupStats,
	type SpeechCleanupVerification,
} from "./schema";

const TIME_TOLERANCE_SECONDS = 0.001;

export interface SpeechCleanupResult {
	plan: SpeechCleanupPlan;
	clips: EditPlanClip[];
	rebuiltCaptions: RebuiltSpeechCaption[];
	stats: SpeechCleanupStats;
	verification: SpeechCleanupVerification;
	editPlan: EditPlan;
}

function roundTime(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function assertSourceBounds({
	decision,
	sourceDuration,
}: {
	decision: SpeechCleanupDecision;
	sourceDuration: number;
}) {
	if (decision.sourceEnd > sourceDuration) {
		throw new Error("SpeechCleanupDecision sourceEnd exceeds source duration.");
	}
}

function buildStats({
	decisions,
}: {
	decisions: SpeechCleanupDecision[];
}): SpeechCleanupStats {
	const dropReasons: Partial<Record<SpeechCleanupDropReason, number>> = {};
	let keep = 0;
	let drop = 0;

	for (const decision of decisions) {
		if (decision.action === "keep") {
			keep += 1;
			continue;
		}

		drop += 1;
		dropReasons[decision.dropReason] =
			(dropReasons[decision.dropReason] ?? 0) + 1;
	}

	return {
		total: decisions.length,
		keep,
		drop,
		dropReasons,
	};
}

function verifyResult({
	clips,
	rebuiltCaptions,
}: {
	clips: EditPlanClip[];
	rebuiltCaptions: RebuiltSpeechCaption[];
}): SpeechCleanupVerification {
	let expectedTimelineStart = 0;
	let timelineContiguous = true;
	let timelineEnd = 0;

	for (const clip of clips) {
		if (Math.abs(clip.timelineStart - expectedTimelineStart) > TIME_TOLERANCE_SECONDS) {
			timelineContiguous = false;
		}
		const clipDuration = clip.sourceEnd - clip.sourceStart;
		expectedTimelineStart = roundTime(expectedTimelineStart + clipDuration);
		timelineEnd = Math.max(timelineEnd, clip.timelineStart + clipDuration);
	}

	const captionsWithinTimeline = rebuiltCaptions.every(
		(caption) => caption.startTime + caption.duration <= timelineEnd + TIME_TOLERANCE_SECONDS,
	);
	const sourceTraceAvailable = rebuiltCaptions.every(
		(caption) => caption.sourceEnd > caption.sourceStart,
	);

	return {
		timelineContiguous,
		captionsWithinTimeline,
		sourceTraceAvailable,
		warnings: [],
	};
}

export function rebuildTimelineFromSpeechCleanup({
	plan,
	sourceDuration,
}: {
	plan: unknown;
	sourceDuration: number;
}): SpeechCleanupResult {
	const parsed = SpeechCleanupPlanSchema.parse(plan);
	if (sourceDuration <= 0) {
		throw new Error("sourceDuration must be positive.");
	}

	for (const decision of parsed.decisions) {
		assertSourceBounds({ decision, sourceDuration });
	}

	const keepDecisions = parsed.decisions.filter(
		(decision) => decision.action === "keep",
	);
	if (keepDecisions.length === 0) {
		throw new Error("SpeechCleanupPlan must keep at least one segment.");
	}

	const clips: EditPlanClip[] = [];
	const rebuiltCaptions: RebuiltSpeechCaption[] = [];
	let timelineStart = 0;

	for (let index = 0; index < keepDecisions.length; index += 1) {
		const decision = keepDecisions[index];
		const duration = roundTime(decision.sourceEnd - decision.sourceStart);
		const startTime = roundTime(timelineStart);

		clips.push({
			id: `clip-${index + 1}`,
			sourceStart: roundTime(decision.sourceStart),
			sourceEnd: roundTime(decision.sourceEnd),
			timelineStart: startTime,
			reason: decision.reason,
		});
		rebuiltCaptions.push({
			id: `caption-${index + 1}`,
			text: decision.text,
			startTime,
			duration,
			sourceStart: roundTime(decision.sourceStart),
			sourceEnd: roundTime(decision.sourceEnd),
		});

		timelineStart = roundTime(timelineStart + duration);
	}

	const stats = buildStats({ decisions: parsed.decisions });
	const verification = verifyResult({ clips, rebuiltCaptions });
	const editPlan: EditPlan = {
		version: 1,
		projectId: parsed.projectId,
		sourceMediaId: parsed.sourceMediaId,
		target: {
			durationSec: roundTime(timelineStart),
			aspectRatio: parsed.target.aspectRatio,
		},
		clips,
		captions: rebuiltCaptions.map((caption) => ({
			text: caption.text,
			startTime: caption.startTime,
			duration: caption.duration,
		})),
		rationale: parsed.rationale,
	};

	return {
		plan: parsed,
		clips,
		rebuiltCaptions,
		stats,
		verification,
		editPlan,
	};
}
```

- [ ] **Step 2: Run the rebuild tests and verify they pass**

Run:

```bash
bun test apps/web/src/lib/speech-cleanup/__tests__/rebuild.test.ts
```

Expected:

```text
PASS
```

---

### Task 5: Add Public Exports

**Files:**
- Create: `apps/web/src/lib/speech-cleanup/index.ts`

- [ ] **Step 1: Write the public export file**

```typescript
export {
	SpeechCleanupActionSchema,
	SpeechCleanupDecisionSchema,
	SpeechCleanupDropReasonSchema,
	SpeechCleanupPlanSchema,
	type RebuiltSpeechCaption,
	type SpeechCleanupAction,
	type SpeechCleanupDecision,
	type SpeechCleanupDropReason,
	type SpeechCleanupPlan,
	type SpeechCleanupStats,
	type SpeechCleanupVerification,
} from "./schema";

export {
	rebuildTimelineFromSpeechCleanup,
	type SpeechCleanupResult,
} from "./rebuild";
```

- [ ] **Step 2: Run the focused test suite**

Run:

```bash
bun test apps/web/src/lib/speech-cleanup/__tests__/schema.test.ts apps/web/src/lib/speech-cleanup/__tests__/rebuild.test.ts
```

Expected:

```text
PASS
```

---

### Task 6: Document the Codex Workflow

**Files:**
- Modify: `docs/codex-driven-editing.md`

- [ ] **Step 1: Add this section after the "EditPlan Contract" section**

````markdown
## Speech Cleanup Contract

For talking-head cleanup, Codex may generate a local `SpeechCleanupPlan` before
creating the final EditPlan v1. This keeps semantic judgment in Codex and keeps
timeline reconstruction deterministic in CodeCut.

Flow:

```text
transcribe_media
  -> Codex labels SpeechCleanupDecision[]
  -> rebuildTimelineFromSpeechCleanup()
  -> EditPlan v1 projection
  -> apply_edit_plan
  -> get_timeline_state
```

Rules:

- Use seconds for all source and timeline fields.
- Mark every transcript segment as `keep` or `drop`.
- Every `drop` decision must include `dropReason`.
- Do not use audio VAD as a semantic deletion substitute.
- Do not claim word-level precision unless the selected transcription model
  supports word timestamps.
- Apply only the generated EditPlan v1 projection through `apply_edit_plan`.

The cleanup report is an execution artifact. It is not persisted in project
storage in the first implementation phase.
````

- [ ] **Step 2: Run focused docs-sensitive tests**

Run:

```bash
bun test apps/web/src/lib/speech-cleanup/__tests__/schema.test.ts apps/web/src/lib/speech-cleanup/__tests__/rebuild.test.ts
```

Expected:

```text
PASS
```

---

### Task 7: Run Final Verification

**Files:**
- Test: `apps/web/src/lib/speech-cleanup/__tests__/schema.test.ts`
- Test: `apps/web/src/lib/speech-cleanup/__tests__/rebuild.test.ts`
- Existing validator: `apps/web/src/lib/agent-bridge/edit-plan/validate.ts`

- [ ] **Step 1: Run focused tests**

```bash
bun test apps/web/src/lib/speech-cleanup/__tests__/schema.test.ts apps/web/src/lib/speech-cleanup/__tests__/rebuild.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 2: Run all tests only if focused tests pass**

```bash
bun test
```

Expected:

```text
PASS
```

- [ ] **Step 3: Inspect changed files**

```bash
git diff -- apps/web/src/lib/speech-cleanup docs/codex-driven-editing.md
```

Expected:

```text
Only speech-cleanup module files and the workflow documentation changed.
```

## Self-Review

- Spec coverage: schema, rebuild, stats, verification, v1 projection, docs, and tests are covered by tasks.
- Placeholder scan: no task depends on undefined follow-up behavior.
- Type consistency: `SpeechCleanupPlan`, `SpeechCleanupDecision`, `RebuiltSpeechCaption`, and `SpeechCleanupResult` are introduced before use.
- Scope control: UI, storage migration, model switching, and cloud API work remain out of this plan.
