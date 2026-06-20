# Codex-Driven Cutia Editing

This workflow keeps all LLM and agent reasoning outside Cutia. Cutia exposes deterministic browser tools for media inspection, transcription, timeline mutation, validation, and export. Codex owns user intent, clip selection, EditPlan creation, retries, and user communication.

## Product Boundary

Cutia does:

- Show the editor UI and timeline state.
- Store imported media assets for the active browser project.
- Run browser-side transcription for an existing audio or video asset.
- Validate an explicit EditPlan.
- Apply a valid EditPlan to the timeline.
- Export the current project through the browser export runtime.

Cutia does not:

- Configure or store an LLM provider.
- Call OpenAI, Anthropic, or any OpenAI-compatible API.
- Run an internal editing agent.
- Understand natural-language editing requests.
- Generate, complete, guess, or repair an EditPlan.

Codex is the only LLM and Agent layer. Cutia is the visual executor and validator.

## Required Local Environment

The Codex bridge CLI reads bridge access only from local environment variables:

```bash
export CUTIA_AGENT_BRIDGE_URL="http://localhost:4100"
export CUTIA_AGENT_BRIDGE_TOKEN="<local bridge token>"
export CUTIA_AGENT_BRIDGE_TIMEOUT_MS="120000"
export CUTIA_AGENT_BRIDGE_INTERVAL_MS="1000"
```

Do not pass the token as a CLI flag. Do not commit local tokens or `.env` files.

## EditPlan Contract

Codex sends exactly one editing plan format to Cutia:

```ts
{
  version: 1,
  projectId: string,
  sourceMediaId: string,
  target: {
    durationSec: number,
    aspectRatio: "9:16" | "16:9" | "1:1"
  },
  clips: Array<{
    id: string,
    sourceStart: number,
    sourceEnd: number,
    timelineStart: number,
    reason: string
  }>,
  title?: {
    text: string,
    startTime: number,
    duration: number
  },
  captions?: Array<{
    text: string,
    startTime: number,
    duration: number
  }>,
  rationale: string
}
```

Cutia validates and executes this plan. If validation fails, Cutia returns a structured error. Codex must generate a corrected plan and retry.

## End-to-End Workflow

1. The user opens the Cutia editor in the browser.
2. The user imports a long video into the active project.
3. Codex calls `get_project_info` to confirm the active project.
4. Codex calls `list_media_assets` to inspect available media.
5. Codex selects the target media asset for editing.
6. Codex calls `transcribe_media` for that media asset.
7. Codex uses its own context to choose clips and write an EditPlan JSON file.
8. Codex calls `apply_edit_plan` with that EditPlan.
9. Codex calls `get_timeline_state` to verify the applied timeline.
10. The user previews the result or asks Codex for another revision.
11. Codex can optionally call `export_project` after the user confirms the timeline.

## CLI Commands

Transcribe an existing imported media asset:

```bash
node scripts/codex-bridge.mjs transcribe \
  --project-id <id> \
  --media-id <id> \
  --language auto \
  --model-id <model>
```

Apply a local EditPlan file:

```bash
node scripts/codex-bridge.mjs apply-plan \
  --project-id <id> \
  --plan-json-file /absolute/path/edit-plan.json \
  --replace-existing true
```

Check the applied timeline:

```bash
node scripts/codex-bridge.mjs send \
  --project-id <id> \
  --tool get_timeline_state \
  --args-json '{}'
```

Export after review:

```bash
node scripts/codex-bridge.mjs export \
  --project-id <id> \
  --format mp4 \
  --quality high \
  --include-audio true \
  --download true
```

## Failure Handling

- If `transcribe_media` cannot find the media asset, Codex must call `list_media_assets` again and select a valid asset.
- If `apply_edit_plan` fails validation, Codex must correct the EditPlan. Cutia must not auto-fix it.
- If the timeline is not empty, Codex must pass `replaceExisting=true` only when replacing the current cut is intentional.
- If export fails, Codex must first verify media availability and browser permissions before retrying.

`generate_captions` is not part of the Codex-only MVP automation path. Captions in this workflow come from the Codex-authored EditPlan and are applied by `apply_edit_plan`.
