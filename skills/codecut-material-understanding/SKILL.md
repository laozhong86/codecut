---
name: codecut-material-understanding
description: Use when Codecut source material must be understood before edit planning, including material role labeling, content summaries, visual or transcript evidence review, script-to-material matching, replacement/PIP/split-screen/circular talking-head suitability, and material risk reporting. Use for requests such as "understand these assets", "which clips fit this script", "what material can be B-roll", or "is this talking-head video suitable for picture-in-picture" before Codecut edit planning or executor mutation.
---

# Codecut Material Understanding

## Core Boundary

Material understanding is the read-only evidence stage between material ingest
and edit planning. It turns a material audit, transcript or VideoContext, visual
evidence, and optional script segments into a material-understanding report.

It must not choose the final editing recipe, write an EditPlan, generate media
or masks, import media, mutate the timeline, export files, or claim the edit is
ready. Composition notes are affordances only; final composition choices belong
to `codecut-edit-planning`.

## Progressive Load Map

| Situation | Read first | Load detail when | Stop before continuing | Required readback |
| --- | --- | --- | --- | --- |
| Need to understand material roles or usefulness | `../codecut/references/workflow-stage-contract.md` | Material audit, asset manifest, or media facts affect role labels | Material audit or asset paths are missing, stale, or blocked | `02-inventory/material-understanding.json` and `.md` |
| Need transcript, theme, speaker, or narration evidence | `../codecut/references/video-context-contract.md` | Talking-head signal, narration meaning, or script matching affects the report | Transcript or VideoContext cannot prove the claimed content | Material report cites timed transcript or VideoContext evidence |
| Need visual suitability, crop risk, replacement, PIP, split-screen, or circular talking-head assessment | `references/material-understanding-contract.md`, then `../codecut/references/video-context-contract.md` | Visual evidence, contact sheets, or range inspection are needed | Visual evidence is missing for a visual suitability claim | Material report cites visual context, frame, contact-sheet, or range evidence |
| Need script-to-material matching | `references/material-understanding-contract.md` | User provided script, outline, caption beats, or segment list | Script segments or material evidence are missing | Match suggestions with evidence and confidence only |

## Stage Ownership

This skill owns the `material-understanding` stage: material role labels,
content summaries, visual and transcript evidence references, composition
affordances, script-to-material match suggestions, risks, blockers, and the
handoff report.

It does not download or probe sources, pass requirement intake, learn reference
templates, select workflow recipes, compare candidate clips for the final edit,
write strict plan drafts, run executor commands, mutate timelines, verify
exports, or repair timeline state. Use `codecut-material-ingest` for source
facts, `codecut-reference-template` for reference-derived style constraints,
`codecut-edit-planning` for final edit decisions, and
`codecut-executor-apply` for validation, apply, readback, and export.

## Inputs

- Passed requirement-intake output when the request is part of a creative job.
- Material audit, asset manifest, local paths, durations, dimensions, audio
  flags, warnings, and blockers from `codecut-material-ingest`.
- Transcript, VideoContext, visual context, contact sheets, range inspection,
  frame evidence, or user-supplied timed captions when they affect material
  meaning or visual suitability.
- Optional script, outline, caption beats, storyboard beats, or user-specified
  material-matching needs.

## Transcript Provider Boundary

When the confirmed requirement asks for provider-backed source-audio
transcription, audio transcription API evidence, or Volcengine transcription,
use the Volcengine URL/media tools as the transcript evidence path. Use
`transcribe_volcengine_media` or `build_volcengine_media_captions` for imported
media assets that already carry a public HTTPS source URL; use the URL tools for
explicit public HTTPS sources.

If an imported local media asset has no public HTTPS source URL, stop with that
provider gate. Do not silently use `transcribe_media`, `build_video_context`, or
a low-quality local Whisper result as the source script basis unless the user
explicitly approves switching to local transcription.

## Outputs

- Material role labels: `talking_head_subject`, `b_roll`, `product_demo`,
  `screen_recording`, `proof_asset`, `ambience`, or `low_usability`.
- Content summary and evidence references for each usable asset.
- Composition affordances for main-shot replacement, picture-in-picture,
  split-screen, circular talking-head crop, crop needs, and visual risks.
- Script-to-material match suggestions with evidence and confidence.
- Blockers and next-stage handoff. Suggestions must remain evidence notes, not
  final edit-plan decisions.

## Artifacts

Write material-understanding proof under the Codecut workspace when a confirmed
project ID exists:

- `.codecut-workspace/projects/<projectId>/02-inventory/material-understanding.json`
- `.codecut-workspace/projects/<projectId>/02-inventory/material-understanding.md`

Do not create a skill-local `.artifacts` directory as the primary Codecut
artifact path.

## Stop Conditions

- Requirement intake has not passed for a creative job.
- Material audit, asset manifest, local paths, duration, dimensions, or audio
  facts are missing or stale.
- Transcript, VideoContext, visual context, contact sheet, range inspection, or
  frame evidence is missing for a claim that depends on it.
- Provider-backed transcription is required, but the selected media asset has
  no public HTTPS source URL or the provider tool fails.
- The user is asking for final edit decisions, a strict EditPlan, template
  import, executor mutation, timeline readback, or export rather than material
  understanding.
- The requested material use cannot be supported by current Codecut evidence.

## Handoff

Report `Stage`, `Status`, `Proof`, `Next`, and `Risk`.

Hand back to `codecut-material-ingest` when source facts are missing or stale.
Hand off to `codecut-reference-template` when the user wants to derive a
reusable reference style. Hand off to `codecut-edit-planning` only when the
material-understanding report exists and the user wants composition, clip
selection, replacement, picture-in-picture, split-screen, circular talking-head,
or other final edit decisions.
