# Execution Contract

## Current Stage

The current deliverable is an installed Codex-only Codecut editing MVP. The browser bridge, deterministic tool whitelist, EditPlan validation/preview/application/verification path, local export command contract, and codex-bridge CLI exist.

Use this contract to operate and extend the current MVP. Use implemented snake_case executor tools, not future camelCase product-direction names.

## Success Standard

A Codecut editing task is complete only when the creator outcome is visible and the editor state contract is verified.

Define success before coding:

- user scenario
- target editor surface
- expected timeline tracks and elements
- expected preview behavior
- persistence or export expectation
- verification command or browser proof

## Implementation Flow

1. State assumptions. If the request has multiple valid interpretations, list them and ask only when the wrong choice would change the product outcome.
2. Read the smallest relevant surface from `SKILL.md` routing.
3. For Codex-generated edits, use the current callable MCP path: `get_project_info`, `list_media_assets`, optional `import_media`, `transcribe_media`, `build_video_context` when transcript-first planning needs source-timestamped context, Codex-generated implemented `EditPlan`, `validate_edit_plan`, `preview_edit_plan`, `apply_edit_plan`, `verify_timeline`, then `get_timeline_state`.
4. If the user outcome requires canvas, FPS, or background mutation and no current callable project-settings tool is visible, stop and report that runtime gap instead of naming an unavailable tool.
5. Write or run a failing validation first for implementation code.
6. Use existing Codecut paths:
   - actions for user-facing triggers
   - commands for undoable state changes
   - managers for editor domain operations
   - typed timeline models for element shape
   - API routes/services for media, AI, TTS, and export boundaries
7. Keep the change narrow. Do not refactor unrelated editor code.
8. Verify and report the exact result.

## Agent Tool Loop

The current runtime contract exposes the tools needed for the Codex-only MVP:

Before this loop starts, the local service and current executor path must be ready, and the project ID must be explicit. The editor URL is for human preview and manual adjustment, not for proving that the agent executor is available.

1. `get_project_info`
2. `list_media_assets`
3. `import_media` only when no suitable media exists and the user provided an explicit source
4. `transcribe_media`
5. `build_video_context` when long-video or transcript-first planning needs merged source-timestamped context
6. `validate_edit_plan`
7. `preview_edit_plan`
8. `apply_edit_plan`
9. `verify_timeline`
10. `get_timeline_state`
11. `export_project` only after user confirmation and only with explicit `format`, `quality`, `includeAudio`, `outputFile`, and `overwrite`
12. `export_timeline_frame` only after user confirmation and only with explicit `timeSeconds`, `format: "png"`, `outputFile`, and `overwrite`

`validate_edit_plan` and `preview_edit_plan` are read-only. `apply_edit_plan` is the only EditPlan mutation path. `verify_timeline` compares explicit verification JSON to current timeline metrics and reports field-level mismatches.

`export_project` is executor-native and writes one explicit local file. `export_timeline_frame` is executor-native and writes one explicit local PNG frame file. The local executor must not use browser download as a fallback. If the current server runtime lacks a Node-compatible renderer, export fails fast with that runtime gap.

If a bridge command stays pending until timeout, stop the editing loop. If the current implementation still depends on a browser-mounted poller or heartbeat, report that as an executor gap instead of asking the user to refresh a Browser tab. Do not enqueue more edit commands while the executor is not consuming.

## Validation Matrix

| Change type | Minimum validation |
| --- | --- |
| Pure routing or config skill change | Codex skill validator plus file existence check |
| Agent tool contract | Schema/content check proving required tools and failure behavior are documented |
| Current EditPlan apply path | `validate_edit_plan`, `preview_edit_plan`, `apply_edit_plan`, `verify_timeline`, and `get_timeline_state`; do not claim all-or-nothing rollback until implemented |
| Timeline command or manager | Focused unit test proving state before and after |
| User action | Action definition, handler behavior, and undo/redo expectation |
| UI editor change | Focused test where available plus browser-visible proof |
| Media import or generated media | Source resolution and timeline element verification |
| TTS/subtitle | Audio element, text element, timing alignment, and failure behavior |
| Export | Output existence, format, and user-facing error path |

## Failure Rules

- Throw or return explicit errors for invalid inputs.
- Do not silently skip missing assets.
- Do not substitute unrelated media, voices, effects, or transitions.
- Do not add automatic downgrade behavior.
- Do not catch errors without surfacing the concrete failure reason.

## Product Guardrails

- Preserve Codecut's local-first, privacy-first positioning.
- Prefer creator workflow value over broad platform abstraction.
- A feature that cannot be verified in editor state or browser preview is not complete.
- A generated edit is not complete until the user can preview the applied result in Codecut and the timeline state verifies the requested tracks/elements.
- If implementation requires a new abstraction, first show the repeated pattern or current ownership boundary that makes it necessary.
