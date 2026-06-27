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
- Clearer cover ownership: project-cover judgment lives in a stage skill while
  runtime code only imports image assets, sets cover metadata, and reads state.

## Stage Table

| Stage | Owner | Input | Output Artifact | User-Visible Status | Stop Condition | Next Handoff |
| --- | --- | --- | --- | --- | --- | --- |
| `router` | `codecut` | User request, plugin startup context, existing stage proof | Selected route; no timeline or workspace mutation | "Routed" or "Route blocked" | Request shape is ambiguous enough that routing could choose the wrong side-effect stage | Exactly one loadable stage skill |
| `requirement-intake` | `codecut-requirement-intake` | User brief, known source path or URL, known output constraints | Widget submission, confirmed setup token, `requirement-intake.md`, explicit user answers, assumptions kept separate | "Setup confirmed" or "Missing setup fields" | Two or more blocking fields are missing; widget submission has not passed; confirmed setup token is missing for side effects | `codecut-material-ingest` when source facts are needed; `codecut-reference-template` for reference derivation; `codecut-executor-apply` only when source is already in an executor project |
| `source-acquisition` | `codecut-tiktok-downloader` for TikTok sources; otherwise `codecut-material-ingest` | Source-only request or confirmed creative setup with TikTok URL, share link, author page, or `@handle` | local media files, `download_manifest.json`, backend warnings, later `material-audit.md` after ingest resumes | "Source downloaded" or "Source blocked" | Missing author download count, unavailable source rights/access, stale downloader, login/region/private-account block, or missing setup token for creative jobs | `codecut-material-ingest` for probe/audit; completion for source-only acquisition |
| `material-ingest` | `codecut-material-ingest` | Confirmed setup token, confirmed source paths or remote URLs, workspace project ID | `.codecut-workspace` assets, ffprobe inventory, `material-audit.md` | "Source material ready" or "Source blocked" | Confirmed setup token is missing or invalid; remote source cannot be downloaded or probed; local path is not absolute; media has no positive duration | `codecut-reference-template` when deriving a reference package; otherwise `codecut-edit-planning` before `codecut-executor-apply` |
| `reference-template` | `codecut-reference-template` | Finished reference videos, requested reusable style, evidence availability | `reference-analysis.md`, `local-template-script.json`, `template-fields.md`, import result after confirmation | "Template draft ready" or "Template imported" | Speech/copy evidence is missing for an import-ready draft; user has not confirmed import; requested effect is unsupported | Normal `codecut-requirement-intake` and `codecut-material-ingest` when applying the saved template to new material; `codecut-edit-planning` before executor apply; `codecut-executor-apply` only for confirmed import |
| `edit-planning` | `codecut-edit-planning` | Passed requirement intake, material audit, transcript or VideoContext, visual evidence, reference-template constraints, optional platform strategy brief | `intent-route.md`, `editing-decision-ledger.md`, `candidate-clips.json`, strict plan draft, `verification-spec.json`, optional `planning-blockers.md` | "Plan ready" or "Planning blocked" | Required transcript, visual, material, business, caption, platform, or template evidence is missing; no candidate clip passes standalone coherence; requested plan cannot be represented safely; more than one primary recipe would be merged | `codecut-executor-apply` only after a strict plan draft and verification spec exist |
| `cover-generation` | `codecut-cover-generation` | Confirmed project ID, setup token for cover side effects, platform or cover type, current media/timeline evidence | `cover-frame-ledger.md`, `cover-prompt.md`, `cover-import.md`, `cover-readback.md` | "Cover prompt ready", "Project cover set", or "Cover blocked" | Platform ratio, visual evidence, image generation capability, imported image dimensions, setup token, or cover readback is missing | `codecut-material-ingest` when source media is missing; `codecut-executor-apply` for cover import/set/readback side effects; completion report when cover metadata is verified |
| `executor-apply` | `codecut-executor-apply` | Confirmed project ID, bridge env, imported media, strict plan file, verification/export request | validation result, preview result, applied draft revision, readback summary, optional exported file path | "Timeline updated", "Verified in timeline", or "Export produced" | service gate, doctor, import, validation, preview, apply, caption build, readback, or export fails | Completion report or the narrow failed owner stage |

## Supporting File Map

Use this map before loading detail files. It keeps stage skills light while
preserving one canonical place for stop and readback expectations.

| Capability / stage | Read first | Load detail when | Stop before continuing | Required readback | Verification proof |
| --- | --- | --- | --- | --- | --- |
| `router` | `skills/codecut/SKILL.md` | The user request could enter source acquisition, intake, reference-template, executor apply, inspection, or implementation work | Routing would choose a side-effect owner by guess, or the required skill/tool is unavailable | None; router must not mutate state | Handoff with `Stage`, `Status`, `Proof`, `Next`, and `Risk` |
| `requirement-intake` | `skills/codecut-requirement-intake/SKILL.md` | A new creative job has missing setup fields, remote source, local source, or side-effect intent | Two or more blocking setup fields are missing, widget submission is unavailable, or side-effect token is missing | Confirmed setup token and `00-brief/requirement-intake.md` when a project exists | Confirmed fields, assumptions kept separate, and next owner |
| `source-acquisition` | `skills/codecut-tiktok-downloader/SKILL.md` or `skills/codecut-material-ingest/SKILL.md` | Source is TikTok-specific, remote, local, or source-only | Access rights, login/region/private account, author count, local absolute path, or positive duration proof is missing | Manifest and material audit before creative planning | Local files, `download_manifest.json`, ffprobe facts, warnings, blockers |
| `material-ingest` | `skills/codecut-material-ingest/SKILL.md` | Source facts affect transcript, crop, aspect, captions, or clip selection | Confirmed setup token is missing, media cannot be reached/probed, or required duration/dimensions are absent | `02-inventory/material-audit.md` plus media metadata | Asset manifest, ffprobe report, material audit |
| `reference-template` | `skills/codecut-reference-template/SKILL.md` | User asks to learn, import, or apply a reference-derived template | Speech/copy evidence is missing, unsupported effect is requested, or user has not confirmed import | Imported system template only after confirmed import; otherwise draft proof only | `reference-analysis.md`, `local-template-script.json`, `template-fields.md`, import result |
| `cover-generation` | `skills/codecut-cover-generation/SKILL.md` | User asks for a project cover, short-video poster, thumbnail prompt, cover evidence-frame selection, generated cover image import, or cover readback | Platform ratio, visual evidence, image generation capability, setup token, imported image dimensions, or cover readback is missing | `get_project_info` or `get_timeline_state` proves project `cover`; total duration is unchanged | Cover frame ledger, generated cover prompt, import result, set_project_cover result, cover readback |
| `edit-planning` | `skills/codecut-edit-planning/SKILL.md` | Transcript, VideoContext, candidate clips, decision ledger, or EditPlan/NarratedRemixPlan strategy is needed | Required transcript/visual/material/business/template evidence is missing or the requested plan cannot be represented safely | No mutation readback; hand off a strict plan draft and verification spec to executor apply | Selected recipe, planning ledger, strict EditPlan or NarratedRemixPlan draft, verification spec |
| `executor-apply` | `skills/codecut-executor-apply/SKILL.md` and `skills/codecut/references/execution-contract.md` | Service readiness, import, validate/preview/apply, captions, timeline readback, export, visual QA, or plugin freshness proof is needed | Service, bridge env, doctor, import, validation, preview, apply, caption build, readback, or export fails | `get_timeline_state` after mutation; export proof after MP4/still export | Validation/apply result, timeline readback, visual QA verdict, export file proof |
| `timeline-inspection` | `skills/codecut-edit-planning/SKILL.md` timeline-inspection recipe, then `skills/codecut-executor-apply/SKILL.md` for readback | User asks to inspect existing project state or export readiness | Existing project cannot be read, evidence is stale, or requested proof cannot be produced | `get_timeline_state`; visual contact sheet when preview quality matters | Readback summary, contact sheet, readiness/blocker report |
| `implementation` | `docs/codex-driven-editing.md` and focused tests | Code, MCP schema, skill, widget, manifest, or bridge behavior changes | Runtime truth, source/cache/config/session state, or focused failing test is missing | Depends on touched surface; plugin-facing changes require freshness/session proof | Focused test, `bun run plugin:freshness`, and cache sync when plugin surface changes |

## Non-Skill Workflow Phases

`evidence-build` is a Codex-side workflow phase, not a loadable stage skill. It
must not appear as a Stage Table owner or as the reported `Stage` value.

- Evidence-building proof uses Codecut read-only tools such as transcript,
  `VideoContext`, visual context, contact sheets, range inspection, and quality
  reports.
- Edit-planning is a loadable stage skill owned by `codecut-edit-planning`.
  Report it as `Stage: edit-planning` when planning is active or blocked.
- Project-cover generation is not a non-skill phase. Report it as
  `cover-generation` when the user outcome is an independent poster or
  thumbnail outside the exported video timeline.
- If evidence-building is blocked, report the loadable owner stage whose gate
  cannot continue, then name the missing evidence in `Proof` and `Risk`.

## Stage Ownership Rules

- Stage skills own workflow gates, handoff, and stop conditions.
- MCP tools own atomic capability schemas, side effects, read-only status, and
  failure shape.
- `docs/codex-driven-editing.md` owns current runtime truth and command details.
- `codecut-edit-planning` owns workflow recipes and Codex planning judgment for
  one selected intent.
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
