# Long-To-Short Recipe

Use this recipe when the user wants one imported source video compressed into a 30-60 second short, highlight reel, or platform cut.

## Success Criteria

- One explicit source media asset is selected.
- The target duration and aspect ratio are known or safely defaulted.
- A Codex-side EditingDecisionLedger is written before EditPlan generation for conversion, product, tutorial, highlight, platform short, or broad "make this better" requests.
- Candidate clips are compared with hook strength, standalone coherence, user value, energy or pacing, platform fit, crop viability, source coverage, evidence, and risk before final selection.
- The EditPlan uses only implemented v1 fields.
- Speech-led cleanup requests use SpeechCleanupPlan before the final EditPlan projection.
- `apply_edit_plan` succeeds.
- `get_timeline_state` proves final duration, clip count, media source, and caption bounds.
- If vertical or square output is requested, `get_project_info` proves project settings after `update_project_settings`; `EditPlan.target.aspectRatio` alone does not mutate canvas settings.
- If landscape source is converted to vertical or square output, visual preflight proves the reframe and caption policy before the EditPlan is applied.

## Required Context

- Pre-edit workspace material audit when the user provides a local file before
  a Codecut executor project exists
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

1. For a new job with a local source file, initialize `.codecut-workspace/projects/<projectId>` before creating a Codecut executor project.
2. Copy the source file into the workspace with `codecut-workspace add-assets`.
3. Run `codecut-workspace probe-assets` and review duration, dimensions, audio availability, and obvious format risks.
4. Ask missing platform, aspect ratio, duration, video type, style, caption, or business questions with concrete choices and one recommended option.
5. Write workflow route and planning documents that are knowable before timeline execution.
6. Complete the main P0 CLI Runtime Gate and executor readiness check only after the workspace material audit is done.
7. Confirm the project ID is explicit and matches the local project being modified.
8. Pick the source media asset; import only if the user supplied an absolute local path and no suitable asset exists.
9. Read project/media facts: duration, dimensions, audio availability, target platform, and whether export is requested.

### Stage 2: Content Breakdown

10. Transcribe the source when speech determines clip selection.
11. Build VideoContext with `build_video_context` when long-video or transcript-first planning needs source-timestamped context.
12. Extract story beats from the available evidence: hook, pain, proof, process, value, trust, objection, CTA, or tutorial steps. Do not infer content from filenames or unsupported visual guesses.
13. Mark missing evidence that affects the business promise, such as unavailable transcript, missing visual proof, unknown product facts, unsupported crop proof, or absent tutorial step context.

### Stage 3: Hook And Candidate Selection

14. For vertical or square output from a landscape source, inspect the relevant
   source ranges with `inspect_video_range` before clip planning:
   - use the returned contact sheet to check continuity and caption/reframe risk.
   - use waveform and silence ranges to avoid dead-air cuts and awkward audio boundaries.
   - do not treat this as OCR, scene detection, face tracking, or full visual preflight.
15. For vertical or square output from a landscape source, run visual preflight before clip planning when the decision requires crop/caption policy proof beyond contact-sheet evidence:
   - classify whether the source is a plain talking head, a talking head with bottom burned-in captions, a screen recording, or mixed B-roll.
   - choose the reframe policy before caption placement. When visual preflight recommends `vertical_face_safe_crop_above_burned_captions` and the old subtitle band can be removed by a fixed rectangle, use EditPlan `clips[].sourceCrop`.
   - Do not use `black-bar` as a subtitle mask to cover source subtitles.
   - If the chosen policy requires a face anchor, animated crop, arbitrary transform, or any reframe outside current EditPlan v1 `sourceCrop`, stop and present two choices: A. wait at the runtime gap; B. generate a one-time fallback MP4 with non-editable baked output.
16. If the user asks to remove filler, restarts, repeated setup, or dead air, generate a strict SpeechCleanupPlan v2 and project it with `rebuildTimelineFromSpeechCleanup({ captionMode: "clip-only" })` before applying when post-cut captions are available; use `captionMode: "source-transcript-remap"` only when source transcript remap is the declared caption source.
17. Otherwise, select candidate clips with a clear role: hook, pain, proof, process, value, trust, objection, CTA, or tutorial step.
18. Score each viable candidate in the ledger, using short labels rather than numeric precision:
   - `hookStrength`: why the range can earn attention in the first 1-3 seconds.
   - `standaloneCoherence`: whether the range works without prior context; reject or widen unresolved pronouns, missing setup, mid-sentence starts, and premature endings.
   - `userValue`: the concrete benefit, proof, instruction, objection handling, or emotional payoff.
   - `energyOrPacing`: motion, voice energy, cut density, silence risk, or dead-air risk.
   - `platformFit`: target duration, aspect ratio, mobile readability, and caption-safe zones.
   - `cropViability`: whether available visual evidence supports the requested crop or reframe.
   - `sourceCoverage`: whether the selected set represents the strongest material rather than only the earliest usable range.

### Stage 4: Timeline Restructure

19. Write a narrow EditingDecisionLedger before EditPlan generation when clip choice depends on story or business logic:
   - `materialAudit`: selected source, duration, dimensions, transcript status, visual-preflight status, missing evidence.
   - `storyBeats`: source-timestamped beats and evidence.
   - `candidateClips`: source ranges with role, rubric labels, reason, evidence, risk, and keep/drop decision.
   - `selectedStructure`: final output order, such as hook -> pain/proof -> solution/demo -> trust -> CTA.
   - `qaChecklist`: first frame, first 1-3 seconds, standalone clarity, claim support, source range validity, caption policy, reframe safety, unsupported requested fields.
20. Keep the ledger outside the EditPlan. Do not include ledger fields, `intent`, `strategy`, or acceptance checks in EditPlan v1.

### Stage 5: Technical Execution

21. Generate an implemented EditPlan v1 only.
22. Apply only to an empty timeline, or use `replaceExisting=true` after explicit user confirmation that existing timeline content can be cleared. Append is not implemented in the current `apply_edit_plan` path.

### Stage 6: Final QA

23. Verify with `get_timeline_state`.
24. For conversion or platform shorts, QA the ledger against the applied timeline: the first frame is intentional, hook appears in the first 1-3 seconds, selected proof supports claims, weak candidates were rejected for explicit reasons, CTA or loop-back exists when requested, captions fit the timeline, and reframe/caption policy matches available visual-preflight evidence.

## Defaults

- Duration: 30-60 seconds.
- Aspect ratio: 9:16 when the user asks for TikTok, Reels, Shorts, or short video. Apply it through `update_project_settings`; do not treat the EditPlan target field as execution proof.
- Captions: concise transcript-derived captions only after the cut is stable.
- Speech cleanup: `dropReason` and `risk: "low" | "high"` are required for `drop` decisions and forbidden for `keep` decisions. High-risk drops require `retainedMeaningEvidence`. Filler counts come only from `dropReason: "filler"`, not marker words inside kept text.
- Landscape-to-vertical reframe: prefer centered `cover` only when visual preflight proves the subject and burned-in captions are safe. Use `sourceCrop` for talking-head sources where a fixed source rectangle can crop out the old bottom caption band while preserving the subject.
- Caption policy: new captions must avoid old burned-in captions; Do not use `black-bar` as a subtitle mask.

## Stop Conditions

- No active editor project.
- Executor readiness check fails.
- No source media and no absolute local path.
- Transcript required but unavailable.
- Landscape-to-vertical output requires a face anchor, animated crop, arbitrary transform, or source crop that current EditPlan v1 `sourceCrop` cannot express.
- The requested style requires fields outside current EditPlan v1, such as speed, effects, BGM, or overlays.
- No candidate clip passes standalone coherence for the requested short.
- Product-proof, tutorial, or platform-crop goals require visual or business evidence that is not available.

## Report Back

Return the project ID, selected media, selected structure summary, why the chosen candidates beat rejected alternatives, clip count, final duration, caption count, and the exact verification command/result.

If the user chooses a one-time fallback MP4 for an unsupported reframe, write a
project note with the fallback reason, exact command, verification result, and
limitations: baked subtitles are not editable text tracks, and
`build_video_quality_report` cannot validate baked caption pixels as timeline
captions.
