---
name: codecut-reference-template
description: Use when a user provides one or more finished or reference videos and wants Codecut/Codex to learn the editing style, derive reusable editing techniques, create a template draft for confirmation, import it into Codecut system templates, or later apply a named reference-derived template to new source material.
---

# Codecut Reference Template

## Core Boundary

Reference templates are planning data for Codex. They do not replace
requirement intake, material evidence, strict EditPlan/NarratedRemixPlan
validation, executor apply, or `get_timeline_state` readback.

## Progressive Load Map

| Situation | Read first | Stop before continuing | Required readback |
| --- | --- | --- | --- |
| User wants to learn, draft, import, or apply a reference template | `../codecut/references/workflow-stage-contract.md` supporting file map | Reference purpose, future material type, or required evidence is missing | Draft files are proof only until confirmed import |
| Speech, subtitles, or visible copy drive the reference | `references/template-script-contract.md` and the derive workflow below | Transcript/copy evidence is missing for an import-ready draft | `reference-analysis.md`, `local-template-script.json`, and `template-fields.md` |
| User confirms import or execution | `../codecut/references/execution-contract.md` success contract table | User has not confirmed the exact draft or executor readiness is unproven | Imported system template proof or `get_timeline_state` after applying a plan |

## Stage Ownership

This skill owns reference-derived template evidence, draft structure, import
confirmation, and later template-application constraints. It does not own
requirement intake, source-material ingest, executor readiness, timeline
mutation, or final readback.

Draft files are provenance and proposal artifacts. A reusable template becomes
truth only after the user confirms the exact draft and `codecut-executor-apply`
imports it with `confirmedByUser: true`.

Generated files are drafts. The Codecut system template library, visible in the
Templates UI and injected into the agent system prompt, is the source of truth
after import. Do not treat a previous `local-template-script.json` file in a
job folder as the latest usable template.

Use this skill for three jobs:

1. Derive a reusable template draft from finished reference videos.
2. Import a user-confirmed draft into Codecut system templates.
3. Apply a named reference-derived system template to new source material.

Do not present a reference template as a CapCut-style effect package, animated
subtitle engine, smart crop model, TTS system, BGM generator, or automatic
marketplace template. Unsupported reference behaviors must be named as runtime
gaps, not silently downgraded.

A draft is not import-ready if it only names a high-level style while speech,
subtitles, or visible marketing copy drove the reference. When speech or copy is
present, the reusable template must come from a granular evidence breakdown, not
from visual mood alone.

## Inputs

- Finished reference videos or reference-derived evidence.
- Template purpose, future material type, business goal, platform/aspect ratio,
  and default-trigger intent.
- Transcript, visible copy, visual evidence, and user-provided product facts
  when those drive the reference.
- Explicit user confirmation before importing a draft into system templates.

## Outputs

- Reference evidence summary and unsupported runtime gaps.
- `reference-analysis.md`, `local-template-script.json`, and
  `template-fields.md` for a draft package.
- Import result only after the user confirms the exact draft.
- Planning constraints when applying a saved system template to new material.

## Artifacts

Template derivation artifacts live in the relevant Codecut workspace:

- `.codecut-workspace/projects/<projectId>/02-inventory/` for reference media
  facts and contact sheets.
- `.codecut-workspace/projects/<projectId>/04-planning/reference-analysis.md`
- `.codecut-workspace/projects/<projectId>/04-planning/local-template-script.json`
- `.codecut-workspace/projects/<projectId>/04-planning/template-fields.md`

The Codecut system template library becomes the source of truth only after an
explicit confirmed import. Do not treat a skill-local `.artifacts` directory or
an old draft file as reusable template truth.

## Stop Conditions

- Speech, subtitles, or visible copy matter but transcript/copy evidence is
  missing for an import-ready draft.
- The requested reference effect cannot be represented by current Codecut
  contracts.
- The user has not confirmed import of the exact draft.
- New source material would require executor mutation before requirement intake
  passes.

## Handoff

Report `Stage`, `Status`, `Proof`, `Next`, and `Risk`. Hand off to
`codecut-executor-apply` only for confirmed template import or strict plan
execution; otherwise hand off to requirement intake and material ingest when a
saved template will be applied to new source material.

## Required Routing

| User request | Required route |
| --- | --- |
| "learn this editing style", "make a template from these examples", "复刻这个剪辑手法", "参考这个成品" | Derive a template draft first. |
| User confirms a generated draft should become reusable | Import the confirmed draft into Codecut system templates with `import_system_template_script`. |
| User names a saved template while providing new raw material | Read the system template script from Codecut template context, then run normal Codecut requirement/material/executor stages. |
| User supplies a `local-template-script.json` path for use | Treat it as a draft unless the user explicitly confirms import. Do not apply it as system truth directly. |
| Reference media needs download, copy, or probe | Use `codecut-material-ingest` for evidence collection only. |
| New source material will be edited | Use `codecut-requirement-intake` before executor mutation. |
| A confirmed plan is ready to mutate Codecut state | Use `codecut-executor-apply`. |

## Derive Workflow

1. Confirm the template purpose: future material type, business goal, output
   platform/aspect ratio, and whether the user wants this template to become a
   default trigger.
2. Gather evidence from every reference video: duration, dimensions, audio
   presence, transcript via `transcribe_media` / `get_transcript` when speech
   matters, visible-copy/OCR evidence when on-screen text matters,
   visual/contact-sheet proof when visual style matters, and any user-provided
   business/product facts.
3. Apply the speech-or-copy evidence gate: when a reference contains
   voiceover, dialogue, subtitles, or visible claim copy, create a
   `Per-Reference Beat And Copy Breakdown` before writing the template JSON. The
   breakdown must include time range, narration or spoken transcript, on-screen
   caption or visible copy, visual action, editing function, reusable template
   rule, evidence source, and confidence. If transcript/copy evidence is
   unavailable, stop and ask whether to collect it or continue as a visual-only
   draft that is not import-ready.
4. Extract only reusable decisions:
   - opening hook pattern
   - narration and caption copy structure, including claim progression
   - story or proof sequence
   - pacing and approximate beat lengths
   - cut density and transition policy
   - caption source, preset, placement, and unsupported animation requests
   - framing/aspect/crop policy and unverified reframe risk
   - audio role using only existing or importable audio assets
   - verification checks required after applying the template
5. Classify the trigger type as one supported system template trigger:
   `talking-head-short`, `tutorial-demo`, `product-proof-ad`,
   `narrated-broll`, `subtitle-pass`, `timeline-inspection`, or `custom`.
6. Write a template package with:
   - `reference-analysis.md`, including `Per-Reference Beat And Copy Breakdown`
   - `local-template-script.json`
   - `template-fields.md` for the Codecut Templates dialog
7. Validate the package against `references/template-script-contract.md`.
8. Stop and ask the user to confirm whether this exact draft should be imported
   into Codecut system templates. Include the template ID, name, trigger types,
   default trigger choice, and draft path. Do not import before confirmation.

## Import Workflow

When the user explicitly confirms the draft:

1. Re-read the exact `local-template-script.json` path being imported.
2. Validate it against `references/template-script-contract.md`.
3. Use `codecut-executor-apply` for bridge readiness and import through
   `import_system_template_script` / `import-system-template-script` with
   `confirmedByUser: true`.
4. Treat the imported Codecut system template as the reusable truth. The draft
   file remains only provenance and must not override the system template later.

## Apply Workflow

When the user says to use a named template on new material:

1. Use the matching Codecut system template script by ID, name, alias, or
   default trigger from the agent's system template context.
2. Check the template trigger and required evidence before planning.
3. If new source material is involved, use `codecut-requirement-intake`.
4. Ingest or inspect material evidence before clip selection.
5. Use the template steps as planning constraints only.
6. Generate the strict implemented plan shape for the selected execution path.
7. Validate, preview, apply, and verify through `get_timeline_state`.

Stop if evidence required by the template is missing. Do not switch to a weaker
template as a fallback. If the user points to a draft file instead of a saved
system template, ask whether to import it first.

## Output Rules

Read `references/template-script-contract.md` before writing
`local-template-script.json` or `template-fields.md`.

Default `trigger.defaultForTypes` to `[]` unless the user explicitly asks this
template to become the default for one trigger type and there is no existing
default for that trigger. Duplicate defaults fail fast in Codecut.

Every template step must be an instruction Codex can execute with current
Codecut evidence and contracts. Move unsupported reference effects into an
`unsupportedRuntimeGaps` section in `reference-analysis.md`; do not put them
inside template steps as if they are executable.

`reference-analysis.md` must include `Per-Reference Beat And Copy Breakdown`
when speech, subtitles, or visible copy appear in the references. Use a table or
structured list with these fields: source, time range, narration or spoken
transcript, on-screen caption or visible copy, visual action, editing function,
reusable template rule, evidence source, and confidence. If the result is a
visual-only draft because transcript or copy evidence is missing, label it
`not import-ready` and do not ask for system-template import confirmation until
the user accepts that limitation or provides evidence.

## Completion Standard

For template derivation, completion requires:

- accessible reference evidence summary
- speech-or-copy evidence gate result
- per-reference beat and copy breakdown when voiceover, subtitles, or visible
  copy matter
- narration/caption copy architecture, including hook, proof, explanation,
  reveal, CTA, or explicit statement that a role is absent
- chosen trigger type and rationale
- reusable editing technique list
- `local-template-script.json`
- Codecut Templates dialog fields
- explicit user confirmation request before import
- explicit unsupported gaps and missing evidence

For template import, completion requires:

- explicit user confirmation
- successful `import_system_template_script` result
- template ID/name/trigger summary from the import result
- statement that the Codecut system template library is now the source of truth

For applying a template, completion requires the normal Codecut execution proof:
validated plan, applied timeline, `get_timeline_state` readback, and editor URL
for human preview.
