# Pressure-Test Prompts

Use these prompts to test whether an agent routes Codecut editing requests through the intent router and the narrowest workflow recipe before sending bridge commands or claiming unsupported capabilities.

## How To Use

For each prompt, inspect the agent's first plan before any mutation. Passing behavior means the agent selects the expected recipe, states the current MVP boundary, and names the verification exit.

Do not run these as product tests. They test skill compliance and routing quality only.

## Test 1: Long-To-Short Default

Prompt:

```text
把这个长视频剪成 1 分钟左右的 9:16 短视频：/absolute/path/source.mp4
```

Expected route:

- Intent: `Long-to-short` or `TikTok/Reels/Shorts`
- Recipe: `workflow-recipes/long-to-short.md`
- Verification exit: `apply_edit_plan` success plus `get_timeline_state`

Pass criteria:

- Uses 30-60 seconds and 9:16 as safe defaults, and requires explicit project settings for vertical execution.
- Requires the P0 browser/bridge gate before importing media.
- Uses transcript-first selection for talking content.

Fail signals:

- Starts with arbitrary effects, BGM, or multi-source composition.
- Claims preview tools that are not implemented.
- Treats `EditPlan.target.aspectRatio` as canvas execution proof.
- Infers video content from the file name.

## Test 2: Talking-Head Polish

Prompt:

```text
这个口播太啰嗦了，帮我去废话、剪紧凑，但不要改意思。
```

Expected route:

- Intent: `Talking-head polish`
- Recipe: `workflow-recipes/talking-head-polish.md`
- Verification exit: `get_timeline_state` proves source-order clips and caption timing

Pass criteria:

- Requires transcript timestamps before cutting.
- Keeps sentence meaning intact.
- States that word-boundary checks are Codex transcript reasoning, not automatic Codecut validator enforcement.
- States that silence/audio-event detection is unavailable if only transcript context exists.

Fail signals:

- Reorders the story without user permission.
- Promises automatic silence removal without silence/audio-event data.
- Adds style before the core cut is verified.

## Test 3: Subtitle Boundary

Prompt:

```text
给当前项目加好看的字幕，最好像卡拉 OK 一样逐字高亮。
```

Expected route:

- Intent: `Subtitle/caption pass`
- Recipe: `workflow-recipes/subtitle-pass.md`
- Verification exit: caption count and timing bounds from `get_timeline_state`

Pass criteria:

- Separates timed captions from fixed titles or stickers.
- Uses transcript or user-supplied timed text as the source.
- Refuses karaoke/animated template claims unless current EditPlan schema supports them.

Fail signals:

- Treats plain title text as subtitles.
- Claims animated or karaoke subtitle execution through current EditPlan v1.
- Skips timing verification.

## Test 4: Voiceover Gated Capability

Prompt:

```text
把这些 B-roll 混剪在一起，加一段网感旁白、字幕、BGM 和开头提示音。
```

Expected route:

- Intent: `Voiceover/narration`
- Recipe: `workflow-recipes/voiceover-remix.md`
- Verification exit: blocked capability report unless existing narration audio can be imported/placed and the requested composition is supported

Pass criteria:

- Separates planning from execution.
- Identifies multi-source B-roll, speech generation, BGM, and effect audio as gated unless the bridge exposes them; existing audio insertion alone is not full voiceover remix support.
- Does not present a partial visual-only cut as a complete voiceover edit.

Fail signals:

- Executes only a video cut and claims full narrated remix completion.
- Invents voice, BGM, or effect IDs.
- Omits audio/text/video track separation checks.

## Test 5: Timeline Inspection Before Export

Prompt:

```text
看看当前项目剪辑结果对不对，能不能导出。
```

Expected route:

- Intent: `Timeline inspection`
- Recipe: `workflow-recipes/timeline-inspection.md`
- Verification exit: read-only project and timeline state summary

Pass criteria:

- Runs inspection without mutation.
- Confirms project ID, track counts, element counts, media references, and export blockers.
- Does not call `export_project` until user confirms after readiness checks.

Fail signals:

- Mutates the timeline during inspection.
- Exports immediately.
- Gives visual confidence without `get_timeline_state` evidence.

## Test 6: Conversion Short Requires Decision Ledger

Prompt:

```text
把这个长视频剪成转化型短视频，保留最能促成下单的结构：/absolute/path/source.mp4
```

Expected route:

- Intent: `UGC/product ad` or `TikTok/Reels/Shorts` depending on product context
- Recipe: `workflow-recipes/long-to-short.md`
- Required pre-EditPlan artifact: Codex-side EditingDecisionLedger with `materialAudit`, `storyBeats`, `candidateClips`, `selectedStructure`, and `qaChecklist`
- Verification exit: `apply_edit_plan` success plus `get_timeline_state`, with the report mapping the applied timeline back to the selected structure

Pass criteria:

- Audits source media, transcript availability, visual proof, product facts, and missing evidence before choosing clips.
- Selects candidate clips by role such as hook, pain, proof, demo/process, value, trust, objection, CTA, or loop-back.
- Produces the EditingDecisionLedger before generating EditPlan v1.
- Keeps ledger fields out of EditPlan v1 and uses only implemented schema fields for `apply_edit_plan`.
- Stops or clearly limits claims when product facts, proof shots, transcript, or visual context are missing.

Fail signals:

- Jumps directly from transcript to EditPlan without a decision ledger.
- Treats transcript highlights as conversion proof when visual or product evidence is missing.
- Adds `materialAudit`, `storyBeats`, `candidateClips`, `selectedStructure`, `qaChecklist`, `intent`, or `strategy` fields to EditPlan v1.
- Invents price, guarantee, shipping, platform, or product performance claims.
