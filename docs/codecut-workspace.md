# Codecut Pre-Edit Workspace

## Purpose

The pre-edit workspace is the local project folder for user intent, source
materials, material inventory, clarification answers, and editing plans before
Codecut mutates a timeline.

It prevents a common failure mode: creating an editor project too early, then
discovering that the platform, aspect ratio, duration, source quality, or story
route was wrong.

## Project ID Rule

One `projectId` represents one creative job and one source-material pack:

```text
.codecut-workspace/projects/<projectId>
```

The same `projectId` should later be reused when creating the Codecut executor
project. That gives one stable ID for:

- user brief and clarification;
- source assets and ffprobe inventory;
- content breakdown and scripts;
- workflow route and timeline restructure plan;
- EditPlan files and verification notes;
- the final Codecut executor timeline.

Use a new `projectId` for unrelated jobs. Use subfolders or additional planning
documents for variants that share the same source pack.

## Folder Structure

```text
.codecut-workspace/projects/<projectId>/
  workspace.json
  00-brief/
    user-message.md
    intent-analysis.md
    clarification-questions.md
    clarification-answers.md
  01-assets/
    original/
    video/
    audio/
    images/
    brand/
    references/
    documents/
  02-inventory/
    asset-manifest.json
    ffprobe-report.json
    material-audit.md
    contact-sheets/
  03-content/
    transcript/
    content-breakdown.md
    hook-selection.md
    talking-script.md
    voiceover-script.md
  04-planning/
    workflow-route.md
    editing-decision-ledger.md
    timeline-restructure.md
    edit-plan-notes.md
  05-execution/
  06-verification/
  07-exports/
```

## Required Order

1. Understand the user message and write intent analysis.
2. Reserve a concrete `projectId` and business project name.
3. Initialize the workspace.
4. Save and classify all provided local materials.
5. Run ffprobe inventory for video/audio assets.
6. Ask clarification questions with choices and one recommended option.
7. Write route and planning documents.
8. Create the Codecut executor project only when editing execution begins.

## CLI

Initialize:

```bash
node scripts/codecut-workspace.mjs init \
  --project-id <id> \
  --name "<business project name>" \
  --user-message "<original user request>"
```

Add local assets:

```bash
node scripts/codecut-workspace.mjs add-assets \
  --project-id <id> \
  --file /absolute/path/source.mp4 \
  --file /absolute/path/brief.pdf
```

Probe video/audio assets:

```bash
node scripts/codecut-workspace.mjs probe-assets --project-id <id>
```

Write a planning document:

```bash
node scripts/codecut-workspace.mjs write-doc \
  --project-id <id> \
  --kind workflow-route \
  --content-file /absolute/path/workflow-route.md
```

Supported `write-doc` kinds:

```text
user-message
intent-analysis
clarification-questions
clarification-answers
content-breakdown
hook-selection
voiceover-script
talking-script
material-audit
workflow-route
editing-decision-ledger
timeline-restructure
edit-plan-notes
```

## Boundaries

- This workspace is local-only and excluded from git and plugin-cache sync.
- It does not create, import into, or mutate a Codecut executor project.
- It does not mutate tracks, media assets, project settings, derived assets, or
  timeline state.
- It does not replace `build-video-context`, `inspect-video-range`,
  transcription, EditPlan validation, or timeline verification.
- It is the business and material planning layer before those executor tools run.
