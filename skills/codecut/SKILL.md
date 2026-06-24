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

For new creative jobs with missing setup fields, call
`open_codecut_workspace` directly from the MCP tool surface before reading
local files, loading stage skills, running shell commands, or sending text-only
questions. Use `tool_search` only if the widget tool is not visible. After
widget submission, route the submitted setup through `codecut-requirement-intake`
before executor mutation.

| Request shape | Required stage |
| --- | --- |
| Source-only acquisition: "download", "save locally", "提取到本地", "下载到本地", or similar with no editing, timeline, template, or export request | Use `codecut-tiktok-downloader` for TikTok sources, otherwise use `codecut-material-ingest`. Do not open the creative editing widget or run executor mutation commands. |
| New creative job with missing setup fields, new source material, remote URL, local media path, "make a short", "剪辑", or any request that will create, edit, verify, or export a timeline | Call `open_codecut_workspace` directly before loading child skills or shell. After widget submission, use `codecut-requirement-intake` to pass or block the execution gate. |
| New creative job with explicit setup fields already provided | **REQUIRED SUB-SKILL:** Use `codecut-requirement-intake` before executor mutation. |
| TikTok video, photo post, share link, author page, or @handle that must be downloaded or saved locally for an editing job | **REQUIRED SUB-SKILL:** Use `codecut-tiktok-downloader` for TikTok source acquisition after intake passes, or before intake only when source facts are needed to ask useful questions. |
| Source needs download, file copy, workspace init, or ffprobe audit | **REQUIRED SUB-SKILL:** Use `codecut-material-ingest`. |
| Finished/reference videos, "learn this editing style", "复刻模板", reference-derived template draft/import/application | **REQUIRED SUB-SKILL:** Use `codecut-reference-template` before EditPlan authoring or executor mutation. |
| Transcript, VideoContext, candidate clips, decision ledger, or EditPlan authoring | Read `references/editing-intent-router.md` and exactly one workflow recipe. |
| Executor service, env, doctor, import, apply, caption build, timeline readback | **REQUIRED SUB-SKILL:** Use `codecut-executor-apply`. |
| Existing project inspection or export readiness | Read `references/workflow-recipes/timeline-inspection.md`. |
| Implementation work inside Codecut code | Inspect the current contract first, then write focused tests before edits. |

## Non-Negotiable Gates

- Requirement intake must pass before timeline mutation for new creative jobs.
- Before creating a new executor project, define a business project name. Use
  `create-project --project-id <id> --name "<business project name>"`.
- Do not create projects with generic names such as `New project`, `Untitled
  Project`, `Test`, or `Codex cut`.
- Use `codecut-executor-apply` for runtime readiness, `apps/web/.env.local`,
  doctor checks, imports, apply, export, and readback.
- Do not use low-level MCP mutation tools as the default editing path. Tools
  such as `insert_clips`, `add_texts`, `add_captions`, `move_clips`,
  `remove_clips`, `split_clip`, `set_clip_properties`, `set_keyframes`, and
  `ripple_delete_ranges` are advanced repair tools after timeline readback or
  explicit user intent. Normal generated edits go through strict EditPlan or
  NarratedRemixPlan paths.
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
- For horizontal sources converted to vertical shorts, use
  `vertical_face_safe_crop_above_burned_captions` only when current visual
  evidence supports that policy.
- When that policy can be represented as a fixed source rectangle, use EditPlan
  `sourceCrop` and verify `visual.sourceCrop` in `get_timeline_state`.
- If the needed crop cannot be represented natively, present the runtime-gap
  versus one-time fallback MP4 choice instead of silently baking a fallback.
- Do not use `black-bar` as a subtitle mask. It is a caption style only.
- Caption timing must declare a post-cut caption source. Prefer edited audio transcription through `build-post-cut-captions`; use source transcript remap only when every source segment maps cleanly into selected clips.

## Planning References

Read only what matches the task:

- Current runtime truth: `../../docs/codex-driven-editing.md`
- Workspace spec: `../../docs/codecut-workspace.md`
- Workflow stage contract: `references/workflow-stage-contract.md`
- Intent router: `references/editing-intent-router.md`
- Tool contract: `references/codecut-agent-tool-contract.md`
- EditPlan schema: `references/edit-plan-schema.md`
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
- editor URL for human preview
- explicit statement when MP4 export was not produced
