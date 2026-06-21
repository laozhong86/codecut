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
    duration: number,
    stylePreset?: "hook_title" | "lower_title",
    richSpans?: Array<{
      start: number,
      end: number,
      color?: string,
      fontScale?: number,
      fontWeight?: "normal" | "bold",
      fontStyle?: "normal" | "italic",
      stroke?: { color: string, width: number }
    }>
  },
  captions?: Array<{
    text: string,
    startTime: number,
    duration: number,
    richSpans?: Array<{
      start: number,
      end: number,
      color?: string,
      fontScale?: number,
      fontWeight?: "normal" | "bold",
      fontStyle?: "normal" | "italic",
      stroke?: { color: string, width: number }
    }>
  }>,
  captionStyle?: {
    preset: "short-form-bold" | "black-bar",
    position: "lower-safe" | "center"
  },
  audio?: {
    bgm?: {
      assetId: string,
      volume: number,
      mode: "loop_to_timeline"
    },
    sfx?: Array<{
      assetId: string,
      startTime: number,
      volume: number
    }>
  },
  transitions?: Array<{
    fromClipId: string,
    toClipId: string,
    type:
      | "fade"
      | "dissolve"
      | "wipe-left"
      | "wipe-right"
      | "wipe-up"
      | "wipe-down"
      | "slide-left"
      | "slide-right"
      | "slide-up"
      | "slide-down"
      | "zoom-in"
      | "zoom-out",
    duration: number
  }>,
  rationale: string
}
```

Codecut validates and executes this plan. If validation fails, Codecut returns a structured error. Codex must generate a corrected plan and retry.

When `captions` contains one or more items, Codex must include
`captionStyle`. When `captions` is empty or omitted, `captionStyle` must be
omitted. Caption styling is intentionally limited to top-level local presets:
`short-form-bold` and `black-bar`. Codecut does not accept arbitrary CSS,
per-caption style objects, `bold_caption`, `keyword_caption`, or
`keyword-highlight` in this P0 contract.

`title.stylePreset` is optional. If omitted, Codecut keeps the existing default
text behavior. If present, it must be `hook_title` or `lower_title`.

`title.richSpans` and `captions[].richSpans` are optional keyword styling
ranges. Ranges use `[start, end)` code point indexes over `Array.from(text)`.
Spans must be integer, ordered, non-overlapping, and inside the text length.
Invalid rich spans fail validation; Codecut does not repair or clamp them.

`audio.bgm.assetId` and every `audio.sfx[].assetId` must refer to an already
imported audio media asset in the same project. Codecut does not search,
download, substitute, or silently drop missing audio. `volume` is `0..1`.
`bgm.mode` only supports `loop_to_timeline`; Codecut loops and truncates the
last segment to the generated timeline duration. SFX starts at the declared
timeline second and is truncated at the timeline end if needed.

`transitions` only support adjacent video clips created from `clips[]`.
`fromClipId` and `toClipId` refer to `clips[].id`, not timeline element IDs.
The two clips must be adjacent within `0.05s`, and the transition duration must
not exceed either neighboring clip duration. Invalid transitions fail the plan;
Codecut does not move clips to make them valid.

## NarratedRemixPlan Contract

For existing narration audio plus multi-video B-roll, Codex may use the separate
`NarratedRemixPlan v1` contract with `apply_narrated_remix_plan`.

P0 supports only:

- already imported narration audio;
- already imported video B-roll assets;
- captions authored by Codex;
- full timeline replacement after validation.

P0 does not support:

- TTS or speech generation fields;
- BGM, SFX, or generated audio;
- image B-roll;
- partial append mode;
- visual effects or template effects.

```ts
{
  version: 1,
  projectId: string,
  target: {
    durationSec: number,
    aspectRatio: "9:16" | "16:9" | "1:1"
  },
  visualBeats: Array<{
    id: string,
    mediaId: string,
    sourceStart: number,
    sourceEnd: number,
    timelineStart: number,
    muted: true,
    reason: string
  }>,
  narration: {
    mediaId: string,
    startTime: number
  },
  captions: Array<{
    text: string,
    startTime: number,
    duration: number
  }>,
  rationale: string
}
```

Validation is all-or-nothing:

- `projectId` must match the active project.
- `narration.mediaId` must resolve to an imported audio asset with known duration.
- every `visualBeats[].mediaId` must resolve to an imported video asset with
  known duration.
- every source range must be inside the source asset and have
  `sourceEnd > sourceStart`.
- visual beats must be continuous from `0` with no gaps or overlaps.
- total visual beat duration must equal `target.durationSec`.
- captions must fit inside `target.durationSec`.
- unknown fields such as `generateSpeech`, `text`, or `voiceId` fail schema
  validation.

When applied, Codecut replaces the timeline with:

- one video track containing muted B-roll clips;
- one audio track containing the narration audio;
- one text track containing captions.

After application, Codex must verify `get_timeline_state` proof fields:

- video elements expose `visual.muted`;
- audio elements expose `audio.sourceType`, `audio.volume`, and `audio.muted`;
- track-level `muted` and `hidden` fields are present when the track type
  supports them.

## End-to-End Workflow

1. Codex confirms the local Codecut service is ready.
2. Codex creates or confirms one concrete project ID through CLI/local project state.
3. Codex calls `doctor` to confirm the local executor is ready.
4. The user imports a long video into the active project, or Codex imports a local media file with `import-media`.
5. Codex calls `get_project_info` to confirm the active project.
6. Codex calls `list_media_assets` to inspect available media.
7. Codex selects the target media asset for editing.
8. Codex calls `transcribe_media` for that media asset.
9. Codex calls `build_video_context` for transcript-first planning when a long
   source video needs structured context.
10. Codex uses its own context to choose clips and write an EditPlan JSON file.
11. Codex calls `apply_edit_plan` with that EditPlan.
12. Codex calls `get_timeline_state` to verify clips, text style, audio source
    and volume, and video transitions.
13. Codex provides the editor URL so the user can preview the result or ask for another revision.
14. Export is a separate follow-up until local executor export is implemented and tested.

## Fast Path: Local File To Short

When the request includes one absolute local media file and a concrete target such as "1 minute vertical short", Codex should execute directly:

1. Create a new executor project if no project ID is provided.
2. Run `doctor`.
3. Apply explicit project settings for vertical/square output.
4. Import the local file.
5. List media and select the imported audio/video asset.
6. Transcribe through the local executor.
7. Build local VideoContext with `build-video-context` when long-video or transcript-first planning needs source-timestamped context.
8. Generate and apply one EditPlan v1.
9. Verify with `get_timeline_state`.
10. Provide the editor URL for human preview.

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

Build merged transcript context for long-video or transcript-first planning:

```bash
node scripts/codex-bridge.mjs build-video-context \
  --project-id <id> \
  --media-id <id> \
  --language auto \
  --model-id whisper-tiny
```

Apply a local EditPlan file:

```bash
node scripts/codex-bridge.mjs apply-plan \
  --project-id <id> \
  --plan-json-file /absolute/path/edit-plan.json \
  --replace-existing true
```

Apply a NarratedRemixPlan file through the generic bridge sender:

```bash
node scripts/codex-bridge.mjs send \
  --project-id <id> \
  --tool apply_narrated_remix_plan \
  --args-json '{"plan":<NarratedRemixPlan JSON>,"replaceExisting":true}'
```

Check the applied timeline:

```bash
node scripts/codex-bridge.mjs send \
  --project-id <id> \
  --tool get_timeline_state \
  --args-json '{}'
```

Create a text-background masked effect from an existing person-mask derived asset:

```bash
node scripts/codex-bridge.mjs send \
  --project-id <id> \
  --tool create_text_background_effect \
  --args-json '{"sourceMediaId":"<video-id>","derivedAssetId":"<person-mask-id>","content":"Core claim","startTime":0,"duration":5,"replaceExisting":true}'
```

Create a human picture-in-picture masked effect from an existing person-mask derived asset:

```bash
node scripts/codex-bridge.mjs send \
  --project-id <id> \
  --tool create_human_pip_effect \
  --args-json '{"foregroundMediaId":"<talking-head-id>","backgroundMediaId":"<background-video-id>","derivedAssetId":"<person-mask-id>","placement":"right_down","scale":0.35,"startTime":0,"duration":5,"replaceExisting":true}'
```

Both masked effect tools are explicit timeline actions outside EditPlan v1. They
only consume an existing `person-mask` derived asset. They do not generate
person masks, call an LLM, infer missing media, or append to non-empty timelines
unless `replaceExisting=true` is provided intentionally.

Export after review is not part of the current local executor path:

```bash
Do not call `node scripts/codex-bridge.mjs export` for the executor workflow until executor export has been implemented and verified.
```

## Failure Handling

- If `import_media_file` fails, Codex must verify the file path, file type, and active browser project before retrying.
- If `transcribe_media` cannot find the media asset, Codex must call `list_media_assets` again and select a valid asset.
- If `apply_edit_plan` fails validation, Codex must correct the EditPlan. Codecut must not auto-fix it.
- If `apply_narrated_remix_plan` fails validation, Codex must correct the NarratedRemixPlan. Codecut must not auto-fix it.
- If the timeline is not empty, Codex must pass `replaceExisting=true` only when replacing the current cut is intentional.
- If BGM/SFX is requested, Codex must import or select valid audio assets before writing the EditPlan. Missing or non-audio assets must stop the workflow.
- If TTS, image B-roll, BGM, or SFX is requested for narrated remix, stop and report that the current `NarratedRemixPlan v1` path only supports existing narration audio, video B-roll, and captions.
- If transitions are requested, Codex must generate adjacent clip timings before applying the EditPlan. Do not rely on Codecut to reposition clips.
- If a masked effect is requested, Codex must verify `get_timeline_state` exposes a matching `derivedAssets[]` person-mask entry before calling the effect action.
- If `create_text_background_effect` or `create_human_pip_effect` fails, fix the media or derived-asset input. Do not simulate the effect with unrelated low-level timeline tools.
- If export is requested, treat it as a separate migration task unless an implemented executor export path is available.

`generate_captions` is not part of the Codex-only MVP automation path. Captions in this workflow come from the Codex-authored EditPlan and are applied by `apply_edit_plan`.
