# Round-Trip Editing Contract

This reference adapts the strongest transferable pattern from OpusClip: do not let the agent guess and directly mutate an editor. For the current installed Codecut MVP, apply this pattern through the implemented snake_case bridge tools, not through future camelCase tool names.

The OpusClip source remains research material only. Codecut should not call OpusClip for this workflow and should not copy its cloud editing model. The product lesson is the round-trip contract.

## Core Loop

Current implemented loop:

```text
get_project_info
  -> optional update_project_settings
  -> list_media_assets
  -> transcribe_media
  -> Codex generates implemented EditPlan v1
  -> apply_edit_plan
  -> get_timeline_state
```

Future product-direction loop:

```text
getProjectState
  -> buildVideoContext
  -> generate EditPlan
  -> validateEditPlan
  -> previewEditPlan
  -> applyEditPlan
  -> verifyEditorState
```

Do not claim the future product-direction loop is implemented unless the code exposes those tools. Today's `apply_edit_plan` validates and mutates in one command.

## Why This Matters

Long-video editing fails when Codex mixes three different concerns:

- deciding which source ranges are valuable
- translating those ranges into timeline elements
- mutating the visible editor state

Round-trip editing separates those concerns. Codex can reason about creator intent, but Codecut owns state validation and timeline mutation.

## Required State Objects

| Object | Owner | Purpose |
| --- | --- | --- |
| `ProjectState` | Codecut | Current media, tracks, elements, duration, aspect ratio, and selection |
| `VideoContext` | Codecut + Codex | Transcript, scenes, metadata, OCR, audio events, and context quality |
| `EditPlan` | Codex | Proposed source ranges, captions, overlays, audio, rationale, and checks |
| `EditPlanPreview` | Codecut | Human-readable diff before mutation |
| `ApplyEditPlanResult` | Codecut | Applied track/element ids, warnings, and verification status |

Current MVP boundary: these object names describe the target product model. In today's bridge, `ProjectState` is represented by `get_project_info`, media context by `list_media_assets`, transcript context by `transcribe_media`, mutation by `apply_edit_plan`, and verification by `get_timeline_state`. There is no separate `VideoContext`, `EditPlanPreview`, or `verifyEditorState` bridge object yet.

## Coordinate Rules

Codecut must keep source time and output timeline time explicit.

| Time field | Meaning | Example |
| --- | --- | --- |
| `sourceStart` / `sourceEnd` | Seconds in the original media asset | take 123.4s to 130.2s from a 30-minute video |
| `timelineStart` | Seconds in the generated short-video timeline | place the selected source range at 0s |
| caption `start` / `end` | Seconds in the output timeline | show a subtitle from 4.2s to 5.8s |

Common failure: treating a transcript timestamp from the source video as if it were an output-timeline timestamp. The validator must reject that instead of silently shifting text.

## Product Flow

1. Codex explains the editing assumption: target platform, target length, and selection strategy.
2. Codecut returns current project state through `get_project_info`.
3. Codecut returns imported media through `list_media_assets`.
4. Codecut returns transcript segments through `transcribe_media` when transcript-first editing is needed.
5. Codex returns one strict implemented EditPlan v1.
6. Codecut validates and applies the plan through `apply_edit_plan`.
7. Codecut returns timeline state through `get_timeline_state`.
8. The user previews the visible result in the browser.

## Confirmation Rules

Ask the user before:

- replacing an existing timeline
- applying more than one generated variant
- exporting or publishing
- deleting existing tracks or elements
- running a batch job across multiple videos

Do not ask before creating a non-destructive preview when a separate preview tool exists. The current MVP does not expose that tool yet.

## Verification Standard

After `apply_edit_plan`, verify:

- every clip produced one video element
- output duration matches target tolerance
- source ranges stay within source media duration
- captions and overlays stay within output timeline
- audio elements, if any, are on audio tracks
- undo/redo still works for the mutation path when the touched implementation is expected to be undoable
- preview displays the expected timeline result

## Non-Goals

- Do not model Codecut as an OpusClip API wrapper.
- Do not add automatic publishing to the MVP.
- Do not introduce a second timeline mutation path for Codex.
- Do not simulate drag-and-drop editor UI for deterministic edits.
