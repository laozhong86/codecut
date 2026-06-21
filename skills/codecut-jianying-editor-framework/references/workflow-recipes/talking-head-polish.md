# Talking-Head Polish Recipe

Use this recipe when the user asks to tighten a talking-head video, remove filler, cut dead air, or make a speech clip feel more direct.

## Success Criteria

- The edited timeline keeps sentence meaning intact.
- Codex creates a SpeechCleanupPlan decision ledger before applying the final EditPlan projection.
- Codex chooses cuts from transcript timestamps that do not split words or obvious sentence units when the transcript supports that check.
- Captions align to the edited speech timeline.
- Timeline verification proves the generated clips are in source order unless the user asked for reordering.
- Filler removal counts come only from explicit `drop` decisions with `dropReason: "filler"`.

## Required Context

- Transcript segments with timestamps.
- Source media duration.
- Optional silence or audio-event data when available.

Codecut currently targets transcript-first polish. If silence spans are not available, use transcript boundaries and say that audio-event detection was not available. The current EditPlan validator does not enforce word-boundary or meaning-preservation checks automatically.

## Execution Path

1. Complete the main P0 CLI Runtime Gate and executor readiness check.
2. Run `get_project_info` and `list_media_assets`.
3. Transcribe the selected audio/video asset.
4. Generate a strict SpeechCleanupPlan v2 from transcript evidence.
5. Mark each classified transcript segment as `keep` or `drop`; every `drop` needs `dropReason`, and every `keep` must omit `dropReason`.
6. Keep source ranges sorted and non-overlapping. Do not auto-fix reversed or overlapping ranges.
7. Project the SpeechCleanupPlan with `rebuildTimelineFromSpeechCleanup()` into the implemented EditPlan v1.
8. Apply only the projected EditPlan v1 and verify with `get_timeline_state`.

## Product Rules

- Prefer clarity over maximum compression.
- Keep source order unless the user asks for a story restructure.
- Do not add BGM, effects, or title cards unless requested and supported by the current tool surface.
- Do not infer filler counts from marker words inside kept text. Count a filler only when Codex explicitly chose `action: "drop"` with `dropReason: "filler"`.

## Stop Conditions

- The media has no audio.
- Transcription fails or returns unusable timestamps.
- The user asks for automated filler removal based on silence detection, but no silence/audio-event data exists.

## Report Back

Return removed themes, retained themes, final duration, transcript coverage, and any context limitations.
