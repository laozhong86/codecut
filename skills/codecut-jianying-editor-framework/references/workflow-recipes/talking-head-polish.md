# Talking-Head Polish Recipe

Use this recipe when the user asks to tighten a talking-head video, remove filler, cut dead air, or make a speech clip feel more direct.

## Success Criteria

- The edited timeline keeps sentence meaning intact.
- Codex creates a SpeechCleanupPlan decision ledger before applying the final EditPlan projection.
- Codex chooses cuts from transcript timestamps that do not split words or obvious sentence units when the transcript supports that check.
- Captions align to the edited speech timeline.
- High-risk drops require `retainedMeaningEvidence` before projection.
- Captions come from post-cut captions when edited audio transcription is available.
- Timeline verification proves the generated clips are in source order unless the user asked for reordering.
- Filler removal counts come only from explicit `drop` decisions with `dropReason: "filler"`.

## Required Context

- Transcript segments with timestamps.
- Source media duration.
- Optional silence or audio-event data when available.
- Optional script, outline, or article draft for semantic alignment evidence.

Codecut currently targets transcript-first polish. If silence spans are not available, use transcript boundaries and say that audio-event detection was not available. The current EditPlan validator does not enforce word-boundary or meaning-preservation checks automatically.

## Execution Path

1. Complete the main P0 CLI Runtime Gate and executor readiness check.
2. Run `get_project_info` and `list_media_assets`.
3. Transcribe the selected audio/video asset.
4. Compare source duration against transcript coverage; represent leading or trailing untranscribed audio longer than 0.3 seconds as an explicit keep/drop decision or report the blocker. `rebuildTimelineFromSpeechCleanup()` fails fast when that coverage gap is unclassified.
5. Generate a strict SpeechCleanupPlan v2 from transcript evidence.
6. Mark each classified transcript segment as `keep` or `drop`; every `drop` needs `dropReason`, and every `keep` must omit `dropReason`.
7. For restarts and repeats, drop earlier restarts or repeats and keep the later complete take unless the user explicitly prefers the earlier version.
8. Classify each dropped range with `risk: "low"` or `risk: "high"`. Low risk means pauses, exact prefix repeats, or very short filler tokens with no standalone meaning. High risk means full-sentence removals, repeated openings with divergent endings, or long repeated spans.
9. For high-risk drops, write retained-meaning evidence in `retainedMeaningEvidence`; if a script or outline exists, use it as semantic alignment evidence rather than a word-by-word diff.
10. Keep source ranges sorted and non-overlapping. Do not auto-fix reversed or overlapping ranges.
11. Project the SpeechCleanupPlan with `rebuildTimelineFromSpeechCleanup({ captionMode: "clip-only" })` into a clip-only EditPlan v1 when edited audio transcription is available.
12. Apply only the projected clip-only EditPlan v1 and verify with `get_timeline_state`.
13. If captions are requested and edited audio transcription is available, run the post-cut captions path after applying the clip-only cleanup, then apply the final captioned EditPlan.
14. Use `captionMode: "source-transcript-remap"` only when post-cut caption building is unavailable and every kept source transcript segment maps cleanly into the selected clips.

## Product Rules

- Prefer clarity over maximum compression.
- Keep source order unless the user asks for a story restructure.
- Do not add BGM, effects, or title cards unless requested and supported by the current tool surface.
- Do not reuse source captions after speech cleanup when edited audio transcription is available.
- Do not infer filler counts from marker words inside kept text. Count a filler only when Codex explicitly chose `action: "drop"` with `dropReason: "filler"`.

## Stop Conditions

- The media has no audio.
- Transcription fails or returns unusable timestamps.
- Source duration and transcript coverage disagree, and the uncovered audio cannot be safely represented as keep/drop.
- A high-risk drop cannot show that a retained segment preserves the useful meaning.
- The user asks for automated filler removal based on silence detection, but no silence/audio-event data exists.

## Report Back

Return removed themes, retained themes, final duration, transcript coverage, high-risk drops with `retainedMeaningEvidence`, post-cut captions status, and any context limitations.
