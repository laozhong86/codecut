# CodeCut Agent Visual Production Design Spec

## Overview

CodeCut should be positioned as:

```text
CodeCut = Codex + CapCut
```

In plain product language, CodeCut is an Agent-driven visual video production
system. Codex or another external Agent plans and performs the production work,
while CodeCut gives that work a visible editing surface: project setup, source
materials, progress, timeline, preview, manual adjustment, and export.

This positioning replaces the narrower "Codex decides, CodeCut executes"
language. The product value is not that CodeCut has a local executor. The value
is that users can ask for a video outcome, let an Agent do most production work,
and still watch, control, correct, and finish the result in a familiar visual
editor.

CodeCut should absorb two reference systems:

- OpenMontage provides the Agent engineering core: pipelines, stage director
  skills, tool capability discovery, artifacts, checkpoints, approval gates,
  and quality review.
- OpenCut / CapCut provide the visual editing shape: media library, timeline,
  preview, manual control, editable tracks, and export.

CodeCut combines these into one product: an Agent video production system whose
work is visible and editable through a local video editor.

## Problem

Current CodeCut documentation is technically correct but product positioning is
too implementation-led. It often introduces CodeCut as a deterministic local
executor or timeline validator. That language helps engineers understand safety
boundaries, but it does not explain the product:

- what user problem CodeCut solves;
- why visual collaboration matters;
- why OpenMontage is a core reference;
- how CodeCut differs from a black-box AI video generator;
- how CodeCut differs from a normal editor with a chat panel.

The result is a strategy risk. Future work can become centered around small
EditPlan or executor improvements instead of the larger product direction:
Agent-driven video production with a visual, collaborative, human-controllable
editing surface.

## Goals

1. Establish the product positioning in durable documentation:
   `CodeCut = Codex + CapCut`.
2. Define CodeCut as an Agent-driven visual video production system.
3. Treat OpenMontage as the core Agent engineering reference, not as a small
   feature source.
4. Treat OpenCut / CapCut as the visual editor reference, not as a simple clone
   target.
5. Define a complete layered architecture for pipeline, skills, tools,
   artifacts, checkpoints, visual editor state, timeline delivery, and quality
   gates.
6. Keep compatibility with OpenMontage-style full prompts, full stage contracts,
   and full artifact thinking. Do not reduce the design to a miniature
   EditPlan-only workflow.
7. Make the first implementation step documentation-only so the product
   direction is clear before runtime refactoring begins.

## Non-Goals

- Do not implement runtime changes in this design phase.
- Do not modify MCP tool schemas in this design phase.
- Do not migrate OpenMontage Python tools into CodeCut directly.
- Do not replace the CodeCut editor with OpenMontage render runtimes.
- Do not turn CodeCut into a CapCut clone without the Agent production core.
- Do not shrink OpenMontage pipeline and director-skill patterns into a small
  prompt summary.
- Do not treat a final MP4 as the only delivery target. CodeCut must first
  preserve the editable visual timeline as a primary outcome.

## Product Positioning

### External Positioning

CodeCut is Codex + CapCut.

Users can describe a video goal in natural language. The Agent handles the
video production workflow: understanding requirements, analyzing materials,
planning content, generating or selecting assets, building an edit, checking
quality, and preparing delivery. CodeCut shows that work inside a visual editor
so users can inspect progress, preview the result, make manual changes, and
export when ready.

### Internal Positioning

CodeCut is an Agent-driven visual production system.

Its internal architecture should be explained as a combination of:

- Agent production workflow from OpenMontage;
- visual timeline editor from OpenCut / CapCut;
- local, verifiable, editable project state from CodeCut.

The local executor remains important, but it is not the product headline. It is
the safety and reliability layer that lets Agent decisions become visible,
editable timeline state.

### What CodeCut Is Not

CodeCut is not only a deterministic executor. That phrase describes an internal
safety boundary, not the product.

CodeCut is not only a black-box video generator. A black-box generator gives a
file. CodeCut gives an editable project, process evidence, preview, and manual
control.

CodeCut is not only a normal editor with a chat panel. The Agent is not a side
assistant. The Agent owns the production workflow while the editor makes that
workflow visible and controllable.

## User Value

CodeCut should be described through user outcomes:

- The user does not need to manually perform every GUI operation.
- The Agent can do repetitive production work: selecting clips, organizing
  materials, drafting scripts, adding captions, arranging timeline structure,
  and checking output.
- The user can see what is happening instead of waiting for a black-box result.
- The user can interrupt, correct, manually adjust, and continue.
- The result stays editable, so quality can improve through collaboration
  instead of one-shot generation.
- Every major decision can be traced to a material fact, transcript, visual
  proof, user requirement, or explicit artifact.

The core promise is higher-quality videos that better match user intent because
the Agent workflow is engineered and the human user stays in control through a
visual editor.

## Reference Systems

### OpenMontage Role

OpenMontage is the Agent engineering reference. CodeCut should absorb its
complete production-management ideas:

- pipeline manifests;
- stage director skills;
- required and optional artifacts;
- tool availability preflight;
- tool contracts and support envelope;
- checkpoints and resume;
- human approval gates;
- stage review criteria;
- quality reports;
- publish and delivery logs.

This should be treated as core architecture, not as optional inspiration.

### OpenCut / CapCut Role

OpenCut and CapCut are the visual editing reference. CodeCut should absorb the
editor shape:

- project and media library;
- timeline tracks and clips;
- preview playback;
- text, caption, audio, image, and video elements;
- manual editing;
- export flow;
- user-visible project state.

The product phrase "Codex + CapCut" is useful because it makes the value clear:
Agent intelligence plus a familiar visual video editor.

### CodeCut Role

CodeCut is the integration product. It should not copy either system blindly.

OpenMontage ends in a rendered video package. CodeCut should end first in a
visual, editable timeline, then preview and export from that timeline.

CapCut is primarily a human-operated editor. CodeCut should let an Agent perform
the work while the human watches, corrects, and controls the result.

## Layered Architecture

The target architecture should be documented as:

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

### 1. User Goal Layer

This layer captures what the user wants, not how the system will execute it.

Examples:

- "Turn this long talking-head video into a 60-second vertical short."
- "Make a product proof ad from these clips."
- "Use this reference style on my new source material."
- "Create a tutorial demo with captions and a clear sequence."

The success measure is whether the final video matches the user's desired
outcome, not whether a specific internal tool ran.

### 2. Agent Production Pipeline Layer

This layer absorbs OpenMontage pipeline thinking. CodeCut should support full
video production routes instead of one small edit flow.

Candidate canonical stages:

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

Existing CodeCut stages already cover parts of this. The design task is to
rename and organize them as a complete Agent video production pipeline.

### 3. Stage Skill Layer

Each stage should have a full skill contract, similar to OpenMontage director
skills. Skills should not be reduced to short prompt snippets.

Each stage skill should define:

- purpose in product language;
- when to use it;
- inputs;
- outputs;
- required evidence;
- optional evidence;
- tools it may use;
- artifacts it produces;
- handoff to the next stage;
- stop conditions;
- review criteria;
- user-visible status;
- what it must not do.

This preserves OpenMontage's strongest pattern: the intelligence is in rich
stage instructions, not improvised one-off tool calls.

### 4. Tool Capability Layer

Tools are concrete capabilities. They should not choose the workflow.

CodeCut should absorb OpenMontage's support-envelope idea. Before production,
the Agent should know what is available:

- local tools;
- provider-backed tools;
- visual evidence tools;
- transcription tools;
- image, audio, music, and video generation tools;
- timeline mutation tools;
- readback and verification tools;
- export tools;
- unavailable tools and why they are unavailable.

Each tool should declare:

- purpose;
- inputs;
- outputs;
- side effects;
- whether it mutates editor state;
- required environment or dependency;
- failure shape;
- user-visible result;
- artifact path when applicable.

### 5. Process Artifact Layer

CodeCut should keep full process artifacts, not only final EditPlan JSON.

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

CodeCut naming can be Chinese-friendly in user-facing docs, while internal file
names can stay stable and schema-friendly:

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

Artifacts should live under the existing project workspace:

```text
.codecut-workspace/projects/<projectId>/
```

The workspace should become the visible production record, not just a pre-edit
scratch folder.

### 6. Checkpoint And Approval Layer

CodeCut should absorb OpenMontage checkpoints and human approval gates.

Each meaningful stage can produce:

- stage status;
- produced artifacts;
- blockers;
- review notes;
- user approval requirement;
- next stage recommendation;
- resume information.

CodeCut's differentiator is that checkpoints should eventually be visible in
the editor UI, not only in files. Users should be able to see that the Agent is
currently understanding material, writing a script, generating assets, applying
timeline changes, or checking preview quality.

### 7. Visual Editor State Layer

This is CodeCut's main product difference from OpenMontage.

Agent work should be reflected in a visual editor:

- imported source media appears in the media library;
- generated images, audio, captions, and B-roll become project assets;
- selected clips appear on tracks;
- captions are editable text elements;
- progress can be shown as stage status;
- preview can show the current result;
- users can manually adjust the timeline.

The editor is not a decorative preview. It is the human control surface for the
Agent production process.

### 8. Editable Timeline Delivery Layer

OpenMontage compose normally means rendering a final video. CodeCut compose
should mean converting production artifacts into editable timeline state.

Examples:

- `script` and `scene_plan` inform clip sequence and overlays;
- `asset_manifest` maps generated or imported assets into project media;
- `edit_decisions` map source ranges into timeline elements;
- `timeline_plan` becomes tracks, clips, captions, audio, transitions, and
  visual elements;
- `quality_report` reads back the result and identifies issues before export.

The first delivery target is not an MP4. It is a CodeCut project timeline that
can be previewed, changed, and exported.

### 9. Quality And Delivery Proof Layer

Quality proof should combine Agent artifacts and editor readback:

- requirements match the selected route;
- material facts were inspected;
- script and scene plan are aligned;
- generated assets are present;
- timeline elements match the plan;
- captions are readable and timed;
- preview frames are visually acceptable;
- export exists only when requested and verified.

This layer should preserve CodeCut's current strict readback culture while
explaining it in product language: proof exists so the user can trust the work
and keep editing from a known state.

## OpenMontage Compatibility Strategy

The compatibility principle is:

```text
Preserve full production structure; adapt only the delivery surface.
```

### Preserve

CodeCut should preserve these OpenMontage concepts as fully as possible:

- explicit pipeline definitions;
- complete director-skill prompts;
- stage-specific artifacts;
- human approval gates;
- checkpoint and resume;
- tool discovery and availability reporting;
- capability-specific tool contracts;
- review focus and success criteria;
- render/export quality reports;
- decision logs.

### Adapt

CodeCut should adapt these parts:

- OpenMontage `compose` becomes CodeCut `timeline composition`.
- OpenMontage `render_report` becomes timeline and export proof.
- OpenMontage `projects/<name>/renders/final.mp4` becomes a secondary output
  after CodeCut timeline preview and export.
- OpenMontage support assets become CodeCut media library assets.
- OpenMontage stage status becomes editor-visible Agent progress.

### Do Not Copy Directly

CodeCut should not copy:

- OpenMontage's Python runtime as the CodeCut orchestrator;
- direct final-render-first workflow;
- provider fallback behavior that hides user-facing choices;
- render-engine decisions that bypass CodeCut timeline state;
- any workflow that turns CodeCut into an invisible backend instead of a visual
  collaborative editor.

## Documentation Design

First-stage implementation should be documentation-only. It should create a
clear product and architecture map before runtime refactoring.

### New Product Positioning Document

Path:

```text
docs/codecut-product-positioning.md
```

Purpose:

- Explain `CodeCut = Codex + CapCut`.
- Explain user value in plain language.
- Explain why Agent production plus visual editing matters.
- Clarify what CodeCut is and is not.
- Reframe "local executor" as an internal reliability layer.

### New Architecture Document

Path:

```text
docs/codecut-agent-visual-production-architecture.md
```

Purpose:

- Define the full layered architecture.
- Explain each layer's product role.
- Map each layer to existing CodeCut surfaces where possible.
- Mark future architecture gaps without implementing them yet.

### New OpenMontage Adaptation Document

Path:

```text
docs/openmontage-to-codecut-adaptation.md
```

Purpose:

- Document OpenMontage patterns CodeCut should absorb.
- Document how pipeline, skills, tools, artifacts, checkpoints, and QA map into
  CodeCut.
- State the compatibility principle: preserve full production structure and
  adapt only the delivery surface.
- Name non-transferable parts.

### Existing Document Repositioning

`docs/codex-driven-editing.md` should become the current execution contract,
not the product positioning entry point.

`docs/codecut-workspace.md` should become the process artifact and production
workspace contract.

`skills/codecut/references/workflow-stage-contract.md` should become the stage
pipeline contract.

`skills/codecut/SKILL.md` should open with the product boundary before the
technical boundary.

`.codex-plugin/plugin.json` should eventually use the external positioning:

```text
CodeCut is Codex + CapCut: an Agent-driven visual video production system.
```

Plugin copy can still mention local workspace, media import, timeline preview,
manual adjustment, and export, but those should support the positioning rather
than replace it.

## Expected First Implementation Scope

After this spec is approved, the first implementation plan should cover:

1. Add `docs/codecut-product-positioning.md`.
2. Add `docs/codecut-agent-visual-production-architecture.md`.
3. Add `docs/openmontage-to-codecut-adaptation.md`.
4. Update the opening sections of:
   - `docs/codex-driven-editing.md`;
   - `skills/codecut/SKILL.md`;
   - `skills/codecut/references/workflow-stage-contract.md`;
   - `docs/codecut-workspace.md`;
   - `.codex-plugin/plugin.json`.
5. Keep all changes documentation and plugin-description focused.
6. Do not change runtime behavior, schemas, MCP tools, or executor code in this
   first implementation.

## Success Criteria

- A reader can understand CodeCut's product in one sentence:
  `CodeCut = Codex + CapCut`.
- The product is described as an Agent-driven visual video production system.
- OpenMontage is identified as the Agent engineering core reference.
- OpenCut / CapCut are identified as the visual editing shape reference.
- Documentation no longer leads with "local deterministic executor" as the
  product identity.
- The design keeps full OpenMontage-style pipeline, skill, tool, artifact, and
  checkpoint thinking instead of a miniature EditPlan-only flow.
- The CodeCut delivery surface is clearly the editable visual timeline first,
  then preview, manual adjustment, and export.
- First implementation remains documentation-only.

## Risks

### Risk: "Codex + CapCut" Sounds Like A CapCut Clone

Mitigation: always pair the phrase with "Agent-driven visual video production
system." The product is not a clone; it is Agent production plus familiar
visual editing.

### Risk: Documentation Becomes Too Abstract

Mitigation: every layer must state what user problem it solves and what artifact
or visible state it produces.

### Risk: OpenMontage Is Reduced Too Much

Mitigation: preserve full director-skill, pipeline, artifact, checkpoint, and
quality-gate concepts. Do not write a mini prompt-only version.

### Risk: Runtime Refactoring Starts Too Early

Mitigation: first implementation is documentation-only. Runtime, schemas, MCP
tools, and editor UI changes require later plans.

### Risk: Existing Execution Contracts Get Weakened

Mitigation: reposition execution contracts under the product architecture, but
do not remove fail-fast, readback, timeline validation, or export proof rules.

## Open Questions For Later Plans

These are intentionally outside the first documentation implementation:

- Whether CodeCut should add pipeline manifest files similar to
  `pipeline_defs/*.yaml`.
- Whether stage artifacts should get formal JSON schemas matching OpenMontage
  artifact schemas.
- How to show Agent stage progress in the editor UI.
- How to represent checkpoints and approval gates visually.
- Whether tool capability preflight should become a first-class CodeCut UI
  surface.
- How to migrate current stage skills toward fuller OpenMontage-style director
  skill contracts without breaking existing Codex plugin behavior.

## Verification Plan

For the documentation implementation that follows this design:

- Run repository documentation checks.
- Run diff checks for whitespace and formatting.
- Verify the new product positioning is linked or referenced from current
  CodeCut entry documents.
- If plugin metadata changes, run the plugin freshness checks required by the
  repository's plugin verification contract.
- Do not claim runtime behavior changed.
