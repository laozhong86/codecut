# Codecut Agent Tool Contract

This reference separates the current implemented Codex-only MVP from future product-direction tools. When operating today's Codecut plugin, use the implemented snake_case bridge tools and CLI first.

## Current Implemented Tool Surface

The current executable path is documented in `../../docs/codex-driven-editing.md` and implemented through `scripts/codex-bridge.mjs`.

Implemented bridge tools relevant to Codex-driven editing:

| Tool | Current purpose |
| --- | --- |
| `get_project_info` | Confirm the active project, canvas, tracks, duration, and media summary. |
| `update_project_settings` | Update explicit project settings such as canvas size, FPS, and background color. |
| `list_media_assets` | Inspect imported media assets. |
| `import_media_file` | Import one Codex-provided local media file payload into the browser media library. |
| `transcribe_media` | Transcribe one existing audio/video media asset through the local executor transcription runtime. |
| `apply_edit_plan` | Validate and apply the implemented EditPlan v1 to the timeline. |
| `create_text_background_effect` | Replace the timeline with source video, text, and masked foreground layers using an existing person-mask derived asset. |
| `create_human_pip_effect` | Replace the timeline with muted background video and masked talking-head foreground using an existing person-mask derived asset. |
| `get_timeline_state` | Verify timeline tracks and elements after mutation. |
| `export_project` | Legacy/browser-mounted export path only. Local executor export is not implemented yet. |

Do not claim the current MVP has `getProjectState`, `buildVideoContext`, `validateEditPlan`, `previewEditPlan`, `applyEditPlan`, or `verifyEditorState` as bridge tools. Those names are product-direction concepts unless and until they are implemented.

## Current One Path Rule

Codex should use one path for generated edits:

```text
get_project_info -> optional update_project_settings -> list_media_assets -> optional import_media_file -> transcribe_media -> Codex writes EditPlan -> apply_edit_plan -> get_timeline_state
```

Codecut validates and executes. Codex does all LLM reasoning and plan repair.

Masked visual effects use explicit deterministic actions outside EditPlan v1:

```text
get_timeline_state confirms derivedAssets[] -> create_text_background_effect or create_human_pip_effect -> get_timeline_state
```

These actions require an existing `person-mask` derived asset. They do not
generate masks, infer missing media, call an LLM, or use low-level timeline
mutation tools as a fallback.

Do not call `export_project` through the local executor until executor export is implemented and tested.

Current `apply_edit_plan` behavior:

- validates the full plan before mutating timeline state
- rejects non-empty timelines unless `replaceExisting=true`
- clears the timeline when `replaceExisting=true`, then inserts generated tracks and elements
- does not support append mode in the current EditPlan path
- does not provide mid-apply rollback or undo transaction hardening yet

## Future Product Direction

## One Path Rule

The aspirational product loop remains:

```text
read -> plan -> validate -> preview -> apply -> verify
```

Treat this as a future migration direction, not the current installed plugin capability.

## Tool Set

### `getProjectState`

Purpose: return the current editor state needed for planning and validation.

Minimum response:

```json
{
  "projectId": "project_123",
  "durationSeconds": 0,
  "target": { "width": 1080, "height": 1920, "fps": 30 },
  "media": [
    {
      "id": "media_123",
      "type": "video",
      "name": "source.mp4",
      "durationSeconds": 1800,
      "width": 1920,
      "height": 1080,
      "hasAudio": true
    }
  ],
  "tracks": []
}
```

Failure behavior: fail fast if the editor has no project or the selected media cannot be resolved.

### `buildVideoContext`

Purpose: create or retrieve the analysis context for one source video.

Input:

```json
{
  "sourceMediaId": "media_123",
  "mode": "transcript_first"
}
```

Minimum response:

```json
{
  "sourceMediaId": "media_123",
  "qualityLevel": "L2_transcript",
  "metadata": { "durationSeconds": 1800, "width": 1920, "height": 1080 },
  "transcript": {
    "language": "zh",
    "segments": [
      {
        "start": 12.4,
        "end": 18.9,
        "text": "这段话可以作为短视频开头。"
      }
    ]
  },
  "warnings": []
}
```

Failure behavior: if transcript is required but unavailable, return an explicit error. Do not invent transcript text.

### `validateEditPlan`

Purpose: reject invalid plans before they touch the timeline.

Input: strict `EditPlan` JSON.

Minimum checks:

- source media exists
- clip ranges are inside source duration
- clip ranges do not cut mid-word when word timestamps are available
- final duration is inside target tolerance
- captions and overlays fit inside output timeline
- platform preset dimensions match the selected target unless user explicitly overrides

Failure behavior: return field-level errors that Codex can repair.

### `previewEditPlan`

Purpose: show the user what will happen before mutation.

Input: validated `EditPlan`.

Minimum response:

```json
{
  "summary": "4 clips, 43.2 seconds, vertical 1080x1920",
  "clips": [
    {
      "label": "hook",
      "sourceStart": 12.4,
      "sourceEnd": 18.9,
      "timelineStart": 0,
      "reason": "Direct result statement with no setup."
    }
  ],
  "warnings": [],
  "requiresConfirmation": false
}
```

Confirmation should be required when applying the plan would replace or delete existing timeline content.

### `applyEditPlan`

Purpose: mutate the Codecut timeline through the editor runtime.

Input:

```json
{
  "plan": {},
  "mode": "replace_empty_timeline"
}
```

Future allowed modes after implementation:

| Mode | Rule |
| --- | --- |
| `replace_empty_timeline` | Only allowed when timeline is empty |
| `append_to_timeline` | Adds the generated short after existing content |

Do not treat these future modes as current bridge behavior until the app code implements and tests them. Current bridge behavior is controlled by `apply_edit_plan` with `replaceExisting`.

Minimum response:

```json
{
  "applied": true,
  "timelineDurationSeconds": 43.2,
  "createdElements": [
    { "id": "el_1", "type": "video", "trackId": "track_video_1" }
  ],
  "warnings": [],
  "verification": {
    "hasVideoTrack": true,
    "captionsWithinTimeline": true,
    "audioOnAudioTrack": true
  }
}
```

Future failure behavior: if any clip cannot be applied, fail the entire plan. Do not partially apply and hide the failed clip. Current behavior validates before mutation but does not yet guarantee rollback for a mid-apply runtime failure.

### `verifyEditorState`

Purpose: prove the user-visible result after mutation.

Minimum checks:

- track count and element count match the plan
- timeline duration equals applied result
- media sources resolve
- captions render within timeline bounds
- preview can render the first frame or current playhead frame

## MVP Tool Boundary

For the first long-to-short MVP, do not expose:

- direct arbitrary `addElement` from Codex
- raw IndexedDB writes
- export or social publishing
- template marketplace mutation
- automatic deletion of user-created timeline elements

These can be added after the EditPlan loop is stable.
