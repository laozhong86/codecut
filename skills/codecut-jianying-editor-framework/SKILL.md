---
name: codecut-jianying-editor-framework
description: Use when operating or extending the Codex-only Codecut editing MVP, including local executor projects, material intake, EditPlan validation/application, timeline verification, or human preview.
---

# Codecut Jianying Editor Framework

## Core Boundary

Codecut is a local deterministic executor plus browser preview. Codex is the only LLM and agent layer.

The local executor draft and `get_timeline_state` are proof. EditPlans are intent. Browser preview is for the human user, not the agent runtime.

Browser is not the Agent runtime. Use `setupBrowserRuntime`, `agent.browsers.get("iab")`, `browser.capabilities.get("visibility")`, and `browser.tabs.selected()` only to open or inspect the Codex in-app browser preview for the human user.

Preview URLs:

- `http://127.0.0.1:4100/en/projects`
- `http://127.0.0.1:4100/en/editor/<projectId>`

Do not call `tab.goto(previewUrl)` if the selected tab is already on the preview URL.

## Required Stage Routing

For every request, choose one path before running commands:

| Request shape | Required stage |
| --- | --- |
| New creative job, new source material, remote URL, local media path, "make a short", "剪辑", "提取到本地" | **REQUIRED SUB-SKILL:** Use `codecut-requirement-intake` first. |
| Source needs download, file copy, workspace init, or ffprobe audit | **REQUIRED SUB-SKILL:** Use `codecut-material-ingest`. |
| Transcript, VideoContext, candidate clips, decision ledger, or EditPlan authoring | Use `references/editing-intent-router.md` and exactly one workflow recipe. |
| Executor service, env, doctor, import, apply, caption build, timeline readback | **REQUIRED SUB-SKILL:** Use `codecut-executor-apply`. |
| Existing project inspection or export readiness | Use `references/workflow-recipes/timeline-inspection.md`. |
| Implementation work inside Codecut code | Inspect current contract first, then write focused tests before edits. |

## Non-Negotiable Gates

Requirement intake must pass before mutation for new creative jobs.

Blocked before requirement intake passes:

- `create-project`
- `import-media`
- `transcribe`
- `build-video-context`
- `build-post-cut-captions`
- `apply-plan`
- `apply_edit_plan`
- timeline mutation bridge tools

Allowed before requirement intake passes:

- read-only investigation
- material reachability checks
- local source download/probe when explicitly requested or needed for material audit
- writing `intent-analysis.md`, `clarification-questions.md`, `assumptions.md`, and material audit files

## Current Runtime Rules

- Use only `CODECUT_AGENT_BRIDGE_*` env keys.
- Load bridge env from `apps/web/.env.local` when needed with `source apps/web/.env.local`.
- Use `http://127.0.0.1:4100`; do not switch ports.
- Run `doctor-install` and `doctor` before business executor commands.
- Do not depend on browser-mounted heartbeat for command execution.
- Do not use FFmpeg, shell scripts, or overlay rendering as the Codecut editing path for cuts or subtitle burn-in.

## Cross-Stage Editing Rules

- Before creating a new executor project, define a business project name from the user brief or ask for one when the brief does not contain enough context.
- Create projects with `create-project --project-id <id> --name "<business project name>"`.
- Do not create projects with generic names such as "Untitled", "Test", or "Short Video".
- For horizontal sources converted to vertical shorts, run a visual preflight and use `vertical_face_safe_crop_above_burned_captions` when faces or important content would collide with captions.
- Do not use `black-bar` as a subtitle mask.
- Caption timing must use a post-cut caption source: choose source transcript remap, edited audio transcription, or `build-post-cut-captions` based on the actual edit path.

## Planning References

Read only what matches the task:

- Current workflow: `../../docs/codex-driven-editing.md`
- Workspace spec: `../../docs/codecut-workspace.md`
- Intent router: `references/editing-intent-router.md`
- Long-to-short: `references/workflow-recipes/long-to-short.md`
- Talking-head polish: `references/workflow-recipes/talking-head-polish.md`
- Subtitle pass: `references/workflow-recipes/subtitle-pass.md`
- Voiceover remix: `references/workflow-recipes/voiceover-remix.md`
- Timeline inspection: `references/workflow-recipes/timeline-inspection.md`
- EditPlan schema: `references/edit-plan-schema.md`

## Completion Standard

For editing execution, completion requires:

- successful validator/application result
- `get_timeline_state` readback
- expected track, element, duration, trim range, and media source proof
- editor URL for human preview
- explicit statement when MP4 export was not produced

Do not report a local MP4 unless a verified export path produced it.
