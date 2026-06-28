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
