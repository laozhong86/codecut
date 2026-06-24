---
name: codecut-executor-apply
description: Use when a confirmed Codecut editing plan is ready for local executor commands, including service readiness, bridge env, doctor checks, media import, transcription, EditPlan application, caption build, and get_timeline_state verification.
---

# Codecut Executor Apply

## Core Rule

Executor apply mutates Codecut state. Use it only after requirement intake passes for new creative jobs.

## Stage Ownership

This skill owns executor readiness and execution: fixed local runtime checks,
bridge env loading, doctor checks, media import, template import after explicit
confirmation, EditPlan/NarratedRemixPlan application, caption build, timeline
readback, and export proof.

It does not confirm missing user requirements, collect source material facts,
derive reference-template strategy, select clips, or decide creative workflow.
The full command contract lives in `../../docs/codex-driven-editing.md`; this
skill keeps the minimum command surface needed to operate the current executor.

## Runtime Gate

Use the fixed MVP origin `http://127.0.0.1:4100/en/projects` and run the
complete Local Web Service Gate from `../../docs/codex-driven-editing.md`.

Do not switch ports.

## Bridge Env

From plugin root:

```bash
set -a
source apps/web/.env.local
set +a
```

Required keys:

- `CODECUT_AGENT_BRIDGE_URL`
- `CODECUT_AGENT_BRIDGE_TOKEN`
- `CODECUT_AGENT_BRIDGE_TIMEOUT_MS`
- `CODECUT_AGENT_BRIDGE_INTERVAL_MS`

Do not print token values.

## Required Command Order

Use the complete command forms in `../../docs/codex-driven-editing.md`. The
minimum execution order is:

1. local service gate
2. bridge env load from `apps/web/.env.local`
3. `create-project` with a concrete business project name
4. `doctor-install`
5. `doctor`
6. `get_project_info`
7. `list_media_assets`

After `create-project` returns an `editorUrl`, open that exact URL in the Codex
in-app browser before the next executor step. If the selected tab is already on
that URL, do not reload it. If browser control is unavailable, stop and report
the browser-control blocker plus the returned URL.

Import only when needed:

Use `import-media` from the docs after the source material path is known.
For `--file-path` imports, the bridge preflights local media with ffprobe when
metadata is incomplete. Imported video must read back `duration`, `width`, and
`height`; imported audio must read back `duration`. Run `list_media_assets`
after import and stop if those required fields are missing.

For reference-derived template draft imports, rely on
`codecut-reference-template` for the confirmation gate and run
`import-system-template-script` from the docs only with `confirmedByUser: true`.

Apply a strict implemented EditPlan:

Use `validate-edit-plan`, `preview-edit-plan`, and `apply-plan` from the docs.
Captioned EditPlans must use `captions[]` plus top-level `captionStyle` only.
Do not add arbitrary caption font or CSS fields to the plan.

Verify:

Use `verify-timeline` and `get_timeline_state` from the docs.

Before any long render or `export_project`, rerun `doctor-install` and
`doctor`. Do not begin the render if source-to-cache sync, bridge env, service,
or executor readiness is stale.

For fresh-session spokenScript/readback acceptance on an existing scripted
project, run the read-only smoke command with explicit expected evidence:

Use `fresh-session-smoke` from the docs.

## Failure Rule

Do not continue after `doctor-install`, `doctor`, `fresh-session-smoke`, `import-media`, `import-system-template-script`, `transcribe`, `build-post-cut-captions`, `apply-plan`, or `get_timeline_state` fails. Fix the failing gate first.

Advanced MCP repair tools such as `insert_clips`, `add_texts`,
`add_captions`, `move_clips`, `remove_clips`, `split_clip`,
`set_clip_properties`, `set_keyframes`, and `ripple_delete_ranges` are not the
default generated-edit path. Use them only after timeline readback identifies a
specific repair or the user explicitly asks for a direct low-level edit.

## Completion

Report:

- project ID
- editor URL
- revision
- track count
- clip count
- caption count
- total duration
- source media IDs
- whether MP4 export was produced

Do not claim MP4 export unless a verified export path produced it.
