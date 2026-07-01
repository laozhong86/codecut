---
name: codecut-requirement-intake
description: Use when a Codecut editing request starts a new creative job, uses new source material, uses a remote URL, asks for a short/video edit, or lacks platform, aspect ratio, output form, caption policy, business goal, or source ownership details.
---

# Codecut Requirement Intake

## Core Boundary

Requirement intake is the permission gate for new Codecut creative editing
jobs. It confirms whether the user intent is specific enough to enter side
effects.

It must not become a material ingest, planning, executor, template, or export
stage.

## Core Rule

Requirement intake is a blocking gate for new Codecut editing jobs.

Before material ingest, workspace add-assets/probe, doctor checks,
`create-project`, `import-media`, generated media, timeline mutation, or export,
classify the request and decide whether the user's intent is confirmed enough
to execute.

## Progressive Load Map

| Situation | Read first | Stop before continuing | Required readback |
| --- | --- | --- | --- |
| New creative job or missing setup fields | `../codecut/references/workflow-stage-contract.md` supporting file map | Two or more blocking fields are missing, or requirement confirmation cannot pass | Confirmed setup token plus `00-brief/requirement-intake.md` when a project exists |
| Requirement confirmation or setup-token behavior is involved | `../../docs/codecut-workspace.md` and `../../docs/codex-driven-editing.md` | `open_codecut_requirement_confirmation`, `get_codecut_requirement_confirmation`, or `create_codecut_project_from_requirement` is unavailable | Carry the returned confirmation token to later side-effect stages |
| Requirement pass will lead to executor mutation | `../codecut/references/execution-contract.md` success contract table | Side-effect token, project ID, or required user decision is missing | Executor readback is owned by `codecut-executor-apply` after mutation |

## Stage Ownership

This skill owns only the permission decision for entering Codecut editing
execution. It checks whether user intent is confirmed enough to proceed, records
explicit answers separately from assumptions, and chooses the next stage.

It does not download source media, create executor projects, import media,
write EditPlans, choose clip ranges, apply templates, mutate the timeline, or
verify finished edits. Use `codecut-material-ingest` for material facts and
`codecut-executor-apply` for executor commands after this gate passes.

## Inputs

- User brief and any widget-submitted setup fields.
- Known source path, remote URL, existing project ID, output form, platform,
  aspect ratio, caption policy, business goal, and source ownership details.
- Pending or confirmed requirement draft from
  `open_codecut_requirement_confirmation` / `get_codecut_requirement_confirmation`,
  plus the confirmed setup token from `create_codecut_project_from_requirement`
  when available.

## Outputs

- Gate decision: passed or blocked.
- Confirmed fields, assumptions, missing fields, and next stage.
- For passed creative jobs, a confirmed setup token must be carried to later
  side-effect stages.

## Artifacts

Write explicit answers and gate proof into the Codecut workspace when a
confirmed project ID exists:

- `.codecut-workspace/projects/<projectId>/00-brief/clarification-answers.md`
- `.codecut-workspace/projects/<projectId>/00-brief/assumptions.md`
- `.codecut-workspace/projects/<projectId>/00-brief/requirement-intake.md`

Do not create a skill-local `.artifacts` directory as the primary Codecut
artifact path.

## Stop Conditions

- Two or more key blocking fields are missing.
- The requirement confirmation page path is unavailable and no explicit text
  answers can safely pass the gate.
- A side-effect token is required but missing.

## Handoff

Report `Stage`, `Status`, `Proof`, `Next`, and `Risk`. Hand off to
`codecut-material-ingest` when source facts are still needed, or to
`codecut-executor-apply` only when the source is already in an executor project
and execution is allowed.

## Hard Stop

If two or more key fields are missing, stop and ask. Do not continue with defaults.

Blocked commands before this gate passes:

- `node scripts/codex-bridge.mjs create-project`
- `node scripts/codex-bridge.mjs import-media`
- `node scripts/codex-bridge.mjs transcribe`
- `node scripts/codex-bridge.mjs build-video-context`
- `node scripts/codex-bridge.mjs build-post-cut-captions`
- `node scripts/codex-bridge.mjs apply-plan`
- `node scripts/codecut-workspace.mjs add-assets`
- `node scripts/codecut-workspace.mjs probe-assets`
- `node scripts/codecut-workspace.mjs write-doc`
- bridge tools that mutate timeline state

Allowed before this gate passes:

- read the user request
- inspect an existing project when the user asks for read-only inspection
- call `open_codecut_requirement_confirmation`, open its returned
  `confirmationUrl` in the Codex in-app browser when available, then wait for
  confirmed `get_codecut_requirement_confirmation` readback before calling
  `create_codecut_project_from_requirement`
- ask text-only setup questions only when the requirement confirmation tool is
  unavailable after tool discovery

## Requirement Confirmation First

For new creative jobs with missing setup fields, the plugin startup prompt and
framework router should call the `open_codecut_requirement_confirmation` MCP
tool before this stage skill is loaded through shell. If this skill is already
loaded, call the same tool before sending text-only questions. Pass any known
setup fields from
the user request, such as project name, source path or URL, brief, output form,
platform, aspect ratio, caption language, UI language, and browser preview
intent.

If `open_codecut_requirement_confirmation` is not visible in the current
callable tool surface, use `tool_search` with the query
`open_codecut_requirement_confirmation CodeCut requirement confirmation page`,
then call the returned `mcp__codecut_mcp.open_codecut_requirement_confirmation`
tool.

The web requirement confirmation page is the primary review surface. It must be
opened with the returned `confirmationUrl` in the Codex in-app browser when
browser control is available. Do not rely on an inline MCP App, output
template, or chat card to open the confirmation page. Complete setup fields are
not create-project confirmation. Codex should call
`create_codecut_project_from_requirement` only after the user confirms in the
web page and `get_codecut_requirement_confirmation` reads back
`status: "confirmed"`. The project creation tool returns the confirmed setup
token and unlocks material ingest, doctor checks, import, generated media,
timeline mutation, and export.

If the user reports that clicking the widget create button did not continue the
Codex thread, first check whether the project was created and the pending
confirmation was consumed. When the project exists but the follow-up message did
not reach the thread, call `recover_codecut_setup` with the `projectId` and
`pendingConfirmationId` from the original `open_codecut_workspace` result. Do
not open a second setup widget until recovery proves there is no confirmed
setup result.

If the requirement confirmation tool is unavailable after tool discovery,
report that requirement confirmation is unavailable, then ask the required
text-only questions with choices. Do not run shell commands, write
planning/audit files, initialize a workspace, create, import, transcribe,
generate media, mutate the timeline, or export before confirmed project
creation. If the confirmation page is unavailable, explicit text answers can
pass requirement intake, but they do not mint a side-effect token; report that
CodeCut execution is blocked until the requirement confirmation path is
available.

## Key Fields

Check these fields for every new creative job:

| Field | Blocks when missing? | Why |
| --- | --- | --- |
| Goal | yes | Defines whether this is long-to-short, polish, subtitles, remix, inspection, or export. |
| Source | yes | Determines local file, remote URL, existing project media, or manual import. |
| Output form | yes | Separates Codecut timeline preview, local MP4, both, or source download only. |
| Platform / destination | yes when aspect ratio or style depends on it | Prevents defaulting every short to TikTok/Reels/Shorts. |
| Aspect ratio | yes when not implied by platform | Prevents accidental 9:16 crop. |
| Duration | no if user gave a target | `1 minute` is sufficient for duration. |
| Caption policy | yes when speech/subtitles are relevant | Prevents overlapping new captions with burned-in subtitles. |
| Opening cover image | no | Widget defaults this to recommended on except full-source duration preservation, where it defaults off. Full-source duration preservation with full-source coverage cannot enable a timeline opening cover image. A top fixed title is not an opening cover image. The confirmed intent must preserve `generateIntroCover` as `true` or `false`. |
| Video type | yes when style or selection depends on it | Prevents wrong selection strategy. |
| Editing style | yes when output quality depends on it | Prevents arbitrary pacing. |
| Business intent | yes for ads/conversion/offers | Prevents invented claims. |

## Remote URL Rule

A remote URL is not the same as the local-file fast path.

For YouTube or other remote URLs in a new creative job, confirm output form,
platform, aspect ratio, and caption policy through the widget before download,
probe, workspace asset filing, or timeline mutation.

For TikTok video URLs, photo URLs, share links, author pages, or `@handle`
inputs, use `codecut-tiktok-downloader` for source acquisition only after the
required widget and intent gates pass, unless the user explicitly requested
source-only download with no editing, timeline, template, or export intent.
TikTok download success does not pass requirement intake and does not permit
executor mutation commands.

## Required Question Format

Ask at most five questions. Each question must provide choices and exactly one recommended option.

Use this order:

1. Output form
2. Platform / destination
3. Aspect ratio
4. Caption policy
5. Editing style or business intent

## Default Choices

Output form:

```text
1. 你要的最终交付是什么？
   A. CodeCut 编辑器预览和时间线验证 (Recommended) - fastest path and matches current verified executor workflow.
   B. 本地 MP4 文件 - requires export path verification before claiming completion.
   C. 两者都要 - timeline first, export second.
   D. 只下载源视频 - no editing timeline needed.
```

Platform / destination:

```text
2. 发布平台按哪个来？
   A. TikTok/Reels/Shorts (Recommended) - short-form reach and vertical layout.
   B. YouTube horizontal - preserves source composition.
   C. Internal preview only - avoids platform-specific styling.
   D. Other/custom - specify platform and constraints.
```

Aspect ratio:

```text
3. 画幅按哪个来？
   A. Vertical 9:16 (Recommended for TikTok/Reels/Shorts) - short-form native, but may crop horizontal UI.
   B. Horizontal 16:9 - preserves the source frame.
   C. Square 1:1 - feed-safe compromise.
   D. Source aspect/custom - specify exact dimensions.
```

Caption policy:

```text
4. 字幕策略按哪个来？
   A. Post-cut captions from edited audio (Recommended for talking videos) - best alignment after cuts.
   B. Preserve existing burned-in captions - avoids overlap when the source already has subtitles.
   C. No new captions - clean visual result.
   D. Translate captions/custom - specify target language and style.
```

Editing style:

```text
5. 剪辑风格按哪个来？
   A. Fast-cut creator-native (Recommended) - stronger short-form retention.
   B. Clean tutorial - clearer for demos and screen recordings.
   C. Documentary soft - calmer narrative pacing.
   D. Other/custom - provide a reference or style description.
```

Opening cover image:

```text
生成开头封面图？
A. 生成开头封面图 (Recommended) - uses the final first clip frame as evidence, then places the generated image at the start.
B. 不生成 - starts directly from the first selected video clip.
```

## File Rules

- `clarification-answers.md` may contain only explicit user answers.
- `assumptions.md` contains agent assumptions and safe defaults.
- `requirement-intake.md` records missing fields, blocking decision, questions asked, and whether the gate passed.
- Never write `No blocking clarification was required` unless the request explicitly provided all blocking fields or only one non-blocking field is missing.

## Pass Output

When the gate passes, report:

```text
Requirement intake: passed
Confirmed fields: <list>
Assumptions: <list, if any>
Next stage: <codecut-material-ingest|codecut-reference-template|codecut-executor-apply>
```

When blocked and the workspace widget tool is unavailable, report only the
questions and do not run executor commands.

## Common Mistakes

| Mistake | Correct behavior |
| --- | --- |
| Treating "1 分钟短片" as TikTok 9:16 | Ask platform and aspect ratio unless user said vertical/shorts. |
| Writing assumptions into `clarification-answers.md` | Write assumptions into `assumptions.md`; answers are only user-provided. |
| Treating YouTube URL as local-file fast path | Use remote URL rule and confirm output form before mutation. |
| Asking open-ended questions | Provide concrete choices and one recommended option. |
| Continuing because defaults seem safe | Stop when two or more blocking fields are missing. |
