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

## Success Contract Table

Use this table as the canonical completion contract. Other skills should point
here instead of copying a separate success definition.

| Outcome | Durable truth | Required readback | Stop before claiming success | Minimum proof |
| --- | --- | --- | --- | --- |
| Workspace ready | Confirmed `projectId`, business project name, setup token when side effects are needed, and `.codecut-workspace/projects/<projectId>` | `get_project_info` or workspace state that proves the project is readable | Project ID is missing, workspace path is absent, or setup token is required but missing | Workspace path plus readable project state |
| Timeline mutated | Applied strict EditPlan, NarratedRemixPlan, or explicit low-level repair | `get_timeline_state` after mutation; include affected tracks, elements, duration, media IDs, and revision when available | `validate_edit_plan`, `preview_edit_plan`, `apply_edit_plan`, `verify_timeline`, or `get_timeline_state` fails | Readback summary matching expected tracks/elements and requested edit |
| Captions, covers, crop, or transitions applied | Timeline/editor state contains the requested native objects or project cover metadata | `get_timeline_state` with text/style/cover/sourceCrop/transition fields, or `get_project_info` for project cover | Required native object is missing, unsupported, or represented by a fake substitute | Field-level readback for the requested object |
| Local MP4 export produced | `export_project` or equivalent verified executor path produced one explicit file | Export metadata plus local file existence, non-zero size, and sampled export frames when visual delivery matters | File is missing, empty, not readable, or was produced by an unverified fallback path | Export file path, size, metadata, and export-frame verdict |
| Timeline still frame produced | `export_timeline_frame` produced the requested local PNG | Local file existence, non-zero size, and requested timestamp/format proof | `inspect_timeline` contact sheets are used as the still-frame product | PNG path, timestamp, format, and file proof |
| Human preview ready | Returned `editorUrl` opened or explicit browser-control blocker reported | Browser-visible proof is useful for the human; executor readback remains the agent truth | Bare `/editor/<projectId>` URL is reconstructed or browser failure is hidden | Exact returned `editorUrl` and preview/browser status |
| Visual QA passed | A verdict exists under `.codecut-workspace/projects/<projectId>/06-verification/visual-qa/<runId>/` | Timeline contact sheet inspection, and export-frame inspection when MP4 was delivered | `inspect_timeline` or quality report is treated as a verdict without Codex inspection | Verdict path, sampled timestamps, pass/fail status, issues, and fixes |
| Plugin-facing change ready | Source checkout, installed cache, enabled config, and current-session tool surface are all checked | `bun run plugin:freshness`; fresh-session/tool-surface proof when schema or widget behavior changed | Source tests pass but cache/session state is stale or unproven | Freshness report plus session/tool proof when applicable |

Timeline readback and export proof are different contracts. Timeline frames
prove editor state; exported MP4 frames prove the delivered file. Do not use one
as a substitute for the other.

## Human Preview Contract

Browser is not the Agent runtime. The local executor draft and readback are the
agent proof; the Codex in-app browser is only for human preview.

Whenever a Codecut project is created and an `editorUrl` is returned, open that
exact `editorUrl` in the Codex in-app browser before reporting the project
ready. This is mandatory for setup-widget project creation and direct executor
`create-project` runs. If browser control is unavailable, report the
`editorUrl` and the browser-control blocker explicitly; do not claim
browser-visible preview.

Use `setupBrowserRuntime` through the current Codex browser API, make the
browser visible, and navigate only when needed:

```ts
const previewUrl = editorUrl;
const browser = await agent.browsers.get("iab");
await (await browser.capabilities.get("visibility")).set(true);
const tab = (await browser.tabs.selected()) ?? await browser.tabs.new();
if ((await tab.url()) !== previewUrl) {
  await tab.goto(previewUrl);
}
```

Preview URLs:

- `http://127.0.0.1:4100/en/projects`
- the `editorUrl` returned by `create-project`

Do not reconstruct a bare `/editor/<projectId>` URL for executor projects; the
returned `editorUrl` carries the browser bridge token required for editor
state. Do not call `tab.goto(previewUrl)` if the selected tab is already on the
preview URL.

## Evidence And Caption Gates

- For tutorial, product-proof, screen-recording, or horizontal-to-vertical jobs,
  use visual preflight before final EditPlan authoring when crop, caption, or
  proof risk affects the result.
- Project cover and EditPlan `introCover` are separate products. A project
  cover is a poster/thumbnail outside the timeline; set it only by importing an
  image with `import_media` and calling `set_project_cover`. Do not represent a
  project cover with `introCover`, and do not shift timeline clips for it.
- If the user asks for a short-video cover/poster, use the video first frame or
  visual evidence to create an image outside Codecut runtime, route through
  `codecut-cover-generation` before importing the image, then call
  `set_project_cover` with the imported image `mediaId`, title text, prompt,
  and style preset metadata. Verify with `get_project_info` or
  `get_timeline_state` that `cover` is present and total duration is unchanged.
- If confirmed setup intent has `generateIntroCover: true`, create a timeline
  opening image before final EditPlan authoring. This is not the project cover.
  Determine the final first clip's `sourceStart`, inspect that source frame or a
  tight range with `inspect_video_range`, choose a prompt from
  `references/intro-cover-prompts.md` based on video type, generate a separate
  image through an available image generation capability outside Codecut
  runtime, import that image with `import_media`, and write `introCover` in the
  EditPlan.
- For full-source duration preservation, `generateIntroCover` defaults to
  `false` unless the user explicitly asks for a timeline opening image. A fixed
  top title is a text/title layer and must not be treated as `introCover`.
- Do not generate a timeline intro image when confirmed setup intent has
  `generateIntroCover: false`.
- Do not silently downgrade cover work. If image generation capability is
  unavailable, first-frame visual evidence is missing, or the generated image
  cannot be imported as an image asset with width and height, stop and report
  the blocker before calling timeline mutation tools.
- Intro cover duration is planned explicitly by Codex. The current recommended
  starting value is `1.2s`; do not rely on a runtime default. The first video
  clip's `timelineStart` must equal `introCover.duration`.
- For project covers, baked title text is expected when the user asks for
  short-video cover style. For timeline intro images, prefer adding titles
  through Codecut text/title layers unless the user explicitly needs image text.
- For horizontal sources converted to vertical shorts, use
  `vertical_face_safe_crop_above_burned_captions` only when current visual
  evidence supports that policy.
- When that policy can be represented as a fixed source rectangle, use EditPlan
  `sourceCrop` and verify `visual.sourceCrop` in `get_timeline_state`.
- If the needed crop cannot be represented natively, present the runtime-gap
  versus one-time fallback MP4 choice instead of silently baking a fallback.
- Do not use `black-bar` as a subtitle mask. It is a caption style only.
- Subtitle styling has one generated-edit path: `EditPlan.captions[]` plus
  top-level `captionStyle`. Do not put `fontFamily`, `fontSize`, `color`, CSS,
  per-caption style objects, or external subtitle renderer settings in an
  EditPlan. Codecut caption presets resolve to controlled local renderer
  styles and curated local CJK renderer fonts.
- Route Chinese captions by content type. Use `talking-head-pop` for spoken
  talking-head and opinion clips because it uses white text, translucent dark
  backing, and stronger shadow for light-background readability. Use
  `creator-clean` only when the source background is visually controlled and
  the user wants a clean font-first look. Emphasize at most one key phrase per
  sentence through `richSpans`, using light yellow text such as `#fde68a` when
  emphasis is needed. Treat commercial fonts seen in references as style
  inspiration unless the user supplies redistribution rights.
- Caption timing must declare a post-cut caption source. Prefer edited audio
  transcription through `build-post-cut-captions`; use source transcript remap
  only when every source segment maps cleanly into selected clips.
- After applying captions, use `get_timeline_state` readback and verify text
  elements include `content`, `startTime`, `duration`, and `style`.
- Local video import through `import-media --file-path` must produce
  `duration`, `width`, and `height`; local image import used as project cover
  must produce `width` and `height`; local audio import must produce `duration`.
  Verify with `list_media_assets` or `get_timeline_state`
  `includeReferencedMedia` before authoring project cover, intro cover,
  sourceCrop, or export-sensitive plans.

## Visual QA Completion Standard

For editing execution, completion requires:

- successful validation/application result
- `get_timeline_state` readback
- expected track, element, duration, trim range, and media source proof
- a visual QA verdict recorded under
  `.codecut-workspace/projects/<projectId>/06-verification/visual-qa/<runId>/`
- editor URL for human preview
- explicit statement when MP4 export was not produced

`inspect_timeline` and `build_video_quality_report` only generate evidence.
They are not a visual pass by themselves. Before reporting completion, Codex
must inspect the timeline contact sheet and report a verdict that includes:
contact sheet path, frame count, sampled timestamps, pass/fail status, issues
found, and whether each issue was fixed.

`export_timeline_frame` writes a requested local PNG frame file. It is not a
visual QA verdict and does not replace contact-sheet inspection when reporting
edit success or export readiness.

For MP4 delivery, Codex must also sample frames from the exported MP4 with
`codecut-workspace extract-export-frames`, inspect the export contact sheet,
compare it against the timeline preview, and record the final verdict with
`codecut-workspace record-visual-qa`. Timeline frames prove editor state; export
frames prove the delivered file. They are not interchangeable.

The required visual QA checks are:

- `first_frame_not_black`
- `title_not_clipped`
- `text_layers_not_overlapping`
- `subject_not_cropped_by_cover`
- `bottom_safe_area_clear`
- `ending_normal`
- `export_matches_timeline_preview`

`export_matches_timeline_preview` may be `not_applicable` only when no MP4
export was requested; in that case the final report must explicitly say that
no MP4 was produced.

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
- If a voice tool fails with a provider/runtime error, report that external
  generation gate separately from editing correctness. Do not mutate the
  timeline, apply a NarratedRemixPlan, or substitute a different voice unless
  the user supplies a real executable voice id, a local reference audio path, or
  explicit approval to use another available voice.
