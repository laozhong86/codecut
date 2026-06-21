# Long-To-Short Recipe

Use this recipe when the user wants one imported source video compressed into a 30-60 second short, highlight reel, or platform cut.

## Success Criteria

- One explicit source media asset is selected.
- The target duration and aspect ratio are known or safely defaulted.
- A Codex-side EditingDecisionLedger is written before EditPlan generation for conversion, product, tutorial, highlight, platform short, or broad "make this better" requests.
- The EditPlan uses only implemented v1 fields.
- Speech-led cleanup requests use SpeechCleanupPlan before the final EditPlan projection.
- `apply_edit_plan` succeeds.
- `get_timeline_state` proves final duration, clip count, media source, and caption bounds.
- If vertical or square output is requested, `get_project_info` proves project settings after `update_project_settings`; `EditPlan.target.aspectRatio` alone does not mutate canvas settings.
- If landscape source is converted to vertical or square output, visual preflight proves the reframe and caption policy before the EditPlan is applied.

## Required Context

- `get_project_info`
- `list_media_assets`
- `transcribe_media` for talking videos
- `build_video_context` for long-video or transcript-first planning
- `inspect_video_range` for landscape-to-vertical, caption-overlap, silence-gap,
  visual-continuity, or ambiguous cut decisions
- Source duration and media dimensions
- Visual preflight for landscape-to-vertical outputs, especially when the source may contain burned-in captions or the subject is off-center

If transcript is unavailable for speech-led content, stop and report the missing context. Do not infer content from the file name.

## Execution Path

### Stage 1: Material Audit

1. Complete the main P0 CLI Runtime Gate and executor readiness check.
2. Confirm the project ID is explicit and matches the local project being modified.
3. Pick the source media asset; import only if the user supplied an absolute local path and no suitable asset exists.
4. Read project/media facts: duration, dimensions, audio availability, target platform, and whether export is requested.

### Stage 2: Content Breakdown

5. Transcribe the source when speech determines clip selection.
6. Build VideoContext with `build_video_context` when long-video or transcript-first planning needs source-timestamped context.
7. Extract story beats from the available evidence: hook, pain, proof, process, value, trust, objection, CTA, or tutorial steps. Do not infer content from filenames or unsupported visual guesses.

### Stage 3: Hook And Candidate Selection

8. For vertical or square output from a landscape source, inspect the relevant
   source ranges with `inspect_video_range` before clip planning:
   - use the returned contact sheet to check continuity and caption/reframe risk.
   - use waveform and silence ranges to avoid dead-air cuts and awkward audio boundaries.
   - do not treat this as OCR, scene detection, face tracking, or full visual preflight.
9. For vertical or square output from a landscape source, run visual preflight before clip planning when the decision requires crop/caption policy proof beyond contact-sheet evidence:
   - classify whether the source is a plain talking head, a talking head with bottom burned-in captions, a screen recording, or mixed B-roll.
   - choose the reframe policy before caption placement. For talking-head footage where the face can remain large and the old subtitle band can be removed by reframing, use `vertical_face_safe_crop_above_burned_captions`.
   - Do not use `black-bar` as a subtitle mask to cover source subtitles.
   - If the chosen policy requires source crop, face anchor, or per-clip transform fields outside current EditPlan v1, stop and report the runtime gap instead of hiding the problem with captions.
10. If the user asks to remove filler, restarts, repeated setup, or dead air, generate a strict SpeechCleanupPlan v2 and project it with `rebuildTimelineFromSpeechCleanup()` before applying.
11. Otherwise, select candidate clips with a clear role: hook, pain, proof, process, value, trust, objection, CTA, or tutorial step.

### Stage 4: Timeline Restructure

12. Write a narrow EditingDecisionLedger before EditPlan generation when clip choice depends on story or business logic:
   - `materialAudit`: selected source, duration, dimensions, transcript status, visual-preflight status, missing evidence.
   - `storyBeats`: source-timestamped beats and evidence.
   - `candidateClips`: source ranges with role, reason, evidence, risk, and keep/drop decision.
   - `selectedStructure`: final output order, such as hook -> pain/proof -> solution/demo -> trust -> CTA.
   - `qaChecklist`: first 1-3 seconds, claim support, source range validity, caption policy, reframe safety, unsupported requested fields.
13. Keep the ledger outside the EditPlan. Do not include ledger fields, `intent`, `strategy`, or acceptance checks in EditPlan v1.

### Stage 5: Technical Execution

14. Generate an implemented EditPlan v1 only.
15. Apply only to an empty timeline, or use `replaceExisting=true` after explicit user confirmation that existing timeline content can be cleared. Append is not implemented in the current `apply_edit_plan` path.

### Stage 6: Final QA

16. Verify with `get_timeline_state`.
17. For conversion or platform shorts, QA the ledger against the applied timeline: hook appears in the first 1-3 seconds, selected proof supports claims, CTA or loop-back exists when requested, captions fit the timeline, and reframe/caption policy matches available visual-preflight evidence.

## Defaults

- Duration: 30-60 seconds.
- Aspect ratio: 9:16 when the user asks for TikTok, Reels, Shorts, or short video. Apply it through `update_project_settings`; do not treat the EditPlan target field as execution proof.
- Captions: concise transcript-derived captions only after the cut is stable.
- Speech cleanup: `dropReason` is required for `drop` decisions and forbidden for `keep` decisions. Filler counts come only from `dropReason: "filler"`, not marker words inside kept text.
- Landscape-to-vertical reframe: prefer centered `cover` only when visual preflight proves the subject and burned-in captions are safe. Use `vertical_face_safe_crop_above_burned_captions` as the planning template for talking-head sources where the old bottom caption band should be cropped out.
- Caption policy: new captions must avoid old burned-in captions; Do not use `black-bar` as a subtitle mask.

## Stop Conditions

- No active editor project.
- Executor readiness check fails.
- No source media and no absolute local path.
- Transcript required but unavailable.
- Landscape-to-vertical output requires a source crop or face anchor that current EditPlan v1 cannot express.
- The requested style requires fields outside current EditPlan v1, such as speed, effects, BGM, or overlays.

## Report Back

Return the project ID, selected media, selected structure summary, clip count, final duration, caption count, and the exact verification command/result.
