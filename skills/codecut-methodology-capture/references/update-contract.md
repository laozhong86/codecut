# Methodology Update Contract

Use this reference when a project proposal or explicit user correction may
become long-term Codecut methodology.

## Confirmation Gate

Long-term methodology updates require explicit user confirmation. Without
confirmation, write only the project proposal:

```text
.codecut-workspace/projects/<projectId>/08-learning/methodology-proposal.md
```

Do not update:

```text
.codecut-workspace/user-methodology/profile.md
.codecut-workspace/user-methodology/rules.md
.codecut-workspace/user-methodology/feedback-log.md
```

## Private Store

Confirmed user-specific methodology lives only under:

```text
.codecut-workspace/user-methodology/
```

This directory is local-only because `.codecut-workspace/` is ignored by git
and excluded from plugin cache sync. Do not copy private preferences into
`skills/**`, `docs/**`, `.codex-plugin/**`, or installed cache paths.

Do not write personal editing preferences to `skills/**`.

## Body Integration Rule

Integrate reusable methodology into the body of the right file:

- `profile.md`: user preferences, taste, recurring approval standards, and
  personal style choices.
- `rules.md`: reusable editing methods, decision rules, sequencing rules, and
  verification rules.
- `feedback-log.md`: event log only.

Do not append a reusable rule only to `feedback-log.md`. If no matching section
exists, create a short section in `profile.md` or `rules.md`.

## Feedback Log Rule

The feedback log records only what happened:

```markdown
## 2026-06-27

- Project `<projectId>`: User rejected a cut because the stronger corrected
  sentence came later; accepted update recorded in `rules.md`.
```

Do not repeat the full rule text in the log.

## Proposal Quality

A proposal must separate:

- Evidence: what happened in this project.
- Suggested profile update: user-specific taste or preference.
- Suggested rule update: reusable editing method.
- Not reusable: one-off facts that must not become defaults.
- Risk: what could go wrong if this is stored too broadly.

## Conflict Rule

Current user instructions override stored methodology. When they conflict,
follow the current instruction and record the conflict in the project proposal
instead of rewriting stored methodology automatically.
