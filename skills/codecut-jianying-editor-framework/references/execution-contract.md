# Execution Contract

## Current Stage

The current deliverable is an installed Codex-only Codecut editing MVP. The browser bridge, deterministic tool whitelist, EditPlan validator/application path, and codex-bridge CLI exist.

Use this contract to operate and extend the current MVP. Do not describe future preview/verify tool names as implemented unless the app code exposes them.

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
3. For Codex-generated edits, use the implemented bridge path: `get_project_info`, optional `update_project_settings` for explicit canvas/FPS requirements, `list_media_assets`, `transcribe_media`, Codex-generated implemented `EditPlan`, `apply_edit_plan`, then `get_timeline_state`.
4. Write or run a failing validation first for implementation code.
5. Use existing Codecut paths:
   - actions for user-facing triggers
   - commands for undoable state changes
   - managers for editor domain operations
   - typed timeline models for element shape
   - API routes/services for media, AI, TTS, and export boundaries
6. Keep the change narrow. Do not refactor unrelated editor code.
7. Verify and report the exact result.

## Agent Tool Loop

The current runtime contract exposes the tools needed for the Codex-only MVP:

Before this loop starts, the local service and current executor path must be ready, and the project ID must be explicit. The editor URL is for human preview and manual adjustment, not for proving that the agent executor is available.

1. `get_project_info`
2. `update_project_settings` only when the user outcome requires a concrete canvas, FPS, or background
3. `list_media_assets`
4. `import_media_file` only when no suitable media exists and the user provided an absolute local file path
5. `transcribe_media`
6. `apply_edit_plan`
7. `get_timeline_state`
8. `export_project` only after user confirmation and only when an implemented executor/browser export path is explicitly available

Future separate `preview_edit_plan` and `verify_editor_state` tools can be planned later, but they are not part of the currently installed tool surface. Current `apply_edit_plan` validates and mutates through the editor runtime in one bridge command.

Local executor export is not implemented yet. Do not treat `export_project` as part of the default executor loop.

If a bridge command stays pending until timeout, stop the editing loop. If the current implementation still depends on a browser-mounted poller or heartbeat, report that as an executor gap instead of asking the user to refresh a Browser tab. Do not enqueue more edit commands while the executor is not consuming.

## Validation Matrix

| Change type | Minimum validation |
| --- | --- |
| Pure routing or config skill change | Codex skill validator plus file existence check |
| Agent tool contract | Schema/content check proving required tools and failure behavior are documented |
| Current EditPlan apply path | Schema validation, `apply_edit_plan` result, and `get_timeline_state`; do not claim separate preview or all-or-nothing rollback until implemented |
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
- A generated edit is not complete until the user can preview the applied result in Codecut and the timeline state verifies the requested tracks/elements. Separate preview-before-mutation remains a future tool.
- If implementation requires a new abstraction, first show the repeated pattern or current ownership boundary that makes it necessary.
