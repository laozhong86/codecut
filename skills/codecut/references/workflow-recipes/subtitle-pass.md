# Subtitle Pass Recipe

Use this recipe when the user asks for subtitles, caption cleanup, subtitle timing repair, translation subtitles, or caption readability improvements.

## Success Criteria

- Captions are derived from transcript or user-supplied timed text.
- Captions use a declared post-cut caption source: edited audio transcription through `build-post-cut-captions` or source transcript remap.
- Captions fit inside the generated timeline.
- Text stays on text tracks.
- `get_timeline_state` confirms caption element count and timing bounds.
- `build_video_quality_report` passes `caption_quality` and
  `layout.captionLines`: captions do not overlap, each item is `0.5s..4s`, and
  the selected preset renders within two lines with no 1-2 character orphan
  final line.

## Required Context

- Existing transcript segments, or user-supplied caption segments.
- Current timeline duration if editing an existing project.
- Target language only when translation is explicitly requested.

## Existing Subtitle Policy

When the source already appears to have subtitles, do not treat "add subtitles"
as approval to stack another caption layer. First classify the existing subtitle
surface:

- editable caption/text track in the current timeline: confirm whether the user
  wants to preserve, replace, restyle, or translate the existing timed text. If
  the next plan uses `replaceExisting=true`, confirm that deleting the existing
  text track is intentional.
- burned-in source subtitles inside the video pixels: treat them as a visual
  layout constraint, not an editable caption source. Use `inspect_video_range` or
  visual preflight when placement is uncertain, then confirm the policy choice:
  preserve, replace, translation overlay, or avoid the old subtitle region.
  When the old subtitle band can be removed by a fixed source rectangle, use
  EditPlan `sourceCrop` on video clips and keep new captions as editable text
  track elements.
- Unclear subtitle source: stop and ask for confirmation before generating new
  captions.

Do not stack new captions over existing subtitles unless the user explicitly
confirms a translation overlay or duplicate-language caption.

## Execution Path

1. Complete the main P0 CLI Runtime Gate and executor readiness check.
2. Inspect project and media state.
3. If timed captions are missing, transcribe the selected media first.
4. Choose the caption timing source after the cut is stable:
   - Use edited audio transcription through `build-post-cut-captions` after a clip-first EditPlan is applied.
   - Use source transcript remap when only source transcript segments exist: convert each kept source segment into output timeline time with `timelineStart + segment.start - clip.sourceStart`.
   - Do not place source transcript timestamps directly on the edited timeline.
   - If a transcript segment crosses a clip boundary, stop and either regenerate captions from edited audio or choose transcript-aligned cuts.
5. Normalize caption text for readability:
   - Chinese: short phrases. For vertical talking-head captions, prefer phrase
     chunks that the current preset renders as one or two balanced lines; avoid
     three-line captions and 1-2 character orphan last lines.
   - English: short phrase groups, usually 3-7 words.
6. Select the caption preset by video type: `creator-clean` for the default Chinese creator/talking-head look, `talking-head-pop` for high-retention opinion clips that need stronger contrast, `tutorial-clean` for screen recordings or demos, `product-punch` for product proof or UGC ads, `lifestyle-warm` for vlog/food/travel/lifestyle clips, `cinematic-serif` for brand stories or premium emotional edits, `documentary-soft` for calm narrative edits, `black-bar` only when the user explicitly requests boxed subtitles, and `short-form-bold` only when the user explicitly asks for the older bold short-form look.
   - Prefer font choice, line breaking, and subtle shadow over heavy black outlines.
   - Use `richSpans` for one key phrase per sentence; do not style every caption as a visual effect.
7. If `build-post-cut-captions` is used, copy the returned captions into the final implemented EditPlan v1 with the selected `captionStyle`.
8. Generate or update an implemented EditPlan v1 with `captions`.
9. Validate, preview, apply, read back with `get_timeline_state` v2, run
   `build_video_quality_report`, then export only after quality passes.

## Executor Recipe

Use this recipe when captions must be generated from edited audio, not source
timestamps:

```bash
node scripts/codex-bridge.mjs apply-plan \
  --project-id <id> \
  --plan-json-file /absolute/path/clip-first-edit-plan.json \
  --replace-existing true
```

```bash
node scripts/codex-bridge.mjs build-post-cut-captions \
  --project-id <id> \
  --language zh \
  --model-id whisper-base
```

Codex then merges the returned `captions[]` and `captionStyle` into a final
EditPlan file only when the returned `captionQuality.ok` is true. If
`voiceConsistency` is present, preserve the scripted caption text and treat ASR
as timing evidence only. The fixture
`workflow-recipes/fixtures/post-cut-captions-final-edit-plan.json` shows the
shape of that final plan.

```bash
node scripts/codex-bridge.mjs validate-edit-plan \
  --project-id <id> \
  --plan-json-file /absolute/path/final-edit-plan.json
```

```bash
node scripts/codex-bridge.mjs preview-edit-plan \
  --project-id <id> \
  --plan-json-file /absolute/path/final-edit-plan.json
```

```bash
node scripts/codex-bridge.mjs apply-plan \
  --project-id <id> \
  --plan-json-file /absolute/path/final-edit-plan.json \
  --replace-existing true
```

```bash
node scripts/codex-bridge.mjs send \
  --project-id <id> \
  --tool get_timeline_state \
  --args-json '{}'
```

Run a quality report before export when captions are present:

```bash
node scripts/codex-bridge.mjs build-video-quality-report \
  --project-id <id> \
  --plan-json-file /absolute/path/final-edit-plan.json \
  --start-time 0 \
  --end-time <timeline-duration-seconds> \
  --frame-count 6
```

Stop if `caption_quality`, `voice_consistency`, or `layout.captionLines` fails.
Fix the caption text, timing, script binding, or selected preset, then re-apply
the final EditPlan and re-run the report.

If burned-in source subtitles require a crop that current EditPlan `sourceCrop`
cannot express, do not silently generate a fallback. Present two choices:
A. stop at the runtime gap and wait for native capability; B. create a one-time
fallback MP4. If B is chosen, document the fallback reason, exact command,
verification result, and limitations in the project docs. Baked subtitles are
not editable text tracks, and `build_video_quality_report` cannot validate them
as timeline caption elements.

Do not add a hidden one-step caption mutation command. A future convenience
command may be named `caption-edit-plan`, but it must output a final EditPlan
file and leave timeline mutation to `apply-plan`.

## Boundary

Do not route simple fixed title text, labels, badges, or stickers into this recipe. Use the implemented title field only when the user asks for a title-like overlay and the current EditPlan v1 supports the request.

## Stop Conditions

- No transcript or timed caption source exists.
- Captions cannot be tied to edited audio transcription or source transcript remap.
- Captions fail the quality contract: overlap, shorter than `0.5s`, longer than
  `4s`, more than two rendered lines, or a 1-2 character orphan final line.
- The user requests animated subtitle templates, karaoke words, or styling not represented in current EditPlan v1.
- Translation is requested but no translation source/tool is available in the current workflow.

## Report Back

Return caption count, language, timing source, and any unsupported style requests.
