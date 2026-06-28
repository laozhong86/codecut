# Codecut Agent Tool Contract

This reference separates the current implemented Codex-only MVP from future product-direction tools. When operating today's Codecut plugin, use the implemented snake_case bridge tools and CLI first.

## Current Implemented Tool Surface

The current executable path is documented in `../../docs/codex-driven-editing.md` and implemented through `scripts/codex-bridge.mjs`.

MCP exposes tool-level `codecut/governanceCategory` metadata:

| Category | Agent meaning |
| --- | --- |
| `evidence_read` | Read project, media, transcript, visual, quality, model, search, system-template, or timeline evidence. |
| `plan_execution` | Validate, preview, apply, or verify strict plan contracts. This is the normal generated-edit path. |
| `advanced_repair` | Low-level timeline repair or deterministic effect action after readback or explicit user intent; not the default generated-edit path. |
| `asset_side_effect` | Import or delete media/template state outside timeline planning. |
| `external_side_effect` | Export or provider-backed generation with explicit output or API side effects. |

## Atomic Capability Contract

MCP tools are atomic capabilities. Skills decide workflow order; tools only
declare schema, side effect, returned evidence, and failure shape. Do not hide a
multi-step editing workflow inside one MCP tool unless the tool name and schema
make that compound side effect explicit.

Every MCP bridge result should keep the machine-readable payload in
`structuredContent`. CLI-backed failures return `isError: true` with
`structuredContent.error` and, when available, `stdout` and `stderr`. Widget
setup failures use explicit `status` values such as `create_failed`,
`import_failed`, or `readback_failed`. Codex must branch on those fields instead
of treating a text message as success.
Executor envelopes that contain any `results[].success === false` are MCP
failures even when the bridge process exits successfully.

| Capability | Tools | Side Effect Boundary | Success Output | Failure Shape | Agent Next Action |
| --- | --- | --- | --- | --- | --- |
| Workspace intake | `open_codecut_workspace`, optional local `inspect_codecut_setup`, `submit_codecut_setup` | Opens setup UI with required defaults; submit directly mints a confirmed setup token, creates a project, and imports only import-ready local media. Remote URL and directory sources are deferred to material ingest; the timeline is never mutated. | `intentDefaults`, pending confirmation ID, confirmed setup token, setup `status`, created `projectId`, imported media, `deferredMediaSources`, latest revision. | `isError: true` plus `status` such as `blocked`, `confirmation_required`, `create_failed`, `import_failed`, or `readback_failed`. | Wait for widget submission, then carry the confirmed setup token into side-effect tools and material ingest for deferred sources. |
| Evidence read | `get_project_info`, `list_media_assets`, `transcribe_media`, `build_video_context`, `build_visual_context`, `inspect_video_range`, `inspect_timeline`, `get_transcript`, `search_media`, `list_models`, `list_system_template_scripts`, `get_system_template_script`, `resolve_system_template_script`, `get_timeline_state` | No timeline mutation, no project deletion, no implicit import. System template reads require an open editor bridge for one project because the Templates UI library lives in browser storage. | Project/media/transcript/visual/model/template/timeline evidence in `structuredContent`. | `isError: true` with concrete missing project, missing template, missing media, provider, runtime, bridge, or command error. | Gather missing evidence or stop with the narrow runtime/data blocker. |
| Asset side effect | `import_media`, `import_system_template_script`, `delete_system_template_script` | Media import requires the confirmed setup token and mutates media only; template library tools require their explicit template confirmation. Timeline stays unchanged. | Imported media asset or confirmed template mutation. | `isError: true` with validation, path, URL, confirmation, or bridge error. | Repair the asset input or ask for explicit confirmation before retry. |
| Plan execution | `validate_edit_plan`, `preview_edit_plan`, `apply_edit_plan`, `apply_narrated_remix_plan`, `build_post_cut_captions`, `build_video_quality_report`, `verify_timeline` | Validation, preview, caption building, and verification are read-only; `apply_*` requires the confirmed setup token and is the strict timeline mutation path. | Field-level validation/preview/readback, caption items, applied revision, or verification mismatch report. | `isError: true` or explicit mismatch fields; failed validation or verification is not completion. | Repair the plan or verification JSON, then rerun validate/preview before mutation. |
| Advanced repair | `add_texts`, `add_captions`, `import_subtitles`, `insert_clips`, `move_clips`, `remove_clips`, `split_clip`, `set_clip_properties`, `set_keyframes`, `add_transitions`, `update_transition`, `remove_transition`, `ripple_delete_ranges`, `create_text_background_effect`, `create_human_pip_effect` | Requires the confirmed setup token and mutates specific timeline objects, native transitions, controlled subtitle imports, or deterministic effects after explicit user intent or readback diagnosis. | Created/updated element IDs, created subtitle track ID, native transition IDs, affected tracks, revision, `captionQuality`, `transitionCount`, or timeline summary. | `isError: true` with unknown IDs, non-video tracks, non-adjacent transition elements, invalid ranges, unsupported subtitle format/style/override/effect, unsupported effect assets, or bridge command failure. | Read timeline state first, repair only the named object/range/transition, or import only the explicit user-supplied subtitle file, then verify with readback. |
| External side effect | `export_project`, `export_timeline_frame`, `generate_digital_human`, `generate_runninghub_voice_design`, `generate_runninghub_voice_clone`, `generate_volcengine_cloned_voice`, `transcribe_volcengine_url`, `build_volcengine_url_captions` | Requires the confirmed setup token for generation/export tools, writes output files, or calls provider-backed generation/transcription. Voice tools accept optional `protectedTerms`. Volcengine URL tools accept only public `https://` media URLs and do not upload local files implicitly. | Output path, still-frame artifact, provider artifact, voice consistency summary, transcript/caption data, or export/generation metadata. | `isError: true` with renderer/provider/runtime/output-path/URL error. | Report the external gate separately from editing correctness; place returned Volcengine captions through `add_texts`, `add_captions`, or an EditPlan only after reviewing the returned data. |

Current callable MCP tools relevant to Codex-driven editing:

| Tool | Current purpose |
| --- | --- |
| `get_project_info` | Confirm the active project, canvas, tracks, duration, and media summary. |
| `list_media_assets` | Inspect imported media assets. |
| `list_system_template_scripts` | List browser-local Codecut system template script summaries before answering “有哪些模板” or applying a named template. |
| `get_system_template_script` | Read one complete browser-local Codecut system template script by exact ID. |
| `resolve_system_template_script` | Resolve one browser-local Codecut system template script by ID, name, alias, or default trigger type. |
| `import_media` | Import one local media file, HTTPS URL, or base64 payload into the explicit executor project. |
| `transcribe_media` | Transcribe one existing audio/video media asset through the local executor transcription runtime. |
| `build_video_context` | Build local L2 transcript context for one imported audio/video asset; media longer than 300 seconds is analyzed in fixed 5-minute chunks and returned with source-video timestamps. |
| `inspect_video_range` | Build local L3-on-demand visual/audio evidence for one video source range as a PNG contact sheet plus frame, waveform, and silence metadata. This is not OCR or scene detection. |
| `build_post_cut_captions` | Transcribe the current edited video clip ranges and return caption items, `captionQuality`, optional `voiceConsistency`, and trace data offset into output timeline time. |
| `import_subtitles` | Import one explicit SRT or strict ASS timed-text file as editable `TextElement` captions on a new text track after full parse, timing, style, and caption-quality validation. It requires `format`, absolute `filePath`, `trackName`, and a confirmation token. `captionStyle` is optional only when the project already has confirmed caption preferences. |
| `validate_edit_plan` | Validate an implemented EditPlan v1 without mutating timeline state. |
| `preview_edit_plan` | Return EditPlan summary, clip list, caption/audio/transition counts, and replacement warning without mutating timeline state. |
| `apply_edit_plan` | Validate and apply the implemented EditPlan v1 to the timeline. |
| `apply_narrated_remix_plan` | Validate and apply the implemented NarratedRemixPlan v1 for existing narration audio plus muted video or image B-roll, optional independent text overlays, and captions. |
| `build_video_quality_report` | Return read-only `schemaVersion: 2` checks for validation, readback, caption quality, optional title quality rubric, optional export probe, optional audio presence, voice consistency, text layout, transitions, and contact-sheet rendering. It does not export files, infer platforms, perform OCR, face detection, or burned-caption detection. |
| `add_transitions` | Add native `TrackTransition` entries between adjacent visual elements on video tracks. Requires `trackId`, `fromElementId`, `toElementId`, implemented native `type`, `duration`, and a confirmation token. It must fail instead of moving clips, creating keyframes, or accepting Shader/CSS transition names. |
| `update_transition` | Update one native transition by `trackId` and `transitionId`. Requires at least one of `type` or `duration`, and must preserve revision on invalid IDs, non-adjacent pairs, or excessive duration. |
| `remove_transition` | Remove one native transition by `trackId` and `transitionId`. Requires a confirmation token and returns the removed transition plus the latest `transitionCount`. |
| `set_keyframes` | Replace or clear per-element keyframes for motion effects. It can create opacity, scale, rotation, or position animation, but it is not a native transition and must not satisfy a user transition request. |
| `create_text_background_effect` | Replace the timeline with source video, text, and masked foreground layers using an existing person-mask derived asset. |
| `create_human_pip_effect` | Replace the timeline with muted background video and masked talking-head foreground using an existing person-mask derived asset. |
| `generate_volcengine_cloned_voice` | Generate an audio media asset from an existing Volcengine OpenSpeech `voice_type`; it does not train a new voice. Requires `VOLCENGINE_OPEN_SPEECH_API_KEY`. |
| `transcribe_volcengine_url` | Return transcript data for a public `https://` audio/video URL through Volcengine OpenSpeech ASR. It does not import media or mutate timeline state. |
| `build_volcengine_url_captions` | Return editable caption entries for a public `https://` audio/video URL through Volcengine subtitle generation. It does not place captions on the timeline. |
| `verify_timeline` | Compare current timeline metrics against explicit verification JSON and return field-level mismatches. |
| `get_timeline_state` | Verify timeline tracks and elements after mutation. |
| `export_project` | Executor-native local export contract. It writes one explicit local output file when a Node-compatible renderer is available; otherwise it fails fast with a runtime gap. It must not trigger browser download. |
| `export_timeline_frame` | Executor-native still-frame export contract. It writes one explicit local PNG file for one timeline second and fails fast on empty timelines, unsafe paths, unsupported formats, existing files without overwrite, or renderer runtime gaps. It is not a contact-sheet or visual-QA substitute. |

Do not claim the current MVP has camelCase bridge tools such as
`getProjectState`, `validateEditPlan`, `previewEditPlan`, `applyEditPlan`, or
`verifyEditorState`. Use the implemented snake_case executor tools.

## Current One Path Rule

Codex should use one path for generated edits:

```text
get_project_info -> list_media_assets -> optional import_media -> transcribe_media -> build_video_context -> optional inspect_video_range for ambiguous or reframe-sensitive ranges -> Codex writes clip-first EditPlan -> validate_edit_plan -> preview_edit_plan -> apply_edit_plan -> optional build_post_cut_captions -> Codex writes final EditPlan -> validate_edit_plan -> preview_edit_plan -> apply_edit_plan -> verify_timeline -> get_timeline_state -> optional export_project
```

Codecut validates and executes. Codex does all LLM reasoning and plan repair.

`build_post_cut_captions` is a non-mutating Agent/executor tool. It reads
unmuted edited video or uploaded-audio clips, transcribes each `trimStart` to
`trimEnd` source range, and returns captions in output timeline time plus
`captionStyle`, `captionQuality`, optional `voiceConsistency`, and a clip
trace. For scripted TTS audio, it preserves `spokenScript.captions` text and
uses ASR only as timing evidence. Codex must copy those captions into the final
EditPlan and apply that plan only when `captionQuality.ok` is true.

User-supplied SRT/ASS files use the controlled `import_subtitles` exception
instead of EditPlan reconstruction. It always creates a new editable text track,
requires explicit `format`, and rejects unsupported SRT markup or ASS style,
override, effect, margin, positioning, karaoke, drawing, and non-allowlisted
event fields before any timeline mutation. After success, Codex must call
`get_timeline_state` and prove the created elements' `content`, `startTime`,
`duration`, and `style`.

Existing narration plus B-roll uses the separate deterministic path:

```text
get_project_info -> list_media_assets -> optional import_media -> Codex writes NarratedRemixPlan -> apply_narrated_remix_plan -> get_timeline_state
```

`NarratedRemixPlan v1` only accepts existing narration audio, imported video or
image B-roll, optional independent text overlays, and captions. It rejects TTS
fields, BGM, SFX, gaps, overlaps, missing `captionStyle`, and caption quality
failures before mutating timeline state.

Masked visual effects use explicit deterministic actions outside EditPlan v1:

```text
get_timeline_state confirms derivedAssets[] -> create_text_background_effect or create_human_pip_effect -> get_timeline_state
```

These actions require an existing `person-mask` derived asset. They do not
generate masks, infer missing media, call an LLM, or use low-level timeline
mutation tools as a fallback.

Do not use browser download as a substitute for `export_project` or
`export_timeline_frame`. If the local executor returns the Node-compatible
renderer runtime gap, report the blocker and stop the export step.

Current `apply_edit_plan` behavior:

- validates the full plan before mutating timeline state
- rejects non-empty timelines unless `replaceExisting=true`
- clears the timeline when `replaceExisting=true`, then inserts generated tracks and elements
- does not support append mode in the current EditPlan path
- does not provide mid-apply rollback or undo transaction hardening yet

Current `apply_narrated_remix_plan` behavior:

- validates the full plan before mutating timeline state
- rejects non-empty timelines unless `replaceExisting=true`
- replaces the timeline with one muted visual B-roll track, one narration audio track, optional `Text Overlays`, and one caption text track
- requires continuous visual beats whose total duration equals `target.durationSec`
- requires top-level `captionStyle` when captions are present
- requires `narration.mediaId` to be an existing audio asset
- requires every `visualBeats[].mediaId` to be an existing video asset for video beats or an existing image asset for image beats

## Product Direction

## One Path Rule

The product loop maps to the implemented snake_case executor tools:

```text
read -> plan -> validate_edit_plan -> preview_edit_plan -> apply_edit_plan -> verify_timeline
```

Future work can improve preview richness and verification depth, but must keep
the same one-path editing rule.

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

### Future build video context concept

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
