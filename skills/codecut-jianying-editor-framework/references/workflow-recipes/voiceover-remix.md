# Voiceover Remix Recipe

Use this recipe when the user wants B-roll mixed with narration, a voiceover explainer, or a narrated remix from one or more visual clips.

## Current Capability Boundary

This is a gated recipe. The current implemented EditPlan v1 does not include general audio, BGM, effects, or multi-source B-roll fields. The bridge can place an existing audio asset on an audio track, but bridge-exposed speech generation is not part of the current MVP. Use this recipe to plan and identify missing implementation support before claiming execution is complete.

## Success Criteria

- Visual sequence, narration script, audio asset, and captions all refer to the same target duration.
- Voiceover audio lands on an audio track.
- Captions align with the generated narration.
- Timeline verification proves video/text/audio track separation.

## Required Context

- Visual media assets with known duration.
- User-approved narration script or Codex-generated draft script awaiting confirmation.
- Existing narration audio file or a separately approved audio generation path, if execution is requested.
- Current bridge tool support for importing and placing that audio asset.

## Planning Path

1. Inspect media assets and target duration.
2. Draft a visual beat list before writing narration.
3. Estimate narration length by duration, using roughly 4-5 Chinese characters per second or 2-3 English words per second.
4. Ask for confirmation when the narration materially changes the user's message.
5. Only execute if the current bridge/tool surface can import or reference narration audio and place it on an audio track. Do not claim bridge TTS generation unless `generate_speech` or an equivalent tool is exposed by the bridge schema.

## Execution Path When Supported

1. Import or reference existing narration audio through an approved path.
2. Add the visual sequence.
3. Add narration audio at timeline start.
4. Transcribe or segment the narration for captions.
5. Apply captions.
6. Verify video, audio, and text tracks separately.

## Stop Conditions

- The requested edit needs multi-source clip composition unsupported by current EditPlan v1.
- No approved path can provide a narration audio asset.
- Audio insertion is unavailable.
- Captions cannot be aligned to narration timing.

## Report Back

If blocked, report the exact missing bridge/tool capability instead of presenting a partial edit as complete.
