---
name: codecut-requirement-intake
description: Use when a Codecut editing request starts a new creative job, uses new source material, uses a remote URL, asks for a short/video edit, or lacks platform, aspect ratio, output form, caption policy, business goal, or source ownership details.
---

# Codecut Requirement Intake

## Core Rule

Requirement intake is a blocking gate for new Codecut editing jobs.

Before `create-project`, `import-media`, `transcribe`, `build-video-context`, `apply-plan`, or `apply_edit_plan`, classify the request and decide whether the user's intent is confirmed enough to execute.

## Hard Stop

If two or more key fields are missing, stop and ask. Do not continue with defaults.

Blocked commands before this gate passes:

- `node scripts/codex-bridge.mjs create-project`
- `node scripts/codex-bridge.mjs import-media`
- `node scripts/codex-bridge.mjs transcribe`
- `node scripts/codex-bridge.mjs build-video-context`
- `node scripts/codex-bridge.mjs build-post-cut-captions`
- `node scripts/codex-bridge.mjs apply-plan`
- bridge tools that mutate timeline state

Allowed before this gate passes:

- read the user request
- inspect an existing project when the user asks for read-only inspection
- verify whether a source file path exists
- download or probe remote material only when the user explicitly asked to extract it locally or the material facts are needed to ask useful questions
- write `intent-analysis.md`, `clarification-questions.md`, `assumptions.md`, and material audit files

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
| Video type | yes when style or selection depends on it | Prevents wrong selection strategy. |
| Editing style | yes when output quality depends on it | Prevents arbitrary pacing. |
| Business intent | yes for ads/conversion/offers | Prevents invented claims. |

## Remote URL Rule

A remote URL is not the same as the local-file fast path.

For YouTube or other remote URLs, confirm output form, platform, aspect ratio, and caption policy before timeline mutation. Download/probe can happen first only when it improves material audit or the user explicitly requested local extraction.

## Required Question Format

Ask exactly one blocking question per assistant turn. Do not list a full intake form.

Use this channel order:

1. If Codex `request_user_input` is available, call it with exactly one question for the next missing field, 2-3 mutually exclusive choices, and exactly one recommended option. Put the recommended option first and suffix its label with `(Recommended)`.
2. After calling `request_user_input`, stop and wait for the answer. Do not also print duplicate natural-language questions, numbered lists, or "please answer these items" text in the same turn.
3. If `request_user_input` is unavailable in the current Codex mode, ask the same single question in natural language with the same choices, then stop.
4. On the next user answer, record only the explicit answer, recalculate missing fields, and ask the next highest-priority blocking question if the gate is still blocked.

Do not include a fixed "Other/custom" option when using `request_user_input`; the Codex client supplies a free-form path. In natural-language fallback, the user may answer with custom constraints directly.

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
```

Platform / destination:

```text
2. 发布平台按哪个来？
   A. TikTok/Reels/Shorts (Recommended) - short-form reach and vertical layout.
   B. YouTube horizontal - preserves source composition.
   C. Internal preview only - avoids platform-specific styling.
```

Aspect ratio:

```text
3. 画幅按哪个来？
   A. Vertical 9:16 (Recommended for TikTok/Reels/Shorts) - short-form native, but may crop horizontal UI.
   B. Horizontal 16:9 - preserves the source frame.
   C. Source aspect - preserves the source frame.
```

Caption policy:

```text
4. 字幕策略按哪个来？
   A. Post-cut captions from edited audio (Recommended for talking videos) - best alignment after cuts.
   B. Preserve existing burned-in captions - avoids overlap when the source already has subtitles.
   C. No new captions - clean visual result.
```

Editing style:

```text
5. 剪辑风格按哪个来？
   A. Fast-cut creator-native (Recommended) - stronger short-form retention.
   B. Clean tutorial - clearer for demos and screen recordings.
   C. Documentary soft - calmer narrative pacing.
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
Next stage: <material-ingest|edit-planning|executor-apply|timeline-inspection>
```

When blocked, ask only the next required question and do not run executor commands.

## Common Mistakes

| Mistake | Correct behavior |
| --- | --- |
| Treating "1 分钟短片" as TikTok 9:16 | Ask platform and aspect ratio unless user said vertical/shorts. |
| Writing assumptions into `clarification-answers.md` | Write assumptions into `assumptions.md`; answers are only user-provided. |
| Treating YouTube URL as local-file fast path | Use remote URL rule and confirm output form before mutation. |
| Asking open-ended questions | Provide concrete choices and one recommended option. |
| Asking a five-question checklist | Ask one field per turn and wait for the answer. |
| Printing questions after calling `request_user_input` | The tool call is the question UI; stop after the tool call. |
| Continuing because defaults seem safe | Stop when two or more blocking fields are missing. |
