# CodeCut Agent Visual Production Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition CodeCut as `Codex + CapCut`, an Agent-driven visual video production system that absorbs OpenMontage Agent engineering and OpenCut/CapCut visual editing patterns.

**Architecture:** This is a documentation-only implementation. Add three product/architecture documents, then update existing entry documents so product positioning leads and current executor contracts remain as implementation truth underneath. Do not change runtime behavior, MCP schemas, executor code, editor UI, or skill routing logic.

**Tech Stack:** Markdown documentation, CodeCut skill Markdown files, `.codex-plugin/plugin.json`, existing repository scripts (`bun run plugin:freshness`, `bun run test`, `git diff --check`).

---

## File Structure

- Create `docs/codecut-product-positioning.md`
  - User-facing and product-facing positioning.
  - Explains `CodeCut = Codex + CapCut`.
  - Explains what CodeCut is, what it is not, and why visual collaboration matters.

- Create `docs/codecut-agent-visual-production-architecture.md`
  - Internal architecture map.
  - Defines pipeline, skills, tools, artifacts, checkpoints, visual editor, timeline delivery, and quality layers.
  - Links current CodeCut surfaces to the target architecture.

- Create `docs/openmontage-to-codecut-adaptation.md`
  - Reference-adaptation blueprint.
  - Maps OpenMontage pipeline, skill, tool, artifact, checkpoint, and QA ideas into CodeCut.
  - States what to preserve, what to adapt, and what not to copy.

- Modify `docs/codex-driven-editing.md`
  - Reposition it as the current execution contract.
  - Keep fail-fast, readback, EditPlan, executor, and export rules intact.
  - Add links to the new product and architecture docs.

- Modify `docs/codecut-workspace.md`
  - Reposition the workspace as the production artifact and checkpoint record.
  - Keep existing folder structure and CLI behavior intact.
  - Add language connecting workspace artifacts to the Agent production process.

- Modify `skills/codecut/SKILL.md`
  - Change the entry skill opening from a technical-only boundary to a product-first boundary.
  - Keep router responsibilities and non-negotiable gates intact.

- Modify `skills/codecut/references/workflow-stage-contract.md`
  - Reposition the stage contract as the Agent production pipeline map.
  - Keep current stage table and runtime truth intact.

- Modify `.codex-plugin/plugin.json`
  - Update description, short description, long description, capabilities, and default prompts to reflect `Codex + CapCut`.
  - Keep plugin name, version, paths, icons, and brand color unchanged.

## Task 1: Add Product Positioning Document

**Files:**
- Create: `docs/codecut-product-positioning.md`
- Verify: `docs/superpowers/specs/2026-06-28-codecut-agent-visual-production-design.md`

- [ ] **Step 1: Create the product positioning document**

Create `docs/codecut-product-positioning.md` with this Markdown structure and content:

```markdown
# CodeCut Product Positioning

## One Sentence

CodeCut = Codex + CapCut.

CodeCut is an Agent-driven visual video production system: Codex or another
external Agent performs the video production work, while CodeCut provides the
visual editor where users can see progress, inspect materials, preview the
timeline, manually adjust the result, and export the finished video.

## Plain-Language Product Definition

CodeCut gives a video production Agent a visual editing workspace.

Without CodeCut, an Agent can produce scripts, files, plans, or a final MP4, but
the user often cannot see the production process or easily take over the edit.
With CodeCut, the Agent works inside a visible editing project. Materials appear
in the media library, generated assets become project assets, selected clips
land on the timeline, captions stay editable, previews are visible, and the user
can manually adjust the result before export.

The product goal is higher-quality video output that better matches user intent,
because the Agent follows an engineered production workflow and the human user
can stay in control through a familiar visual editor.

## What CodeCut Solves

CodeCut solves the gap between black-box AI video generation and manual editing.

Black-box AI video generation can create a file, but it often hides the
decisions and makes refinement hard. Manual editors give control, but the user
must do repetitive work: importing assets, finding clips, adding captions,
arranging the timeline, checking quality, and exporting.

CodeCut combines both sides:

- The Agent handles repetitive and reasoning-heavy production work.
- The editor makes the work visible and editable.
- The workspace records artifacts and evidence so the result can be reviewed,
  corrected, and continued.

## Core User Value

- Users can ask for an outcome instead of manually executing every GUI step.
- The Agent can understand requirements, analyze materials, draft scripts,
  create or select assets, plan the edit, build the timeline, and check quality.
- Users can watch progress and inspect evidence instead of waiting for a
  black-box result.
- Users can interrupt, correct, manually adjust, and continue.
- The final result is an editable project before it is an exported file.
- Every major production decision can be traced to requirements, material facts,
  transcript evidence, visual proof, or a process artifact.

## Reference Systems

CodeCut absorbs two systems:

- OpenMontage is the Agent engineering reference. It contributes pipeline
  manifests, stage director skills, tool capability discovery, artifacts,
  checkpoints, approval gates, and quality review.
- OpenCut / CapCut are the visual editing references. They contribute the
  familiar media library, timeline, preview, manual adjustment, and export
  surface.

CodeCut is the integration product: Agent video production plus a visual editing
workspace.

## What CodeCut Is Not

CodeCut is not only a deterministic local executor. The executor is an internal
reliability layer that turns Agent decisions into safe, editable timeline state.
It is not the product identity.

CodeCut is not a black-box video generator. A generator gives a file. CodeCut
gives a project, a production record, an editable timeline, preview, manual
control, and export.

CodeCut is not a normal editor with a chat panel. The Agent is not a small side
assistant. The Agent drives the production workflow; the editor makes that work
visible and controllable.

CodeCut is not a CapCut clone. `Codex + CapCut` is a positioning shortcut: Agent
production intelligence plus a familiar visual editing surface.

## Product Boundary

The product boundary is:

```text
User goal
  -> Agent production workflow
  -> visible project workspace
  -> editable timeline
  -> preview and manual adjustment
  -> verified export when requested
```

Current implementation contracts still matter. Runtime tools must keep clear
schemas, fail-fast behavior, timeline readback, and export proof. Those rules
exist to support the product promise: users can trust, inspect, and continue the
Agent's work.

## Documentation Map

- `docs/codecut-agent-visual-production-architecture.md` explains the internal
  layered architecture.
- `docs/openmontage-to-codecut-adaptation.md` explains how OpenMontage patterns
  map into CodeCut.
- `docs/codex-driven-editing.md` remains the current execution contract for the
  implemented local executor, EditPlan, readback, and export path.
- `docs/codecut-workspace.md` explains the local project workspace and process
  artifacts.
```

- [ ] **Step 2: Verify product positioning keywords**

Run:

```bash
rg -n "CodeCut = Codex \\+ CapCut|Agent-driven visual video production|OpenMontage|OpenCut|CapCut" docs/codecut-product-positioning.md
```

Expected: the command prints matches for all four positioning themes.

- [ ] **Step 3: Commit Task 1**

Run:

```bash
git add docs/codecut-product-positioning.md
git commit -m "docs: add codecut product positioning"
```

Expected: commit succeeds with only `docs/codecut-product-positioning.md`.

## Task 2: Add Agent Visual Production Architecture Document

**Files:**
- Create: `docs/codecut-agent-visual-production-architecture.md`
- Read: `docs/codecut-product-positioning.md`
- Read: `docs/codecut-workspace.md`
- Read: `skills/codecut/references/workflow-stage-contract.md`

- [ ] **Step 1: Create the architecture document**

Create `docs/codecut-agent-visual-production-architecture.md` with this Markdown structure and content:

```markdown
# CodeCut Agent Visual Production Architecture

## Purpose

This document explains CodeCut's target product architecture after the product
positioning shift:

```text
CodeCut = Codex + CapCut
```

CodeCut is an Agent-driven visual video production system. The Agent performs
the production workflow. CodeCut makes that workflow visible and editable
through a local visual editor.

## Architecture Summary

```text
User goal
  -> Agent production pipeline
  -> Stage skills
  -> Tool capabilities
  -> Process artifacts
  -> Checkpoints and approvals
  -> Visual editor state
  -> Editable timeline
  -> Preview, manual adjustment, export
  -> Quality and delivery proof
```

Each layer has one responsibility. Pipeline and skills decide what should
happen. Tools perform concrete capabilities. Artifacts preserve evidence and
handoff state. The editor shows the work. The timeline carries the editable
result. Quality proof makes completion trustworthy.

## 1. User Goal Layer

The user goal layer captures what the user wants, not how CodeCut will execute
it.

Examples:

- Turn a long video into a 60-second vertical short.
- Make a product proof ad from raw clips.
- Use a reference style on new material.
- Create a tutorial demo with captions and clear steps.
- Prepare a project for preview and export.

Success is measured by whether the final video matches the user's outcome, not
whether a specific internal tool was called.

## 2. Agent Production Pipeline Layer

The Agent production pipeline is the stage-by-stage production route. It
absorbs OpenMontage's pipeline thinking and maps it to CodeCut's visual editor.

Target canonical flow:

```text
requirement intake
-> idea / concept
-> script / copy
-> scene plan
-> material ingest
-> material understanding
-> asset planning and generation
-> edit decisions
-> timeline composition
-> quality review
-> export / publish package
```

Current CodeCut stages already cover parts of this flow. Future work should
organize those stages as a complete production pipeline instead of treating
EditPlan application as the whole product.

## 3. Stage Skill Layer

Stage skills are the Agent's production playbooks. They should remain rich,
director-style instructions rather than small prompt snippets.

Each stage skill should define:

- product purpose;
- when to use it;
- inputs and required evidence;
- optional evidence;
- allowed tools;
- output artifacts;
- user-visible status;
- stop conditions;
- review criteria;
- handoff to the next stage;
- what the stage must not do.

Stage skills own workflow judgment. Runtime code owns only necessary product
safety, data safety, timeline validity, readback, and export rules.

## 4. Tool Capability Layer

Tools expose concrete capabilities. They do not choose the workflow.

Every tool should declare:

- purpose;
- required inputs;
- optional inputs;
- side effects;
- whether it mutates editor state;
- returned evidence;
- failure shape;
- dependency or provider requirements;
- user-visible result;
- artifact paths when applicable.

Before production, the Agent should be able to report the available capability
menu: local tools, provider-backed tools, generation tools, evidence tools,
timeline tools, verification tools, export tools, and unavailable tools.

## 5. Process Artifact Layer

Process artifacts are the production memory. They prevent the Agent from
guessing and let users review or continue work.

Target artifact families:

```text
brief
script
scene_plan
asset_manifest
material_understanding
edit_decisions
timeline_plan
quality_report
render_or_export_report
publish_log
```

User-facing labels can be Chinese-friendly:

```text
需求说明
脚本/口播稿
镜头与场景计划
素材清单
资产生成清单
素材理解报告
剪辑决策记录
时间线计划
预览检查报告
导出报告
```

The durable workspace path remains:

```text
.codecut-workspace/projects/<projectId>/
```

## 6. Checkpoint And Approval Layer

Checkpoints preserve stage state and make production resumable.

Each stage can record:

- current status;
- produced artifacts;
- blockers;
- review notes;
- user approval requirement;
- next stage recommendation;
- resume data.

CodeCut should eventually show checkpoint state in the editor UI so the user can
see what the Agent is doing now and what needs confirmation.

## 7. Visual Editor State Layer

This is CodeCut's main difference from OpenMontage.

Agent work should become visible editor state:

- source media appears in the media library;
- generated images, audio, captions, and B-roll become project assets;
- selected clips appear on tracks;
- captions are editable text;
- progress appears as stage status;
- previews show the current result;
- users can manually adjust the timeline.

The editor is the human control surface for the Agent production process.

## 8. Editable Timeline Delivery Layer

OpenMontage compose normally produces a final rendered video. CodeCut timeline
composition should first produce an editable visual timeline.

Examples:

- `script` and `scene_plan` inform sequence, overlays, and pacing.
- `asset_manifest` maps generated and imported assets into the media library.
- `edit_decisions` map source ranges into clips.
- `timeline_plan` becomes tracks, clips, captions, audio, transitions, and
  visual elements.
- `quality_report` verifies the result before export.

The editable project timeline is the primary delivery surface. MP4 export is a
verified output from that timeline when requested.

## 9. Quality And Delivery Proof Layer

Quality proof combines Agent artifacts with editor readback:

- requirement route matches the user goal;
- material facts were inspected;
- script and scene plan align;
- required assets exist;
- timeline elements match the plan;
- captions are readable and timed;
- preview frames are acceptable;
- export exists only when requested and verified.

This layer keeps CodeCut's fail-fast and readback culture, but explains it in
product language: users can trust the work because it is visible, editable, and
proven.

## Existing Surface Map

| Target layer | Current CodeCut surface |
| --- | --- |
| User goal | `codecut-requirement-intake`, setup widget, brief files |
| Agent pipeline | `skills/codecut/references/workflow-stage-contract.md` |
| Stage skills | `skills/codecut-*` |
| Tool capabilities | MCP tools and `skills/codecut/references/codecut-agent-tool-contract.md` |
| Process artifacts | `.codecut-workspace/projects/<projectId>/` |
| Checkpoints | Current workspace docs plus future stage status artifacts |
| Visual editor state | web editor, media library, timeline, preview |
| Editable timeline | executor project and `get_timeline_state` readback |
| Quality proof | verification files, visual QA, readback, export proof |

## First Implementation Boundary

The first implementation is documentation-only. It clarifies product direction
and architecture before runtime changes. Runtime schemas, MCP tools, editor UI,
and executor behavior stay unchanged.
```

- [ ] **Step 2: Verify architecture layer coverage**

Run:

```bash
rg -n "Agent production pipeline|Stage Skill Layer|Tool Capability Layer|Process Artifact Layer|Editable Timeline Delivery Layer|Quality And Delivery Proof" docs/codecut-agent-visual-production-architecture.md
```

Expected: every layer heading is found.

- [ ] **Step 3: Commit Task 2**

Run:

```bash
git add docs/codecut-agent-visual-production-architecture.md
git commit -m "docs: add agent visual production architecture"
```

Expected: commit succeeds with only the architecture document.

## Task 3: Add OpenMontage Adaptation Blueprint

**Files:**
- Create: `docs/openmontage-to-codecut-adaptation.md`
- Read: `/Users/x/Desktop/Project/github/openmontage/docs/ARCHITECTURE.md`
- Read: `/Users/x/Desktop/Project/github/openmontage/AGENT_GUIDE.md`
- Read: `/Users/x/Desktop/Project/github/openmontage/pipeline_defs/hybrid.yaml`
- Read: `docs/codecut-agent-visual-production-architecture.md`

- [ ] **Step 1: Create the adaptation document**

Create `docs/openmontage-to-codecut-adaptation.md` with this Markdown structure and content:

```markdown
# OpenMontage To CodeCut Adaptation

## Purpose

OpenMontage is the Agent engineering reference for CodeCut. CodeCut should
absorb its production-management structure while preserving CodeCut's visual
editor delivery surface.

The compatibility principle is:

```text
Preserve full production structure; adapt only the delivery surface.
```

## Shared Product Essence

OpenMontage and CodeCut share the same core product direction: Agent-driven
video production.

The difference is the user-facing surface:

- OpenMontage is an instruction-driven video production system that produces
  project artifacts and rendered outputs.
- CodeCut is an Agent-driven visual video production system that exposes the
  production process through a visual editor, editable timeline, preview,
  manual adjustment, and export.

## What To Preserve

CodeCut should preserve these OpenMontage ideas as full concepts, not mini
versions:

- pipeline manifests;
- stage director skills;
- required and optional artifacts;
- tool availability preflight;
- tool contracts and support envelope;
- checkpoints and resume;
- human approval gates;
- review focus and success criteria;
- decision logs;
- quality reports;
- publish and delivery logs.

## Pipeline Layer Mapping

OpenMontage uses pipeline manifests such as `pipeline_defs/hybrid.yaml` to
define stage order, required skills, available tools, artifacts, review focus,
success criteria, and approval defaults.

CodeCut should map this idea into a CodeCut production pipeline:

| OpenMontage concept | CodeCut adaptation |
| --- | --- |
| `pipeline_defs/*.yaml` | future CodeCut pipeline definitions or structured stage contracts |
| `stages[]` | CodeCut stage table and stage skill routing |
| `required_skills` | CodeCut stage skills |
| `tools_available` | CodeCut MCP/tool capability menu |
| `produces` | `.codecut-workspace` artifacts |
| `checkpoint_required` | workspace checkpoint/status artifacts |
| `human_approval_default` | editor-visible confirmation gate |
| `review_focus` | stage review criteria and visual QA focus |
| `success_criteria` | stage completion and readback proof |

## Skill Layer Mapping

OpenMontage stage director skills are complete production instructions. CodeCut
should keep that richness.

Each CodeCut stage skill should include:

- product purpose;
- required evidence;
- allowed tools;
- artifact outputs;
- stop conditions;
- handoff;
- review criteria;
- user-visible progress language;
- non-goals.

Do not replace director-style skills with short summaries. The skill prompt is
where the Agent learns how to make better production decisions.

## Tool Layer Mapping

OpenMontage tools expose identity, capability, provider, runtime, dependencies,
input schema, output schema, artifacts, failure state, cost, duration, and
availability.

CodeCut should adapt this into MCP/tool contracts:

- purpose;
- input schema;
- output shape;
- side effects;
- state mutation boundary;
- dependency or provider requirement;
- failure shape;
- returned evidence;
- editor-visible status;
- artifact path.

Tools should not choose the production workflow. Stage skills and Agent
planning choose how tools are combined.

## Artifact Layer Mapping

OpenMontage keeps artifacts such as:

```text
brief
script
scene_plan
asset_manifest
edit_decisions
render_report
final_review
publish_log
```

CodeCut should adapt them into:

```text
brief
script
scene_plan
asset_manifest
material_understanding
edit_decisions
timeline_plan
quality_report
export_report
publish_log
```

These artifacts should live under:

```text
.codecut-workspace/projects/<projectId>/
```

The workspace is the production record shared by the Agent, tools, and visual
editor.

## Checkpoint And Approval Mapping

OpenMontage checkpoints let the Agent resume work, review stage output, and
pause for human approval.

CodeCut should preserve this pattern and eventually surface it in the editor:

- current stage;
- completed stages;
- produced artifacts;
- blockers;
- user approval needed;
- next action;
- risk;
- latest readback.

## Composition Mapping

This is the main adaptation point.

OpenMontage compose usually means:

```text
artifacts + assets -> final rendered video
```

CodeCut timeline composition should mean:

```text
artifacts + assets -> editable visual timeline -> preview -> manual adjustment -> export
```

OpenMontage `render_report` becomes CodeCut timeline and export proof. The
editable timeline is the primary product state. MP4 is a verified output from
that state when requested.

## What Not To Copy

CodeCut should not copy these parts directly:

- OpenMontage Python runtime as a CodeCut orchestrator;
- direct final-render-first delivery;
- hidden provider fallback that changes approved production choices;
- render-engine choices that bypass CodeCut timeline state;
- workflows that make CodeCut an invisible backend instead of a visual
  collaborative editor.

## First Adaptation Step

The first implementation should update product and architecture documentation
only. Later plans can decide whether to add CodeCut pipeline manifest files,
formal artifact schemas, editor-visible stage progress, and richer tool
capability preflight.
```

- [ ] **Step 2: Verify adaptation concepts**

Run:

```bash
rg -n "Preserve full production structure|Pipeline Layer Mapping|Skill Layer Mapping|Tool Layer Mapping|Artifact Layer Mapping|Composition Mapping" docs/openmontage-to-codecut-adaptation.md
```

Expected: all adaptation sections are found.

- [ ] **Step 3: Commit Task 3**

Run:

```bash
git add docs/openmontage-to-codecut-adaptation.md
git commit -m "docs: map openmontage patterns to codecut"
```

Expected: commit succeeds with only the adaptation document.

## Task 4: Reposition Current Execution Contract

**Files:**
- Modify: `docs/codex-driven-editing.md`
- Read: `docs/codecut-product-positioning.md`
- Read: `docs/codecut-agent-visual-production-architecture.md`

- [ ] **Step 1: Replace the title and opening section**

In `docs/codex-driven-editing.md`, replace the title and opening paragraph before `## Product Boundary` with:

```markdown
# CodeCut Current Execution Contract

This document describes the current implemented execution contract for CodeCut's
Codex-operated editing path. For product positioning, read
`docs/codecut-product-positioning.md`. For the target Agent visual production
architecture, read `docs/codecut-agent-visual-production-architecture.md`.

CodeCut's product positioning is `Codex + CapCut`: an Agent-driven visual video
production system. This file covers the narrower runtime truth underneath that
positioning: how Codex operates the current local executor, how plans are
validated, how the timeline is mutated, how readback proves state, and how
export is verified when requested.

The current implementation keeps LLM and Agent reasoning outside CodeCut.
Codex operates CodeCut through deterministic local CLI/executor tools. The
browser editor is the human-visible production surface for preview, manual
adjustment, and live status. Codex owns user intent, material judgment, clip
selection, plan creation, retries, and user communication.
```

- [ ] **Step 2: Rename `## Product Boundary` to `## Current Runtime Boundary`**

Replace:

```markdown
## Product Boundary
```

with:

```markdown
## Current Runtime Boundary
```

- [ ] **Step 3: Replace the sentence after the `Codecut does not` list**

Find:

```markdown
Codex is the only LLM and Agent layer. Codecut is the visual executor and validator.
```

Replace it with:

```markdown
Codex is the only LLM and Agent layer in the current implementation. CodeCut
is the visual editor, local timeline runtime, validator, and readback surface.
This is an implementation boundary, not the product headline.
```

- [ ] **Step 4: Verify execution contract still points to runtime truth**

Run:

```bash
rg -n "Current Execution Contract|Current Runtime Boundary|implementation boundary|apply_edit_plan|get_timeline_state" docs/codex-driven-editing.md
```

Expected: all terms are found.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add docs/codex-driven-editing.md
git commit -m "docs: reposition codecut execution contract"
```

Expected: commit succeeds with only `docs/codex-driven-editing.md`.

## Task 5: Reposition Workspace Documentation Around Artifacts

**Files:**
- Modify: `docs/codecut-workspace.md`
- Read: `docs/codecut-agent-visual-production-architecture.md`

- [ ] **Step 1: Replace the Purpose section**

In `docs/codecut-workspace.md`, replace the current `## Purpose` section with:

```markdown
## Purpose

The CodeCut workspace is the local production record for an Agent-driven visual
video project.

It stores user intent, source materials, material inventory, clarification
answers, scripts, scene plans, generated or selected assets, edit decisions,
timeline plans, execution files, verification notes, export proof, and project
learning proposals before and around CodeCut timeline mutation.

This workspace is where CodeCut absorbs OpenMontage-style process artifacts and
checkpoints while still delivering through the CodeCut visual editor. It
prevents a common failure mode: creating an editor project too early, then
discovering that the platform, aspect ratio, duration, source quality, story
route, or production evidence was wrong.
```

- [ ] **Step 2: Insert an Agent production artifact paragraph after `Project ID Rule`**

After the paragraph ending with `Use subfolders or additional planning
documents for variants that share the same source pack.`, insert:

```markdown
The workspace is not only a pre-edit scratch folder. It is the shared project
context for the Agent, local tools, and visual editor. Early folders record
requirements, source evidence, and planning. Later folders record timeline
execution, visual QA, export proof, and learning proposals. The editable
CodeCut timeline remains the primary visual delivery surface, while this
workspace preserves why the timeline was built that way.
```

- [ ] **Step 3: Verify workspace positioning**

Run:

```bash
rg -n "production record|OpenMontage-style process artifacts|shared project context|primary visual delivery surface" docs/codecut-workspace.md
```

Expected: all four phrases are found.

- [ ] **Step 4: Commit Task 5**

Run:

```bash
git add docs/codecut-workspace.md
git commit -m "docs: frame workspace as production record"
```

Expected: commit succeeds with only `docs/codecut-workspace.md`.

## Task 6: Update CodeCut Skill Entry And Stage Contract Positioning

**Files:**
- Modify: `skills/codecut/SKILL.md`
- Modify: `skills/codecut/references/workflow-stage-contract.md`
- Read: `docs/codecut-product-positioning.md`
- Read: `docs/codecut-agent-visual-production-architecture.md`

- [ ] **Step 1: Update `skills/codecut/SKILL.md` description metadata**

Replace the frontmatter `description` value with:

```yaml
description: Use when operating or extending CodeCut, an Agent-driven visual video production system where Codex performs production work and CodeCut shows progress, materials, timeline, preview, manual adjustment, and export through a local editor.
```

- [ ] **Step 2: Replace the Core Boundary opening in `skills/codecut/SKILL.md`**

Replace the first paragraph under `## Core Boundary` with:

```markdown
CodeCut is Codex + CapCut: an Agent-driven visual video production system.
Codex performs the production workflow; CodeCut provides the local visual editor
where the user can see progress, inspect materials, preview timeline state,
manually adjust the edit, and export verified results.

The current implementation still keeps Codex as the only LLM and Agent layer.
CodeCut provides the local workspace, visual editor, deterministic timeline
runtime, validation, readback, and export surface.
```

Keep the paragraph starting `This skill is the public plugin entrypoint and router.`

- [ ] **Step 3: Add product docs to the Governance Layers list**

In `skills/codecut/SKILL.md`, under `## Governance Layers`, insert these bullets after `AGENTS.md`:

```markdown
- `../../docs/codecut-product-positioning.md`: product positioning,
  `CodeCut = Codex + CapCut`, and user value.
- `../../docs/codecut-agent-visual-production-architecture.md`: target layered
  architecture for Agent production, process artifacts, visual editor state,
  timeline delivery, and quality proof.
- `../../docs/openmontage-to-codecut-adaptation.md`: OpenMontage compatibility
  and adaptation blueprint.
```

- [ ] **Step 4: Update `workflow-stage-contract.md` opening**

Replace the first paragraph in `skills/codecut/references/workflow-stage-contract.md` with:

```markdown
This reference maps broad video production requests into user-visible CodeCut
stages. It is the current stage contract for CodeCut's Agent-driven visual video
production model: Codex performs the production workflow, while CodeCut exposes
workspace proof, editor progress, timeline state, preview, manual adjustment,
and export readiness.
```

Keep the paragraph that starts `The executable contracts remain`.

- [ ] **Step 5: Replace the `Expected benefits` bullet about cleaner architecture**

In `skills/codecut/references/workflow-stage-contract.md`, replace:

```markdown
- Cleaner product architecture: Codecut keeps one deterministic executor path
  while Codex owns judgment, workflow routing, and communication.
```

with:

```markdown
- Cleaner product architecture: CodeCut keeps Agent production decisions,
  stage proof, tool side effects, visual editor state, timeline readback, and
  export proof separated without reducing the product to an executor-only
  workflow.
```

- [ ] **Step 6: Verify skill positioning**

Run:

```bash
rg -n "CodeCut is Codex \\+ CapCut|Agent-driven visual video production|codecut-product-positioning|openmontage-to-codecut-adaptation|executor-only workflow" skills/codecut/SKILL.md skills/codecut/references/workflow-stage-contract.md
```

Expected: all positioning terms are found.

- [ ] **Step 7: Commit Task 6**

Run:

```bash
git add skills/codecut/SKILL.md skills/codecut/references/workflow-stage-contract.md
git commit -m "docs: align codecut skill positioning"
```

Expected: commit succeeds with only the two skill reference files.

## Task 7: Update Plugin Marketplace Copy

**Files:**
- Modify: `.codex-plugin/plugin.json`
- Read: `docs/codecut-product-positioning.md`

- [ ] **Step 1: Update top-level `description`**

In `.codex-plugin/plugin.json`, replace the top-level `description` with:

```json
"CodeCut is Codex + CapCut: an Agent-driven visual video production system. Codex performs the production work, while CodeCut shows progress, materials, timeline, preview, manual adjustment, and export in a local visual editor."
```

- [ ] **Step 2: Update `interface.shortDescription`**

Replace `interface.shortDescription` with:

```json
"Codex + CapCut for Agent-driven visual video production."
```

- [ ] **Step 3: Update `interface.longDescription`**

Replace `interface.longDescription` with:

```json
"CodeCut is Codex + CapCut: an Agent-driven visual video production system. Codex understands the user's video goal, plans the production work, uses tools and artifacts to build the edit, and CodeCut presents the process in a local visual editor with media, timeline, preview, manual adjustment, and export."
```

- [ ] **Step 4: Update `interface.capabilities`**

Replace `interface.capabilities` with:

```json
[
  "Agent-driven video production workflow",
  "Visual editing workspace with media and timeline",
  "OpenMontage-style process artifacts",
  "Transcript and visual-evidence planning",
  "Validated timeline updates and readback",
  "Preview, manual adjustment, and export proof"
]
```

- [ ] **Step 5: Update `interface.defaultPrompt`**

Replace `interface.defaultPrompt` with:

```json
[
  "Open CodeCut and set up an Agent-driven visual video production workspace.",
  "Import my local video into CodeCut and prepare a short-form edit with visible timeline progress.",
  "Turn this source clip into a 30-90 second vertical short with captions, preview, and editable timeline."
]
```

- [ ] **Step 6: Validate JSON**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('.codex-plugin/plugin.json','utf8')); console.log('plugin json ok')"
```

Expected output:

```text
plugin json ok
```

- [ ] **Step 7: Commit Task 7**

Run:

```bash
git add .codex-plugin/plugin.json
git commit -m "docs: update codecut plugin positioning"
```

Expected: commit succeeds with only `.codex-plugin/plugin.json`.

## Task 8: Documentation And Plugin Verification

**Files:**
- Verify all changed files from Tasks 1-7.

- [ ] **Step 1: Scan for forbidden placeholders**

Run:

```bash
rg -n "TB[D]|TO[D]O|FIXM[E]|PLACEHOLDE[R]|待[定]|以后再[说]" docs/codecut-product-positioning.md docs/codecut-agent-visual-production-architecture.md docs/openmontage-to-codecut-adaptation.md docs/codex-driven-editing.md docs/codecut-workspace.md skills/codecut/SKILL.md skills/codecut/references/workflow-stage-contract.md .codex-plugin/plugin.json
```

Expected: no matches. Exit code 1 is acceptable for no matches.

- [ ] **Step 2: Check Markdown and JSON formatting whitespace**

Run:

```bash
git diff --check HEAD
```

Expected: no output and exit code 0.

- [ ] **Step 3: Validate plugin JSON again**

Run:

```bash
node -e "const p=JSON.parse(require('fs').readFileSync('.codex-plugin/plugin.json','utf8')); console.log(p.interface.shortDescription)"
```

Expected output:

```text
Codex + CapCut for Agent-driven visual video production.
```

- [ ] **Step 4: Run plugin freshness check**

Run:

```bash
bun run plugin:freshness
```

Expected: command completes. If it reports stale source/cache/session state,
record the stale layer in the final report. Do not sync plugin cache in this
documentation task unless the user explicitly asks for plugin runtime rollout.

- [ ] **Step 5: Run focused repository test suite**

Run:

```bash
bun run test
```

Expected: tests pass. If tests fail for unrelated pre-existing reasons, capture
the failing command, failing test name, and first actionable error.

- [ ] **Step 6: Inspect final diff**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected changed files:

```text
.codex-plugin/plugin.json
docs/codecut-agent-visual-production-architecture.md
docs/codecut-product-positioning.md
docs/codecut-workspace.md
docs/codex-driven-editing.md
docs/openmontage-to-codecut-adaptation.md
docs/superpowers/plans/2026-06-28-codecut-agent-visual-production-docs.md
docs/superpowers/specs/2026-06-28-codecut-agent-visual-production-design.md
skills/codecut/SKILL.md
skills/codecut/references/workflow-stage-contract.md
```

- [ ] **Step 7: Commit verification adjustments if needed**

If verification required only typo or formatting fixes, commit them:

```bash
git add .codex-plugin/plugin.json docs skills
git commit -m "docs: polish codecut positioning rollout"
```

Expected: commit is created only when verification fixes were necessary. If no
fixes were necessary, skip this step and report that no final polish commit was
needed.

## Task 9: Final Report

**Files:**
- Read: `git status -sb`
- Read: `git log --oneline --decorate -n 8`

- [ ] **Step 1: Confirm clean worktree**

Run:

```bash
git status -sb
```

Expected: clean worktree on `codex/codecut-agent-visual-production-docs`, ahead
of `origin/main`.

- [ ] **Step 2: Summarize commits**

Run:

```bash
git log --oneline --decorate -n 8
```

Expected: log includes the spec commit, this implementation plan commit if it
was committed, and task commits from Tasks 1-8.

- [ ] **Step 3: Report outcome**

Final report must include:

- product positioning changed to `CodeCut = Codex + CapCut`;
- new docs added;
- existing docs/skill/plugin copy updated;
- runtime code unchanged;
- verification commands and results;
- plugin freshness status if plugin metadata changed;
- next risk: plugin cache/session sync is a separate rollout if the user wants
  active Codex plugin copy to update.

Do not claim runtime behavior changed. Do not claim plugin cache was synced
unless `node scripts/sync-codex-local-plugin.mjs` was actually run in a later,
explicit rollout step.
