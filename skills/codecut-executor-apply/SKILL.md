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

## Progressive Load Map

| Situation | Read first | Stop before continuing | Required readback |
| --- | --- | --- | --- |
| Service readiness, bridge env, import, validate, preview, apply, or export is needed | `../codecut/references/execution-contract.md` success contract table | Requirement intake, setup token, project ID, bridge env, doctor, validation, preview, apply, readback, or export proof is missing | `get_timeline_state` after timeline mutation; export proof after MP4/still export |
| Current command syntax or executor behavior is needed | `../../docs/codex-driven-editing.md` | Callable tool or command is not implemented in the current runtime | Command result plus field-level readback |
| Human preview or visual QA is required | `../codecut/references/execution-contract.md` human preview and visual QA sections | Browser-control blocker, contact sheet, or verdict path is missing | Visual QA verdict under `06-verification/visual-qa/<runId>/` |
| Project execution is complete and learning capture is needed | `../codecut-methodology-capture/SKILL.md` | Timeline/export proof or user confirmation for long-term updates is missing | Proposal under `08-learning/methodology-proposal.md` |

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
- Strict EditPlan, NarratedRemixPlan, verification JSON, template draft path,
  explicit controlled subtitle import request, or explicit export request.

## Outputs

- Runtime/doctor gate result.
- Import, validation, preview, apply, caption-build, verification, readback, and
  export proof as applicable.
- Completion report with project ID, editor URL, revision, track count, clip
  count, caption count, total duration, source media IDs, and export status.
- Post-completion handoff to `codecut-methodology-capture` for a private
  learning proposal.

## Artifacts

Execution proof should live under the active Codecut workspace:

- `.codecut-workspace/projects/<projectId>/05-execution/` for plan JSON,
  validation, preview, apply, caption-build, and command summaries.
- `.codecut-workspace/projects/<projectId>/06-verification/` for
  `verify_timeline`, `get_timeline_state`, quality reports, and readback notes.
- `.codecut-workspace/projects/<projectId>/07-exports/` for verified exported
  files and export metadata.
- `.codecut-workspace/projects/<projectId>/08-learning/` for the methodology
  proposal created after execution proof is complete.

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
bun run env:status
```

This is the only allowed read-only command for checking whether bridge,
RunningHub, or Volcengine env keys are present. It reports key presence and
value length only. Do not use `cat`, `sed`, `grep`, `rg`, or similar commands on
`.env.local` to check secrets, because raw values can leak into the transcript.

When a CLI command needs the actual env values, load them without printing:

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
8. transcript evidence through the confirmed path. Use local
   `transcribe_media`/`build_video_context` only for local transcription.
   Use Volcengine URL/media tools when the requirement expects provider-backed
   transcription.

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

For user-supplied SRT/ASS files, use the controlled `import-subtitles`
exception instead of rebuilding the timeline through EditPlan. Require an
absolute file path, explicit `format`, `trackName`, `captionStyle`, and a
confirmed setup token, then verify the created text elements through
`get_timeline_state`.

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

Do not continue after `doctor-install`, `doctor`, `fresh-session-smoke`, `import-media`, `import-system-template-script`, `transcribe`, `transcribe_volcengine_media`, `build_volcengine_media_captions`, `build-post-cut-captions`, `import-subtitles`, `apply-plan`, or `get_timeline_state` fails. Fix the failing gate first.

When the confirmed requirement expects Volcengine or provider-backed source
audio transcription, a missing public HTTPS source URL is a provider gate. Stop
and report it instead of switching to local Whisper, `transcribe_media`, or
`build_video_context` without explicit user approval.

Advanced MCP repair tools such as `insert_clips`, `add_texts`,
`add_captions`, `import_subtitles`, `move_clips`, `remove_clips`, `split_clip`,
`set_clip_properties`, `set_keyframes`, and `ripple_delete_ranges` are not the
default generated-edit path. Use them only after timeline readback identifies a
specific repair, the user explicitly asks for a direct low-level edit, or the
user supplies a subtitle file for controlled import.

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
After the completion report is backed by readback and visual/export proof,
handoff to `codecut-methodology-capture` to create
`08-learning/methodology-proposal.md`. Do not update
`.codecut-workspace/user-methodology/` from this executor skill.
