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
