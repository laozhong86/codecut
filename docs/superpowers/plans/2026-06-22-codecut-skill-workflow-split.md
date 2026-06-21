# Codecut Skill Workflow Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the overloaded Codecut editing skill into a lean router plus focused stage skills, starting with a hard requirement-intake gate that prevents agents from treating assumptions as user confirmation.

**Architecture:** Keep `codecut-jianying-editor-framework` as the public plugin entrypoint for compatibility, but shrink it into a routing and gatekeeping skill. Move stage-specific behavior into focused sibling skills under `skills/`, and keep long command/schema details in references. Add a pressure-test regression for the exact failure: YouTube URL plus "1 minute short" must ask for platform/aspect/output before execution.

**Tech Stack:** Codex skills, Markdown `SKILL.md`, plugin skill discovery through `.codex-plugin/plugin.json`, existing `scripts/sync-codex-local-plugin.mjs`, existing `quick_validate.py` skill validator.

---

## File Structure

**Modify:**
- `skills/codecut-jianying-editor-framework/SKILL.md`  
  Convert from a long execution manual into the router and non-negotiable gate list.
- `skills/codecut-jianying-editor-framework/agents/openai.yaml`  
  Shorten the default prompt so it routes through stage skills instead of encouraging direct execution.
- `skills/codecut-jianying-editor-framework/references/pressure-tests.md`  
  Add a regression pressure scenario for YouTube URL plus missing platform/aspect/output.

**Create:**
- `skills/codecut-requirement-intake/SKILL.md`  
  New mandatory stage skill for requirement confirmation.
- `skills/codecut-requirement-intake/agents/openai.yaml`  
  UI metadata for the new skill.
- `skills/codecut-requirement-intake/references/pressure-tests.md`  
  Focused pressure tests for assumptions vs user answers.
- `skills/codecut-material-ingest/SKILL.md`  
  Stage skill for local file and URL material intake, workspace init, asset filing, and ffprobe audit.
- `skills/codecut-executor-apply/SKILL.md`  
  Stage skill for service gate, env, doctor, import, apply, and timeline readback.

**Defer:**
- `skills/codecut-edit-planning/SKILL.md`  
  Defer until the P0 gate is stable. Current recipes can remain references.
- `skills/codecut-verification-export/SKILL.md`  
  Defer until export policy is ready to harden separately.

---

### Task 1: Add The Failing Pressure Case

**Files:**
- Modify: `skills/codecut-jianying-editor-framework/references/pressure-tests.md`

- [ ] **Step 1: Add the RED scenario to the pressure-test reference**

Append this exact section after the existing tests:

```markdown
## Test 7: URL Short Requires Requirement Intake

Prompt:

```text
[@codecut](plugin://codecut@local-opc) 提取 视频 https://www.youtube.com/watch?v=SVBH_kmPSwI 到本地 将视频剪辑为 1 分钟的短片
```

Expected route:

- Intent: new creative job from a remote URL.
- First required stage: `codecut-requirement-intake`.
- Allowed before confirmation: URL reachability check and material metadata/download audit only when needed to ask better questions.
- Blocked before confirmation: `create-project`, `import-media`, `transcribe`, `build-video-context`, `apply-plan`.

Pass criteria:

- Counts missing fields before execution.
- Identifies at least these missing fields: publish platform, aspect ratio, output form, caption policy.
- Asks a compact numbered list with concrete options and exactly one recommended option per question.
- Writes agent assumptions only to `assumptions.md`, never to `clarification-answers.md`.
- Does not claim `No blocking clarification was required`.

Fail signals:

- Defaults to TikTok/Reels/Shorts without asking.
- Defaults to vertical 9:16 without asking.
- Treats a YouTube URL as the same as an absolute local file fast path.
- Writes assumed values into `clarification-answers.md`.
- Starts Codecut executor commands before requirement intake passes.
```

- [ ] **Step 2: Run a text check**

Run:

```bash
rg -n "URL Short Requires Requirement Intake|No blocking clarification|clarification-answers" skills/codecut-jianying-editor-framework/references/pressure-tests.md
```

Expected:

```text
skills/codecut-jianying-editor-framework/references/pressure-tests.md:<line>:## Test 7: URL Short Requires Requirement Intake
skills/codecut-jianying-editor-framework/references/pressure-tests.md:<line>:- Does not claim `No blocking clarification was required`.
skills/codecut-jianying-editor-framework/references/pressure-tests.md:<line>:- Writes assumed values into `clarification-answers.md`.
```

- [ ] **Step 3: Commit**

```bash
git add skills/codecut-jianying-editor-framework/references/pressure-tests.md
git commit -m "test: add codecut requirement intake pressure case"
```

---

### Task 2: Create The Requirement Intake Skill

**Files:**
- Create: `skills/codecut-requirement-intake/SKILL.md`
- Create: `skills/codecut-requirement-intake/agents/openai.yaml`
- Create: `skills/codecut-requirement-intake/references/pressure-tests.md`

- [ ] **Step 1: Create the skill directory**

Run:

```bash
mkdir -p skills/codecut-requirement-intake/agents skills/codecut-requirement-intake/references
```

Expected: command exits with status `0`.

- [ ] **Step 2: Write `SKILL.md`**

Create `skills/codecut-requirement-intake/SKILL.md` with this content:

```markdown
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

When blocked, report only the questions and do not run executor commands.

## Common Mistakes

| Mistake | Correct behavior |
| --- | --- |
| Treating "1 分钟短片" as TikTok 9:16 | Ask platform and aspect ratio unless user said vertical/shorts. |
| Writing assumptions into `clarification-answers.md` | Write assumptions into `assumptions.md`; answers are only user-provided. |
| Treating YouTube URL as local-file fast path | Use remote URL rule and confirm output form before mutation. |
| Asking open-ended questions | Provide concrete choices and one recommended option. |
| Continuing because defaults seem safe | Stop when two or more blocking fields are missing. |
```

- [ ] **Step 3: Write `agents/openai.yaml`**

Create `skills/codecut-requirement-intake/agents/openai.yaml`:

```yaml
interface:
  display_name: Codecut Requirement Intake
  short_description: Confirms platform, aspect ratio, output form, captions, and business intent before Codecut editing execution.
  default_prompt: Use $codecut-requirement-intake before any new Codecut creative editing job. Do not run Codecut executor mutation commands until requirement intake passes.
```

- [ ] **Step 4: Write focused pressure tests**

Create `skills/codecut-requirement-intake/references/pressure-tests.md`:

```markdown
# Codecut Requirement Intake Pressure Tests

## Test 1: YouTube URL One-Minute Short

Prompt:

```text
提取 视频 https://www.youtube.com/watch?v=SVBH_kmPSwI 到本地 将视频剪辑为 1 分钟的短片
```

Pass:

- Ask output form, platform, aspect ratio, and caption policy before executor mutation.
- Do not default to TikTok/Reels/Shorts.
- Do not default to 9:16.
- Do not write assumptions as answers.

Fail:

- Runs `create-project`, `import-media`, `transcribe`, or `apply-plan`.
- Says "No blocking clarification was required".

## Test 2: Explicit Vertical Local File

Prompt:

```text
把 /absolute/path/source.mp4 剪成 1 分钟 9:16 TikTok 短视频，只要 CodeCut 预览，不用导出。
```

Pass:

- Requirement intake passes without asking platform, aspect ratio, duration, or output form again.
- May ask caption policy only if it changes the result.

Fail:

- Re-asks already specified fields.
- Starts applying plan before material audit when source material is new.
```

- [ ] **Step 5: Validate the new skill**

Run:

```bash
python3 /Users/x/.agents/skills/_langfuse-src/.cursor/skills/skill-creator/scripts/quick_validate.py /Users/x/Desktop/Project/OPC/社媒运营/plugins/cutia/skills/codecut-requirement-intake
```

Expected: validation exits with status `0`.

- [ ] **Step 6: Commit**

```bash
git add skills/codecut-requirement-intake
git commit -m "feat: add codecut requirement intake skill"
```

---

### Task 3: Convert Main Skill Into A Router

**Files:**
- Modify: `skills/codecut-jianying-editor-framework/SKILL.md`
- Modify: `skills/codecut-jianying-editor-framework/agents/openai.yaml`

- [ ] **Step 1: Replace the main skill body with a router**

Rewrite `skills/codecut-jianying-editor-framework/SKILL.md` to keep the same frontmatter name and description, then use this body:

```markdown
---
name: codecut-jianying-editor-framework
description: Use when operating or extending the Codex-only Codecut editing MVP, including local executor projects, material intake, EditPlan validation/application, timeline verification, or human preview.
---

# Codecut Jianying Editor Framework

## Core Boundary

Codecut is a local deterministic executor plus browser preview. Codex is the only LLM and agent layer.

The local executor draft and `get_timeline_state` are proof. EditPlans are intent. Browser preview is for the human user, not the agent runtime.

## Required Stage Routing

For every request, choose one path before running commands:

| Request shape | Required stage |
| --- | --- |
| New creative job, new source material, remote URL, local media path, "make a short", "剪辑", "提取到本地" | **REQUIRED SUB-SKILL:** Use `codecut-requirement-intake` first. |
| Source needs download, file copy, workspace init, or ffprobe audit | **REQUIRED SUB-SKILL:** Use `codecut-material-ingest`. |
| Transcript, VideoContext, candidate clips, decision ledger, or EditPlan authoring | Use `references/editing-intent-router.md` and exactly one workflow recipe. |
| Executor service, env, doctor, import, apply, caption build, timeline readback | **REQUIRED SUB-SKILL:** Use `codecut-executor-apply`. |
| Existing project inspection or export readiness | Use `references/workflow-recipes/timeline-inspection.md`. |
| Implementation work inside Codecut code | Inspect current contract first, then write focused tests before edits. |

## Non-Negotiable Gates

Requirement intake must pass before mutation for new creative jobs.

Blocked before requirement intake passes:

- `create-project`
- `import-media`
- `transcribe`
- `build-video-context`
- `build-post-cut-captions`
- `apply-plan`
- `apply_edit_plan`
- timeline mutation bridge tools

Allowed before requirement intake passes:

- read-only investigation
- material reachability checks
- local source download/probe when explicitly requested or needed for material audit
- writing `intent-analysis.md`, `clarification-questions.md`, `assumptions.md`, and material audit files

## Current Runtime Rules

- Use only `CODECUT_AGENT_BRIDGE_*` env keys.
- Load bridge env from `apps/web/.env.local` when needed.
- Use `http://127.0.0.1:4100`; do not switch ports.
- Run `doctor-install` and `doctor` before business executor commands.
- Do not depend on browser-mounted heartbeat for command execution.
- Do not use FFmpeg, shell scripts, or overlay rendering as the Codecut editing path for cuts or subtitle burn-in.

## Planning References

Read only what matches the task:

- Current workflow: `../../docs/codex-driven-editing.md`
- Workspace spec: `../../docs/codecut-workspace.md`
- Intent router: `references/editing-intent-router.md`
- Long-to-short: `references/workflow-recipes/long-to-short.md`
- Talking-head polish: `references/workflow-recipes/talking-head-polish.md`
- Subtitle pass: `references/workflow-recipes/subtitle-pass.md`
- Voiceover remix: `references/workflow-recipes/voiceover-remix.md`
- Timeline inspection: `references/workflow-recipes/timeline-inspection.md`
- EditPlan schema: `references/edit-plan-schema.md`

## Completion Standard

For editing execution, completion requires:

- successful validator/application result
- `get_timeline_state` readback
- expected track, element, duration, trim range, and media source proof
- editor URL for human preview
- explicit statement when MP4 export was not produced

Do not report a local MP4 unless a verified export path produced it.
```

- [ ] **Step 2: Shorten the plugin-facing default prompt**

Replace `skills/codecut-jianying-editor-framework/agents/openai.yaml` with:

```yaml
interface:
  display_name: Codecut Jianying Editor Framework
  short_description: Routes Codecut editing jobs through requirement intake, material ingest, executor apply, and timeline verification.
  default_prompt: Use $codecut-jianying-editor-framework as the router. For any new creative editing job or remote URL, use $codecut-requirement-intake before Codecut executor mutation commands. Verify execution with get_timeline_state before reporting completion.
```

- [ ] **Step 3: Validate the main skill**

Run:

```bash
python3 /Users/x/.agents/skills/_langfuse-src/.cursor/skills/skill-creator/scripts/quick_validate.py /Users/x/Desktop/Project/OPC/社媒运营/plugins/cutia/skills/codecut-jianying-editor-framework
```

Expected: validation exits with status `0`.

- [ ] **Step 4: Commit**

```bash
git add skills/codecut-jianying-editor-framework/SKILL.md skills/codecut-jianying-editor-framework/agents/openai.yaml
git commit -m "refactor: turn codecut skill into router"
```

---

### Task 4: Create Material Ingest Stage Skill

**Files:**
- Create: `skills/codecut-material-ingest/SKILL.md`

- [ ] **Step 1: Create directory**

Run:

```bash
mkdir -p skills/codecut-material-ingest
```

Expected: command exits with status `0`.

- [ ] **Step 2: Write `SKILL.md`**

Create `skills/codecut-material-ingest/SKILL.md`:

```markdown
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
```

- [ ] **Step 3: Validate**

Run:

```bash
python3 /Users/x/.agents/skills/_langfuse-src/.cursor/skills/skill-creator/scripts/quick_validate.py /Users/x/Desktop/Project/OPC/社媒运营/plugins/cutia/skills/codecut-material-ingest
```

Expected: validation exits with status `0`.

- [ ] **Step 4: Commit**

```bash
git add skills/codecut-material-ingest
git commit -m "feat: add codecut material ingest skill"
```

---

### Task 5: Create Executor Apply Stage Skill

**Files:**
- Create: `skills/codecut-executor-apply/SKILL.md`

- [ ] **Step 1: Create directory**

Run:

```bash
mkdir -p skills/codecut-executor-apply
```

Expected: command exits with status `0`.

- [ ] **Step 2: Write `SKILL.md`**

Create `skills/codecut-executor-apply/SKILL.md`:

```markdown
---
name: codecut-executor-apply
description: Use when a confirmed Codecut editing plan is ready for local executor commands, including service readiness, bridge env, doctor checks, media import, transcription, EditPlan application, caption build, and get_timeline_state verification.
---

# Codecut Executor Apply

## Core Rule

Executor apply mutates Codecut state. Use it only after requirement intake passes for new creative jobs.

## Runtime Gate

Use the fixed MVP origin:

```bash
curl -fsS -o /dev/null http://127.0.0.1:4100/en/projects
```

If unavailable:

```bash
bun run dev:web
```

Do not switch ports.

## Bridge Env

From plugin root:

```bash
set -a
source apps/web/.env.local
set +a
```

Required keys:

- `CODECUT_AGENT_BRIDGE_URL`
- `CODECUT_AGENT_BRIDGE_TOKEN`
- `CODECUT_AGENT_BRIDGE_TIMEOUT_MS`
- `CODECUT_AGENT_BRIDGE_INTERVAL_MS`

Do not print token values.

## Required Command Order

```bash
node scripts/codex-bridge.mjs create-project --project-id <id> --name "<business project name>"
node scripts/codex-bridge.mjs doctor-install --project-id <id>
node scripts/codex-bridge.mjs doctor --project-id <id>
node scripts/codex-bridge.mjs send --project-id <id> --tool get_project_info --args-json '{}'
node scripts/codex-bridge.mjs send --project-id <id> --tool list_media_assets --args-json '{}'
```

Import only when needed:

```bash
node scripts/codex-bridge.mjs import-media --project-id <id> --file-path /absolute/path/source.mp4
```

Apply a strict implemented EditPlan:

```bash
node scripts/codex-bridge.mjs apply-plan --project-id <id> --plan-json-file /absolute/path/edit-plan.json --replace-existing true
```

Verify:

```bash
node scripts/codex-bridge.mjs send --project-id <id> --tool get_timeline_state --args-json '{}'
```

## Failure Rule

Do not continue after `doctor-install`, `doctor`, `import-media`, `transcribe`, `build-post-cut-captions`, `apply-plan`, or `get_timeline_state` fails. Fix the failing gate first.

## Completion

Report:

- project ID
- editor URL
- revision
- track count
- clip count
- caption count
- total duration
- source media IDs
- whether MP4 export was produced

Do not claim MP4 export unless a verified export path produced it.
```

- [ ] **Step 3: Validate**

Run:

```bash
python3 /Users/x/.agents/skills/_langfuse-src/.cursor/skills/skill-creator/scripts/quick_validate.py /Users/x/Desktop/Project/OPC/社媒运营/plugins/cutia/skills/codecut-executor-apply
```

Expected: validation exits with status `0`.

- [ ] **Step 4: Commit**

```bash
git add skills/codecut-executor-apply
git commit -m "feat: add codecut executor apply skill"
```

---

### Task 6: Sync Plugin Cache And Run Discovery Validation

**Files:**
- No source edits expected.

- [ ] **Step 1: Run plugin sync**

Run:

```bash
node scripts/sync-codex-local-plugin.mjs
```

Expected: output reports synced or no-op success.

- [ ] **Step 2: Confirm installed skill files exist**

Run:

```bash
test -f /Users/x/.codex/plugins/cache/local-opc/codecut/0.1.1/skills/codecut-requirement-intake/SKILL.md
test -f /Users/x/.codex/plugins/cache/local-opc/codecut/0.1.1/skills/codecut-material-ingest/SKILL.md
test -f /Users/x/.codex/plugins/cache/local-opc/codecut/0.1.1/skills/codecut-executor-apply/SKILL.md
```

Expected: all commands exit with status `0`.

- [ ] **Step 3: Check source and cache match**

Run:

```bash
diff -qr skills/codecut-requirement-intake /Users/x/.codex/plugins/cache/local-opc/codecut/0.1.1/skills/codecut-requirement-intake
diff -qr skills/codecut-material-ingest /Users/x/.codex/plugins/cache/local-opc/codecut/0.1.1/skills/codecut-material-ingest
diff -qr skills/codecut-executor-apply /Users/x/.codex/plugins/cache/local-opc/codecut/0.1.1/skills/codecut-executor-apply
```

Expected: no output.

- [ ] **Step 4: Commit sync-related source changes only if sync script modified tracked files**

Run:

```bash
git status --short
```

Expected: only intended source files are changed. If no tracked files changed, do not commit.

---

### Task 7: Manual Pressure Review

**Files:**
- No source edits expected unless the pressure review exposes a gap.

- [ ] **Step 1: Run the regression prompt manually in a fresh Codex thread**

Prompt:

```text
[@codecut](plugin://codecut@local-opc) 提取 视频 https://www.youtube.com/watch?v=SVBH_kmPSwI 到本地 将视频剪辑为 1 分钟的短片
```

Expected first behavior:

```text
使用 codecut-jianying-editor-framework 路由。
使用 codecut-requirement-intake。
提出输出形式、平台、画幅、字幕策略问题。
未运行 create-project/import-media/transcribe/apply-plan。
```

- [ ] **Step 2: Inspect for known fail signals**

Fail if the agent says any of:

```text
No blocking clarification was required
默认 TikTok/Reels/Shorts
默认 9:16
我会直接创建项目
```

- [ ] **Step 3: If it fails, patch only the smallest skill text that caused the loophole**

Allowed patch targets:

```text
skills/codecut-jianying-editor-framework/SKILL.md
skills/codecut-requirement-intake/SKILL.md
skills/codecut-jianying-editor-framework/agents/openai.yaml
```

Do not add new stages during this task.

- [ ] **Step 4: Validate again after any patch**

Run:

```bash
python3 /Users/x/.agents/skills/_langfuse-src/.cursor/skills/skill-creator/scripts/quick_validate.py /Users/x/Desktop/Project/OPC/社媒运营/plugins/cutia/skills/codecut-jianying-editor-framework
python3 /Users/x/.agents/skills/_langfuse-src/.cursor/skills/skill-creator/scripts/quick_validate.py /Users/x/Desktop/Project/OPC/社媒运营/plugins/cutia/skills/codecut-requirement-intake
```

Expected: both validations exit with status `0`.

- [ ] **Step 5: Commit any pressure-review fix**

```bash
git add skills/codecut-jianying-editor-framework skills/codecut-requirement-intake
git commit -m "fix: harden codecut requirement intake routing"
```

---

## Self-Review

**Spec coverage:**  
This plan covers skill diagnosis outcome, staged split, P0 requirement confirmation, router retention for compatibility, pressure regression, plugin cache sync, and validation.

**Placeholder scan:**  
No `TBD`, `TODO`, or "implement later" placeholders are used. Deferred future stages are explicitly out of scope for this implementation batch.

**Type and path consistency:**  
All new skill names use lowercase letters and hyphens. All referenced files live under `skills/` or `docs/superpowers/plans/`. Existing plugin entrypoint `codecut-jianying-editor-framework` remains intact.

---

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-06-22-codecut-skill-workflow-split.md`.

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
