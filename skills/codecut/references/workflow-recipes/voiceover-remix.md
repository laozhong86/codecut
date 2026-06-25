# Voiceover Remix Recipe

Use this recipe when the user wants B-roll mixed with narration, a voiceover explainer, or a narrated remix from one or more visual clips.

## Current Capability Boundary

This recipe is executable only through the implemented `NarratedRemixPlan v1` path. P0 supports existing narration audio, imported video B-roll, 9:16 image card beats, and post-cut captions. It does not support TTS fields inside the plan, BGM, SFX, unsupported image B-roll, effects, or append mode.

## Success Criteria

- Visual sequence, existing narration audio asset, and captions all refer to the same target duration.
- Voiceover audio lands on an audio track.
- Captions are built from the applied narration timeline through
  `build_post_cut_captions`; first-pass handwritten caption timing is not
  accepted.
- Captions include explicit top-level `captionStyle`, required `size`, and
  `captionSource`, and pass the same
  no-overlap, `0.5s..4s`, two-line, and orphan-line quality contract as
  EditPlan captions.
- Timeline verification proves video/text/audio track separation.

## Required Context

- Visual media assets with known duration.
- Existing narration audio asset with known duration. A RunningHub-generated
  voice asset is valid only after it has already been saved as a media asset
  with sanitized `spokenScript` metadata.
- Caption text from the available transcript or user-provided script; timing
  must come from post-cut narration audio.
- Current bridge support for `apply_narrated_remix_plan`.

## Planning Path

1. Inspect media assets and target duration.
2. Confirm one existing audio asset will be used as narration.
3. Draft a continuous muted video beat list with no gaps or overlaps.
4. Keep visual beat total duration equal to `target.durationSec`.
5. Choose an explicit implemented `captionStyle` preset and `size`; use
   `property-clean-yellow` for real-estate/property explainers unless the user
   asks for a hard promotion/deal-hook look.

## Execution Path When Supported

1. Import or reference existing narration audio through an approved path.
2. Import or reference video B-roll assets.
3. Generate a strict first-pass NarratedRemixPlan v1 without `captions`,
   `captionStyle`, or `captionSource`.
4. Call `apply_narrated_remix_plan` with `replaceExisting=true` only when replacement is intentional.
5. Call `build_post_cut_captions` against the applied timeline. Pass the chosen
   `captionStyle` with `preset`, `position`, and `size` when intake selected a
   size or preset.
6. Generate the final NarratedRemixPlan v1 with returned `captions`,
   returned `captionStyle`, and `captionSource` built from returned `source`,
   `trace`, and optional `voiceConsistency`.
7. Apply the final NarratedRemixPlan.
8. Verify video, audio, and text tracks separately through `get_timeline_state`
   v2, then run `build_video_quality_report` before export.

## Stop Conditions

- No approved path can provide a narration audio asset.
- The requested B-roll includes images instead of videos.
- The requested edit requires TTS fields inside `NarratedRemixPlan`, BGM, SFX,
  effects, or append mode.
- `build_post_cut_captions` cannot produce timing from the applied narration.
- Captions are missing explicit `captionStyle`, `size`, `captionSource`, or fail
  the caption quality / visual footprint contract.

## Report Back

If blocked, report the exact missing bridge/tool capability instead of presenting a partial edit as complete.
