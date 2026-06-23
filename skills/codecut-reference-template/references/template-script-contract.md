# Template Script Contract

Use this contract when deriving a reusable Codecut template from finished
reference videos.

## Product Principle

A Local Template Script JSON file is a draft Codex planning script until the
user confirms import. It is not timeline state, an EditPlan extension, a hidden
fallback, or a runtime template effect.

A draft derived from speech, subtitles, or visible marketing copy is not
import-ready until the copy has been decomposed into reusable editing logic. Do
not turn a reference video into a generic visual style template while skipping
the words that carry the hook, proof, explanation, reveal, or call to action.

The runtime schema is implemented in `apps/web/src/lib/template-scripts/schema.ts`.
The Codecut system template library uses the same schema and is the source of
truth after import. The current UI shows system templates through the Projects
page `Templates` dialog, and the agent system prompt reads from that library.
Do not use stale draft files as the latest template truth.

## Supported Trigger Types

- `talking-head-short`
- `tutorial-demo`
- `product-proof-ad`
- `narrated-broll`
- `subtitle-pass`
- `timeline-inspection`
- `custom`

Use `custom` when the reference style does not cleanly match a P0 template or
when evidence is too narrow to make it a default for a business intent.

## Required Template Package

Write these artifacts in the job workspace or the user-specified output folder:

```text
reference-analysis.md
local-template-script.json
template-fields.md
```

These files are review artifacts. They are not reusable system templates until
the user confirms import through `import_system_template_script`.

### `reference-analysis.md`

Include:

- reference sources and accessibility status
- evidence quality: metadata, transcript, visual proof, product facts
- `Per-Reference Beat And Copy Breakdown` when speech, subtitles, or visible
  copy appear in the references
- narration/caption copy architecture and claim progression
- reusable style rules
- non-reusable one-off content
- unsupported runtime gaps
- confidence level and why

#### Per-Reference Beat And Copy Breakdown

Apply this speech-or-copy evidence gate before writing `local-template-script.json`:

- If the reference contains voiceover, dialogue, subtitles, or visible claim
  copy, collect transcript/copy evidence with current tools such as
  `transcribe_media`, `get_transcript`, OCR, visual context, or user-provided
  transcripts.
- If the copy cannot be collected, either stop and request evidence or label the
  output as a visual-only draft that is not import-ready.

For each reference, include a table or structured list with:

| Field | Requirement |
| --- | --- |
| source | Reference filename or URL. |
| time range | Approximate start/end for the beat. |
| narration or spoken transcript | Verbatim or close paraphrase from transcript evidence; write "none" only when no speech occurs. |
| on-screen caption or visible copy | Visible subtitle, metric, label, CTA, or claim copy; write "none" only when absent. |
| visual action | What the viewer sees in that beat. |
| editing function | Hook, proof, setup, reveal, explanation, objection handling, CTA, rhythm reset, or transition. |
| reusable template rule | The repeatable editing decision that can guide future material. |
| evidence source and confidence | Transcript, OCR, visual context, contact sheet, user facts, plus high/medium/low confidence. |

### `local-template-script.json`

Use this strict shape:

```json
{
  "id": "reference-proof-cut",
  "name": "Reference proof cut",
  "description": "A proof-led short-form editing script derived from supplied reference videos.",
  "trigger": {
    "types": ["product-proof-ad"],
    "defaultForTypes": [],
    "aliases": ["reference proof cut"]
  },
  "script": {
    "objective": "Create a proof-led product short that opens with visible evidence before claims.",
    "steps": [
      {
        "id": "open-with-proof",
        "label": "Open with proof",
        "instruction": "Select the strongest visible or spoken proof beat for the first 1-3 seconds. Do not invent claims."
      }
    ],
    "verification": [
      "Every product claim maps to transcript, visual proof, or supplied product facts.",
      "get_timeline_state verifies clip order, caption count, trim ranges, and final duration."
    ]
  },
  "createdAt": "2026-06-23T00:00:00.000Z",
  "updatedAt": "2026-06-23T00:00:00.000Z"
}
```

Rules:

- `id` uses lowercase letters, numbers, and hyphens.
- `trigger.types` must contain at least one supported trigger type.
- `trigger.defaultForTypes` may only contain values already present in
  `trigger.types`.
- Keep `defaultForTypes` empty unless the user explicitly wants this as the
  default and no default already exists.
- `steps[].instruction` must be executable guidance, not a vague style label.
- `verification[]` must include evidence/readback checks, not taste judgments.
- Include ISO timestamps when producing JSON for programmatic registration.

### `template-fields.md`

Provide fields for the Codecut `Templates` dialog:

```markdown
ID: reference-proof-cut
Name: Reference proof cut
Description: A proof-led short-form editing script derived from supplied reference videos.
Trigger type: product-proof-ad
Default for trigger: No
Aliases: reference proof cut

Objective:
Create a proof-led product short that opens with visible evidence before claims.

Steps:
Open with proof: Select the strongest visible or spoken proof beat for the first 1-3 seconds. Do not invent claims.

Verification:
Every product claim maps to transcript, visual proof, or supplied product facts.
get_timeline_state verifies clip order, caption count, trim ranges, and final duration.
```

## Evidence To Template Mapping

| Reference evidence | Template field |
| --- | --- |
| Repeated story sequence | `script.steps` in the same order |
| Business outcome | `script.objective` and trigger type |
| Common pacing | Step instructions with approximate ranges |
| Caption look supported by EditPlan v1 | Step instruction plus verification |
| Unsupported animation/effect | `reference-analysis.md` runtime gap only |
| Product/claim proof | Verification and proof-selection steps |
| One-off visual content | Exclude from reusable script |

## Unsupported Runtime Gaps

Do not encode these as executable template steps unless a current Codecut tool
or plan schema supports them:

- animated, karaoke, or bouncing subtitles
- arbitrary CSS, keyframes, masks, or stickers
- smart face tracking, OCR-based scene selection, or automatic crop boxes
- TTS, voice cloning, generated narration, or automatic BGM/SFX selection
- unsupported multi-source montage paths
- marketplace template IDs or CapCut/Jianying-only effects

## Import Gate

Do not import automatically after writing `local-template-script.json`.

Before import, show the user:

- template ID and name
- trigger types and whether it will be a default trigger
- summary of reusable steps and verification checks
- unsupported runtime gaps
- path to the draft JSON

Import only after explicit confirmation. Use the
`import-system-template-script` command contract in
`../../../docs/codex-driven-editing.md` and keep `confirmedByUser: true`.

After import, apply future user requests from the Codecut system template
library, not from the draft file path.
