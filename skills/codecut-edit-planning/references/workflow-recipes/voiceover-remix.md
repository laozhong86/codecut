# Voiceover Remix Recipe

Use this recipe when the user wants B-roll mixed with narration, a voiceover explainer, or a narrated remix from one or more visual clips.

## Current Capability Boundary

This recipe is executable only through the implemented `NarratedRemixPlan v1` path. P0 supports existing narration audio, imported video or image B-roll, optional editable text overlays with `richSpans`, and captions. It does not support TTS, BGM, SFX, effects, or append mode.

## Success Criteria

- Visual sequence, existing narration audio asset, and captions all refer to the same target duration.
- Voiceover audio lands on an audio track.
- Captions align with the generated narration.
- Captions include explicit top-level `captionStyle` and pass the same
  no-overlap, `0.5s..4s`, two-line, and orphan-line quality contract as
  EditPlan captions.
- Timeline verification proves video/text/audio track separation.

## Required Context

- Visual media assets: video assets with known duration, or image assets with known dimensions and explicit planned beat durations.
- Existing narration audio asset with known duration. A RunningHub-generated or
  Volcengine-generated voice asset is valid only after it has already been saved
  as a media asset with sanitized `spokenScript` metadata.
- Caption text and timing authored by Codex from the available transcript or user-provided script.
- Current bridge support for `apply_narrated_remix_plan`.

## Planning Path

1. Inspect media assets and target duration.
2. Confirm one existing audio asset will be used as narration.
3. Draft a continuous muted visual beat list with no gaps or overlaps.
4. Keep visual beat total duration equal to `target.durationSec`.
5. For grouped multiline title/stat copy, use one `textOverlay` with newline
   content and `richSpans`; split text overlays only for independent timing,
   position, background, or motion.
6. Write captions and choose an explicit implemented `captionStyle` preset.

## Executor Handoff When Supported

1. Reference existing narration audio and visual assets from material audit.
2. Generate strict NarratedRemixPlan v1 draft.
3. Record whether `replaceExisting=true` is intentional and confirmed.
4. Hand off expected video, audio, text track separation, canonical
   `get_timeline_state` checks, and quality-report needs to
   `codecut-executor-apply`.

## Stop Conditions

- No approved path can provide a narration audio asset.
- The requested edit requires TTS fields inside `NarratedRemixPlan`, BGM, SFX,
  effects, or append mode.
- Captions cannot be aligned to narration timing.
- Captions are missing explicit `captionStyle` or fail the caption quality
  contract.

## Report Back

If blocked, report the exact missing bridge/tool capability instead of presenting a partial edit as complete.
