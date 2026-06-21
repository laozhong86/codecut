---
name: codecut-material-ingest
description: Use when Codecut source material must be downloaded, copied, classified, probed, or organized before editing, including remote URLs, YouTube sources, local media files, workspace init, asset filing, and ffprobe material audit.
---

# Codecut Material Ingest

## Core Rule

Material ingest collects source facts. It does not decide the final platform, aspect ratio, caption policy, or output form.

For new creative jobs, use `codecut-requirement-intake` first unless material facts are needed to ask better questions.

## Responsibilities

- Reserve the project ID.
- Initialize `.codecut-workspace/projects/<projectId>`.
- Save the original request.
- Copy local source files into `01-assets/`.
- Download remote source material only when explicitly requested or needed for material audit.
- Run `node scripts/codecut-workspace.mjs probe-assets`.
- Write material facts into `02-inventory/material-audit.md`.

## Allowed Commands

```bash
node scripts/codecut-workspace.mjs init --project-id <id> --name "<business project name>" --user-message "<original request>"
node scripts/codecut-workspace.mjs add-assets --project-id <id> --file /absolute/path/source.mp4
node scripts/codecut-workspace.mjs probe-assets --project-id <id>
node scripts/codecut-workspace.mjs write-doc --project-id <id> --kind material-audit --content-file /absolute/path/material-audit.md
```

For YouTube source extraction, use a local download tool only after separating download failure from Codecut failure. Record source URL, title, duration, dimensions, local file path, and download limitations.

## Stop Conditions

- Remote source cannot be accessed or downloaded.
- Local media path is not absolute.
- `ffprobe` cannot read positive duration for video/audio.
- The requested output requires confirmation that has not passed.

## Handoff

After ingest, hand off to:

- `codecut-requirement-intake` if questions remain.
- `codecut-executor-apply` only after requirement intake passes.
