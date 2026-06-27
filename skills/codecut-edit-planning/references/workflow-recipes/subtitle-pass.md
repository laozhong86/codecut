# Subtitle Pass Recipe

Use this recipe when the user asks for subtitles, caption cleanup, subtitle timing repair, translation subtitles, or caption readability improvements.

## Success Criteria

- Captions are derived from transcript or user-supplied timed text.
- Captions use a declared post-cut caption source when generated from edited
  audio through `build-post-cut-captions`, or another declared caption source
  through source transcript remap or explicit user-supplied timed text through
  `import_subtitles`.
- Captions fit inside the generated timeline.
- Text stays on text tracks.
- `get_timeline_state` confirms caption element count, timing bounds, and
  editable text track state.
- `build_video_quality_report` passes `caption_quality` and
  `layout.captionLines`: captions do not overlap, each item is `0.5s..4s`, and
  the selected preset renders within two lines with no 1-2 character orphan
  final line.

## Required Context

- Existing transcript segments, or user-supplied caption segments.
- Current timeline duration if editing an existing project.
- Target language only when translation is explicitly requested.
- For controlled SRT/ASS import: absolute `filePath`, explicit
  `format: "srt" | "ass"`, `trackName`, `captionStyle`, and a confirmed setup
  token.

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

## Planning Path

1. Use project and media state from upstream evidence.
2. If the user supplied an SRT or ASS file and asked to import it, use the
   controlled import path:
   - require explicit `format`; do not infer from the file extension.
   - require an absolute `filePath`, `trackName`, and `captionStyle`.
   - SRT must be strict numeric blocks with SubRip timecodes and plain non-empty
     text.
   - ASS must be the strict timed-text subset: style must be `Default`; effect,
     positioning, non-zero margins, drawing, karaoke, override tags, and
     non-allowlisted event fields fail the whole import.
   - Call `import_subtitles`, then immediately read back with
     `get_timeline_state` and verify the created track/elements expose the
     expected `content`, `startTime`, `duration`, and resolved `style`.
   - Stop on any parse, unsupported-style, timing, or caption-quality failure.
     Do not fall back to burn-in, FFmpeg overlay, free-form parsing, or an
     EditPlan timeline rebuild.
3. If timed captions are missing, hand back for transcription before planning.
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
	   - Use punctuation as a phrase boundary, but do not automatically display
	     every trailing punctuation mark. For short-form captions, remove trailing
	     full stops, commas, colons, semicolons, and enumeration punctuation after
	     chunking; keep question marks and exclamation marks, and preserve numeric
	     punctuation such as `117.55` and `1,000`.
6. Select the caption preset by video type: `creator-clean` for the standard Chinese creator/talking-head look, `talking-head-pop` for high-retention opinion clips that need stronger contrast, `tutorial-clean` for screen recordings or demos, `product-punch` for product proof or UGC ads, `lifestyle-warm` for vlog/food/travel/lifestyle clips, `cinematic-serif` for brand stories or premium emotional edits, `documentary-soft` for calm narrative edits, `black-bar` only when the user explicitly requests boxed subtitles, and `short-form-bold` only when the user explicitly asks for the older bold short-form look.
	   - Prefer font choice, line breaking, and subtle shadow over heavy black outlines.
	   - Use `richSpans` for one key phrase per sentence; do not style every caption as a visual effect.
7. If post-cut caption building is required, record the expected caption timing
   source in the verification spec.
8. Generate or update an implemented EditPlan v1 draft with `captions`.
9. Write a verification spec that asks `codecut-executor-apply` to validate,
   preview, apply, read back with canonical `get_timeline_state`, run
   `build_video_quality_report`, and prove export only when export was
   requested.

## Executor Handoff

Use this recipe when captions must be generated from edited audio, not source
timestamps. The planning artifact should hand off a clip-first plan draft,
caption timing source, selected `captionStyle`, and verification spec to
`codecut-executor-apply`.

The executor stage owns validation, preview, apply, post-cut caption building,
timeline readback, quality reporting, and export proof when export was
requested. The fixture
`workflow-recipes/fixtures/post-cut-captions-final-edit-plan.json` shows the
shape of a final plan draft.

Stop if `caption_quality`, `voice_consistency`, or `layout.captionLines` fails.
Fix the caption text, timing, script binding, or selected preset in the plan
draft, then require the executor stage to re-run the report.

If burned-in source subtitles require a crop that current EditPlan `sourceCrop`
cannot express, stop at the runtime gap. Do not replace editable timeline
semantics with a baked media path.

Do not add a hidden one-step caption mutation route. The controlled exception
is explicit user-supplied file import through `import_subtitles`: it creates a
new editable text track only after full parse, timing, style, and quality
validation, and it must be followed by `get_timeline_state` readback proof. It
is not free-form subtitle compatibility, subtitle burn-in, FFmpeg fallback, or
an EditPlan timeline rebuild.

## Boundary

Do not route simple fixed title text, labels, badges, or stickers into this recipe. Use the implemented title field only when the user asks for a title-like overlay and the current EditPlan v1 supports the request.

## Stop Conditions

- No transcript or timed caption source exists.
- Captions cannot be tied to edited audio transcription, source transcript
  remap, or an explicit controlled subtitle import.
- Captions fail the quality contract: overlap, shorter than `0.5s`, longer than
  `4s`, more than two rendered lines, or a 1-2 character orphan final line.
- Controlled import input is missing `format`, uses a relative `filePath`, or
  contains unsupported SRT/ASS markup, style, override, effect, positioning,
  margins, karaoke, drawing, empty cue text, overlapping timing, inverted
  timing, or out-of-timeline timing.
- The user requests animated subtitle templates, karaoke words, or styling not represented in current EditPlan v1.
- Translation is requested but no translation source/tool is available in the current workflow.

## Report Back

Return caption count, language when known, timing source, created track ID for
controlled imports, readback proof, and any unsupported style requests.
