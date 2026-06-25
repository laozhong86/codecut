---
name: codecut-executor-apply
description: Use when a confirmed Codecut editing plan is ready for local executor commands, including service readiness, bridge env, doctor checks, media import, transcription, EditPlan application, caption build, and get_timeline_state verification.
---

# Codecut Executor Apply

## Core Boundary

Executor apply is the only normal stage that mutates Codecut executor state,
verifies timeline readback, or produces verified exports.

It must not collect missing requirements, invent material facts, select clips,
derive reference strategy, or bypass strict plan validation.

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

## Inputs

- Confirmed project ID, business project name, setup token, and editor URL when
  available.
- Bridge env from `apps/web/.env.local`.
- Imported media IDs and readback from material/evidence stages.
- Strict EditPlan, NarratedRemixPlan, verification JSON, template draft path, or
  explicit export request.

## Outputs

- Runtime/doctor gate result.
- Import, validation, preview, apply, caption-build, verification, readback, and
  export proof as applicable.
- Completion report with project ID, editor URL, revision, track count, clip
  count, caption count, total duration, source media IDs, and export status.

## Artifacts

Execution proof should live under the active Codecut workspace:

- `.codecut-workspace/projects/<projectId>/05-execution/` for plan JSON,
  validation, preview, apply, caption-build, and command summaries.
- `.codecut-workspace/projects/<projectId>/06-verification/` for
  `verify_timeline`, `get_timeline_state`, quality reports, and readback notes.
- `.codecut-workspace/projects/<projectId>/07-exports/` for verified exported
  files and export metadata.

Do not create a skill-local `.artifacts` directory as the primary Codecut
artifact path.

## Stop Conditions

- Requirement intake has not passed for a new creative job.
- Confirmed setup token is missing for side-effect tools.
- Service gate, bridge env, `doctor-install`, `doctor`, import, validation,
  preview, apply, caption build, verification, readback, or export fails.
- Export is requested but `export_project` or an equivalent verified executor
  path does not produce a file.

## Handoff

Report `Stage`, `Status`, `Proof`, `Next`, and `Risk`. On failed gates, return
to the narrow failed stage instead of continuing. Use advanced repair tools only
after readback identifies a specific object/range or the user explicitly asks
for a direct low-level edit.

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

Use `verify-timeline`, `get_timeline_state`, `build-video-quality-report`, and
`inspect_timeline` from the docs. `inspect_timeline` success only proves that
sampled composited frames were rendered; it is not a visual pass. Codex must
inspect the generated contact sheet before reporting completion.

Record one visual QA verdict under
`.codecut-workspace/projects/<projectId>/06-verification/visual-qa/<runId>/`
with `codecut-workspace record-visual-qa`. The verdict must include the
timeline contact sheet path, frame count, sampled timestamps, pass/fail status,
issues found, and whether each issue was fixed.

The required visual QA checks are:

- `first_frame_not_black`
- `title_not_clipped`
- `text_layers_not_overlapping`
- `subject_not_cropped_by_cover`
- `bottom_safe_area_clear`
- `ending_normal`
- `export_matches_timeline_preview`

`export_matches_timeline_preview` may be `not_applicable` only when no MP4
export was requested; in that case the completion report must explicitly state
that no MP4 was produced.

Before any long render or `export_project`, rerun `doctor-install` and
`doctor`. Do not begin the render if source-to-cache sync, bridge env, service,
executor readiness, or the timeline visual QA verdict is stale or failing.

After `export_project` produces an MP4, run `codecut-workspace
extract-export-frames` on the final exported file, inspect the export contact
sheet, compare it with the timeline contact sheet, and update the visual QA
verdict with export evidence. Timeline frames prove editor state; exported MP4
frames prove the delivered file. They cannot substitute for each other.

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
- visual QA verdict path
- timeline contact sheet path, frame count, sampled timestamps, pass/fail
  status, found issues, and fixed status
- exported MP4 contact sheet path, frame count, sampled timestamps, pass/fail
  status, found issues, and fixed status when MP4 export was produced

Do not claim MP4 export unless a verified export path produced it.
Do not claim final delivery unless the visual QA verdict is recorded and has no
unresolved blocking issue. If MP4 export was not requested, state that no MP4
was produced and omit export QA instead of marking it as passed.
