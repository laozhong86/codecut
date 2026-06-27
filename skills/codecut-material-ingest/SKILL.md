---
name: codecut-material-ingest
description: Use when Codecut source material must be downloaded, copied, classified, probed, or organized before editing, including remote URLs, YouTube sources, local media files, workspace init, asset filing, and ffprobe material audit.
---

# Codecut Material Ingest

## Core Boundary

Material ingest is the source-facts stage for confirmed Codecut work. It makes
local and remote material inspectable before creative planning or executor
mutation.

It must not decide creative strategy, platform defaults, timeline shape, or
completion status.

## Core Rule

Material ingest collects source facts after creative setup is confirmed. It
does not decide the final platform, aspect ratio, caption policy, or output
form.

For new creative jobs, material ingest is allowed only after
`open_codecut_workspace` and `submit_codecut_setup` have produced a confirmed
setup token and `codecut-requirement-intake` has passed. Do not initialize a
workspace, copy files, probe assets, or write audit/planning files before that
widget submission path.

For source-only acquisition requests with no editing, timeline, template, or
export intent, download or save the source outside the CodeCut creative
workspace path and stop after local source facts are recorded. Do not open the
creative editing widget and do not run CodeCut executor mutation commands.

## Progressive Load Map

| Situation | Read first | Stop before continuing | Required readback |
| --- | --- | --- | --- |
| Source needs copy, download, probe, or workspace filing | `../codecut/references/workflow-stage-contract.md` supporting file map | Confirmed setup token is missing for a creative job | Asset manifest and `02-inventory/material-audit.md` |
| TikTok source is involved | `../codecut-tiktok-downloader/SKILL.md` | TikTok access, rights, author count, or manifest proof is missing | `download_manifest.json` before ffprobe audit resumes |
| Source facts affect planning or export | `../codecut/references/execution-contract.md` success contract table | Duration, width/height, audio presence, or absolute local path cannot be proved | `list_media_assets` or `get_timeline_state includeReferencedMedia` after executor import |

## Stage Ownership

This skill owns source material facts only: local file reachability, remote
download/probe limitations, workspace asset filing, ffprobe inventory, and
material-audit handoff.

It does not pass requirement intake, choose creative strategy, infer platform or
aspect ratio defaults, write EditPlans, import into the executor, mutate the
timeline, or verify completed edits. If material facts reveal missing business
or output decisions, hand back to `codecut-requirement-intake`.

## Inputs

- Confirmed setup token for creative jobs.
- Confirmed project ID and business project name.
- Local media paths, remote source URLs, TikTok download manifests, or existing
  workspace asset references.
- Requirement intake output, including output form and caption/source policy.

## Outputs

- Local workspace asset inventory.
- Material audit with source reachability, duration, dimensions, audio presence,
  warnings, and blockers.
- Next-stage recommendation based only on material facts.

## Artifacts

Primary artifacts live under `.codecut-workspace/projects/<projectId>/...`:

- `01-assets/` for copied or downloaded source files.
- `02-inventory/asset-manifest.json`
- `02-inventory/ffprobe-report.json`
- `02-inventory/material-audit.md`

Do not use a skill-local `.artifacts` directory as the primary Codecut artifact
path.

## Stop Conditions

- Confirmed setup token is missing or invalid for a creative job.
- Remote source cannot be accessed or downloaded.
- Local media path is not absolute.
- Probe cannot read positive duration for required video or audio assets.

## Handoff

Report `Stage`, `Status`, `Proof`, `Next`, and `Risk`. Hand back to
`codecut-requirement-intake` if source facts reveal missing decisions; otherwise
hand off to `codecut-reference-template` for reference derivation or to Codex
planning with workflow recipes before `codecut-executor-apply`. This skill does
not own those planning phases.

## Responsibilities

- Use the confirmed project ID from widget setup.
- Initialize `.codecut-workspace/projects/<projectId>` with the confirmed setup
  token.
- Save the original request.
- Copy local source files into `01-assets/`.
- Download remote source material only when explicitly requested or needed for material audit.
- For TikTok video, photo, share, author, or `@handle` sources, route the
  TikTok-specific acquisition through `codecut-tiktok-downloader`, then resume
  this material audit stage.
- Run `node scripts/codecut-workspace.mjs probe-assets --confirmation-token <token>`.
- Write material facts into `02-inventory/material-audit.md`.

## Allowed Commands

Use the complete `codecut-workspace` command contract in
`../../docs/codex-driven-editing.md`. This stage may run only these workspace
actions, and each requires the confirmed setup token:

- `codecut-workspace init --confirmation-token <token>`
- `codecut-workspace add-assets --confirmation-token <token>`
- `codecut-workspace probe-assets --confirmation-token <token>`
- `codecut-workspace write-doc --confirmation-token <token>`

For YouTube source extraction, use a local download tool only after separating download failure from Codecut failure. Record source URL, title, duration, dimensions, local file path, and download limitations.

For TikTok source extraction, use `codecut-tiktok-downloader` instead of
embedding TikTok-specific backend rules here. Record its `download_manifest.json`
path and downloaded file paths before probing the assets.
