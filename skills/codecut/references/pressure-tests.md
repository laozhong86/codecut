# Pressure-Test Prompts

Use these prompts to test whether an agent routes Codecut editing requests
through `codecut-edit-planning`, chooses the narrowest workflow recipe, and
hands off a strict plan draft plus verification spec before executor apply.

## How To Use

For each prompt, inspect the agent's first plan before any mutation. Passing
behavior means the agent selects the expected recipe, states the current MVP
boundary, and names the planning artifact plus verification exit.

Do not run these as product tests. They test skill compliance and routing quality only.

## Test 1: Long-To-Short Confirmed Choices

Prompt:

```text
把这个长视频剪成 1 分钟左右的 9:16 短视频：/absolute/path/source.mp4
```

Expected route:

- Intent: `Long-to-short` or `TikTok/Reels/Shorts`
- Stage: `codecut-edit-planning`
- Recipe: `skills/codecut-edit-planning/references/workflow-recipes/long-to-short.md`
- Verification exit: strict EditPlan draft plus verification spec for `codecut-executor-apply`

Pass criteria:

- Uses the explicit "1 minute" and "9:16" choices from the prompt, and records
  any project-settings runtime gap in the verification spec.
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
- Stage: `codecut-edit-planning`
- Recipe: `skills/codecut-edit-planning/references/workflow-recipes/talking-head-polish.md`
- Verification exit: SpeechCleanupPlan projection plus verification spec for source-order clips and caption timing

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
- Stage: `codecut-edit-planning`
- Recipe: `skills/codecut-edit-planning/references/workflow-recipes/subtitle-pass.md`
- Verification exit: caption plan draft plus verification spec for caption count and timing bounds

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
- Stage: `codecut-edit-planning`
- Recipe: `skills/codecut-edit-planning/references/workflow-recipes/voiceover-remix.md`
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
- Stage: `codecut-edit-planning` for inspection plan, then `codecut-executor-apply` for readback
- Recipe: `skills/codecut-edit-planning/references/workflow-recipes/timeline-inspection.md`
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
- Stage: `codecut-edit-planning`
- Recipe: `skills/codecut-edit-planning/references/workflow-recipes/long-to-short.md`
- Required pre-EditPlan artifact: Codex-side EditingDecisionLedger with `materialAudit`, `storyBeats`, `candidateClips`, `selectedStructure`, and `qaChecklist`
- Verification exit: strict EditPlan draft plus verification spec that maps executor readback back to the selected structure

Pass criteria:

- Audits source media, transcript availability, visual proof, product facts, and missing evidence before choosing clips.
- Selects candidate clips by role such as hook, pain, proof, demo/process, value, trust, objection, CTA, or loop-back.
- Produces the EditingDecisionLedger before generating EditPlan v1.
- Keeps ledger fields out of EditPlan v1 and uses only implemented schema fields for the executor handoff.
- Stops or clearly limits claims when product facts, proof shots, transcript, or visual context are missing.

Fail signals:

- Jumps directly from transcript to EditPlan without a decision ledger.
- Treats transcript highlights as conversion proof when visual or product evidence is missing.
- Adds `materialAudit`, `storyBeats`, `candidateClips`, `selectedStructure`, `qaChecklist`, `intent`, or `strategy` fields to EditPlan v1.
- Invents price, guarantee, shipping, platform, or product performance claims.

## Test 7: URL Short Requires Requirement Intake

Prompt:

```text
[@codecut](plugin://codecut@local-opc) 提取 视频 https://www.youtube.com/watch?v=SVBH_kmPSwI 到本地 将视频剪辑为 1 分钟的短片
```

Expected route:

- Intent: new creative job from a remote URL.
- First required stage: `codecut-requirement-intake`.
- Allowed before confirmation: call `open_codecut_workspace`, then call
  `submit_codecut_setup` in the same turn when setup fields are complete or
  wait for widget submission when the user must edit the setup.
- Blocked before confirmation: shell, file writes, material ingest, workspace add-assets/probe-assets, `create-project`, `import-media`, generated media, timeline mutation, and export.

Pass criteria:

- Counts missing fields before execution.
- Identifies at least these missing fields: publish platform, aspect ratio, output form, caption policy.
- Asks a compact numbered list with concrete options and exactly one recommended option per question.
- Writes agent assumptions only to `assumptions.md`, never to `clarification-answers.md`.
- Does not claim `No blocking clarification was required`.

Fail signals:

- Defaults to TikTok/Reels/Shorts without asking.
- Defaults to vertical 9:16 without asking.
- Treats a YouTube URL as the same as an absolute local file fast path.
- Writes assumed values into `clarification-answers.md`.
- Starts Codecut executor commands before requirement intake passes.

## Test 8: Talking-Head Template Requires Transcript

Prompt:

```text
把这个口播素材剪成 30 秒精剪短视频，去废话，字幕要有节奏。
```

Expected route:

- Template ID: `talking-head-short`.
- Required evidence: transcript.
- Verification exit: blocked before EditPlan if transcript timestamps are unavailable.

Pass criteria:

- Selects `talking-head-short` before writing an EditingDecisionLedger or EditPlan.
- Stops on missing transcript instead of switching to a generic short-form template.
- States that `talking-head-pop` is the template caption preset only after transcript-backed captions exist.

Fail signals:

- Generates clip ranges without transcript timestamps.
- Uses platform preset assumptions to replace missing transcript evidence.
- Promises automatic filler removal without transcript or silence evidence.

## Test 9: Product Template Requires Product Facts And Visual Proof

Prompt:

```text
帮我把这个视频剪成带货广告，重点是让人下单，开头要有证明。
```

Expected route:

- Template ID: `product-proof-ad`.
- Required evidence: product facts and visual proof.
- Verification exit: blocked before EditPlan until proof shots, product facts, and claim sources are known.

Pass criteria:

- Selects `product-proof-ad` because conversion intent outranks generic short-form intent.
- Audits product facts, visual proof, transcript claims, and missing offer details before writing claims.
- Stops when proof or product facts are missing instead of inventing benefits, guarantees, prices, or results.

Fail signals:

- Treats transcript highlights as product proof without visual or supplied product evidence.
- Creates a CTA or product claim that cannot be traced to source material.
- Downgrades to `talking-head-short` because product proof is missing.

## Test 10: Narrated B-Roll Template Requires Existing Narration Audio

Prompt:

```text
把这些 B-roll 混剪成一个有旁白的品牌短片，先自动配一段旁白再剪。
```

Expected route:

- Template ID: `narrated-broll` only if existing narration audio and imported visual B-roll are available.
- Required evidence: existing narration audio and visual B-roll.
- Verification exit: blocked because TTS is not supported by NarratedRemixPlan v1.

Pass criteria:

- Identifies `narrated-broll` as the only P0 narrated remix path.
- Stops on missing existing narration audio instead of generating speech or switching to EditPlan v1.
- Reports that current NarratedRemixPlan v1 does not support TTS, BGM, SFX, effects, or append mode.

Fail signals:

- Invents a voice ID, generated narration asset, BGM, or SFX.
- Applies a visual-only remix and reports a complete narrated result.
- Omits required `captionStyle` when captions are present in NarratedRemixPlan v1.

## Test 11: Animated Subtitle Is Not A Template Capability

Prompt:

```text
套一个网感模板，字幕要逐字弹跳、有动画高亮，像 CapCut 热门模板。
```

Expected route:

- Template ID: none unless the request can be expressed by a P0 manifest and EditPlan v1 fields.
- Required evidence: transcript or supplied captions if a caption pass is still requested.
- Verification exit: blocked for animated subtitle/template effect capability.

Pass criteria:

- States that P0 templates are planning constraints, not CapCut-style template effects.
- Refuses animated subtitle, karaoke, and arbitrary template styling unless represented by current EditPlan v1 fields.
- Offers the supported caption preset boundary without claiming animation.

Fail signals:

- Treats `SUBTITLE_TEMPLATES` or UI presets as an Agent execution contract.
- Adds arbitrary CSS, animation fields, or unsupported subtitle template fields to EditPlan v1.
- Reports template application success without executor validation and readback.
