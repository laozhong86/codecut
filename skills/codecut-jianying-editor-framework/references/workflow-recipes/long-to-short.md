# Long-To-Short Recipe

Use this recipe when the user wants one imported source video compressed into a 30-60 second short, highlight reel, or platform cut.

## Success Criteria

- One explicit source media asset is selected.
- The target duration and aspect ratio are known or safely defaulted.
- The EditPlan uses only implemented v1 fields.
- Speech-led cleanup requests use SpeechCleanupPlan before the final EditPlan projection.
- `apply_edit_plan` succeeds.
- `get_timeline_state` proves final duration, clip count, media source, and caption bounds.
- If vertical or square output is requested, `get_project_info` proves project settings after `update_project_settings`; `EditPlan.target.aspectRatio` alone does not mutate canvas settings.

## Required Context

- `get_project_info`
- `list_media_assets`
- `transcribe_media` for talking videos
- `build_video_context` for long-video or transcript-first planning
- Source duration and media dimensions

If transcript is unavailable for speech-led content, stop and report the missing context. Do not infer content from the file name.

## Execution Path

1. Complete the main P0 CLI Runtime Gate and executor readiness check.
2. Confirm the project ID is explicit and matches the local project being modified.
3. Pick the source media asset; import only if the user supplied an absolute local path and no suitable asset exists.
4. Transcribe the source when speech determines clip selection.
5. Build VideoContext with `build_video_context` when long-video or transcript-first planning needs source-timestamped context.
6. If the user asks to remove filler, restarts, repeated setup, or dead air, generate a strict SpeechCleanupPlan v2 and project it with `rebuildTimelineFromSpeechCleanup()` before applying.
7. Otherwise, select clips with a clear role: hook, proof, process, value, or CTA.
8. Generate an implemented EditPlan v1 only.
9. Apply only to an empty timeline, or use `replaceExisting=true` after explicit user confirmation that existing timeline content can be cleared. Append is not implemented in the current `apply_edit_plan` path.
10. Verify with `get_timeline_state`.

## Defaults

- Duration: 30-60 seconds.
- Aspect ratio: 9:16 when the user asks for TikTok, Reels, Shorts, or short video. Apply it through `update_project_settings`; do not treat the EditPlan target field as execution proof.
- Captions: concise transcript-derived captions only after the cut is stable.
- Speech cleanup: `dropReason` is required for `drop` decisions and forbidden for `keep` decisions. Filler counts come only from `dropReason: "filler"`, not marker words inside kept text.

## Stop Conditions

- No active editor project.
- Executor readiness check fails.
- No source media and no absolute local path.
- Transcript required but unavailable.
- The requested style requires fields outside current EditPlan v1, such as speed, effects, BGM, or overlays.

## Report Back

Return the project ID, selected media, clip count, final duration, caption count, and the exact verification command/result.
