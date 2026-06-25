---
name: codecut
description: Use when operating or extending the Codex-only Codecut editing MVP, including local executor projects, material intake, EditPlan validation/application, timeline verification, or human preview.
---

# Codecut

## Core Boundary

Codecut is a local deterministic executor plus browser preview. Codex is the
only LLM and agent layer.

This skill is the public plugin entrypoint and router. It must not become the
full execution manual. The complete current runtime contract lives in
`../../docs/codex-driven-editing.md`; stage skills own stage gates; MCP tools
expose atomic primitives only.

## Stage Ownership

This skill owns request classification and stage routing only. It chooses the
next Codecut skill, recipe, or read-only reference to load.

It does not collect missing setup answers, download source media, create
projects, import assets, write plans, mutate timelines, verify exports, or
repair timeline state.

## Inputs

- User request and any explicit source path, URL, project ID, template name,
  output target, or completion requirement.
- Plugin startup context from `.codex-plugin/plugin.json`
  `interface.defaultPrompt`.
- Current stage evidence only when the user is continuing an existing Codecut
  job.

## Outputs

- Selected route: source acquisition, requirement intake, material ingest,
  reference-template, workflow recipe, executor apply, inspection, or
  implementation work.
- A stage handoff statement using `Stage`, `Status`, `Proof`, `Next`, and
  `Risk` when reporting progress or blockers.
- No timeline, workspace, template, or export mutation.

## Artifacts

This router does not create its own primary artifacts. Codecut stage proof must
live under `.codecut-workspace/projects/<projectId>/...` once a creative job has
a confirmed project ID.

Do not introduce a skill-local `.artifacts/<run_id>` path as Codecut truth. The
workspace and executor readback are the durable evidence surfaces.

## Stop Conditions

- The request shape is ambiguous enough that routing would choose a side-effect
  stage incorrectly.
- The Codecut web service gate fails before a new creative job can open
  `open_codecut_workspace`.
- The required stage skill, recipe, or MCP widget tool is unavailable in the
  current session.

## Handoff

Route to exactly one next owner and carry forward all known context. Do not ask
the user to restate details that are already present in the request or prior
stage proof.

## Governance Layers

- `AGENTS.md`: durable product boundaries and safety principles.
- `../../docs/codex-driven-editing.md`: current implementation truth, command
  contract, EditPlan/NarratedRemixPlan details, and failure handling.
- `codecut`: route requests to the correct stage
  skill or recipe.
- Stage skills: own one gate, input set, output shape, handoff, and stop
  conditions.
- `references/workflow-stage-contract.md`: user-visible stage map, stage
  ownership, proof artifacts, and handoff shape.
- MCP tools: define atomic capability schemas, side effects, read-only status,
  and failure shape. They do not choose workflows.

## Required Stage Routing

Choose one path before running commands:

Source-only acquisition is not a creative editing job. If the user explicitly
asks only to download, save, extract, or make source media available locally,
route to the source acquisition stage and stop before editing intake, executor
project creation, timeline mutation, or export.

For new creative jobs with missing setup fields, first verify the local
Codecut web service gate at `http://127.0.0.1:4100/en/projects`. If the service
is not reachable, start it with `bun run dev:web` from the plugin root and wait
until the readiness check succeeds. Only after that, call
`open_codecut_workspace` directly from the MCP tool surface before reading
local files, loading stage skills, running shell commands, or sending text-only
questions. Use `tool_search` only if the widget tool is not visible. After
widget submission, use the returned confirmation token for all side-effect
commands and route the submitted setup through `codecut-requirement-intake`
before ingest, doctor checks, project creation, import, timeline mutation, or
export.

| Request shape | Required stage |
| --- | --- |
| Source-only acquisition: "download", "save locally", "提取到本地", "下载到本地", or similar with no editing, timeline, template, or export request | Use `codecut-tiktok-downloader` for TikTok sources, otherwise use `codecut-material-ingest`. Do not open the creative editing widget or run executor mutation commands. |
| New creative job with missing setup fields, new source material, remote URL, local media path, "make a short", "剪辑", or any request that will create, edit, verify, or export a timeline | Verify `http://127.0.0.1:4100/en/projects` first; if it fails, start `bun run dev:web` and wait for readiness. Then call `open_codecut_workspace` before loading child skills or shell. After widget submission, use `codecut-requirement-intake` to pass or block the execution gate. |
| New creative job with explicit setup fields already provided | **REQUIRED SUB-SKILL:** Use `codecut-requirement-intake` before executor mutation. |
| TikTok video, photo post, share link, author page, or @handle that must be downloaded or saved locally for an editing job | **REQUIRED SUB-SKILL:** Use `codecut-tiktok-downloader` for TikTok source acquisition only after widget submission and requirement intake pass. |
| Source needs download, file copy, workspace init, or ffprobe audit for a creative editing job | **REQUIRED SUB-SKILL:** Use `codecut-material-ingest` only after widget submission and requirement intake pass. |
| Finished/reference videos, "learn this editing style", "复刻模板", reference-derived template draft/import/application | **REQUIRED SUB-SKILL:** Use `codecut-reference-template` before EditPlan authoring or executor mutation. |
| Transcript, VideoContext, candidate clips, decision ledger, or EditPlan authoring | Read `references/editing-intent-router.md` and exactly one workflow recipe. |
| Executor service, env, doctor, import, apply, caption build, timeline readback | **REQUIRED SUB-SKILL:** Use `codecut-executor-apply`. |
| Existing project inspection or export readiness | Read `references/workflow-recipes/timeline-inspection.md`. |
| Implementation work inside Codecut code | Inspect the current contract first, then write focused tests before edits. |

## Non-Negotiable Gates

- Requirement intake must pass before timeline mutation for new creative jobs.
- New creative jobs must pass the local service gate before
  `open_codecut_workspace`; a `service_unavailable` result is a blocker, not a
  rendered widget.
- New creative jobs must pass through `open_codecut_workspace` and
  `submit_codecut_setup` before material ingest, workspace init/add-assets,
  doctor checks, executor project creation, media import, generated media,
  timeline mutation, or export.
- Before creating a new executor project, define a business project name. Use
  `create-project --project-id <id> --name "<business project name>"
  --confirmation-token <token>`.
- Do not create projects with generic names such as `New project`, `Untitled
  Project`, `Test`, or `Codex cut`.
- Use `codecut-executor-apply` for runtime readiness, `apps/web/.env.local`,
  doctor checks, imports, apply, export, and readback.
- Do not use low-level MCP mutation tools as the default editing path. Tools
  such as `insert_clips`, `add_texts`, `add_captions`, `move_clips`,
  `remove_clips`, `split_clip`, `set_clip_properties`, `set_keyframes`,
  `add_transitions`, `update_transition`, `remove_transition`, and
  `ripple_delete_ranges` are advanced repair tools after timeline readback or
  explicit user intent. Normal generated edits go through strict EditPlan or
  NarratedRemixPlan paths.
- When the user asks for transitions, transition, or picture-to-picture
  transitions, use native timeline transitions (`TrackTransition`,
  `tracks[].transitions`, `summary.transitionCount`) or report a capability
  blocker. `set_keyframes` is only for motion effects such as push, pull, fade,
  zoom, or opacity animation and must not be reported as a transition.
- Before completing a transition task, read back
  `get_timeline_state.summary.transitionCount` and the target video
  track's `transitions[]`. For `verify_timeline`, include `transitionCount` in
  the verification JSON when a transition was requested.
- Do not use FFmpeg, shell scripts, or overlay rendering as the Codecut editing
  path for cuts or subtitle burn-in.
- Do not claim MP4 export unless `export_project` or the equivalent verified
  executor path produced the file.

## Human Preview

Browser is not the Agent runtime. The local executor draft and readback are the
agent proof; the Codex in-app browser is only for human preview.

Whenever a Codecut project is created and an `editorUrl` is returned, open that
exact `editorUrl` in the Codex in-app browser before reporting the project
ready. This is mandatory for setup-widget project creation and direct executor
`create-project` runs. If browser control is unavailable, report the `editorUrl`
and the browser-control blocker explicitly; do not claim browser-visible
preview.

Use `setupBrowserRuntime` through the current Codex browser API, make the
browser visible, and navigate only when needed:

```ts
const previewUrl = editorUrl;
const browser = await agent.browsers.get("iab");
await (await browser.capabilities.get("visibility")).set(true);
const tab = (await browser.tabs.selected()) ?? await browser.tabs.new();
if ((await tab.url()) !== previewUrl) {
  await tab.goto(previewUrl);
}
```

Preview URLs:

- `http://127.0.0.1:4100/en/projects`
- the `editorUrl` returned by `create-project`

Do not reconstruct a bare `/editor/<projectId>` URL for executor projects; the
returned `editorUrl` carries the browser bridge token required for editor state.
Do not call `tab.goto(previewUrl)` if the selected tab is already on the preview URL.

## Evidence And Caption Gates

- For tutorial, product-proof, screen-recording, or horizontal-to-vertical jobs,
  use visual preflight before final EditPlan authoring when crop, caption, or
  proof risk affects the result.
- Project cover and EditPlan `introCover` are separate products. A project
  cover is a poster/thumbnail outside the timeline; set it only by importing an
  image with `import_media` and calling `set_project_cover`. Do not represent a
  project cover with `introCover`, and do not shift timeline clips for it.
- If the user asks for a short-video cover/poster, use the video first frame or
  visual evidence to create an image outside Codecut runtime, import the image,
  then call `set_project_cover` with the imported image `mediaId`, title text,
  prompt, and style preset metadata. Verify with `get_project_info` or
  `get_timeline_state` that `cover` is present and total duration is unchanged.
- If confirmed setup intent has `generateIntroCover: true`, create a timeline
  opening image before final EditPlan authoring. This is not the project cover.
  Determine the final first clip's `sourceStart`, inspect that source frame or a
  tight range with `inspect_video_range`, choose a prompt from
  `references/intro-cover-prompts.md` based on video type, generate a separate
  image through an available image generation capability outside Codecut
  runtime, import that image with `import_media`, and write `introCover` in the
  EditPlan.
- Do not generate a timeline intro image when confirmed setup intent has
  `generateIntroCover: false`.
- Do not silently downgrade cover work. If image generation capability is
  unavailable, first-frame visual evidence is missing, or the generated image
  cannot be imported as an image asset with width and height, stop and report
  the blocker before calling timeline mutation tools.
- Intro cover duration is planned explicitly by Codex. The current recommended
  starting value is `1.2s`; do not rely on a runtime default. The first video
  clip's `timelineStart` must equal `introCover.duration`.
- For project covers, baked title text is expected when the user asks for
  short-video cover style. For timeline intro images, prefer adding titles
  through Codecut text/title layers unless the user explicitly needs image text.
- For horizontal sources converted to vertical shorts, use
  `vertical_face_safe_crop_above_burned_captions` only when current visual
  evidence supports that policy.
- When that policy can be represented as a fixed source rectangle, use EditPlan
  `sourceCrop` and verify `visual.sourceCrop` in `get_timeline_state`.
- If the needed crop cannot be represented natively, present the runtime-gap
  versus one-time fallback MP4 choice instead of silently baking a fallback.
- Do not use `black-bar` as a subtitle mask. It is a caption style only.
- Subtitle styling has one generated-edit path: `EditPlan.captions[]` plus
  top-level `captionStyle`. Do not put `fontFamily`, `fontSize`, `color`, CSS,
  per-caption style objects, or external subtitle renderer settings in an
  EditPlan. Codecut caption presets resolve to controlled local renderer
  styles and curated local CJK renderer fonts.
- For Chinese creator captions, default to a clean font-first treatment:
  `creator-clean`, lower-safe position, no heavy black stroke, subtle shadow,
  balanced one- or two-line chunks, and at most one emphasized phrase per
  sentence through `richSpans`. Treat commercial fonts seen in references as
  style inspiration unless the user supplies redistribution rights.
- Caption timing must declare a post-cut caption source. Prefer edited audio transcription through `build-post-cut-captions`; use source transcript remap only when every source segment maps cleanly into selected clips.
- After applying captions, use `get_timeline_state` readback and verify text
  elements include `content`, `startTime`, `duration`, and `style`.
- Local video import through `import-media --file-path` must produce
  `duration`, `width`, and `height`; local image import used as project cover
  must produce `width` and `height`; local audio import must produce `duration`.
  Verify with `list_media_assets` or `get_timeline_state`
  `includeReferencedMedia` before authoring project cover, intro cover,
  sourceCrop, or export-sensitive plans.

## Planning References

Read only what matches the task:

- Current runtime truth: `../../docs/codex-driven-editing.md`
- Workspace spec: `../../docs/codecut-workspace.md`
- Workflow stage contract: `references/workflow-stage-contract.md`
- Intent router: `references/editing-intent-router.md`
- Tool contract: `references/codecut-agent-tool-contract.md`
- EditPlan schema: `references/edit-plan-schema.md`
- Project and intro cover prompt guide: `references/intro-cover-prompts.md`
- Long-to-short: `references/workflow-recipes/long-to-short.md`
- Talking-head polish: `references/workflow-recipes/talking-head-polish.md`
- Subtitle pass: `references/workflow-recipes/subtitle-pass.md`
- Voiceover remix: `references/workflow-recipes/voiceover-remix.md`
- Timeline inspection: `references/workflow-recipes/timeline-inspection.md`

## Completion Standard

For editing execution, completion requires:

- successful validation/application result
- `get_timeline_state` readback
- expected track, element, duration, trim range, and media source proof
- a visual QA verdict recorded under
  `.codecut-workspace/projects/<projectId>/06-verification/visual-qa/<runId>/`
- editor URL for human preview
- explicit statement when MP4 export was not produced

`inspect_timeline` and `build_video_quality_report` only generate evidence.
They are not a visual pass by themselves. Before reporting completion, Codex
must inspect the timeline contact sheet and report a verdict that includes:
contact sheet path, frame count, sampled timestamps, pass/fail status, issues
found, and whether each issue was fixed.

For MP4 delivery, Codex must also sample frames from the exported MP4 with
`codecut-workspace extract-export-frames`, inspect the export contact sheet,
compare it against the timeline preview, and record the final verdict with
`codecut-workspace record-visual-qa`. Timeline frames prove editor state; export
frames prove the delivered file. They are not interchangeable.

The required visual QA checks are:

- `first_frame_not_black`
- `title_not_clipped`
- `text_layers_not_overlapping`
- `subject_not_cropped_by_cover`
- `bottom_safe_area_clear`
- `ending_normal`
- `export_matches_timeline_preview`

`export_matches_timeline_preview` may be `not_applicable` only when no MP4
export was requested; in that case the final report must explicitly say that
no MP4 was produced.
