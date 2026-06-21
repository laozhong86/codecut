# Speech Cleanup v2 Design Spec

## Overview

Build a local speech-cleanup contract for CodeCut/Cutia that lets Codex decide
which transcript segments are kept or dropped, while CodeCut deterministically
rebuilds a continuous timeline and projects the result into the existing
EditPlan v1 executor.

This is not a cloud VAD integration. The product goal is an explainable
talking-head cleanup workflow: creators should be able to see what was removed,
why it was removed, and how the remaining captions map back to the source
media.

## Test Evidence

The design is based on a local test using this source video:

```text
/Users/x/Downloads/WangNextDoor 长期固守头部大厂容易失去议价能力，平台红利不等于个人实力，久居其中极易变成可替代的普通执行者。 未来多数岗位会走向外包，国企央企同步缩减编制，只有手握核.mp4
```

The first 60 seconds were tested through the current local transcription path.

| Signal | Result | Product meaning |
| --- | --- | --- |
| Local transcription | 3.73s, 45 segment timestamps | Segment-level transcript-first planning is viable locally. |
| Silence detection | 3 short silence spans, 0.723s total | Audio-event-only cleanup has low value for fast speech. |
| Word timestamp test | Failed for current `onnx-community/whisper-base` | The first implementation must not depend on word-level cuts. |
| EditPlan v1 projection | Passed current validator | A richer cleanup contract can still execute through existing v1. |

The test output was saved to:

```text
/tmp/cutia-vad-comparison/comparison-results.json
```

## Product Decision

Use **SpeechCleanup v2 contract + EditPlan v1 projection**.

The tested alternatives were:

| Option | Decision |
| --- | --- |
| v1 preprocessor only | Rejected as the durable product path. It executes, but loses the keep/drop ledger, drop reasons, source caption provenance, and rollback surface. |
| SpeechCleanup v2 + v1 projection | Recommended. It gives Codex a reasoning ledger and gives CodeCut a deterministic executor path without breaking current EditPlan v1. |
| Audio VAD only | Rejected as primary path. It can detect silence but cannot identify filler, repeated meaning, mistakes, or restarts. |

## Scope

### In Scope

- A local `SpeechCleanupPlan` contract.
- A pure `rebuildTimelineFromSpeechCleanup()` function.
- Output `clips`, `captions`, `stats`, and `verification`.
- Projection into the current strict EditPlan v1 shape.
- Focused tests using deterministic fixture decisions.
- Documentation for how Codex should use the contract before calling
  `apply_edit_plan`.

### Out of Scope

- UI for editing each keep/drop row.
- Storage migrations for persisting cleanup reports inside projects.
- Switching ASR models.
- Word-level transcript support.
- Real-time browser VAD.
- Cloud VectCut API calls.
- Automatic export.

## User Scenario

A creator imports a talking-head video and asks CodeCut to remove filler,
mistakes, restarts, or repeated setup.

Codex transcribes the media, marks each segment as `keep` or `drop`, and sends
the decision list into CodeCut's local speech-cleanup builder. CodeCut validates
the decisions, rebuilds a continuous output timeline, generates captions on the
new timeline, and produces an EditPlan v1 projection that the current executor
can apply.

The creator can inspect the cleanup report before trusting the result:

- kept segment count
- dropped segment count
- drop reason distribution
- source time for each kept caption
- warnings when context quality is not good enough for aggressive deletion

## Architecture

```text
transcribe_media
  -> Codex labels SpeechCleanupDecision[]
  -> rebuildTimelineFromSpeechCleanup()
  -> SpeechCleanupResult
  -> EditPlan v1 projection
  -> apply_edit_plan
  -> get_timeline_state
```

Codex owns semantic judgment. CodeCut owns validation, timeline reconstruction,
and execution. CodeCut must not call an LLM provider or infer deletion reasons
internally.

## Data Contract

Use seconds for every time field. Do not introduce millisecond fields in the
CodeCut contract.

```typescript
export type SpeechCleanupAction = "keep" | "drop";

export type SpeechCleanupDropReason =
	| "filler"
	| "mistake"
	| "repeat"
	| "restart"
	| "pause"
	| "other";

export type SpeechCleanupDecision =
	| {
			id: string;
			text: string;
			sourceStart: number;
			sourceEnd: number;
			action: "keep";
			reason: string;
	  }
	| {
			id: string;
			text: string;
			sourceStart: number;
			sourceEnd: number;
			action: "drop";
			dropReason: SpeechCleanupDropReason;
			reason: string;
	  };

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

Contract rules:

- `drop` decisions require `dropReason`.
- `keep` decisions must not include `dropReason`.
- Source ranges must be sorted and non-overlapping.
- Filler counts are derived only from dropped segments with
  `dropReason: "filler"`. Marker words inside kept text are not filler
  removals.

## Rebuild Rules

1. Reject empty decision arrays.
2. Reject any decision with `sourceEnd <= sourceStart`.
3. Reject `drop` decisions without a `dropReason`.
4. Reject `keep` decisions with `dropReason`.
5. Preserve source order from the decision list.
6. Reject overlapping source ranges.
7. Keep only `action: "keep"` decisions in the output timeline.
8. Rebuild `timelineStart` by cumulative kept duration from `0`.
9. Captions use output timeline time, plus `sourceStart/sourceEnd` provenance.
10. Return stats and verification alongside the EditPlan projection.
11. Fail if every decision is dropped, because the executor cannot build an
    empty EditPlan v1.

## Verification Rules

The result is valid only if:

- every clip has `sourceEnd > sourceStart`
- every clip has `timelineStart >= 0`
- clip timeline starts are contiguous within a small numeric tolerance
- every caption fits inside the rebuilt timeline
- every rebuilt caption has source provenance
- the projected EditPlan v1 passes the current `validateEditPlan()`

## Error Policy

Follow one path and fail fast.

- Do not silently convert unlabeled transcript segments to `keep`.
- Do not silently drop invalid decisions.
- Do not auto-fix overlapping or reversed ranges.
- Do not fallback to audio VAD when semantic decisions are missing.
- Do not claim filler removal when the result only removes silence or when
  filler marker words remain in kept text.

## Cutia Mapping

The first implementation should live outside the current EditPlan validator so
that existing v1 behavior stays stable.

```text
apps/web/src/lib/speech-cleanup/schema.ts
apps/web/src/lib/speech-cleanup/rebuild.ts
apps/web/src/lib/speech-cleanup/index.ts
apps/web/src/lib/speech-cleanup/__tests__/
```

`rebuildTimelineFromSpeechCleanup()` returns both:

- `speechCleanupResult` for traceability
- `editPlan` for current `apply_edit_plan`

No storage migration is required in the first phase because the cleanup report is
an execution artifact, not a persisted project field.

## Success Criteria

- A fixture with mixed `keep/drop` decisions rebuilds contiguous clips and
  captions.
- Drop statistics match the decision list.
- Captions preserve source provenance.
- Invalid decisions fail with explicit messages.
- The generated EditPlan v1 projection passes current validation.
- The workflow remains fully local and keeps LLM reasoning in Codex.

## Risks

| Risk | Mitigation |
| --- | --- |
| ASR errors cause bad semantic drops | Codex should be conservative and include warnings when transcript quality is low. |
| No word timestamps | First phase only promises segment-level cleanup. |
| v2 contract drifts from v1 executor | Add a projection test against current `validateEditPlan()`. |
| Users expect automatic filler removal from silence | Product copy should say "speech cleanup decisions", not "VAD magic". |

## Self-Review

- No production code is required by this spec alone.
- The scope is one local contract and one deterministic rebuild function.
- The design keeps current EditPlan v1 execution unchanged.
- The design avoids cloud APIs, model switching, and UI expansion.
