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
