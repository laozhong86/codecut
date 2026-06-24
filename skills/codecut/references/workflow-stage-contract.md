# Workflow Stage Contract

This reference turns broad editing requests into user-visible Codecut stages
without changing the runtime truth. It is a product and agent-facing workflow
map. The executable contracts remain `docs/codex-driven-editing.md`, the stage
skills, MCP schemas, and executor readback.

## Purpose

Use this file when a task needs a clear stage-by-stage explanation, a handoff
between skills, or a product-facing status summary. Do not copy implementation
commands from here into MCP tools or runtime code.

Expected benefits:

- Fewer wrong defaults: missing platform, aspect ratio, caption policy, and
  output form stop at requirement intake instead of becoming hidden assumptions.
- Lower execution risk: material download, evidence building, plan writing, and
  timeline mutation have separate owners and stop conditions.
- Faster debugging: a failure can be reported as intake, ingest, evidence,
  planning, executor, readback, or export instead of a generic "editing failed".
- Better user trust: every stage has a user-visible status and concrete proof
  artifact.
- Cleaner product architecture: Codecut keeps one deterministic executor path
  while Codex owns judgment, workflow routing, and communication.

## Stage Table

| Stage | Owner | Input | Output Artifact | User-Visible Status | Stop Condition | Next Handoff |
| --- | --- | --- | --- | --- | --- | --- |
| `requirement-intake` | `codecut-requirement-intake` | User brief, known source path or URL, known output constraints | Widget submission, confirmed setup token, `requirement-intake.md`, explicit user answers, assumptions kept separate | "Setup confirmed" or "Missing setup fields" | Two or more blocking fields are missing; widget submission has not passed; confirmed setup token is missing for side effects | `material-ingest` when source facts are needed; `executor-apply` only when source is already in an executor project |
| `material-ingest` | `codecut-material-ingest` | Confirmed setup token, confirmed source paths or remote URLs, workspace project ID | `.codecut-workspace` assets, ffprobe inventory, `material-audit.md` | "Source material ready" or "Source blocked" | Confirmed setup token is missing or invalid; remote source cannot be downloaded or probed; local path is not absolute; media has no positive duration | `requirement-intake` if material facts expose missing decisions; `evidence-build` when material is ready |
| `evidence-build` | Codecut evidence tools plus the selected workflow recipe | Imported media, transcript need, visual proof need, project ID | transcript, `VideoContext`, visual context, contact sheet, range inspection, quality report | "Evidence ready" or "Missing proof" | Required transcript, visual proof, product facts, or word timestamps are unavailable | `edit-planning` when evidence satisfies the selected route |
| `edit-planning` | Codex using `editing-intent-router.md` and one workflow recipe | Requirement answers, material audit, evidence artifacts, template constraints | EditingDecisionLedger, strict EditPlan v1, SpeechCleanupPlan projection, or NarratedRemixPlan v1 | "Plan ready for validation" or "Plan blocked by unsupported capability" | Required evidence is absent; requested behavior cannot be represented by the current strict plan schema | `executor-apply` for validation, preview, apply, and readback |
| `executor-apply` | `codecut-executor-apply` | Confirmed project ID, bridge env, imported media, strict plan file | validation result, preview result, applied draft revision, readback summary | "Timeline updated" or "Executor gate failed" | service gate, doctor, import, validation, preview, apply, caption build, or readback fails | `verification-export` after timeline readback matches the request |
| `verification-export` | `codecut-executor-apply` plus read-only timeline/export checks | Applied timeline, expected metrics, optional export request | `verify_timeline` result, `get_timeline_state` summary, optional exported file path | "Verified in timeline" and optionally "Export produced" | Timeline proof is missing; export path fails; user did not request export | Completion report or a focused repair stage |
| `reference-template` | `codecut-reference-template` | Finished reference videos, requested reusable style, evidence availability | `reference-analysis.md`, `local-template-script.json`, `template-fields.md`, import result after confirmation | "Template draft ready" or "Template imported" | Speech/copy evidence is missing for an import-ready draft; user has not confirmed import; requested effect is unsupported | Normal `requirement-intake` and `material-ingest` when applying the saved template to new material |

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

For user updates, report the current stage and proof point:

```text
Stage: material-ingest
Status: source material ready
Proof: ffprobe read 1920x1080, 184.2s, has audio
Next: evidence-build
Risk: transcript still required before clip selection
```

For blockers, report the failed stage and the narrowest next action:

```text
Stage: evidence-build
Status: blocked
Missing proof: transcript timestamps for talking-head cleanup
Next: run transcribe_media or ask for a transcript
Risk: clip ranges cannot be selected without timing evidence
```
