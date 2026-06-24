---
name: codecut-tiktok-downloader
description: Use when a Codecut source is a TikTok video, photo post, share link, author page, or @handle and the user wants it downloaded, saved, extracted, or made available as local editing material.
---

# Codecut TikTok Downloader

## Core Boundary

TikTok downloader is a source-acquisition stage only. It turns TikTok URLs,
share links, author pages, or handles into local source files and a manifest.

It must not choose editing strategy, open creative intake for source-only
requests, import into the executor, mutate timelines, or claim edit/export
completion.

## Core Rule

TikTok download is source acquisition only. It may create local media files and
a manifest, but it must not choose the edit strategy, import media into the
executor, mutate the timeline, or claim export completion.

## Stage Ownership

This skill owns TikTok-specific source acquisition:

- classify TikTok input as `single` or `author`
- choose an explicit download limit for author pages
- require the user to have rights to save and process the content
- download into `.codecut-workspace/projects/<projectId>/01-assets/tiktok`
- write or preserve `download_manifest.json`
- record backend, item count, local file paths, metadata sidecars, warnings,
  and cookie requirements

It does not own workspace setup, requirement approval, ffprobe audit, executor
import, transcription, EditPlan authoring, timeline mutation, or export.

## Inputs

- TikTok video URL, photo URL, share URL, author page, or `@handle`.
- Mode intent: single post, author page, latest N, or explicit all.
- Confirmed project ID and setup token when the download is part of a creative
  editing job.
- Source-only request context when the user only wants local acquisition.

## Outputs

- Download manifest path, backend, item count, local media paths, metadata
  sidecars, thumbnails when requested, and warnings.
- A clear source-only completion or handoff to material ingest for probe/audit.

## Artifacts

For creative jobs, write outputs under:

- `.codecut-workspace/projects/<projectId>/01-assets/tiktok/`
- `.codecut-workspace/projects/<projectId>/01-assets/tiktok/download_manifest.json`
- `.codecut-workspace/projects/<projectId>/02-inventory/material-audit.md`
  after material ingest resumes.

For source-only acquisition, record the manifest beside the local download
directory chosen for that source-only request. Do not use a skill-local
`.artifacts` directory as Codecut truth.

## Stop Conditions

- Author download count is missing and the user did not explicitly request all.
- The user cannot confirm source rights or usable access.
- TikTok blocks access because of login, region, private account, or stale
  downloader runtime.
- A creative job needs a confirmed setup token but does not have one.

## Handoff

Report `Stage`, `Status`, `Proof`, `Next`, and `Risk`. Hand off to
`codecut-material-ingest` after successful acquisition; hand back to
`codecut-requirement-intake` if editing intent remains under-specified.

## Required Routing

Use this skill only after one of these is true:

| Situation | Required path |
| --- | --- |
| User explicitly asks only to download/save TikTok source material | Use this skill, then hand off to `codecut-material-ingest` for material audit. Do not open creative editing intake unless the user later asks for editing. |
| New Codecut editing job includes a TikTok URL or @handle | Use `codecut-requirement-intake` first; do not download or probe before widget submission. |
| Requirement intake already passed and source still needs local files | Use this skill, then hand off to `codecut-material-ingest`. |
| Download fails because of login, region, private account, or platform blocking | Stop and ask for usable source access; do not switch to unrelated sources or silent fallback. |

## Download Contract

Preferred backend is `yt-dlp`. Single video downloads may use tikwm only as an
explicit fallback when `yt-dlp` is unavailable or produces no media file. Author
page downloads must use `yt-dlp`; do not use tikwm for batch author scraping.
If `yt-dlp` warns that the installed version is older than 90 days, update
`yt-dlp` first and rerun the download before treating the failure as a TikTok
fallback condition.

Always use an explicit output directory:

```bash
python3 scripts/download_tiktok.py "<TikTok URL or @handle>" \
  --mode <single|author|auto> \
  --limit <N|0> \
  --output-dir ".codecut-workspace/projects/<projectId>/01-assets/tiktok" \
  --thumbnail
```

If using `yt-dlp` directly, keep the same contract: write media under the
project asset directory, write metadata when available, and produce a
machine-readable `download_manifest.json` with `manifestPath`, `itemCount`,
`items[].filePath`, `backend`, and `warnings`.

## Input Rules

| Input | Mode | Limit rule |
| --- | --- | --- |
| URL containing `/video/` or `/photo/` | `single` | `1` |
| TikTok share URL for one post | `single` after URL resolution | `1` |
| `https://www.tiktok.com/@handle` | `author` | Ask for count unless user said all. |
| `@handle` | Normalize to `https://www.tiktok.com/@handle` | Ask for count unless user said all. |
| "latest N", "前 N 个", "下载 N 条" | `author` | `N` |
| "all", "全部", author URL with explicit all intent | `author` | `0` means no playlist cap. |

Do not treat a bare author URL as "download everything" unless the user
explicitly asks for all visible posts. Ask for a count because author downloads
can be large and slow.

## Evidence To Record

Write download facts into the project material audit or a dedicated TikTok
source note:

- original user input
- normalized TikTok URL
- mode and limit
- backend used: `yt-dlp` or `tikwm`
- manifest path
- downloaded file paths
- item count
- warnings, cookie requirement, or access blocker

Then hand off to `codecut-material-ingest` for ffprobe/material audit. If the
user's editing intent is still missing output form, platform, aspect ratio,
caption policy, or business goal, hand back to `codecut-requirement-intake`.

## Common Mistakes

| Mistake | Correct behavior |
| --- | --- |
| Downloading into the skill directory | Download into the Codecut project asset directory. |
| Treating download success as edit completion | Download success is only material readiness. |
| Running executor imports before intake passes | Do not run executor mutation commands until the gate passes. |
| Hiding `yt-dlp` failure with another source | Use tikwm only for single-video fallback and record the warning. |
| Committing downloaded media, cookies, profiles, manifests, or `.info.json` files | Keep them local and out of git. |
