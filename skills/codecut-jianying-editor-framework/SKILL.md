---
name: codecut-jianying-editor-framework
description: "Use when operating or extending the Codex-only Codecut editing MVP: local executor, codex-bridge CLI, media inspection, local transcription, EditPlan validation/application, timeline verification, and human preview."
---

# Codecut Jianying Editor Framework

## Overview

This is the main Codex skill for the current Codex-only Codecut editing MVP. Codecut is a local deterministic executor plus a browser-side visual preview surface. Codex is the only LLM and agent layer.

Current implemented scope: use the local executor API and `scripts/codex-bridge.mjs` CLI to create or inspect a project, update explicit project settings when needed, import local media, list media, transcribe one existing audio/video asset, generate an EditPlan or NarratedRemixPlan in Codex, apply that plan through Codecut validation, apply explicit masked visual effect actions when an existing person-mask derived asset is available, verify timeline state, and provide a browser URL for human preview.

Historical Jianying and OpusClip notes are research material only. Do not install them into Codecut, do not copy their runtimes into the app, and do not treat them as the current tool contract.

## First Principles

- Start from the creator outcome, not the code surface.
- State assumptions and success criteria before implementation.
- Choose the simplest path that reuses Codecut's existing editor contracts.
- Use one execution path. Do not add magic defaults, silent fallbacks, or compatibility branches.
- Fail fast when inputs, assets, or editor state are invalid.
- Code comments, when needed, must be in English.

## Operational Discipline

- Treat `CODECUT_AGENT_BRIDGE_*` as the only supported bridge environment prefix.
- Do not map, infer, or revive legacy non-Codecut bridge environment prefixes inside commands.
- If a required `CODECUT_AGENT_BRIDGE_*` key is missing, first load `apps/web/.env.local` from the plugin root with `set -a; source apps/web/.env.local; set +a`, then retry the env check without printing token values. If the key is still missing, stop at P0 and report the exact missing key.
- Keep progress updates about the business run: service gate, project ID, media ID, transcription, EditPlan validation, timeline verification.
- Do not narrate plugin cache paths, framework provenance, or reference-file audits unless a command fails because of that layer.
- Do not continue after `doctor-install`, `doctor`, `import-media`, `transcribe`, `build-post-cut-captions`, `apply-plan`, or `get_timeline_state` fails. Fix the failing gate first.

## Read First

Default read set for execution tasks:

1. Current executable workflow: [../../docs/codex-driven-editing.md](../../docs/codex-driven-editing.md)
2. Exactly one matching workflow recipe from the table below.

Do not read every reference file before execution. The remaining references are lookup material only:

- Execution and acceptance contract: [references/execution-contract.md](references/execution-contract.md)
- round-trip editing contract: [references/round-trip-editing-contract.md](references/round-trip-editing-contract.md)
- Codecut agent tool contract: [references/codecut-agent-tool-contract.md](references/codecut-agent-tool-contract.md)
- Editing intent router: [references/editing-intent-router.md](references/editing-intent-router.md)
- EditPlan schema: [references/edit-plan-schema.md](references/edit-plan-schema.md)
- VideoContext contract: [references/video-context-contract.md](references/video-context-contract.md)
- Platform presets: [references/platform-presets.md](references/platform-presets.md)
- Source provenance and research notes: [references/source-repo.md](references/source-repo.md), [references/jianying-to-codecut-map.md](references/jianying-to-codecut-map.md), [references/pressure-tests.md](references/pressure-tests.md), [references/long-to-short-mvp-fixture.md](references/long-to-short-mvp-fixture.md)

## Codecut Routing

| User intent | Primary Codecut surface |
| --- | --- |
| User-triggered editor operation | `apps/web/src/lib/actions/definitions.ts`, `apps/web/src/hooks/actions/use-editor-actions.ts` |
| Undoable timeline or media mutation | `apps/web/src/lib/commands/` |
| Timeline track and element shape | `apps/web/src/types/timeline.ts` |
| Editor state from React UI | `apps/web/src/hooks/use-editor.ts` |
| Editor state outside React | `EditorCore.getInstance()` from `apps/web/src/core/index.ts` |
| Preview/render behavior | `apps/web/src/services/renderer/`, `apps/web/src/components/editor/panels/preview/` |
| TTS, audio, AI generation | `apps/web/src/lib/tts/`, `apps/web/src/app/api/tts/`, `apps/web/src/app/api/ai/`, `apps/web/src/stores/sounds-store.ts` |
| Editing request classification | `references/editing-intent-router.md` |
| Structured editing plan | `references/edit-plan-schema.md` |
| Video analysis context | `references/video-context-contract.md` |
| Social platform output rules | `references/platform-presets.md` |
| Round-trip editor execution | `references/round-trip-editing-contract.md` |
| Agent tool boundary | `references/codecut-agent-tool-contract.md` |
| Long-to-short MVP acceptance fixture | `references/long-to-short-mvp-fixture.md` |
| Current bridge CLI | `scripts/codex-bridge.mjs` |
| Current bridge whitelist | `apps/web/src/lib/agent-bridge/schema.ts` |
| Current EditPlan validator/apply path | `apps/web/src/lib/agent-bridge/edit-plan/` |
| Current NarratedRemixPlan validator/apply path | `apps/web/src/lib/agent-bridge/narrated-remix/` |

## Workflow Recipes

Use the intent router first, then read only the matching recipe. Recipes are Codecut execution playbooks, not new runtime APIs.

| User outcome | Recipe |
| --- | --- |
| Compress one source into a short video | `references/workflow-recipes/long-to-short.md` |
| Tighten a talking-head video or remove filler | `references/workflow-recipes/talking-head-polish.md` |
| Add, repair, or style timed subtitles | `references/workflow-recipes/subtitle-pass.md` |
| Build a narrated B-roll or voiceover edit | `references/workflow-recipes/voiceover-remix.md` |
| Inspect an existing timeline before editing or export | `references/workflow-recipes/timeline-inspection.md` |

## Fast Path: Local File To Short

Use this fast path when the user request contains an absolute local media path and a concrete short-video goal, such as "剪成 1 分钟竖屏".

Do not stop at framework analysis. Execute the workflow.

1. Parse the request into:
   - source file path
   - target duration
   - target aspect ratio or platform
   - whether export is requested now or only preview is requested
2. If the user did not provide a project ID, create a new local executor project. Use a project ID that is unique and readable, for example `codex-<yyyymmdd-hhmmss>-<short-slug>`.
3. Complete the P0 CLI Runtime Gate.
4. Load bridge env from `apps/web/.env.local` when present, without printing the token:
   `set -a; source apps/web/.env.local; set +a`.
5. Run `create-project`, then `doctor-install`, then `doctor`.
6. If the target is vertical or square, call `update_project_settings` before applying the EditPlan. When a horizontal source must fill that canvas, run visual preflight before choosing `fit: "cover"` so the plan accounts for subject safe area, existing burned-in captions, and caption placement.
   - For horizontal talking-head sources with bottom burned-in captions, classify the layout before writing the EditPlan. Prefer the planning template `vertical_face_safe_crop_above_burned_captions` when the face and torso can stay large while cropping away the old subtitle band.
   - Do not use `black-bar` as a subtitle mask to hide old burned-in captions. That hides a source-layout problem behind a text style and makes preview/export quality unreliable.
   - Current runtime `fit: "cover"` is centered cover only. If the selected strategy needs an explicit source crop or anchor that the current runtime cannot express, stop and report the runtime gap instead of masking captions or pretending the crop is supported.
7. Run `import-media` with the absolute file path.
8. Run `list_media_assets`, select the imported audio/video asset, then run `transcribe`.
9. Run `build-video-context` when long-video or transcript-first planning needs source-timestamped context.
10. For talking-head cleanup or filler removal, generate a strict SpeechCleanupPlan first, then project it through `rebuildTimelineFromSpeechCleanup()` into the implemented EditPlan v1. Do not skip directly to hand-written clips when the user asks to remove filler, restarts, repeated setup, or dead air.
11. Choose the post-cut caption source after the clip sequence is stable. Prefer edited audio transcription from edited clip ranges: apply a clip-first EditPlan, run `node scripts/codex-bridge.mjs build-post-cut-captions --project-id <id> --language <auto|code> --model-id <model>`, then copy the returned captions into the final EditPlan. Otherwise use source transcript remap from transcript segments into the edited timeline; never copy source transcript timestamps directly into `captions[].startTime`.
12. Select a caption preset by video type: `talking-head-pop` for vertical opinion/talking-head clips, `tutorial-clean` for screen recordings or step-by-step demos, `documentary-soft` for calmer narrative edits, and `short-form-bold` as the default short-form fallback.
13. Generate a strict clip-first EditPlan v1 and write it to a temporary local JSON file.
14. Run `apply-plan --replace-existing true` for the newly created empty project.
15. Run `build-post-cut-captions` when captions should follow the edited audio. Then write the final EditPlan v1 with those captions and run `apply-plan --replace-existing true` again.
16. Run `get_timeline_state` and report the verified duration, track count, clip count, caption count, project ID, and editor URL.
17. Do not export unless the user explicitly asks for export after preview and an implemented export path is available.

For this path, keep progress updates operational. Avoid long meta commentary about plugin location, cache paths, or framework provenance unless a command fails.

## P0 CLI Runtime Gate

Local service readiness is the first gate. Before asking the user to open a page or sending CLI commands, verify that the Codecut web app is serving the expected local origin:

```bash
curl -fsS -o /dev/null http://127.0.0.1:4100/en/projects
```

If the readiness check fails:

1. Start the local Codecut web app from the plugin root with `bun run dev:web`.
2. Wait until the same readiness check succeeds.
3. If the app cannot start or `http://127.0.0.1:4100/en/projects` remains unavailable, stop the Codecut editing run immediately and report `P0 blocked: Codecut web service is not available on 127.0.0.1:4100`.
4. Do not ask the user to open the Browser, import media, inspect bridge env, or send CLI commands until the local service is ready.

Do not switch to another port, external origin, or magic default. The browser URL, bridge URL, and editor origin must stay aligned on `http://127.0.0.1:4100` for the MVP workflow.

Browser role:

- Browser is the human preview and manual-edit surface.
- Browser is not the Agent runtime.
- After the `http://127.0.0.1:4100/en/projects` readiness check succeeds, actively open the local preview page in the Codex in-app browser for the user.
- Opening a Browser tab is allowed only to give the user a convenient link to inspect the project page or the current editor page.
- A missing or closed Browser tab must not block Codex from operating through CLI once the headless/local executor path exists.
- Do not use screenshots, DOM control, macOS hotkeys, global menu automation, AppleScript, external browser windows, or standalone Playwright as an Agent execution dependency.

Open the preview with the Browser plugin's `control-in-app-browser` contract:

```js
const previewUrl = "http://127.0.0.1:4100/en/projects";
const { setupBrowserRuntime } = await import("<absolute-browser-plugin-root>/scripts/browser-client.mjs");
await setupBrowserRuntime({ globals: globalThis });
globalThis.browser = await agent.browsers.get("iab");
nodeRepl.write(await browser.documentation());
await (await browser.capabilities.get("visibility")).set(true);
globalThis.tab = (await browser.tabs.selected()) ?? await browser.tabs.new();
if ((await tab.url()) !== previewUrl) {
  await tab.goto(previewUrl);
}
```

Do not call `tab.goto(previewUrl)` if the selected tab is already on the preview URL; that reloads the page and can disturb manual editor work. If Browser bootstrap is unavailable, report the exact blocker and the preview URL, then continue only through the CLI gates that do not depend on Browser state.

Important current implementation gap:

- The existing bridge still has browser-mounted consumers such as `AgentBridgeProvider`.
- If a CLI command depends on a browser-mounted heartbeat or page poller, treat that as a Codecut implementation gap, not as a user workflow requirement.
- Do not ask the user to refresh or open a Browser tab merely so Codex can execute commands.
- Instead, stop and report that the requested operation still depends on legacy browser-mounted execution, then propose or implement the headless/local executor migration.

Project URL handling:

- When a project is created or modified, provide the editor URL for the user to open:

```text
http://127.0.0.1:4100/en/editor/<projectId>
```

This URL is for human preview and manual adjustment. When a concrete `projectId` is available, use it as `previewUrl` and open it in the Codex in-app browser with the same flow above. It is not a proof that the Agent executor is available.

The editing target must be explicit before any CLI command:

- Use a concrete `projectId` from the user's request, the CLI result that created the project, or a local project listing.
- Do not infer the active project from a visible Browser URL.
- Do not reuse a stale project ID from a previous run.
- The CLI `--project-id` must match the project being modified in the local executor/project store.

Before sending any business command, run the install/runtime readiness checks for the current implementation:

```bash
node scripts/codex-bridge.mjs doctor-install --project-id <id>
node scripts/codex-bridge.mjs doctor --project-id <id>
```

`doctor-install` must verify source plugin metadata, installed plugin cache, source-to-cache sync state, `CODECUT_AGENT_BRIDGE_*` env, the 4100 web service, and the executor project. It must not print token values. If `plugin_sync` fails, run `node scripts/sync-codex-local-plugin.mjs` from the plugin root, then rerun `doctor-install`. If the only available readiness path is still browser heartbeat based, report that as `P0 blocked: command execution still depends on browser-mounted bridge` rather than asking the user to open or refresh the Browser.

## Default Workflow

When the user wants Codex to edit through Codecut:

1. Complete the P0 CLI Runtime Gate above and state the concrete project ID.
2. From the plugin root, load `apps/web/.env.local` with `set -a; source apps/web/.env.local; set +a`, then confirm the bridge env exists locally: `CODECUT_AGENT_BRIDGE_URL`, `CODECUT_AGENT_BRIDGE_TOKEN`, `CODECUT_AGENT_BRIDGE_TIMEOUT_MS`, `CODECUT_AGENT_BRIDGE_INTERVAL_MS`.
3. Use `node scripts/codex-bridge.mjs doctor-install --project-id <id>` to verify source, cache, source-to-cache sync, env, 4100 service, and executor project.
4. Use the CLI executor readiness check. If the check still requires a browser-mounted heartbeat, treat it as a known implementation gap.
5. Use `node scripts/codex-bridge.mjs send --project-id <id> --tool get_project_info --args-json '{}'` to confirm the active project.
6. Use `node scripts/codex-bridge.mjs send --project-id <id> --tool list_media_assets --args-json '{}'` to inspect imported media.
7. Select one existing audio/video asset. If none exists and the user has provided an absolute local media path, use `node scripts/codex-bridge.mjs import-media --project-id <id> --file-path /absolute/path/media-file`, then call `list_media_assets` again.
8. If no media exists and no local media path is available, ask the user to import media in Codecut or provide an absolute local file path.
9. Use `node scripts/codex-bridge.mjs transcribe --project-id <id> --media-id <id> --language auto --model-id <model>` when transcript-first editing is needed.
10. Use `node scripts/codex-bridge.mjs build-video-context --project-id <id> --media-id <id> --language auto --model-id <model>` when long-video or transcript-first planning needs merged source-timestamped context. This analyzes videos longer than 300 seconds in fixed 5-minute chunks without creating temporary media assets.
11. If platform output requires a concrete canvas or FPS, call `update_project_settings` explicitly before applying the EditPlan. `EditPlan.target.aspectRatio` is a planning field and does not mutate project settings by itself. Use `clips[].fit: "cover"` for video clips that must fill the target canvas without letterboxing only after visual preflight proves the subject and existing text remain safe. For horizontal talking-head sources with bottom burned-in captions, route through `vertical_face_safe_crop_above_burned_captions` or stop on the missing source-crop runtime gap. Do not use `black-bar` as a subtitle mask for old captions.
12. For talking-head cleanup or filler removal, generate a strict SpeechCleanupPlan v2 and project it with `rebuildTimelineFromSpeechCleanup()` before applying. SpeechCleanup decisions must be sorted, non-overlapping, and exhaustive over the transcript segments Codex chooses to classify; `drop` requires `dropReason`, and `keep` must omit `dropReason`.
13. Choose the post-cut caption source after clip selection is stable. Use edited audio transcription from edited clip ranges with `node scripts/codex-bridge.mjs build-post-cut-captions --project-id <id> --language <auto|code> --model-id <model>` after applying a clip-first EditPlan; then copy the returned captions into the final EditPlan. Otherwise use source transcript remap by converting source transcript segment times into output timeline times through the selected `clips[]`. Do not use source-video transcript timestamps directly as output subtitle timestamps.
14. Generate the strict implemented EditPlan v1 in Codex for single-source clip plans. Use only fields supported by `apps/web/src/lib/agent-bridge/edit-plan/schema.ts`.
15. For existing narration audio plus video B-roll, generate strict NarratedRemixPlan v1 instead. Use only fields supported by `apps/web/src/lib/agent-bridge/narrated-remix/schema.ts`; do not include TTS, BGM, SFX, image B-roll, or generated audio fields.
16. Write the plan to a local JSON file. Use `node scripts/codex-bridge.mjs apply-plan --project-id <id> --plan-json-file /absolute/path/edit-plan.json --replace-existing <true|false>` for EditPlan. Use `node scripts/codex-bridge.mjs send --project-id <id> --tool apply_narrated_remix_plan --args-json '{"plan":<json>,"replaceExisting":true}'` for NarratedRemixPlan.
17. If `build-post-cut-captions` was used, write a final EditPlan JSON with the returned captions and apply it with `replace-existing true`.
18. Use `node scripts/codex-bridge.mjs send --project-id <id> --tool get_timeline_state --args-json '{}'` to verify the applied timeline.
19. Provide the editor URL for human preview and manual adjustment. Do not run export through the local executor until executor export is implemented and the user confirms.

When the user asks to extend Codecut implementation code:

1. Inspect the current implemented contract before proposing new tools.
2. Prefer improving the existing snake_case bridge tools over inventing a parallel camelCase tool surface.
3. Write or run focused tests before changing implementation code.
4. Keep all LLM reasoning in Codex. Codecut must not call LLM providers or generate EditPlans internally.
5. Verify with automated tests and browser-visible proof when UI/editor behavior changes.

## Non-Negotiables

- Do not claim the implemented MVP has `getProjectState`, `buildVideoContext`, `validateEditPlan`, `previewEditPlan`, `applyEditPlan`, or `verifyEditorState` bridge tools. Those names are product-direction references, not the current implemented API.
- Do not recommend freezing the current bridge to those six camelCase tools unless the user explicitly asks for a future migration plan.
- Do not bypass the implemented EditPlan validator/application path for generated edits.
- Do not let Codecut call LLM providers, store LLM provider config, or generate EditPlans internally.
- Do not mutate timeline state from UI components when a command, manager, or existing editor core path already owns that behavior.
- Keep track semantics explicit: `video`, `text`, `audio`, and `sticker` are different product surfaces.
- Do not guess effect, transition, audio, or model IDs. Resolve them from existing typed data, APIs, or an explicit registry.
- Do not introduce Jianying app paths, `draft_info.json`, `pyJianYingDraft`, or `JyProject` as Codecut runtime dependencies.
- Do not introduce OpusClip cloud API calls as the Codecut MVP path.
- Do not add broad configurability before a repeated business pattern exists.

## Acceptance Standard

For every editing operation through the current MVP, verify the user-visible result and the editor state contract:

- Requested tracks/elements exist with correct type, timing, duration, and source.
- `apply_edit_plan` returns a successful execution summary.
- `apply_narrated_remix_plan` returns a successful execution summary when the request is existing narration audio plus video B-roll.
- `get_timeline_state` confirms the expected element count, timing, duration, and media source.
- Audio stays on audio tracks, text stays on text tracks, and visual media stays on video or sticker tracks.
- Narration audio and subtitles remain aligned through existing imported audio assets only; bridge-exposed speech generation is not part of the current MVP.
- Captions must declare a reliable post-cut caption source: `build-post-cut-captions` edited audio transcription from edited clip ranges or source transcript remap. A source transcript timestamp is not valid unless remapped through the selected clips.
- Browser proof is for human preview only; executor state proof comes from CLI results and `get_timeline_state`.
- Tests, lint, or focused validation are run for the touched surface.

Current known MVP gaps:

- There is no separate `preview_edit_plan` bridge tool yet.
- The current `apply_edit_plan` path validates and mutates in one bridge command.
- `EditPlan.target.aspectRatio` does not apply project canvas settings by itself; use `update_project_settings` when vertical or square output is required.
- `clips[].fit: "cover"` is the only implemented clip fit value. It creates a centered cover transform for video clips with known dimensions and is readable through `get_timeline_state`.
- There is no explicit source-crop or face-anchor EditPlan field yet. If visual preflight selects `vertical_face_safe_crop_above_burned_captions`, report the runtime gap unless the centered `cover` transform is enough.
- Undo/redo transaction hardening is a future implementation task.
- Local executor export is not implemented yet; treat export as a separate follow-up migration, not a default Codex command.
- Bridge-exposed speech generation is not part of the current MVP. Existing audio assets can be placed on audio tracks through the implemented audio timeline tool.
- NarratedRemixPlan v1 supports existing narration audio, imported video B-roll, and captions only. It does not support TTS, BGM, SFX, image B-roll, effects, or append mode.
- Transcript-first editing requires an imported audio/video asset and the local executor transcription runtime.
