---
name: codecut-jianying-editor-framework
description: Use when operating or extending the Codex-only Codecut editing MVP, including local executor projects, material intake, EditPlan validation/application, timeline verification, or human preview.
---

# Codecut Jianying Editor Framework

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
- `codecut-jianying-editor-framework`: route requests to the correct stage
  skill or recipe.
- Stage skills: own one gate, input set, output shape, handoff, and stop
  conditions.
- MCP tools: define atomic capability schemas, side effects, read-only status,
  and failure shape. They do not choose workflows.

## Required Stage Routing

Choose one path before running commands:

For new creative jobs with missing setup fields, route through the
`open_codecut_workspace` MCP tool so the user sees the Codecut workspace setup
widget first. Text clarification is only a fallback when the workspace widget
tool is unavailable in the current Codex tool surface.

| Request shape | Required stage |
| --- | --- |
| New creative job, new source material, remote URL, local media path, "make a short", "剪辑", "提取到本地" | **REQUIRED SUB-SKILL:** Use `codecut-requirement-intake` first; it should open `open_codecut_workspace` when setup fields are missing. |
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

Use `setupBrowserRuntime` through the current Codex browser API when the user
needs preview:

```ts
const browser = await agent.browsers.get("iab");
await browser.capabilities.get("visibility");
const tab = await browser.tabs.selected();
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
- Do not use `black-bar` as a subtitle mask. It is a caption style only.
- Caption timing must declare a post-cut caption source. Prefer edited audio transcription through `build-post-cut-captions`; use source transcript remap only when every source segment maps cleanly into selected clips.

## Planning References

Read only what matches the task:

- Current runtime truth: `../../docs/codex-driven-editing.md`
- Workspace spec: `../../docs/codecut-workspace.md`
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
