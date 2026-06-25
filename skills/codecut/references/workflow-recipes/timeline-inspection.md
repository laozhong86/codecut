# Timeline Inspection Recipe

Use this recipe when the user asks what is in the current project, whether an edit worked, why preview/export looks wrong, or whether the timeline is ready for export.

## Success Criteria

- The active project ID is explicit.
- The timeline state is read without mutation.
- Track types, element counts, durations, media references, and caption timing are summarized.
- The timeline contact sheet is inspected when answering edit success or export readiness.
- Any blocker is tied to a concrete editor-state or visual QA fact.

## Required Context

- Explicit project ID.
- Executor readiness check success.
- `get_project_info`
- `get_timeline_state`

## Inspection Path

1. Complete the service and executor readiness gates.
2. Confirm the project ID is explicit and not stale.
3. Run `get_project_info`.
4. Run `get_timeline_state`.
5. When judging edit success, export readiness, or preview correctness, run
   `inspect_timeline` or `build-video-quality-report` over the relevant
   timeline range and inspect the generated contact sheet.
6. Summarize:
   - canvas and duration
   - track count by type
   - element count by type
   - media source references
   - captions or title timing
   - empty or muted tracks
   - visual QA verdict, contact sheet path, frame count, and sampled timestamps
7. Do not call mutation tools during inspection.

## Export Readiness Checks

- At least one visible video or image element exists.
- All media references resolve.
- Text/caption elements fit inside timeline duration.
- Audio is on audio tracks when present.
- Timeline duration matches the intended output length.
- Timeline contact sheet has a recorded visual QA verdict.
- First frame is not black.
- Titles are not clipped.
- Captions, selling points, and source-video text do not overlap.
- The subject is not cropped by cover/crop settings.
- Bottom text does not fall into the target platform UI safety area.
- Ending frame is not abnormal.

These checks are required before export readiness can be reported. A successful
`inspect_timeline` call only proves that frames were rendered; it is not a
visual pass.

## MP4 Delivery Checks

After `export_project` produces an MP4, inspect the final file separately with
`codecut-workspace extract-export-frames`. Record the final verdict with
`codecut-workspace record-visual-qa` under
`.codecut-workspace/projects/<projectId>/06-verification/visual-qa/<runId>/`.

The final MP4 contact sheet must be compared with the timeline contact sheet.
Timeline frames prove editor state; exported MP4 frames prove the delivered
file. Do not use one as a substitute for the other.

## Stop Conditions

- Executor readiness check fails.
- Project ID is missing or stale.
- The local executor cannot load the requested project.

## Report Back

Return a concise state summary, the exact commands used, the visual QA verdict
path, contact sheet paths, frame counts, sampled timestamps, pass/fail status,
found issues, fixed status, and whether the project is safe to edit or export
next.
