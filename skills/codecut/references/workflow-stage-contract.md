# Workflow Stage Contract

This reference turns broad editing requests into user-visible Codecut stages
without changing the runtime truth. It is a product and agent-facing workflow
map. The executable contracts remain `docs/codex-driven-editing.md`, the stage
skills, MCP schemas, and executor readback.

## CodeCut Skill Architecture v1

Codecut uses an entry router plus stage skills plus atomic MCP tools:

- `codecut` routes requests and does not execute stage work.
- Stage skills own one gate, input set, output shape, artifacts, stop
  conditions, and handoff.
- MCP tools expose atomic capabilities, schemas, side effects, returned
  evidence, and failure shape.
- Runtime code owns only deterministic validation, timeline mutation, readback,
  and export.

The primary stage proof path is:

```text
.codecut-workspace/projects/<projectId>
```

Stage artifacts should use the existing workspace folders from `00-brief`
through `07-exports`. A skill-local `.artifacts` folder may exist only as
temporary implementation scratch for a future isolated helper; it must not
become the primary Codecut artifact path or a second source of project truth.

## Purpose

Use this file when a task needs a clear stage-by-stage explanation, a handoff
between skills, or a product-facing status summary. Do not copy implementation
commands from here into MCP tools or runtime code.

Expected benefits:

- Fewer wrong defaults: missing platform, aspect ratio, caption policy, and
  output form stop at requirement intake instead of becoming hidden assumptions.
- Lower execution risk: material download, reference derivation, executor
  mutation, timeline readback, and export have separate owners and stop
  conditions.
- Faster debugging: a failure can be reported as router, intake, source
  acquisition, ingest, reference-template, executor, readback, or export instead
  of a generic "editing failed".
- Better user trust: every stage has a user-visible status and concrete proof
  artifact.
- Cleaner product architecture: Codecut keeps one deterministic executor path
  while Codex owns judgment, workflow routing, and communication.

## Stage Table

| Stage | Owner | Input | Output Artifact | User-Visible Status | Stop Condition | Next Handoff |
| --- | --- | --- | --- | --- | --- | --- |
| `router` | `codecut` | User request, plugin startup context, existing stage proof | Selected route; no timeline or workspace mutation | "Routed" or "Route blocked" | Request shape is ambiguous enough that routing could choose the wrong side-effect stage | Exactly one loadable stage skill |
| `requirement-intake` | `codecut-requirement-intake` | User brief, known source path or URL, known output constraints | Widget submission, confirmed setup token, `requirement-intake.md`, explicit user answers, assumptions kept separate | "Setup confirmed" or "Missing setup fields" | Two or more blocking fields are missing; widget submission has not passed; confirmed setup token is missing for side effects | `codecut-material-ingest` when source facts are needed; `codecut-reference-template` for reference derivation; `codecut-executor-apply` only when source is already in an executor project |
| `source-acquisition` | `codecut-tiktok-downloader` for TikTok sources; otherwise `codecut-material-ingest` | Source-only request or confirmed creative setup with TikTok URL, share link, author page, or `@handle` | local media files, `download_manifest.json`, backend warnings, later `material-audit.md` after ingest resumes | "Source downloaded" or "Source blocked" | Missing author download count, unavailable source rights/access, stale downloader, login/region/private-account block, or missing setup token for creative jobs | `codecut-material-ingest` for probe/audit; completion for source-only acquisition |
| `material-ingest` | `codecut-material-ingest` | Confirmed setup token, confirmed source paths or remote URLs, workspace project ID | `.codecut-workspace` assets, ffprobe inventory, `material-audit.md` | "Source material ready" or "Source blocked" | Confirmed setup token is missing or invalid; remote source cannot be downloaded or probed; local path is not absolute; media has no positive duration | `codecut-reference-template` when deriving a reference package; otherwise Codex planning with workflow recipes before `codecut-executor-apply` |
| `reference-template` | `codecut-reference-template` | Finished reference videos, requested reusable style, evidence availability | `reference-analysis.md`, `local-template-script.json`, `template-fields.md`, import result after confirmation | "Template draft ready" or "Template imported" | Speech/copy evidence is missing for an import-ready draft; user has not confirmed import; requested effect is unsupported | Normal `codecut-requirement-intake` and `codecut-material-ingest` when applying the saved template to new material; `codecut-executor-apply` only for confirmed import |
| `executor-apply` | `codecut-executor-apply` | Confirmed project ID, bridge env, imported media, strict plan file, verification/export request | validation result, preview result, applied draft revision, readback summary, optional exported file path | "Timeline updated", "Verified in timeline", or "Export produced" | service gate, doctor, import, validation, preview, apply, caption build, readback, or export fails | Completion report or the narrow failed owner stage |

## Non-Skill Workflow Phases

`evidence-build` and `edit-planning` are Codex-side workflow phases, not
loadable stage skills. They must not appear as Stage Table owners or as the
reported `Stage` value.

- Evidence-building proof uses Codecut read-only tools such as transcript,
  `VideoContext`, visual context, contact sheets, range inspection, and quality
  reports.
- Edit-planning proof uses `editing-intent-router.md`, one workflow recipe,
  `EditingDecisionLedger`, strict EditPlan v1, SpeechCleanupPlan projection, or
  NarratedRemixPlan v1.
- If either phase is blocked, report the loadable owner stage whose gate cannot
  continue, then name the missing evidence or unsupported planning constraint in
  `Proof` and `Risk`.

## Stage Ownership Rules

- Stage skills own workflow gates, handoff, and stop conditions.
- MCP tools own atomic capability schemas, side effects, read-only status, and
  failure shape.
- `docs/codex-driven-editing.md` owns current runtime truth and command details.
- Workflow recipes own Codex planning judgment for one selected intent.
- Codecut runtime code owns only deterministic validation and timeline mutation.

## Non-Transferable Boundaries

Do not use FFmpeg, shell scripts, or subtitle burn-in as the Codecut editing path.
FFmpeg may exist as an internal executor dependency for media inspection,
transcription, or future verified export runtime, but not as a shortcut around
timeline state.

Do not let MCP tools choose the workflow. Tools expose capabilities; skills and
Codex planning choose how to combine them for the user's job.

Do not treat a local MP4 as completion without matching Codecut timeline readback.
Completion requires executor readback first; export is an additional side effect
only when requested and verified.

Do not turn reference templates into runtime template locks. Reference-derived
templates are planning constraints for Codex until a strict implemented plan is
validated and applied.

## Reporting Shape

For user updates, report the current stage and proof point with this standard
shape:

```text
Stage: material-ingest
Status: source material ready
Proof: ffprobe read 1920x1080, 184.2s, has audio
Next: Codex planning with the selected workflow recipe, then codecut-executor-apply
Risk: transcript still required before clip selection
```

For blockers, report the failed stage and the narrowest next action:

```text
Stage: executor-apply
Status: blocked
Proof: missing transcript timestamps for talking-head cleanup
Next: run transcribe_media or ask for a transcript
Risk: clip ranges cannot be selected without timing evidence
```
