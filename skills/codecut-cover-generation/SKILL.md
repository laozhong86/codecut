---
name: codecut-cover-generation
description: Use when a Codecut project needs a short-video poster, project cover, thumbnail, cover prompt, cover image import, cover evidence frame selection, or project cover readback verification without changing the edited video duration.
---

# Codecut Cover Generation

## Core Boundary

Cover generation is a project-cover stage. It turns Codecut project evidence
into a cover prompt, then sets one imported generated image as the independent
project cover.

Codecut runtime does not generate images. Codex may use an available external
image generation capability, then import the generated image into Codecut. The
runtime remains responsible only for deterministic evidence, asset import,
project cover state, and readback.

Project covers are outside the timeline. This skill must not mutate timeline
tracks, must not mutate timeline tracks through a cover workaround, and must not
change exported video duration. It must not use `EditPlan.introCover` for
project covers. Use `EditPlan.introCover` only when the user explicitly asks
for an opening image inside the video.

## Progressive Load Map

| Situation | Read first | Stop before continuing | Required readback |
| --- | --- | --- | --- |
| Platform, aspect ratio, long-video, short-video, or source quality affects the cover | `references/platform-cover-specs.md` | Platform ratio is ambiguous enough to change the generated image | Platform preset plus source quality level in the cover ledger |
| Choosing video frames for emotion, atmosphere, subject, or proof | `references/frame-selection-rubric.md` | Visual evidence is missing, stale, black, blurred, cropped, or not tied to media timestamps | Evidence-frame ledger with source media ID, timestamp, artifact path, scores, and reason |
| Writing the cover prompt | `references/cover-archetypes.md` | No archetype fits the platform, evidence, or user goal | Prompt names archetype, ratio, title policy, safe-zone policy, and evidence frame roles |
| Creating an Atutun-style Xiaohongshu cover | `references/atutun-xhs-cover-method.md` | No usable human/subject frame exists, or the user does not want a dense Xiaohongshu style | Prompt preserves evidence-frame identity and uses `#FDFFA7` constraints |
| Importing and setting the generated cover image | `../codecut/references/execution-contract.md` | Setup token, generated image path/URL/bytes, imported image dimensions, or cover readback is missing | `get_project_info` or `get_timeline_state` proves `cover` and unchanged duration |

## Stage Ownership

This skill owns project-cover workflow guidance:

- choose platform and cover type when enough user intent is present
- inspect current project and media evidence
- select evidence frames for emotion, atmosphere, subject clarity, and proof
- write a cover prompt for the selected archetype
- request image generation outside Codecut runtime
- import the generated image with `import_media`
- set the independent project cover with `set_project_cover`
- verify cover metadata with `get_project_info` or `get_timeline_state`

It does not create projects, download source media, transcribe from scratch
unless evidence is already missing, write EditPlans, mutate timeline clips,
generate images inside Codecut runtime, export MP4 files, or publish content.

## Inputs

- Confirmed project ID and setup token when `import_media` or
  `set_project_cover` is needed.
- Current project/media evidence from `get_project_info` and
  `list_media_assets`.
- Platform or output context when known, such as Xiaohongshu, Douyin, TikTok,
  Instagram Reels, YouTube, Bilibili, WeChat Channels, LinkedIn, X, or
  Pinterest.
- User-provided title, topic, product, audience, or business goal when present.
- Video evidence from `build_visual_context`, `inspect_video_range`, contact
  sheets, transcript, or existing timeline readback.
- Generated cover image path, URL, or bytes when image generation has already
  happened outside Codecut runtime.

## Outputs

- Selected platform preset and source quality level.
- Selected cover archetype and prompt.
- Evidence-frame ledger with media ID, source timestamp, artifact path, frame
  role, and selection reason.
- Imported image media ID and cover metadata after side effects.
- Readback proof that `cover` is present and timeline duration is unchanged.

## Artifacts

Write cover proof under the active Codecut workspace:

- `.codecut-workspace/projects/<projectId>/04-planning/cover-frame-ledger.md`
- `.codecut-workspace/projects/<projectId>/04-planning/cover-prompt.md`
- `.codecut-workspace/projects/<projectId>/05-execution/cover-import.md`
- `.codecut-workspace/projects/<projectId>/06-verification/cover-readback.md`

Use `inspect_video_range` and `build_visual_context` artifact paths as evidence.
Do not create a skill-local `.artifacts` directory as Codecut truth.

## Stop Conditions

- Project ID is missing.
- A side-effect step needs `import_media` or `set_project_cover`, but the setup
  token is missing.
- No video or image media can provide visual evidence.
- The target platform, aspect ratio, or cover type is ambiguous enough to change
  the output.
- Image generation capability is unavailable.
- The generated cover image cannot be imported as an image asset with positive
  width and height.
- Cover readback does not show the requested `cover` metadata, or timeline
  duration changes during project-cover work.

## Handoff

Report `Stage`, `Status`, `Proof`, `Next`, and `Risk`.

Hand off to `codecut-material-ingest` when source media is missing or not
probed. Hand off to `codecut-executor-apply` only for the asset side effects
that import the generated image and set/read back the project cover. Return to
planning if platform, title, or cover archetype is still under-specified.

## Workflow

1. Read `references/platform-cover-specs.md` when platform, aspect ratio, long
   video, short video, or source quality matters.
2. Read `references/frame-selection-rubric.md` before selecting frames from a
   video.
3. Read `references/cover-archetypes.md` before writing the cover prompt.
4. Read `references/atutun-xhs-cover-method.md` only for
   `xhs-atutun-human-title` or high-density Xiaohongshu cover requests.
5. Call `get_project_info` and `list_media_assets`.
6. Use existing visual evidence when current. Otherwise run
   `build_visual_context` for broad preflight or `inspect_video_range` for
   candidate source ranges.
7. Pick one primary evidence frame and optional support frames. Record why each
   frame represents emotion, atmosphere, subject, or proof.
8. Write a prompt that names the selected frame role, target ratio, title
   policy, safe-zone policy, and generated-image expectations.
9. Generate the image outside Codecut runtime.
10. Import the generated image with `import_media`.
11. Call `set_project_cover` with imported `mediaId`, title, prompt, and
    `stylePreset`.
12. Verify with `get_project_info` or `get_timeline_state` that `cover` is
    present and total duration is unchanged.

## Verification

Minimum proof before reporting success:

- `get_project_info` or `list_media_assets` proves the source media exists.
- Evidence-frame ledger names source media ID, timestamp, artifact path, and
  selection reason.
- Generated image import readback shows image type plus positive width and
  height.
- `set_project_cover` succeeds with the imported media ID.
- Readback shows `cover.mediaId`, optional `title`, optional `stylePreset`, and
  unchanged timeline duration.
