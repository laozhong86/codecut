---
name: codecut-methodology-capture
description: Use when Codecut should capture editing methodology, user preferences, project retrospectives, user corrections, "remember this" feedback, "update preference" requests, or post-project learning proposals without mutating timeline state or publishing private preferences.
---

# Codecut Methodology Capture

## Core Boundary

Methodology capture turns project outcomes and explicit user feedback into a
private learning proposal, then into confirmed local editing preferences only
after the user approves the update.

It is not an editing, ingest, planning, executor, export, publishing, or
plugin-release stage. It must not mutate timeline state, download source media,
call executor tools, export files, or store private preferences in plugin source
files.

## Progressive Load Map

| Situation | Read first | Load detail when | Stop before continuing | Required readback |
| --- | --- | --- | --- | --- |
| Project has finished and a learning proposal is needed | `templates/methodology-proposal.md` | Completion evidence, visual QA notes, or user correction should become a proposal | Project ID or completion evidence is missing | Proposal under `08-learning/methodology-proposal.md` |
| User says "remember this", "以后按这个", "update preference", or corrects a Codecut decision | `references/update-contract.md` | A proposal may become long-term methodology | User confirmation is missing | Confirmed updates under `.codecut-workspace/user-methodology/` |
| Updating confirmed methodology | `references/update-contract.md` | Profile, rules, or feedback-log placement is unclear | The update cannot be integrated into the body without duplicating the event log | Read back changed local methodology files |

## Ownership

This skill owns:

- project retrospective proposal authoring;
- user confirmation gating for long-term preference updates;
- private methodology file placement;
- body integration versus event-log separation;
- handoff back to `codecut-edit-planning` for future jobs.

It does not own requirement intake, material ingest, reference-template
derivation, edit planning, executor apply, visual QA, export, or cache sync.

## Inputs

- User feedback, correction, or explicit memory request.
- Completed-project evidence: requirement intake, material audit,
  EditingDecisionLedger, timeline readback, visual QA verdict, export proof, and
  final user comments when available.
- Existing local methodology files under `.codecut-workspace/user-methodology/`.
- Optional project proposal under
  `.codecut-workspace/projects/<projectId>/08-learning/methodology-proposal.md`.

## Outputs

- A project-scoped proposal under
  `.codecut-workspace/projects/<projectId>/08-learning/methodology-proposal.md`.
- After explicit user confirmation only:
  - `.codecut-workspace/user-methodology/profile.md`
  - `.codecut-workspace/user-methodology/rules.md`
  - `.codecut-workspace/user-methodology/feedback-log.md`
  - `.codecut-workspace/projects/<projectId>/08-learning/accepted-updates.md`
- A handoff note naming what future `codecut-edit-planning` should read.

## Artifacts

All user-specific methodology artifacts are local and private:

```text
.codecut-workspace/user-methodology/profile.md
.codecut-workspace/user-methodology/rules.md
.codecut-workspace/user-methodology/feedback-log.md
.codecut-workspace/projects/<projectId>/08-learning/methodology-proposal.md
.codecut-workspace/projects/<projectId>/08-learning/accepted-updates.md
```

Do not write personal editing preferences to `skills/**`, `docs/**`,
`.codex-plugin/**`, plugin cache paths, or shared reference files. Generic skill
contracts may describe the capture process, but never the user's private
preferences.

## Workflow

1. Reconstruct the concrete event from current project evidence and user
   feedback. Do not ask "what problem?" when the context already shows the
   correction.
2. Draft a proposal using `templates/methodology-proposal.md`. Separate:
   reusable preference, reusable method, one-off project fact, and open risk.
3. Without confirmation, keep only `methodology-proposal.md` and do not update
   long-term methodology.
4. Ask the user whether to accept the proposal before writing long-term
   methodology.
5. If accepted, read the existing methodology files before editing them.
6. Integrate reusable preferences into `profile.md` and reusable rules into
   `rules.md` body sections. Do not append rules only to the end.
7. Record only the event in `feedback-log.md`. Keep it as an event log only;
   do not repeat the full rule in the event log.
8. Write `accepted-updates.md` for the project, then report the exact local
   files changed.

## Stop Conditions

- User confirmation is missing for a long-term methodology update.
- The evidence only supports a one-off project fact, not a reusable preference.
- The update would store personal preferences in plugin source or installed
  cache.
- The proposed rule conflicts with the user's current explicit instruction.
- The agent would need to call executor, timeline, download, import, export, or
  publishing tools.

## Handoff

Report `Stage`, `Status`, `Proof`, `Next`, and `Risk`.

For future edit planning, hand off the confirmed local methodology files to
`codecut-edit-planning`. Current user instructions always override stored
methodology.
