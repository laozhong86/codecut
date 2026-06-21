# Voiceover Remix Recipe

Use this recipe when the user wants B-roll mixed with narration, a voiceover explainer, or a narrated remix from one or more visual clips.

## Current Capability Boundary

This recipe is executable only through the implemented `NarratedRemixPlan v1` path. P0 supports existing narration audio, imported video B-roll, and captions. It does not support TTS, BGM, SFX, image B-roll, effects, or append mode.

## Success Criteria

- Visual sequence, existing narration audio asset, and captions all refer to the same target duration.
- Voiceover audio lands on an audio track.
- Captions align with the generated narration.
- Timeline verification proves video/text/audio track separation.

## Required Context

- Visual media assets with known duration.
- Existing narration audio asset with known duration.
- Caption text and timing authored by Codex from the available transcript or user-provided script.
- Current bridge support for `apply_narrated_remix_plan`.

## Planning Path

1. Inspect media assets and target duration.
2. Confirm one existing audio asset will be used as narration.
3. Draft a continuous muted video beat list with no gaps or overlaps.
4. Keep visual beat total duration equal to `target.durationSec`.
5. Write captions that fit inside the target duration.

## Execution Path When Supported

1. Import or reference existing narration audio through an approved path.
2. Import or reference video B-roll assets.
3. Generate strict NarratedRemixPlan v1.
4. Call `apply_narrated_remix_plan` with `replaceExisting=true` only when replacement is intentional.
5. Verify video, audio, and text tracks separately through `get_timeline_state`.

## Stop Conditions

- No approved path can provide a narration audio asset.
- The requested B-roll includes images instead of videos.
- The requested edit requires TTS, BGM, SFX, effects, or append mode.
- Captions cannot be aligned to narration timing.

## Report Back

If blocked, report the exact missing bridge/tool capability instead of presenting a partial edit as complete.
