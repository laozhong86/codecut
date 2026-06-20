# Codex-Driven Codecut Editing

This workflow keeps all LLM and agent reasoning outside Codecut. Codex operates Codecut through deterministic local CLI/executor tools. The browser editor is for human preview, manual adjustment, and live status visibility. Codex owns user intent, clip selection, EditPlan creation, retries, and user communication.

## Product Boundary

Codecut does:

- Show the editor UI and timeline state.
- Store media assets imported through the UI or the local Codex bridge.
- Run deterministic local executor transcription for an existing audio or video asset.
- Validate an explicit EditPlan.
- Apply a valid EditPlan to the timeline.
- Export the current project through a deterministic export runtime.

Codecut does not:

- Configure or store an LLM provider.
- Call OpenAI, Anthropic, or any OpenAI-compatible API.
- Run an internal editing agent.
- Understand natural-language editing requests.
- Generate, complete, guess, or repair an EditPlan.

Codex is the only LLM and Agent layer. Codecut is the visual executor and validator.

Browser is the human interface, not the Agent runtime. Opening the browser is only a convenience for the user to inspect the project URL and manually adjust the result. Codex command execution must not depend on a visible browser tab, screenshots, DOM control, or a page-mounted heartbeat.

## Required Local Environment

The Codex bridge CLI reads bridge access only from local environment variables:

```bash
export CODECUT_AGENT_BRIDGE_URL="http://localhost:4100"
export CODECUT_AGENT_BRIDGE_TOKEN="<local bridge token>"
export CODECUT_AGENT_BRIDGE_TIMEOUT_MS="120000"
export CODECUT_AGENT_BRIDGE_INTERVAL_MS="1000"
```

Do not pass the token as a CLI flag. Do not commit local tokens or `.env` files. `CODECUT_AGENT_BRIDGE_*` is the only supported prefix; missing keys must fail fast instead of being inferred from legacy names.

## Local Web Service Gate

Before opening, asking the user to open, or navigating the Codex in-app browser, Codex must verify that Codecut is serving the MVP origin:

```bash
curl -fsS -o /dev/null http://127.0.0.1:4100/en/projects
```

If the readiness check fails, start the local Codecut web app from the plugin root:

```bash
bun run dev:web
```

Wait until the same readiness check succeeds. If the app cannot start or `http://127.0.0.1:4100/en/projects` remains unavailable, stop the workflow and report `P0 blocked: Codecut web service is not available on 127.0.0.1:4100`.

Do not ask the user to open the Browser, import media, inspect bridge env, or send bridge commands until this service gate passes. Do not switch to another port, external origin, or magic default. The browser URL, bridge URL, and editor origin must stay aligned on `http://127.0.0.1:4100`.

## CLI Runtime And Human Preview

Codecut editing commands should be consumed by a local CLI/executor process that reads and writes the project state directly. The browser page subscribes to project state and displays progress/results for the human user.

Opening a browser page is not a startup gate for Codex. When a project exists, Codex should provide the editor URL:

```text
http://127.0.0.1:4100/en/editor/<projectId>
```

This link is for human preview and manual adjustment only. Do not use browser visibility, screenshots, DOM control, macOS global hotkeys, AppleScript, external browser windows, or standalone Playwright as an Agent execution dependency.

Current implementation gap:

- Some existing bridge commands are still consumed by `AgentBridgeProvider` in the editor page.
- If a command requires browser-mounted heartbeat, report `P0 blocked: command execution still depends on browser-mounted bridge`.
- Do not ask the user to open or refresh the browser merely so Codex can execute commands.
- The structural fix is to move command consumption into a local executor and make the browser subscribe to project state.

The editing target must be explicit before Codex sends bridge commands:

- Use the project ID from the user's request, a local project listing, or the CLI response that created the project.
- Do not reuse a stale project ID from a previous run.
- The CLI `--project-id` must match the local project store entry being modified.

If a command remains pending until timeout, stop sending more commands. Do not recover by refreshing the browser. Treat this as executor unavailability and fix the local command consumer.

Before the first business bridge command, run:

```bash
node scripts/codex-bridge.mjs doctor-install --project-id <id>
```

`doctor-install` checks the source plugin, installed Codex plugin cache, `CODECUT_AGENT_BRIDGE_*` environment, the 4100 web service, and the executor project. It verifies that the token exists but never prints the token value.

Then run the executor readiness check:

```bash
node scripts/codex-bridge.mjs doctor --project-id <id>
```

`doctor` checks local executor readiness through the executor status endpoint. Do not use browser-mounted heartbeat as the readiness gate for Codex command execution.

## EditPlan Contract

Codex sends exactly one editing plan format to Codecut:

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
  captionStyle?: {
    preset: "short-form-bold" | "black-bar",
    position: "lower-safe" | "center"
  },
  rationale: string
}
```

Codecut validates and executes this plan. If validation fails, Codecut returns a structured error. Codex must generate a corrected plan and retry.

When `captions` contains one or more items, Codex must include
`captionStyle`. When `captions` is empty or omitted, `captionStyle` must be
omitted. Caption styling is intentionally limited to local presets:
`short-form-bold` and `black-bar`. Codecut does not accept arbitrary CSS,
per-caption style objects, or `keyword-highlight` in this P0 contract.

## End-to-End Workflow

1. Codex confirms the local Codecut service is ready.
2. Codex creates or confirms one concrete project ID through CLI/local project state.
3. Codex calls `doctor` to confirm the local executor is ready.
4. The user imports a long video into the active project, or Codex imports a local media file with `import-media`.
5. Codex calls `get_project_info` to confirm the active project.
6. Codex calls `list_media_assets` to inspect available media.
7. Codex selects the target media asset for editing.
8. Codex calls `transcribe_media` for that media asset.
9. Codex uses its own context to choose clips and write an EditPlan JSON file.
10. Codex calls `apply_edit_plan` with that EditPlan.
11. Codex calls `get_timeline_state` to verify the applied timeline.
12. Codex provides the editor URL so the user can preview the result or ask for another revision.
13. Export is a separate follow-up until local executor export is implemented and tested.

## Fast Path: Local File To Short

When the request includes one absolute local media file and a concrete target such as "1 minute vertical short", Codex should execute directly:

1. Create a new executor project if no project ID is provided.
2. Run `doctor`.
3. Apply explicit project settings for vertical/square output.
4. Import the local file.
5. List media and select the imported audio/video asset.
6. Transcribe through the local executor.
7. Generate and apply one EditPlan v1.
8. Verify with `get_timeline_state`.
9. Provide the editor URL for human preview.

Do not spend the first turn auditing all skill references. Read only the workflow document and the matching recipe unless an implementation or validation failure requires deeper reference lookup.

## CLI Commands

Check that the local executor is ready before sending business commands:

```bash
node scripts/codex-bridge.mjs doctor-install --project-id <id>
```

```bash
node scripts/codex-bridge.mjs doctor --project-id <id>
```

Import a local media file into the active executor project's media library:

```bash
node scripts/codex-bridge.mjs import-media \
  --project-id <id> \
  --file-path /absolute/path/source.mp4
```

The local file path stays on the Codex side. The CLI reads the file bytes and sends a base64 payload through the local bridge; very large source videos can hit local request size or timeout limits.

Transcribe an existing imported media asset:

```bash
node scripts/codex-bridge.mjs transcribe \
  --project-id <id> \
  --media-id <id> \
  --language auto \
  --model-id <model>
```

`transcribe_media` runs in the local executor. It extracts 16 kHz mono audio with `ffmpeg` and runs the selected Transformers.js Whisper model in Node. It does not require a visible browser tab or a page-mounted command consumer.

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

Export after review is not part of the current local executor path:

```bash
Do not call `node scripts/codex-bridge.mjs export` for the executor workflow until executor export has been implemented and verified.
```

## Failure Handling

- If `import_media_file` fails, Codex must verify the file path, file type, and active browser project before retrying.
- If `transcribe_media` cannot find the media asset, Codex must call `list_media_assets` again and select a valid asset.
- If `apply_edit_plan` fails validation, Codex must correct the EditPlan. Codecut must not auto-fix it.
- If the timeline is not empty, Codex must pass `replaceExisting=true` only when replacing the current cut is intentional.
- If export is requested, treat it as a separate migration task unless an implemented executor export path is available.

`generate_captions` is not part of the Codex-only MVP automation path. Captions in this workflow come from the Codex-authored EditPlan and are applied by `apply_edit_plan`.
