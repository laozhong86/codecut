---
name: codecut-reference-template
description: Use when a user provides one or more finished or reference videos and wants Codecut/Codex to learn the editing style, derive reusable editing techniques, create a template draft for confirmation, import it into Codecut system templates, or later apply a named reference-derived template to new source material.
---

# Codecut Reference Template

## Core Boundary

Reference templates are planning data for Codex. They do not replace
requirement intake, material evidence, strict EditPlan/NarratedRemixPlan
validation, executor apply, or `get_timeline_state` readback.

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
   - narration/caption copy architecture and claim progression
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
3. Use `codecut-executor-apply` for bridge readiness and run:

   ```bash
   node scripts/codex-bridge.mjs import-system-template-script --project-id <id> --template-json-file /absolute/path/local-template-script.json --confirmed-by-user true
   ```

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
