# EditPlan Schema

EditPlan is the contract between Codex planning and Codecut execution. This file describes only the current implemented runtime schema. Do not use older product-shape examples or future migration sketches when calling `apply_edit_plan`.

## Current Implemented EditPlan v1

The current runtime validator lives in `apps/web/src/lib/agent-bridge/edit-plan/schema.ts`. Codex must generate only this shape when calling `apply_edit_plan`:

```ts
{
  version: 1,
  projectId: string,
  sourceMediaId: string,
  target: {
    durationSec: number,
    aspectRatio: "9:16" | "16:9" | "1:1"
  },
  clips: Array<{
    id: string,
    sourceStart: number,
    sourceEnd: number,
    timelineStart: number,
    fit?: "cover",
    sourceCrop?: {
      x: number,
      y: number,
      width: number,
      height: number,
      fit?: "cover-to-canvas"
    },
    reason: string
  }>,
  title?: {
    text: string,
    startTime: number,
    duration: number,
    stylePreset?: "hook_title" | "lower_title",
    richSpans?: Array<{
      start: number,
      end: number,
      color?: string,
      fontScale?: number,
      fontWeight?: "normal" | "bold",
      fontStyle?: "normal" | "italic",
      stroke?: { color: string, width: number }
    }>
  },
  captions?: Array<{
    text: string,
    startTime: number,
    duration: number,
    richSpans?: Array<{
      start: number,
      end: number,
      color?: string,
      fontScale?: number,
      fontWeight?: "normal" | "bold",
      fontStyle?: "normal" | "italic",
      stroke?: { color: string, width: number }
    }>
  }>,
  captionStyle?: {
    preset:
      | "short-form-bold"
      | "black-bar"
      | "talking-head-pop"
      | "tutorial-clean"
      | "documentary-soft"
      | "product-punch"
      | "lifestyle-warm"
      | "cinematic-serif",
    position: "lower-safe" | "center"
  },
  audio?: {
    bgm?: {
      assetId: string,
      volume: number,
      mode: "loop_to_timeline"
    },
    sfx?: Array<{
      assetId: string,
      startTime: number,
      volume: number
    }>
  },
  transitions?: Array<{
    fromClipId: string,
    toClipId: string,
    type:
      | "fade"
      | "dissolve"
      | "wipe-left"
      | "wipe-right"
      | "wipe-up"
      | "wipe-down"
      | "slide-left"
      | "slide-right"
      | "slide-up"
      | "slide-down"
      | "zoom-in"
      | "zoom-out",
    duration: number
  }>,
  rationale: string
}
```

Current validation fail-fast checks include:

- `projectId` must match the active project.
- `sourceMediaId` must resolve to an imported audio/video media asset.
- media duration must be known.
- every clip must have `sourceEnd > sourceStart`.
- every clip range must fit inside source media duration.
- `clips[].fit` only accepts `cover`, requires video source media, and requires
  known source `width` and `height`.
- `clips[].sourceCrop` is the only implemented explicit source crop. It is
  allowed only for video source media with known source `width` and `height`.
  The rectangle must stay inside source dimensions, `width` and `height` must
  be positive, and the crop aspect ratio must match `target.aspectRatio` unless
  `sourceCrop.fit` is explicitly `cover-to-canvas`.
- `clips[].sourceCrop` cannot be combined with `clips[].fit`.
- total clip duration must stay within the target tolerance.
- title and captions must fit inside the generated timeline.
- captions must use top-level `captionStyle`; per-caption style objects are not
  accepted.
- captionStyle preset must be one of the implemented local presets:
  `short-form-bold`, `black-bar`, `talking-head-pop`, `tutorial-clean`,
  `documentary-soft`, `product-punch`, `lifestyle-warm`, or
  `cinematic-serif`.
- `richSpans` must use integer `[start, end)` code point indexes, must be
  ordered and non-overlapping, and must stay inside the corresponding title or
  caption text.
- BGM/SFX audio assets must exist in the imported media library and must be
  `type === "audio"`.
- BGM/SFX volume must be `0..1`; BGM mode is only `loop_to_timeline`.
- SFX start times must fit inside the generated timeline.
- transitions must reference existing `clips[].id` values, must be adjacent on
  the output timeline within `0.05s`, and must not exceed either neighboring
  clip duration.

`target.aspectRatio` is a planning field in the current implemented schema. It does not update the project canvas by itself. When the user outcome requires vertical, square, or specific FPS output, call the implemented project settings path and verify the result through `get_project_info`.

Caption timing must use a post-cut caption source. Prefer edited clip audio
transcription through `build-post-cut-captions`: apply a clip-first EditPlan,
run the command, copy the returned captions into the final EditPlan, then apply
the final plan. Otherwise use source transcript remap: convert source transcript
segment timestamps into output timeline timestamps through the selected
`clips[]`. Do not copy source transcript timestamps directly into
`captions[].startTime`.

`clips[].fit: "cover"` creates a centered cover crop by converting source and
target aspect ratios into `visual.transform.scale`. It is readable through
`get_timeline_state`.

Use `clips[].sourceCrop` when visual evidence supports a fixed source rectangle
that removes burned-in subtitle pixels before adding new editable text
captions. After applying, `get_timeline_state` must expose
`visual.sourceCrop`; native `export_project` must be used for MP4 output.

`sourceCrop` is not a face tracker, anchor system, arbitrary transform, or
multi-step fallback. If the needed reframe cannot be represented as the
implemented rectangle plus optional `cover-to-canvas`, do not hide the problem
with captions. Present exactly two options:

1. Stop at the runtime gap and wait for Codecut native capability.
2. Generate a one-time fallback MP4 outside editable timeline semantics.

If option 2 is chosen, the project documentation must record the fallback
reason, exact command, verification result, and limitations: baked subtitles are
not editable text tracks and `build_video_quality_report` cannot inspect baked
caption pixels as timeline captions.

Do not include `intent`, `strategy`, `overlays`, `acceptanceChecks`, `speed`,
`anchor`, arbitrary transform objects, arbitrary style objects, external audio
URLs, or automatic asset-download instructions in a plan sent to the current
`apply_edit_plan` tool. Those fields belong to a future schema migration.

Masked visual effects are not part of EditPlan v1. Use the explicit
`create_text_background_effect` or `create_human_pip_effect` bridge action only
after `get_timeline_state` proves that a matching `person-mask` derived asset
already exists.

Audio v1 only accepts already imported audio media assets:

```json
{
  "audio": {
    "bgm": {
      "assetId": "audio_bgm_1",
      "volume": 0.12,
      "mode": "loop_to_timeline"
    },
    "sfx": [
      { "assetId": "audio_sfx_1", "startTime": 0, "volume": 0.8 }
    ]
  }
}
```

Transitions v1 only accepts adjacent generated video clips:

```json
{
  "transitions": [
    {
      "fromClipId": "clip-1",
      "toClipId": "clip-2",
      "type": "fade",
      "duration": 0.5
    }
  ]
}
```

## Current Implemented NarratedRemixPlan v1

The runtime validator lives in
`apps/web/src/lib/agent-bridge/narrated-remix/schema.ts`. Codex must generate
only this shape when calling `apply_narrated_remix_plan`:

```ts
{
  version: 1,
  projectId: string,
  target: {
    durationSec: number,
    aspectRatio: "9:16" | "16:9" | "1:1"
  },
  visualBeats: Array<{
    id: string,
    mediaId: string,
    sourceStart: number,
    sourceEnd: number,
    timelineStart: number,
    muted: true,
    reason: string
  }>,
  narration: {
    mediaId: string,
    sourceStart: number
  },
  captions: Array<{
    text: string,
    startTime: number,
    duration: number
  }>,
  rationale: string
}
```

Current validation fail-fast checks include:

- `projectId` must match the active project.
- `narration.mediaId` must resolve to an imported audio media asset.
- every `visualBeats[].mediaId` must resolve to an imported video media asset.
- all audio/video durations must be known.
- every visual source range must have `sourceEnd > sourceStart`.
- every visual source range must fit inside the referenced media duration.
- visual beats must start at `0`, be continuous, and have no gaps or overlaps.
- visual beat total duration must equal `target.durationSec`.
- captions must fit inside `target.durationSec`.
- narration must cover `target.durationSec` from `narration.sourceStart`.

Do not include TTS, generated speech, BGM, SFX, image B-roll, external media
URLs, effect instructions, append instructions, or arbitrary style fields in
`NarratedRemixPlan v1`.

## Invalid Plan Behavior

Fail fast and ask Codex to repair the plan. Do not:

- silently drop clips
- move invalid clips to another timestamp
- replace missing assets with unrelated media
- downgrade aspect ratio
- ignore missing captions or BGM when requested

## MVP Constraint

For the first long-to-short MVP, support one source video and transcript-first selection. Multi-source edits, advanced effects, and visual highlighter scoring should wait until the base plan contract is stable.
