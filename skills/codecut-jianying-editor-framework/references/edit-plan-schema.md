# EditPlan Schema

EditPlan is the contract between Codex planning and Codecut execution. This file starts with the current implemented schema. Future richer schema ideas are lower in the document and must not be treated as already implemented.

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
    reason: string
  }>,
  title?: {
    text: string,
    startTime: number,
    duration: number,
    stylePreset?: "hook_title" | "lower_title"
  },
  captions?: Array<{
    text: string,
    startTime: number,
    duration: number
  }>,
  captionStyle?: {
    preset: "short-form-bold" | "black-bar" | "bold_caption" | "keyword_caption",
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
- total clip duration must stay within the target tolerance.
- title and captions must fit inside the generated timeline.
- captions must use top-level `captionStyle`; per-caption style objects are not
  accepted.
- BGM/SFX audio assets must exist in the imported media library and must be
  `type === "audio"`.
- BGM/SFX volume must be `0..1`; BGM mode is only `loop_to_timeline`.
- SFX start times must fit inside the generated timeline.
- transitions must reference existing `clips[].id` values, must be adjacent on
  the output timeline within `0.05s`, and must not exceed either neighboring
  clip duration.

`target.aspectRatio` is a planning field in the current implemented schema. It does not update the project canvas by itself. When the user outcome requires vertical, square, or specific FPS output, call the implemented project settings path and verify the result through `get_project_info`.

Do not include `intent`, `strategy`, `overlays`, `acceptanceChecks`, `speed`,
`fit`, `anchor`, arbitrary style objects, external audio URLs, or automatic
asset-download instructions in a plan sent to the current `apply_edit_plan`
tool. Those fields belong to a future schema migration.

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

## Future Product Schema

## Top-Level Shape

```json
{
  "version": 1,
  "intent": "long_to_short",
  "sourceMediaId": "media_123",
  "target": {
    "platform": "tiktok",
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "durationSeconds": 45
  },
  "strategy": {
    "summary": "Compress the strongest teaching moments into a vertical short.",
    "rationale": "Selected segments with specific claims and low filler.",
    "fit": "cover",
    "captionStyle": "short_form_bold"
  },
  "clips": [],
  "captions": [],
  "overlays": [],
  "audio": {},
  "acceptanceChecks": []
}
```

## Required Top-Level Fields

| Field | Type | Rule |
| --- | --- | --- |
| `version` | number | Must be `1` for MVP |
| `intent` | string | One of the router intents, snake_case |
| `sourceMediaId` | string | Must match an existing Codecut media asset |
| `target` | object | Required output settings |
| `strategy` | object | Human-readable explanation |
| `clips` | array | At least one clip |
| `acceptanceChecks` | array | Must include checks relevant to intent |

## Target

```json
{
  "platform": "tiktok",
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "durationSeconds": 45
}
```

Rules:

- Width and height must match the selected platform preset unless the user overrides them.
- `durationSeconds` is the expected final timeline duration, not source duration.
- MVP should support 16:9, 9:16, and 1:1.

## Clips

```json
{
  "id": "clip_1",
  "label": "hook",
  "sourceStart": 12.42,
  "sourceEnd": 17.9,
  "timelineStart": 0,
  "speed": 1,
  "fit": "cover",
  "anchor": "center",
  "volume": 1,
  "reason": "Specific result statement with no setup."
}
```

Rules:

- `sourceStart >= 0`
- `sourceEnd > sourceStart`
- `sourceEnd <= source media duration`
- `timelineStart >= 0`
- `speed > 0`
- `reason` must explain why the clip supports the user goal
- Do not cut mid-word when transcript timestamps are available

Allowed labels:

- `hook`
- `problem`
- `proof`
- `process`
- `comparison`
- `value`
- `broll`
- `cta`
- `summary`

## Captions

```json
{
  "start": 0,
  "end": 2.4,
  "text": "第一眼就要看到结果",
  "source": "transcript",
  "style": "short_form_bold",
  "maxChars": 18
}
```

Rules:

- Times are output-timeline seconds.
- Captions must not exceed their clip range unless intentionally bridging clips.
- Keep short-form captions concise: Chinese 10-18 characters, English 3-7 words.
- Use original language unless translation is requested.
- Do not caption filler words unless they are part of the hook.

## Overlays

```json
{
  "start": 0,
  "end": 2.4,
  "text": "3 个片段讲清楚",
  "role": "hook",
  "position": "top_safe",
  "style": "badge"
}
```

Use overlays for:

- hook
- price or offer
- step labels
- product claim
- CTA

Do not use overlays to invent unsupported business claims.

## Audio

```json
{
  "sourceVolume": 1,
  "bgmMediaId": "media_bgm",
  "bgmVolume": 0.12,
  "duckUnderVoice": true,
  "fadeMs": 30
}
```

Rules:

- If narration or source voice exists, BGM should be low: 0.08-0.14.
- If no voice exists, BGM can be 0.18-0.28.
- Add short fades at cut boundaries when implementation supports it.
- If no approved BGM exists, omit `bgmMediaId`; do not substitute random music.

## Acceptance Checks

Each plan should state checks before execution:

```json
[
  "source_media_exists",
  "clip_ranges_within_source",
  "final_duration_within_target",
  "has_video_track",
  "captions_within_timeline",
  "short_form_safe_zones"
]
```

Recommended checks:

| Check | When |
| --- | --- |
| `source_media_exists` | Always |
| `clip_ranges_within_source` | Always |
| `final_duration_within_target` | Always |
| `has_video_track` | Always |
| `audio_on_audio_track` | When BGM or voiceover exists |
| `captions_within_timeline` | When captions exist |
| `short_form_safe_zones` | TikTok/Reels/Shorts |
| `no_mid_word_cuts` | Talking-head or transcript-first edits |
| `visual_proof_for_claims` | UGC/product ads |
| `chapter_sequence_preserved` | Tutorial/demo |

## Invalid Plan Behavior

Fail fast and ask Codex to repair the plan. Do not:

- silently drop clips
- move invalid clips to another timestamp
- replace missing assets with unrelated media
- downgrade aspect ratio
- ignore missing captions or BGM when requested

## MVP Constraint

For the first long-to-short MVP, support one source video and transcript-first selection. Multi-source edits, advanced effects, and visual highlighter scoring should wait until the base plan contract is stable.
