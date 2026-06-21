# Build Visual Context v1 Design Spec

## Overview

Codecut has already closed most of the deterministic editing-execution gap against VectCut: EditPlan application, post-cut captions, BGM/SFX, transitions, local export, transcript context, and range inspection now exist. The remaining high-impact product gap is not another timeline mutation command. It is a reliable visual evidence layer before Codex writes an EditPlan.

`build_visual_context` v1 adds a local executor tool that turns one imported video asset into timeline-wide visual evidence: fixed source-time windows, contact-sheet artifacts, waveform/silence evidence, source orientation, and explicit vertical-reframe risk. It does not claim OCR, face tracking, object recognition, or scene semantics. Those are separate follow-up systems.

The business outcome is higher-quality tutorial, product-proof, and horizontal-to-vertical short-form editing. Codex can stop guessing whether a source has enough visual proof, whether a landscape video needs manual crop review, or whether a selected range needs on-screen inspection.

## Problem

Current state:

- `build_video_context` gives L2 transcript context only.
- `inspect_video_range` gives strong evidence, but only for one manually chosen range.
- `tutorial-demo` and `product-proof-ad` still need visual proof, so they remain fragile when Codex only has transcript.
- Horizontal-to-vertical edits can use `fit: "cover"`, but that does not prove the subject, screen text, or burned captions are safe.

VectCut's practical advantage is the ability to produce a material report before editing. Codecut should match the useful product pattern locally: produce timestamped evidence first, then let Codex reason over it.

## Success Criteria

- Codex can call one local executor command, `build_visual_context`, for one imported video asset.
- The command does not mutate the timeline or project media library.
- The command splits the source into fixed 60-second visual windows.
- Each window produces a reusable local contact-sheet artifact by reusing `inspect_video_range`.
- Each window preserves source timestamps, frame timestamps, waveform samples, and silence ranges.
- The output includes orientation and target-aspect preflight for `9:16`, `16:9`, or `1:1`.
- Horizontal-to-vertical risk is explicit when the source aspect ratio is wider than the target.
- Missing OCR, face tracking, subject detection, and semantic scene description are warnings, not invented facts.
- Executor tests prove no project revision change.
- CLI support exists so agent workflows can call it without a browser tab.
- Browser bridge schema is not expanded in v1 because this is an executor-only
  evidence command, not a browser agent tool.
- Agent-facing docs explain when this tool is required before EditPlan authoring.

## Non-Goals

- No cloud vision API.
- No LLM vision call inside Codecut.
- No OCR implementation.
- No face, body, product, or object detector.
- No automatic crop box generation.
- No person mask generation.
- No timeline mutation.
- No generated B-roll.
- No new UI.
- No configurable window size in v1.
- No fallback path that silently skips failed windows.

## User And Agent Flow

1. User or Codex imports a video into a named Codecut executor project.
2. Codex runs `list_media_assets` or `get_project_info` to identify the media id.
3. Codex runs `build_visual_context` with the media id and explicit target aspect ratio.
4. Codecut validates the asset is a video with duration, dimensions, and file path.
5. Codecut builds fixed 60-second source windows.
6. Codecut calls the existing range inspector once per window.
7. Codecut returns a `VisualContext` with artifacts and risk warnings.
8. Codex uses the evidence before authoring an EditPlan, especially for tutorial/product proof and horizontal-to-vertical edits.

## Tool Contract

Executor tool name:

```text
build_visual_context
```

Input:

```json
{
  "mediaId": "media_123",
  "targetAspectRatio": "9:16"
}
```

Rules:

- `mediaId` is required.
- `targetAspectRatio` is required and must be one of `9:16`, `16:9`, or `1:1`.
- Window size is fixed at 60 seconds.
- Frame count per window is fixed at 6.
- The command accepts only video media.
- The command requires duration, width, height, and local file path.
- A failed inspection window fails the full command with the window index and source range.

Output:

```json
{
  "success": true,
  "message": "Built VisualContext for 'source.mp4'",
  "data": {
    "version": 1,
    "mediaId": "media_123",
    "name": "source.mp4",
    "qualityLevel": "L3_visual_evidence",
    "target": {
      "aspectRatio": "9:16"
    },
    "metadata": {
      "durationSeconds": 128.4,
      "width": 1920,
      "height": 1080,
      "sourceOrientation": "landscape"
    },
    "analysisWindows": [
      {
        "id": "window-1",
        "index": 1,
        "startSeconds": 0,
        "endSeconds": 60,
        "frameCount": 6,
        "artifact": {
          "kind": "video_range_contact_sheet",
          "path": "/absolute/path/visual-context/media_123-0.000-60.000.png",
          "mimeType": "image/png",
          "width": 1936,
          "height": 520
        },
        "frames": [
          { "timeSeconds": 0 },
          { "timeSeconds": 12 },
          { "timeSeconds": 24 },
          { "timeSeconds": 36 },
          { "timeSeconds": 48 },
          { "timeSeconds": 60 }
        ],
        "audio": {
          "hasAudio": true,
          "waveformSamples": [0.14, 0.22],
          "silenceRanges": []
        },
        "warnings": []
      }
    ],
    "visualPreflight": {
      "requiresReframe": true,
      "reframeRisk": "needs_review",
      "recommendedReframeTemplate": "vertical_face_safe_crop_above_burned_captions",
      "captionPolicy": "inspect_artifacts_before_lower_safe_captions",
      "subjectSafeArea": "unverified",
      "burnedCaptionRegion": "unverified"
    },
    "warnings": [
      "OCR not run",
      "subject detection not run",
      "burned caption detection not run",
      "semantic scene detection not run"
    ]
  }
}
```

Failure example:

```json
{
  "success": false,
  "message": "VisualContext window 2 failed for source range 60.00s-120.00s: inspect_video_range media file was not found."
}
```

## Context Shape

### Metadata

- `durationSeconds`: source duration from executor media metadata.
- `width` and `height`: source dimensions from executor media metadata.
- `sourceOrientation`:
  - `landscape` when `width / height > 1.05`
  - `portrait` when `height / width > 1.05`
  - `square` otherwise

### Windowing

Windowing is deterministic:

- first window starts at `0`
- each full window is 60 seconds
- final window ends at media duration
- frame count is always 6
- windows use source-video seconds

For a 128.4-second video, windows are:

```json
[
  { "index": 1, "startSeconds": 0, "endSeconds": 60 },
  { "index": 2, "startSeconds": 60, "endSeconds": 120 },
  { "index": 3, "startSeconds": 120, "endSeconds": 128.4 }
]
```

### Visual Preflight

v1 preflight is intentionally conservative.

`requiresReframe` is true when the target aspect ratio is narrower than the source by at least 20%.

`reframeRisk` values:

- `none`: source and target aspect ratios are close.
- `needs_review`: target is meaningfully narrower or wider than source, but no detector can prove subject location.

When source is landscape and target is `9:16`, recommend:

```text
vertical_face_safe_crop_above_burned_captions
```

This is a planning recommendation, not proof of a safe face crop. Codex must inspect artifacts before claiming face-safe framing or burned-caption avoidance.

## Product Policy

This tool changes the planning standard:

- For tutorial, product-proof, screen recording, or horizontal-to-vertical edits, Codex must run `build_visual_context` before final EditPlan authoring.
- If `build_visual_context` reports unverified OCR or subject detection, Codex must not claim it read screen text or verified subject-safe crop.
- If the user asks for exact visual claims, Codex must inspect the returned artifacts or use a future OCR/vision tool.

## Roadmap Boundary

Separate follow-up specs should cover:

- OCR extraction from the contact-sheet or frame set.
- Subject/face bounding boxes for actual crop automation.
- Person mask generation for `human-pip` and `text-background`.
- Executor TTS and `NarratedRemixPlan v2`.
- Animated subtitle templates.

These are independent subsystems and should not be bundled into this v1 plan.

## Risks

- Timeline-wide inspection can be slow on long media because it generates one artifact per minute.
- Contact sheets are evidence, not semantic understanding.
- A 60-second window can miss a very short visual moment; Codex can still call `inspect_video_range` for a smaller range after this broad pass.
- If future agents ignore the warnings, they can still overclaim visual facts. The skill docs must explicitly forbid that.

## Verification

Minimum verification:

- Unit tests for window splitting and source orientation.
- Unit tests for vertical reframe risk.
- Unit tests proving window inspection failure includes window index and source range.
- Executor test proving success and no project revision mutation.
- Executor test proving image/audio media is rejected before invoking inspection.
- CLI test proving `build-visual-context` creates the exact command envelope.
- Docs update proving the workflow requires visual context for reframe-sensitive edits.
