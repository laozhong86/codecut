---
name: codecut-edit-planning
description: Use when a Codecut editing job needs intent routing, workflow recipe selection, candidate clip comparison, an EditingDecisionLedger, a strict EditPlan or NarratedRemixPlan draft, or a verification spec before executor apply.
---

# Codecut Edit Planning

## Core Boundary

Edit planning is the Codecut stage that turns confirmed requirements and source
evidence into an executable plan draft.

It must remain a planning owner only. It produces recipe choice, clip
decisions, plan drafts, and verification expectations for a later executor
stage.

## Progressive Load Map

| Situation | Read first | Load detail when | Stop before continuing | Required readback |
| --- | --- | --- | --- | --- |
| Need to classify edit intent or choose one recipe | `references/editing-intent-router.md` | The user asks for a cut, subtitle pass, narration remix, project inspection, platform short, product proof, tutorial, or style application | Requirement intake, material audit, or required evidence is missing | None; this skill does not mutate timeline state |
| Need to apply confirmed user methodology at the start of planning | `../codecut-methodology-capture/SKILL.md` for private-store rules, then the matching recipe | `.codecut-workspace/user-methodology/profile.md` or `rules.md` exists | Current user instructions conflict with stored methodology | Read-only methodology context only |
| Need long-to-short, platform short, product proof, tutorial, or broad highlight planning | `references/workflow-recipes/long-to-short.md` | Candidate clip comparison, story structure, proof, crop viability, or first-frame promise affects the result | No candidate clip passes standalone coherence or required transcript/visual/business evidence is missing | Handoff verification spec only |
| Need speech cleanup or talking-head polish planning | `references/workflow-recipes/talking-head-polish.md` | Filler, restarts, repeated setup, dead air, or sentence-boundary cleanup affects the edit | Transcript timestamps or retained-meaning evidence is missing | Handoff verification spec only |
| Need subtitle planning | `references/workflow-recipes/subtitle-pass.md` | Caption source, timing, readability, translation, or burned-in subtitle policy affects the result | Timed caption source or caption policy is missing | Handoff verification spec only |
| Need narration or B-roll remix planning | `references/workflow-recipes/voiceover-remix.md` | Existing narration audio, visual B-roll, captions, and target duration must align | Approved narration asset, visual asset facts, or caption timing is missing | Handoff verification spec only |
| Need existing project inspection or export-readiness planning | `references/workflow-recipes/timeline-inspection.md` | The user asks what exists, what changed, or whether export is safe | Project ID is missing or readback evidence must be gathered by `codecut-executor-apply` | Handoff verification spec only |

## Stage Ownership

This skill owns the `edit-planning` stage: intent routing, evidence sufficiency,
one recipe selection, candidate clip comparison, EditingDecisionLedger authoring,
strict EditPlan or NarratedRemixPlan draft authoring, and verification spec
authoring.

It does not collect setup answers, download or probe source material, create
projects, import media, run executor commands, mutate timelines, export files,
verify completed edits, or repair timeline state. Use
`codecut-requirement-intake` for missing setup decisions,
`codecut-material-ingest` for source facts, `codecut-reference-template` for
reference-derived constraints, and `codecut-executor-apply` for validation,
apply, readback, quality reports, and export.

## Inputs

- Passed requirement-intake output, including confirmed output form, platform,
  aspect ratio, caption policy, business goal, and side-effect token when a
  later executor stage needs it.
- Material audit with selected source assets, local paths, durations,
  dimensions, audio flags, warnings, and blockers.
- Transcript, VideoContext, visual evidence, contact sheets, range inspection,
  or user-supplied timed captions when they affect the edit.
- Reference-template constraints when the user asks to apply a saved or
  reference-derived style.
- PlatformStrategyBrief when content-platform strategy is part of the job.
- Confirmed local methodology from `.codecut-workspace/user-methodology/`
  when present. Current user instructions override stored methodology.

## Outputs

- One selected primary recipe.
- Candidate clips with keep/drop decisions, evidence, risk, and why the chosen
  candidates beat rejected alternatives.
- EditingDecisionLedger, SpeechCleanupPlan projection notes, or narration remix
  beat plan as appropriate for the selected recipe.
- Strict EditPlan v1 or NarratedRemixPlan v1 draft using only implemented
  fields.
- Verification spec for `codecut-executor-apply`, including expected plan file,
  validation target, readback fields, visual QA needs, caption quality checks,
  and export proof only when export was requested.

## Artifacts

Write planning proof under the Codecut workspace when a confirmed project ID
exists:

- `.codecut-workspace/projects/<projectId>/04-planning/intent-route.md`
- `.codecut-workspace/projects/<projectId>/04-planning/editing-decision-ledger.md`
- `.codecut-workspace/projects/<projectId>/04-planning/candidate-clips.json`
- `.codecut-workspace/projects/<projectId>/04-planning/plan-drafts/edit-plan.json`
- `.codecut-workspace/projects/<projectId>/04-planning/plan-drafts/narrated-remix-plan.json`
- `.codecut-workspace/projects/<projectId>/04-planning/verification-spec.json`
- `.codecut-workspace/projects/<projectId>/04-planning/planning-blockers.md`

Do not create a skill-local `.artifacts` directory as the primary Codecut
artifact path.

## Stop Conditions

- Requirement intake has not passed.
- Material audit is missing, stale, or contains unresolved blockers.
- Required transcript, visual evidence, product facts, business facts, caption
  source, or platform strategy is missing.
- No candidate clip passes standalone coherence for the requested result.
- The requested style, effect, crop, BGM, audio, subtitle animation, overlay, or
  remix cannot be represented in current EditPlan v1 or NarratedRemixPlan v1.
- Platform, aspect ratio, caption policy, output form, project replacement, or
  export intent is required but not confirmed by the user or an upstream stage.
- Stored methodology conflicts with current explicit user instructions and the
  conflict is not recorded in the planning ledger.
- More than one recipe would be merged into a broad workflow. Choose one primary
  recipe or stop.

## Handoff

Report `Stage`, `Status`, `Proof`, `Next`, and `Risk`.

Hand back to `codecut-requirement-intake` when user choices are missing, to
`codecut-material-ingest` when source facts are missing, and to
`codecut-reference-template` when style evidence or template confirmation is
missing.

Hand off to `codecut-executor-apply` only when the selected recipe, decision
ledger, strict plan draft, and verification spec exist. The handoff must name
the plan draft path, verification spec path, expected readback fields, and any
known runtime gap.
