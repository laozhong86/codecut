---
name: codecut-material-ingest
description: Use when Codecut source material must be downloaded, copied, classified, probed, or organized before editing, including remote URLs, YouTube sources, local media files, workspace init, asset filing, and ffprobe material audit.
---

# Codecut Material Ingest

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

## Stage Ownership

This skill owns source material facts only: local file reachability, remote
download/probe limitations, workspace asset filing, ffprobe inventory, and
material-audit handoff.

It does not pass requirement intake, choose creative strategy, infer platform or
aspect ratio defaults, write EditPlans, import into the executor, mutate the
timeline, or verify completed edits. If material facts reveal missing business
or output decisions, hand back to `codecut-requirement-intake`.

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

## Stop Conditions

- Remote source cannot be accessed or downloaded.
- Local media path is not absolute.
- `ffprobe` cannot read positive duration for video/audio.
- The requested output requires widget submission or a confirmed setup token
  that is missing or invalid.

## Handoff

After ingest, hand off to:

- `codecut-requirement-intake` if questions remain.
- `codecut-executor-apply` only after requirement intake passes.
