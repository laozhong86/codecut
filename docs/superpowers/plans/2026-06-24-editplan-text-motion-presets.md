# EditPlan Text Motion Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three strict text motion presets for Codecut EditPlan titles and captions, with easing-aware renderer keyframes, readback proof, and inspectable visual acceptance frames.

**Architecture:** Keep Codecut on the existing local deterministic path: `EditPlan v1 -> timeline TextElement -> renderer keyframes -> get_timeline_state/inspect_timeline proof`. Codex may request only one of three text motion presets; Codecut resolves each preset to fixed local keyframes. Do not add arbitrary HTML, CSS, Remotion, HyperFrames, free-form cubic curves, or hidden fallback rendering.

**Tech Stack:** Bun test, TypeScript, Zod, existing EditPlan validator/apply path, existing Canvas renderer, existing `inspect_timeline` executor.

---

## Scope

This plan implements:

- A shared `EditPlanTextMotionPreset` enum with exactly three values:
  - `slam-in`: fast social hook/title entrance.
  - `soft-reveal`: calm premium/tutorial entrance.
  - `pop-bounce`: product/comment/caption emphasis entrance.
- Optional `title.motionPreset`.
- Optional `captionStyle.motionPreset` applied to all generated caption text elements.
- Easing support in existing `TimelineElementKeyframes`.
- Readback fields that prove the resolved text motion preset and generated keyframes.
- Visual acceptance examples using `inspect_timeline` frame sampling.

This plan excludes:

- Arbitrary HTML/CSS/JS video rendering.
- Remotion or HyperFrames runtime integration.
- User-supplied cubic-bezier curves.
- Per-word animated spans.
- Automatic style selection by runtime code.
- Backward compatibility shims for unsupported preset names.
- Silent downgrade when a preset is unknown.

## Product Success Criteria

- A creator can ask Codex for a more polished social hook/title/caption look without losing editable `TextElement`s.
- Codecut rejects unsupported motion names instead of guessing.
- `get_timeline_state` shows which motion preset was applied and the exact keyframes that will render.
- `inspect_timeline` can produce a contact sheet that shows entrance, overshoot/reveal, and settled states for each preset.
- Existing EditPlans without `motionPreset` keep the current static text behavior.

## Repo Evidence

- `apps/web/src/lib/agent-bridge/edit-plan/schema.ts` is the strict EditPlan contract.
- `apps/web/src/lib/agent-bridge/edit-plan/validate.ts` already enforces fail-fast validation.
- `apps/web/src/lib/agent-bridge/edit-plan/apply.ts` maps EditPlan title/captions into timeline `TextElement`s.
- `apps/web/src/lib/agent-bridge/edit-plan/text-presets.ts` resolves controlled text style presets.
- `apps/web/src/types/timeline.ts` defines `TimelineElementKeyframes` and `KeyframeInterpolation`.
- `apps/web/src/services/renderer/keyframes.ts` evaluates keyframes at element-local time.
- `apps/web/src/lib/timeline/element-serialization.ts` powers `get_timeline_state` visual/style readback.
- `apps/web/src/lib/codex-executor/timeline-inspection.ts` renders sampled timeline frames for visual proof.

## File Structure

- Modify `apps/web/src/types/timeline.ts`
  - Add easing interpolation enum values.
  - Add `TextMotionPreset`.
  - Add optional `motionPreset` to `TextElement`.

- Modify `apps/web/src/lib/agent-bridge/edit-plan/schema.ts`
  - Add `EditPlanTextMotionPresetSchema`.
  - Add `title.motionPreset`.
  - Add `captionStyle.motionPreset`.

- Modify `apps/web/src/lib/agent-bridge/edit-plan/validate.ts`
  - Reject text motion on timed text shorter than `0.5s`.
  - Keep all unknown names failing through Zod enum parsing.

- Create `apps/web/src/lib/agent-bridge/edit-plan/motion-presets.ts`
  - Convert a strict motion preset and base transform into deterministic keyframes.

- Create `apps/web/src/lib/agent-bridge/edit-plan/__tests__/motion-presets.test.ts`
  - Unit-test keyframes for all three presets.

- Modify `apps/web/src/lib/agent-bridge/edit-plan/apply.ts`
  - Resolve title/caption `motionPreset` to timeline `TextElement.motionPreset` and `keyframes`.

- Modify `apps/web/src/lib/timeline/element-utils.ts`
  - Preserve `motionPreset` and `keyframes` when building text elements.

- Modify `apps/web/src/services/renderer/keyframes.ts`
  - Add named easing interpolation to scalar and position keyframe evaluation.

- Modify `apps/web/src/services/renderer/__tests__/keyframes.test.ts`
  - Cover eased scalar and position interpolation.

- Modify `apps/web/src/lib/timeline/element-serialization.ts`
  - Expose `style.motionPreset` and `motion.keyframes` in readback.

- Modify `apps/web/src/lib/ai/agent/tools/timeline-tools.ts`
  - No behavior change required if serialization stays centralized; update tool description if needed.

- Modify `apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts`
  - Add schema acceptance/rejection tests.

- Modify `apps/web/src/lib/agent-bridge/edit-plan/__tests__/apply.test.ts`
  - Add title/caption motion apply tests.

- Modify `apps/web/src/lib/ai/agent/tools/__tests__/timeline-tools.test.ts`
  - Add get_timeline_state readback test for text motion.

- Modify `apps/web/src/lib/codex-executor/__tests__/timeline-inspection.test.ts` if it exists; otherwise create it.
  - Add an inspect frame smoke for a text element with motion keyframes.

- Modify `docs/codex-driven-editing.md`
  - Document the new fields, preset routing, and visual acceptance policy.

---

### Task 1: Add Strict EditPlan Schema Fields

**Files:**
- Modify: `apps/web/src/lib/agent-bridge/edit-plan/schema.ts`
- Modify: `apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts`

- [ ] **Step 1: Write failing schema acceptance and rejection tests**

Append these tests inside the existing `describe("validateEditPlan", () => { ... })` block in `apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts`:

```ts
	test("accepts title and caption text motion presets", () => {
		const plan = structuredClone(validPlan());
		plan.title = {
			text: "Stop scrolling",
			startTime: 0,
			duration: 1.2,
			stylePreset: "social_hook",
			motionPreset: "slam-in",
		};
		plan.captionStyle = {
			preset: "product-punch",
			position: "lower-safe",
			motionPreset: "pop-bounce",
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toMatchObject({
			success: true,
			normalizedPlan: {
				title: {
					motionPreset: "slam-in",
				},
				captionStyle: {
					motionPreset: "pop-bounce",
				},
			},
		});
	});

	test("rejects unsupported text motion presets", () => {
		const plan = {
			...validPlan(),
			title: {
				text: "Stop scrolling",
				startTime: 0,
				duration: 1.2,
				motionPreset: "random-css-slide",
			},
		};

		const result = expectValidationFailure(
			validateEditPlan({
				plan,
				projectId: "project-1",
				mediaAssets: [mediaAsset()],
			}),
		);

		expect(result.path).toBe("title.motionPreset");
	});

	test("rejects captionStyle motionPreset when captions are omitted", () => {
		const plan = validPlan();
		plan.captions = undefined;
		plan.captionStyle = {
			preset: "product-punch",
			position: "lower-safe",
			motionPreset: "pop-bounce",
		};

		expect(validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		})).toEqual({
			success: false,
			message: "EditPlan captionStyle requires captions.",
			path: "captionStyle",
		});
	});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts
```

Expected: FAIL because `motionPreset` is not in the strict Zod schema.

- [ ] **Step 3: Add the strict motion preset enum to schema**

In `apps/web/src/lib/agent-bridge/edit-plan/schema.ts`, add after `EditPlanTextStylePresetSchema`:

```ts
export const EditPlanTextMotionPresetSchema = z.enum([
	"slam-in",
	"soft-reveal",
	"pop-bounce",
]);
```

Update `EditPlanCaptionStyleSchema`:

```ts
export const EditPlanCaptionStyleSchema = z
	.object({
		preset: EditPlanCaptionStylePresetSchema,
		position: EditPlanCaptionPositionSchema,
		motionPreset: EditPlanTextMotionPresetSchema.optional(),
	})
	.strict();
```

Update `EditPlanTitleSchema`:

```ts
export const EditPlanTitleSchema = EditPlanBaseTimedTextSchema.extend({
	stylePreset: EditPlanTextStylePresetSchema.optional(),
	motionPreset: EditPlanTextMotionPresetSchema.optional(),
	richSpans: z.array(EditPlanTextRichSpanSchema).optional(),
}).strict();
```

Add the exported type near the other type exports:

```ts
export type EditPlanTextMotionPreset = z.infer<
	typeof EditPlanTextMotionPresetSchema
>;
```

- [ ] **Step 4: Run focused validation test**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts
```

Expected: PASS for the new schema tests and existing validation tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/agent-bridge/edit-plan/schema.ts apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts
git commit -m "feat: add editplan text motion schema"
```

---

### Task 2: Add Timeline Types And Text Builder Preservation

**Files:**
- Modify: `apps/web/src/types/timeline.ts`
- Modify: `apps/web/src/lib/timeline/element-utils.ts`
- Modify: `apps/web/src/lib/timeline/__tests__/element-utils.test.ts`

- [ ] **Step 1: Write failing builder preservation test**

Append this test to `apps/web/src/lib/timeline/__tests__/element-utils.test.ts`:

```ts
	test("builds text elements with motion preset and visual keyframes", () => {
		const element = buildTextElement({
			raw: {
				content: "Motion title",
				motionPreset: "slam-in",
				keyframes: {
					opacity: [
						{ time: 0, value: 0, interpolation: "ease-out" },
						{ time: 0.2, value: 1 },
					],
				},
			},
			startTime: 0,
		});

		expect(element).toMatchObject({
			type: "text",
			content: "Motion title",
			motionPreset: "slam-in",
			keyframes: {
				opacity: [
					{ time: 0, value: 0, interpolation: "ease-out" },
					{ time: 0.2, value: 1 },
				],
			},
		});
	});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bun test apps/web/src/lib/timeline/__tests__/element-utils.test.ts
```

Expected: FAIL because `TextElement` and `buildTextElement()` do not preserve `motionPreset`.

- [ ] **Step 3: Add timeline types**

In `apps/web/src/types/timeline.ts`, update interpolation and add text motion type:

```ts
export type KeyframeInterpolation =
	| "linear"
	| "hold"
	| "ease-in"
	| "ease-out"
	| "ease-in-out";

export type TextMotionPreset = "slam-in" | "soft-reveal" | "pop-bounce";
```

Add this optional field to `TextElement`:

```ts
	motionPreset?: TextMotionPreset;
```

- [ ] **Step 4: Preserve motion fields in text builder**

In `apps/web/src/lib/timeline/element-utils.ts`, add these fields to the object returned by `buildTextElement()`:

```ts
			motionPreset: t.motionPreset,
			keyframes: t.keyframes,
```

Place `keyframes` near other visual timing fields and `motionPreset` near the text style fields.

- [ ] **Step 5: Run focused test**

Run:

```bash
bun test apps/web/src/lib/timeline/__tests__/element-utils.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/types/timeline.ts apps/web/src/lib/timeline/element-utils.ts apps/web/src/lib/timeline/__tests__/element-utils.test.ts
git commit -m "feat: preserve text motion on timeline elements"
```

---

### Task 3: Add Motion Preset Resolver

**Files:**
- Create: `apps/web/src/lib/agent-bridge/edit-plan/motion-presets.ts`
- Create: `apps/web/src/lib/agent-bridge/edit-plan/__tests__/motion-presets.test.ts`

- [ ] **Step 1: Write failing resolver tests**

Create `apps/web/src/lib/agent-bridge/edit-plan/__tests__/motion-presets.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { resolveTextMotionPreset } from "../motion-presets";

const baseTransform = {
	scale: 1,
	position: { x: 0, y: -420 },
	rotate: 0,
};

describe("resolveTextMotionPreset", () => {
	test("resolves slam-in to fast opacity, scale, and position entrance", () => {
		expect(
			resolveTextMotionPreset({
				preset: "slam-in",
				duration: 1.2,
				baseTransform,
			}),
		).toEqual({
			motionPreset: "slam-in",
			keyframes: {
				opacity: [
					{ time: 0, value: 0, interpolation: "ease-out" },
					{ time: 0.12, value: 1, interpolation: "linear" },
					{ time: 1.2, value: 1 },
				],
				"transform.scale": [
					{ time: 0, value: 0.86, interpolation: "ease-out" },
					{ time: 0.18, value: 1.08, interpolation: "ease-in-out" },
					{ time: 0.32, value: 1, interpolation: "linear" },
					{ time: 1.2, value: 1 },
				],
				"transform.position": [
					{
						time: 0,
						value: { x: 0, y: -366 },
						interpolation: "ease-out",
					},
					{
						time: 0.32,
						value: { x: 0, y: -420 },
						interpolation: "linear",
					},
					{ time: 1.2, value: { x: 0, y: -420 } },
				],
			},
		});
	});

	test("resolves soft-reveal to slower opacity and vertical reveal", () => {
		const result = resolveTextMotionPreset({
			preset: "soft-reveal",
			duration: 2,
			baseTransform,
		});

		expect(result.motionPreset).toBe("soft-reveal");
		expect(result.keyframes.opacity).toEqual([
			{ time: 0, value: 0, interpolation: "ease-out" },
			{ time: 0.55, value: 1, interpolation: "linear" },
			{ time: 2, value: 1 },
		]);
		expect(result.keyframes["transform.position"]).toEqual([
			{
				time: 0,
				value: { x: 0, y: -390 },
				interpolation: "ease-out",
			},
			{
				time: 0.55,
				value: { x: 0, y: -420 },
				interpolation: "linear",
			},
			{ time: 2, value: { x: 0, y: -420 } },
		]);
	});

	test("resolves pop-bounce to compact pop emphasis", () => {
		const result = resolveTextMotionPreset({
			preset: "pop-bounce",
			duration: 0.8,
			baseTransform,
		});

		expect(result.motionPreset).toBe("pop-bounce");
		expect(result.keyframes["transform.scale"]).toEqual([
			{ time: 0, value: 0.92, interpolation: "ease-out" },
			{ time: 0.14, value: 1.12, interpolation: "ease-in-out" },
			{ time: 0.26, value: 0.98, interpolation: "ease-in-out" },
			{ time: 0.38, value: 1, interpolation: "linear" },
			{ time: 0.8, value: 1 },
		]);
	});

	test("rejects text motion shorter than the readable motion minimum", () => {
		expect(() =>
			resolveTextMotionPreset({
				preset: "slam-in",
				duration: 0.49,
				baseTransform,
			}),
		).toThrow("EditPlan text motion requires at least 0.5s duration.");
	});
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/edit-plan/__tests__/motion-presets.test.ts
```

Expected: FAIL because `motion-presets.ts` does not exist.

- [ ] **Step 3: Implement resolver**

Create `apps/web/src/lib/agent-bridge/edit-plan/motion-presets.ts`:

```ts
import type {
	TextMotionPreset,
	TimelineElementKeyframes,
	Transform,
} from "@/types/timeline";

export const TEXT_MOTION_MIN_DURATION_SECONDS = 0.5;

export type ResolvedTextMotionPreset = {
	motionPreset: TextMotionPreset;
	keyframes: TimelineElementKeyframes;
};

function requireMotionDuration(duration: number) {
	if (duration < TEXT_MOTION_MIN_DURATION_SECONDS) {
		throw new Error("EditPlan text motion requires at least 0.5s duration.");
	}
}

export function resolveTextMotionPreset({
	preset,
	duration,
	baseTransform,
}: {
	preset: TextMotionPreset;
	duration: number;
	baseTransform: Transform;
}): ResolvedTextMotionPreset {
	requireMotionDuration(duration);
	const { x, y } = baseTransform.position;

	if (preset === "slam-in") {
		return {
			motionPreset: preset,
			keyframes: {
				opacity: [
					{ time: 0, value: 0, interpolation: "ease-out" },
					{ time: 0.12, value: 1, interpolation: "linear" },
					{ time: duration, value: 1 },
				],
				"transform.scale": [
					{ time: 0, value: 0.86, interpolation: "ease-out" },
					{ time: 0.18, value: 1.08, interpolation: "ease-in-out" },
					{ time: 0.32, value: 1, interpolation: "linear" },
					{ time: duration, value: 1 },
				],
				"transform.position": [
					{
						time: 0,
						value: { x, y: y + 54 },
						interpolation: "ease-out",
					},
					{
						time: 0.32,
						value: { x, y },
						interpolation: "linear",
					},
					{ time: duration, value: { x, y } },
				],
			},
		};
	}

	if (preset === "soft-reveal") {
		return {
			motionPreset: preset,
			keyframes: {
				opacity: [
					{ time: 0, value: 0, interpolation: "ease-out" },
					{ time: 0.55, value: 1, interpolation: "linear" },
					{ time: duration, value: 1 },
				],
				"transform.position": [
					{
						time: 0,
						value: { x, y: y + 30 },
						interpolation: "ease-out",
					},
					{
						time: 0.55,
						value: { x, y },
						interpolation: "linear",
					},
					{ time: duration, value: { x, y } },
				],
			},
		};
	}

	if (preset === "pop-bounce") {
		return {
			motionPreset: preset,
			keyframes: {
				opacity: [
					{ time: 0, value: 0, interpolation: "ease-out" },
					{ time: 0.1, value: 1, interpolation: "linear" },
					{ time: duration, value: 1 },
				],
				"transform.scale": [
					{ time: 0, value: 0.92, interpolation: "ease-out" },
					{ time: 0.14, value: 1.12, interpolation: "ease-in-out" },
					{ time: 0.26, value: 0.98, interpolation: "ease-in-out" },
					{ time: 0.38, value: 1, interpolation: "linear" },
					{ time: duration, value: 1 },
				],
			},
		};
	}

	const exhaustivePreset: never = preset;
	throw new Error(`Unsupported text motion preset: ${exhaustivePreset}`);
}
```

- [ ] **Step 4: Run focused resolver test**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/edit-plan/__tests__/motion-presets.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/agent-bridge/edit-plan/motion-presets.ts apps/web/src/lib/agent-bridge/edit-plan/__tests__/motion-presets.test.ts
git commit -m "feat: add editplan text motion presets"
```

---

### Task 4: Apply Motion Presets To Title And Captions

**Files:**
- Modify: `apps/web/src/lib/agent-bridge/edit-plan/apply.ts`
- Modify: `apps/web/src/lib/agent-bridge/edit-plan/validate.ts`
- Modify: `apps/web/src/lib/agent-bridge/edit-plan/__tests__/apply.test.ts`
- Modify: `apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts`

- [ ] **Step 1: Write failing apply tests**

Append these tests to `apps/web/src/lib/agent-bridge/edit-plan/__tests__/apply.test.ts`:

```ts
	test("applies title motion preset as editable text keyframes", () => {
		const editor = fakeEditor();
		const plan = {
			...validPlan(),
			title: {
				text: "Stop scrolling",
				startTime: 0,
				duration: 1.2,
				stylePreset: "social_hook",
				motionPreset: "slam-in",
			},
		} as unknown as EditPlan;

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		expect(result).toMatchObject({ success: true });

		const titleElement = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "text" ? track.elements : []))[0];

		expect(titleElement).toMatchObject({
			type: "text",
			content: "Stop scrolling",
			motionPreset: "slam-in",
			keyframes: {
				opacity: [
					{ time: 0, value: 0, interpolation: "ease-out" },
					{ time: 0.12, value: 1, interpolation: "linear" },
					{ time: 1.2, value: 1 },
				],
			},
		});
	});

	test("applies captionStyle motion preset to every caption text element", () => {
		const editor = fakeEditor();
		const plan = {
			...validPlan(),
			captionStyle: {
				preset: "product-punch",
				position: "lower-safe",
				motionPreset: "pop-bounce",
			},
		} as unknown as EditPlan;

		const result = applyEditPlanToEditor({
			plan,
			projectId: "project-1",
			replaceExisting: true,
			editor,
		});

		expect(result).toMatchObject({ success: true });

		const textElements = editor.timeline
			.getTracks()
			.flatMap((track) => (track.type === "text" ? track.elements : []));
		const captionElement = textElements[1];

		expect(captionElement).toMatchObject({
			type: "text",
			content: "This is the key insight.",
			motionPreset: "pop-bounce",
			keyframes: {
				"transform.scale": [
					{ time: 0, value: 0.92, interpolation: "ease-out" },
					{ time: 0.14, value: 1.12, interpolation: "ease-in-out" },
					{ time: 0.26, value: 0.98, interpolation: "ease-in-out" },
					{ time: 0.38, value: 1, interpolation: "linear" },
					{ time: 2, value: 1 },
				],
			},
		});
	});
```

- [ ] **Step 2: Write failing validation duration test**

Append this test to `apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts`:

```ts
	test("rejects title motion when title duration is below the motion minimum", () => {
		const plan = validPlan();
		plan.title = {
			text: "Too fast",
			startTime: 0,
			duration: 0.49,
			motionPreset: "slam-in",
		};

		expect(validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		})).toEqual({
			success: false,
			message: "EditPlan text motion requires at least 0.5s duration.",
			path: "title.motionPreset",
		});
	});
```

- [ ] **Step 3: Run focused tests to verify they fail**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/edit-plan/__tests__/apply.test.ts apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts
```

Expected: FAIL because apply does not resolve motion and validation does not check title motion duration.

- [ ] **Step 4: Validate title motion duration**

In `apps/web/src/lib/agent-bridge/edit-plan/validate.ts`, import:

```ts
import { TEXT_MOTION_MIN_DURATION_SECONDS } from "./motion-presets";
```

After title timeline/rich-span validation, add:

```ts
	if (
		normalizedPlan.title?.motionPreset &&
		normalizedPlan.title.duration < TEXT_MOTION_MIN_DURATION_SECONDS
	) {
		return fail({
			message: "EditPlan text motion requires at least 0.5s duration.",
			path: "title.motionPreset",
		});
	}
```

Do not add a separate caption check here because existing caption quality already rejects captions below `0.5s`.

- [ ] **Step 5: Resolve motion during apply**

In `apps/web/src/lib/agent-bridge/edit-plan/apply.ts`, import:

```ts
import { resolveTextMotionPreset } from "./motion-presets";
```

Update the `textItems` item type to include:

```ts
			motionPreset?: EditPlan["title"] extends infer Title
				? Title extends { motionPreset?: infer Preset }
					? Preset
					: never
				: never;
```

Use this simpler local type if the conditional type is too noisy:

```ts
			motionPreset?: NonNullable<EditPlan["title"]>["motionPreset"];
```

Update `createTextElement()` parameters:

```ts
		motionPreset,
```

Update its argument type:

```ts
	motionPreset?: NonNullable<EditPlan["title"]>["motionPreset"];
```

Inside `createTextElement()`, before returning `buildTextElement()`, add:

```ts
	const baseRaw = raw ?? {};
	const baseTransform = baseRaw.transform ?? {
		scale: 1,
		position: { x: 0, y: 0 },
		rotate: 0,
	};
	const resolvedMotion = motionPreset
		? resolveTextMotionPreset({
				preset: motionPreset,
				duration,
				baseTransform,
			})
		: undefined;
```

Then return:

```ts
	return buildTextElement({
		raw: {
			...baseRaw,
			name,
			content: text,
			richSpans,
			duration,
			...(resolvedMotion
				? {
						motionPreset: resolvedMotion.motionPreset,
						keyframes: resolvedMotion.keyframes,
					}
				: {}),
		},
		startTime,
	});
```

When pushing title text item, include:

```ts
				motionPreset: normalizedPlan.title.motionPreset,
```

When pushing caption text item, include:

```ts
				motionPreset: normalizedPlan.captionStyle?.motionPreset,
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/edit-plan/__tests__/apply.test.ts apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/agent-bridge/edit-plan/apply.ts apps/web/src/lib/agent-bridge/edit-plan/validate.ts apps/web/src/lib/agent-bridge/edit-plan/__tests__/apply.test.ts apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts
git commit -m "feat: apply editplan text motion presets"
```

---

### Task 5: Add Easing Evaluation To Renderer Keyframes

**Files:**
- Modify: `apps/web/src/services/renderer/keyframes.ts`
- Modify: `apps/web/src/services/renderer/__tests__/keyframes.test.ts`

- [ ] **Step 1: Write failing easing tests**

Append these tests to `apps/web/src/services/renderer/__tests__/keyframes.test.ts`:

```ts
	test("applies ease-out scalar interpolation", () => {
		const result = applyVisualKeyframes({
			transform: baseTransform,
			opacity: 1,
			keyframes: {
				opacity: [
					{ time: 0, value: 0, interpolation: "ease-out" },
					{ time: 1, value: 1 },
				],
			},
			localTime: 0.5,
		});

		expect(result.opacity).toBeCloseTo(0.875, 6);
	});

	test("applies ease-in position interpolation", () => {
		const result = applyVisualKeyframes({
			transform: baseTransform,
			opacity: 1,
			keyframes: {
				"transform.position": [
					{
						time: 0,
						value: { x: 0, y: 0 },
						interpolation: "ease-in",
					},
					{ time: 1, value: { x: 100, y: 100 } },
				],
			},
			localTime: 0.5,
		});

		expect(result.transform.position.x).toBeCloseTo(12.5, 6);
		expect(result.transform.position.y).toBeCloseTo(12.5, 6);
	});

	test("applies ease-in-out scalar interpolation", () => {
		const result = applyVisualKeyframes({
			transform: baseTransform,
			opacity: 1,
			keyframes: {
				"transform.scale": [
					{ time: 0, value: 1, interpolation: "ease-in-out" },
					{ time: 1, value: 2 },
				],
			},
			localTime: 0.25,
		});

		expect(result.transform.scale).toBeCloseTo(1.0625, 6);
	});
```

- [ ] **Step 2: Run the focused renderer test to verify it fails**

Run:

```bash
bun test apps/web/src/services/renderer/__tests__/keyframes.test.ts
```

Expected: FAIL because non-linear interpolation values are not implemented.

- [ ] **Step 3: Implement easing**

In `apps/web/src/services/renderer/keyframes.ts`, add:

```ts
function easeRatio({
	ratio,
	interpolation,
}: {
	ratio: number;
	interpolation?: ScalarKeyframe["interpolation"];
}): number {
	if (interpolation === "ease-in") return ratio * ratio * ratio;
	if (interpolation === "ease-out") {
		const inverse = 1 - ratio;
		return 1 - inverse * inverse * inverse;
	}
	if (interpolation === "ease-in-out") {
		return ratio < 0.5
			? 4 * ratio * ratio * ratio
			: 1 - Math.pow(-2 * ratio + 2, 3) / 2;
	}
	return ratio;
}
```

In `scalarAt()`, replace:

```ts
				const ratio = (localTime - current.time) / (next.time - current.time);
				return current.value + (next.value - current.value) * ratio;
```

with:

```ts
				const linearRatio =
					(localTime - current.time) / (next.time - current.time);
				const ratio = easeRatio({
					ratio: linearRatio,
					interpolation: current.interpolation,
				});
				return current.value + (next.value - current.value) * ratio;
```

In `positionAt()`, replace:

```ts
				const ratio = (localTime - current.time) / (next.time - current.time);
```

with:

```ts
				const linearRatio =
					(localTime - current.time) / (next.time - current.time);
				const ratio = easeRatio({
					ratio: linearRatio,
					interpolation: current.interpolation,
				});
```

- [ ] **Step 4: Run focused renderer test**

Run:

```bash
bun test apps/web/src/services/renderer/__tests__/keyframes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/renderer/keyframes.ts apps/web/src/services/renderer/__tests__/keyframes.test.ts
git commit -m "feat: add easing to renderer keyframes"
```

---

### Task 6: Add get_timeline_state Readback Proof

**Files:**
- Modify: `apps/web/src/lib/timeline/element-serialization.ts`
- Modify: `apps/web/src/lib/ai/agent/tools/__tests__/timeline-tools.test.ts`
- Modify: `apps/web/src/lib/ai/agent/tools/timeline-tools.ts`

- [ ] **Step 1: Write failing timeline readback test**

Append a test to `apps/web/src/lib/ai/agent/tools/__tests__/timeline-tools.test.ts` using the existing fixture pattern in that file. The assertion must expect this shape on a text element returned by `get_timeline_state`:

```ts
expect(textElement).toMatchObject({
	type: "text",
	content: "Motion title",
	style: {
		motionPreset: "slam-in",
	},
	motion: {
		keyframes: {
			opacity: [
				{ time: 0, value: 0, interpolation: "ease-out" },
				{ time: 0.2, value: 1 },
			],
		},
	},
});
```

Use a fixture text element with:

```ts
motionPreset: "slam-in",
keyframes: {
	opacity: [
		{ time: 0, value: 0, interpolation: "ease-out" },
		{ time: 0.2, value: 1 },
	],
},
```

- [ ] **Step 2: Run focused tool test to verify it fails**

Run:

```bash
bun test apps/web/src/lib/ai/agent/tools/__tests__/timeline-tools.test.ts
```

Expected: FAIL because serialization does not expose `motionPreset` or `motion.keyframes`.

- [ ] **Step 3: Expose motion in element serialization**

In `apps/web/src/lib/timeline/element-serialization.ts`, inside the text branch, add `motionPreset` to `style`:

```ts
					...(element.motionPreset ? { motionPreset: element.motionPreset } : {}),
```

Also add this sibling to `style` inside the returned object:

```ts
				...(element.keyframes
					? {
							motion: {
								keyframes: element.keyframes,
							},
						}
					: {}),
```

The text branch should return one object with `style` and optional `motion`:

```ts
			return {
				style: {
					// existing style fields
					...(element.motionPreset ? { motionPreset: element.motionPreset } : {}),
				},
				...(element.keyframes
					? {
							motion: {
								keyframes: element.keyframes,
							},
						}
					: {}),
			};
```

- [ ] **Step 4: Update tool description**

In `apps/web/src/lib/ai/agent/tools/timeline-tools.ts`, change the `get_timeline_state` description to:

```ts
description:
	"Get the current timeline state including tracks, elements, timing, text style, text motion preset, resolved keyframes, transitions, audio, and visual readback fields.",
```

- [ ] **Step 5: Run focused tool test**

Run:

```bash
bun test apps/web/src/lib/ai/agent/tools/__tests__/timeline-tools.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/timeline/element-serialization.ts apps/web/src/lib/ai/agent/tools/timeline-tools.ts apps/web/src/lib/ai/agent/tools/__tests__/timeline-tools.test.ts
git commit -m "feat: expose text motion readback"
```

---

### Task 7: Add Visual Inspect Frame Smoke

**Files:**
- Create or modify: `apps/web/src/lib/codex-executor/__tests__/timeline-inspection.test.ts`
- No product code changes unless the existing inspection API cannot accept text-only timelines.

- [ ] **Step 1: Write failing inspect smoke test**

If `apps/web/src/lib/codex-executor/__tests__/timeline-inspection.test.ts` does not exist, create it with this test:

```ts
import { mkdtemp, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { inspectTimelineWithNodeRenderer } from "../timeline-inspection";
import type { ExecutorProjectState } from "../executor";

describe("inspectTimelineWithNodeRenderer text motion", () => {
	test("renders sampled frames for motion text without mutating state", async () => {
		const outputDirectory = await mkdtemp(
			join(tmpdir(), "codecut-text-motion-inspect-"),
		);
		const state: ExecutorProjectState = {
			project: {
				id: "project-1",
				name: "Motion Inspect",
				settings: {
					canvasSize: { width: 360, height: 640 },
					fps: 30,
					background: { type: "color", color: "#111827" },
				},
			},
			tracks: [
				{
					id: "track-text",
					type: "text",
					name: "Text",
					hidden: false,
					elements: [
						{
							id: "text-1",
							type: "text",
							name: "Motion title",
							content: "STOP",
							richSpans: [],
							startTime: 0,
							duration: 1.2,
							trimStart: 0,
							trimEnd: 0,
							fontSize: 10,
							fontFamily: "Arial",
							color: "#ffffff",
							backgroundColor: "transparent",
							textAlign: "center",
							fontWeight: "bold",
							fontStyle: "normal",
							textDecoration: "none",
							transform: {
								scale: 1,
								position: { x: 0, y: -180 },
								rotate: 0,
							},
							opacity: 1,
							motionPreset: "slam-in",
							keyframes: {
								opacity: [
									{ time: 0, value: 0, interpolation: "ease-out" },
									{ time: 0.12, value: 1 },
								],
							},
						},
					],
				},
			],
			mediaAssets: [],
			derivedAssets: [],
		};

		const originalState = structuredClone(state);

		const result = await inspectTimelineWithNodeRenderer({
			state,
			mediaAssets: [],
			args: { startTime: 0, endTime: 0.6, frameCount: 3 },
			outputDirectory,
		});

		expect(result.frameTimes).toEqual([0, 0.3, 0.6]);
		expect(result.canvasSize).toEqual({ width: 360, height: 640 });
		expect(result.sheetSize).toEqual({ width: 1080, height: 640 });
		expect((await stat(result.artifactPath)).size).toBeGreaterThan(0);
		expect(state).toEqual(originalState);
	});
});
```

If `ExecutorProjectState` requires additional fields in the current code, fill only the fields required by its existing type definition. Do not change production code just to relax the state type.

- [ ] **Step 2: Run inspect smoke test to verify current behavior**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/timeline-inspection.test.ts
```

Expected: PASS if text-only inspection already works, or FAIL with a concrete type/runtime gap. If it fails because production code cannot inspect text-only timelines, fix the smallest real gap in `timeline-inspection.ts` or its test fixture, then rerun.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/codex-executor/__tests__/timeline-inspection.test.ts
git commit -m "test: cover text motion timeline inspection"
```

---

### Task 8: Update Agent-Facing Documentation

**Files:**
- Modify: `docs/codex-driven-editing.md`

- [ ] **Step 1: Update EditPlan contract docs**

In `docs/codex-driven-editing.md`, update the title contract:

```ts
  title?: {
    text: string,
    startTime: number,
    duration: number,
    stylePreset?:
      | "hook_title"
      | "lower_title"
      | "social_hook"
      | "product_badge"
      | "chapter_bumper",
    motionPreset?: "slam-in" | "soft-reveal" | "pop-bounce",
    richSpans?: Array<{
      start: number,
      end: number,
      color?: string,
      fontScale?: number,
      fontWeight?: "normal" | "bold",
      fontStyle?: "normal" | "italic",
      stroke?: { color: string, width: number }
    }>
  },
```

Update the caption style contract:

```ts
  captionStyle?: {
    preset:
      | "short-form-bold"
      | "black-bar"
      | "talking-head-pop"
      | "tutorial-clean"
      | "documentary-soft"
      | "product-punch"
      | "lifestyle-warm"
      | "cinematic-serif"
      | "social-highlight"
      | "comment-bubble"
      | "minimal-reel",
    position: "lower-safe" | "center",
    motionPreset?: "slam-in" | "soft-reveal" | "pop-bounce"
  },
```

- [ ] **Step 2: Add preset routing text**

After the existing `title.stylePreset` paragraph, add:

```md
`title.motionPreset` and `captionStyle.motionPreset` are optional. If present,
they must be one of `slam-in`, `soft-reveal`, or `pop-bounce`. Codecut resolves
these names to deterministic local renderer keyframes on editable `TextElement`s.
Do not send arbitrary CSS, HTML, JavaScript animation, cubic-bezier values, or
per-caption custom keyframes in EditPlan.

Text motion preset routing:

- `slam-in`: high-energy social hooks, hard claims, short product proof openers.
- `soft-reveal`: premium, tutorial, documentary, calmer explanation, or brand story.
- `pop-bounce`: product badges, comment proof, social proof captions, and quick emphasis.

Every motion preset must be verified through `get_timeline_state` readback. The
text element should expose `style.motionPreset` and `motion.keyframes`. For visual
acceptance, run `inspect_timeline` over the first `0.6s` of the text element with
`frameCount: 3` and check the entrance, mid-motion, and settled frames.
```

- [ ] **Step 3: Add visual acceptance examples**

Add this subsection near the verification/readback area:

```md
### Text Motion Visual Acceptance

For `slam-in`, inspect frames at `0s`, `0.3s`, and `0.6s` relative to the text
start. The expected contact sheet is: hidden or near-hidden entrance frame,
overshoot/emphasis mid frame, and stable final position.

For `soft-reveal`, inspect frames at `0s`, `0.35s`, and `0.7s` relative to the
text start. The expected contact sheet is: faint/lower entrance frame, readable
fade-in mid frame, and stable final position.

For `pop-bounce`, inspect frames at `0s`, `0.22s`, and `0.5s` relative to the
text start. The expected contact sheet is: small entrance frame, enlarged bounce
mid frame, and stable final position.
```

- [ ] **Step 4: Run docs-adjacent focused tests**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts apps/web/src/lib/agent-bridge/edit-plan/__tests__/apply.test.ts apps/web/src/lib/ai/agent/tools/__tests__/timeline-tools.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/codex-driven-editing.md
git commit -m "docs: document editplan text motion presets"
```

---

### Task 9: Final Verification

**Files:**
- No new code files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/edit-plan/__tests__/motion-presets.test.ts apps/web/src/lib/agent-bridge/edit-plan/__tests__/validate.test.ts apps/web/src/lib/agent-bridge/edit-plan/__tests__/apply.test.ts apps/web/src/lib/timeline/__tests__/element-utils.test.ts apps/web/src/services/renderer/__tests__/keyframes.test.ts apps/web/src/lib/ai/agent/tools/__tests__/timeline-tools.test.ts apps/web/src/lib/codex-executor/__tests__/timeline-inspection.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck:web
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
bun run lint:web
```

Expected: PASS.

- [ ] **Step 4: Manual visual acceptance sample**

Create or reuse a local Codecut executor project with a short video or text-only timeline. Apply an EditPlan containing:

```json
{
  "version": 1,
  "projectId": "<active-project-id>",
  "sourceMediaId": "<video-media-id>",
  "target": { "durationSec": 6, "aspectRatio": "9:16" },
  "clips": [
    {
      "id": "clip-1",
      "sourceStart": 0,
      "sourceEnd": 6,
      "timelineStart": 0,
      "fit": "cover",
      "reason": "Short proof clip for text motion acceptance."
    }
  ],
  "title": {
    "text": "Stop scrolling",
    "startTime": 0,
    "duration": 1.2,
    "stylePreset": "social_hook",
    "motionPreset": "slam-in"
  },
  "captions": [
    { "text": "This is the key insight.", "startTime": 1.5, "duration": 1.2 }
  ],
  "captionStyle": {
    "preset": "product-punch",
    "position": "lower-safe",
    "motionPreset": "pop-bounce"
  },
  "rationale": "Verifies strict text motion presets on editable title and caption elements."
}
```

Then call `get_timeline_state` and verify:

```json
{
  "style": {
    "motionPreset": "slam-in"
  },
  "motion": {
    "keyframes": {
      "opacity": [
        { "time": 0, "value": 0, "interpolation": "ease-out" },
        { "time": 0.12, "value": 1, "interpolation": "linear" },
        { "time": 1.2, "value": 1 }
      ]
    }
  }
}
```

Call `inspect_timeline`:

```json
{
  "projectId": "<active-project-id>",
  "startTime": 0,
  "endTime": 0.6,
  "frameCount": 3
}
```

Expected: the returned contact sheet is non-empty and shows title entrance, emphasis, and settled states.

- [ ] **Step 5: Final git check**

Run:

```bash
git status -sb
```

Expected: clean working tree after commits, or only intentional uncommitted files if the user explicitly asked not to commit.

---

## Priority And Risk

P0 priority:

- Schema fields and resolver.
- Apply path to editable `TextElement`s.
- Readback proof.

P1 priority:

- Renderer easing enum support.
- Inspect frame smoke.
- Documentation examples.

Main risks:

- Renderer consistency risk: easing changes must not alter existing `linear` and `hold` behavior.
- Readback risk: exposing keyframes must stay bounded to existing structured timeline state, not become a free-form animation API.
- UX risk: motion presets can make captions harder to read if overused; keep only three presets and route them by content type.

Do not expand scope to HTML rendering, Remotion runtime, HyperFrames runtime, arbitrary CSS, or generated video overlays in this implementation.
