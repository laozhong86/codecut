# Codecut Pre-Edit Workspace

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

The workspace is not only a pre-edit scratch folder. It is the shared project context
for the Agent, local tools, and visual editor. Early folders record requirements,
source evidence, and planning. Later folders record timeline execution, visual QA,
export proof, and learning proposals. The editable CodeCut timeline remains the
primary visual delivery surface, while this workspace preserves why the timeline was
built that way.

## Folder Structure

```text
.codecut-workspace/
  user-methodology/
    profile.md
    rules.md
    feedback-log.md
  projects/
    <projectId>/
      ...
```

Project folder:

```text
.codecut-workspace/projects/<projectId>/
  workspace.json
  00-brief/
    user-message.md
    intent-analysis.md
    clarification-questions.md
    clarification-answers.md
    assumptions.md
    requirement-intake.md
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
    visual-qa/
      <runId>/
        timeline-contact-sheet.png
        export-contact-sheet.png
        export-frames-manifest.json
        visual-qa-verdict.json
        visual-qa-verdict.md
  07-exports/
  08-learning/
    methodology-proposal.md
    accepted-updates.md
```

## Required Order

1. Understand the user message and write intent analysis.
2. Call `open_codecut_workspace`, then wait for explicit user confirmation in
   chat or widget submission before calling `submit_codecut_setup` with
   `confirmedByUser: true`.
3. Use the workspace index created by `submit_codecut_setup`.
4. Carry the returned confirmation token into all workspace side-effect
   commands.
5. Save and classify all provided local materials.
6. Run ffprobe inventory for video/audio assets.
7. Ask clarification questions with choices and one recommended option when
   requirement intake still needs them.
8. Write route and planning documents.
9. At the start of edit planning, read confirmed local methodology from
   `.codecut-workspace/user-methodology/` when present. Current user
   instructions override stored methodology.
10. Create the Codecut executor project only when editing execution begins.
11. Before reporting editing completion, record visual QA under
    `06-verification/visual-qa/<runId>/`.
12. After MP4 export, extract frames from the final exported file and update the
    visual QA verdict before reporting delivery.
13. After verified completion, write a methodology proposal under
    `08-learning/methodology-proposal.md` and ask the user whether to update
    `.codecut-workspace/user-methodology/`.

## CLI

Initialize only for an explicitly recovered confirmed project that is missing
`workspace.json`. New widget-created jobs are initialized by
`submit_codecut_setup`; do not rerun this command for those projects.

```bash
node scripts/codecut-workspace.mjs init \
  --project-id <id> \
  --name "<business project name>" \
  --user-message "<original user request>" \
  --confirmation-token <token>
```

Add local assets:

```bash
node scripts/codecut-workspace.mjs add-assets \
  --project-id <id> \
  --file /absolute/path/source.mp4 \
  --file /absolute/path/brief.pdf \
  --confirmation-token <token>
```

Probe video/audio assets:

```bash
node scripts/codecut-workspace.mjs probe-assets \
  --project-id <id> \
  --confirmation-token <token>
```

Write a planning document:

```bash
node scripts/codecut-workspace.mjs write-doc \
  --project-id <id> \
  --kind workflow-route \
  --content-file /absolute/path/workflow-route.md \
  --confirmation-token <token>
```

Extract frames from a final exported MP4:

```bash
node scripts/codecut-workspace.mjs extract-export-frames \
  --project-id <id> \
  --run-id qa-YYYYMMDD-HHMMSS \
  --export-file /absolute/path/final.mp4 \
  --start-time 0 \
  --end-time <duration-seconds> \
  --frame-count 8 \
  --confirmation-token <token>
```

Record the visual QA verdict after inspecting the contact sheets:

```bash
node scripts/codecut-workspace.mjs record-visual-qa \
  --project-id <id> \
  --run-id qa-YYYYMMDD-HHMMSS \
  --verdict-json-file /absolute/path/visual-qa-verdict.json \
  --confirmation-token <token>
```

Supported `write-doc` kinds:

```text
user-message
intent-analysis
clarification-questions
clarification-answers
assumptions
requirement-intake
content-breakdown
hook-selection
voiceover-script
talking-script
material-audit
workflow-route
editing-decision-ledger
timeline-restructure
edit-plan-notes
methodology-proposal
methodology-accepted-updates
```

## Boundaries

- This workspace is local-only and excluded from git and plugin-cache sync.
- User-specific methodology is private and must stay under
  `.codecut-workspace/user-methodology/`.
- Project learning proposals live under `08-learning/` and do not update
  long-term preferences unless the user confirms.
- It does not create, import into, or mutate a Codecut executor project.
- It does not mutate tracks, media assets, project settings, derived assets, or
  timeline state.
- It does not replace `build-video-context`, `inspect-video-range`,
  transcription, EditPlan validation, or timeline verification.
- It is the business and material planning layer before those executor tools run.
