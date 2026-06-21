# Timeline Inspection Recipe

Use this recipe when the user asks what is in the current project, whether an edit worked, why preview/export looks wrong, or whether the timeline is ready for export.

## Success Criteria

- The active project ID is explicit.
- The timeline state is read without mutation.
- Track types, element counts, durations, media references, and caption timing are summarized.
- Any blocker is tied to a concrete editor-state fact.

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
5. Summarize:
   - canvas and duration
   - track count by type
   - element count by type
   - media source references
   - captions or title timing
   - empty or muted tracks
6. Do not call mutation tools during inspection.

## Export Readiness Checks

- At least one visible video or image element exists.
- All media references resolve.
- Text/caption elements fit inside timeline duration.
- Audio is on audio tracks when present.
- Timeline duration matches the intended output length.

## Stop Conditions

- Executor readiness check fails.
- Project ID is missing or stale.
- The local executor cannot load the requested project.

## Report Back

Return a concise state summary, the exact commands used, and whether the project is safe to edit or export next.
