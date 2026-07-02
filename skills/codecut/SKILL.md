---
name: codecut
description: Use when operating or extending CodeCut, an Agent-driven visual video production system where Codex performs production work and CodeCut shows progress, materials, timeline, preview, manual adjustment, and export through a local editor.
---

# CodeCut

## Core Boundary

CodeCut is Codex + CapCut: an Agent-driven visual video production system.
Codex performs the production workflow; CodeCut provides the local visual editor
where the user can see progress, inspect materials, preview timeline state,
manually adjust the edit, and export verified results.

The current implementation still keeps Codex as the only LLM and Agent layer.
CodeCut provides the local workspace, visual editor, deterministic timeline
runtime, validation, readback, and export surface.

This skill is the public plugin entrypoint and router. It must not become the
full execution manual. The complete current runtime contract lives in
`../../docs/codex-driven-editing.md`; stage skills own stage gates; MCP tools
expose atomic primitives only.

## Stage Ownership

This skill owns request classification and stage routing only. It chooses the
next CodeCut skill, recipe, or read-only reference to load.

It does not collect missing setup answers, download source media, create
projects, import assets, write plans, mutate timelines, verify exports, or
repair timeline state.

## Inputs

- User request and any explicit source path, URL, project ID, template name,
  output target, or completion requirement.
- Plugin startup context from `.codex-plugin/plugin.json`
  `interface.defaultPrompt`.
- Current stage evidence only when the user is continuing an existing CodeCut
  job.

## Outputs

- Selected route: source acquisition, requirement intake, material ingest,
  material understanding, reference-template, title generation, scriptwriting,
  cover generation, edit planning, executor apply, methodology capture, inspection, or
  implementation work.
- A stage handoff statement using `Stage`, `Status`, `Proof`, `Next`, and
  `Risk` when reporting progress or blockers.
- No timeline, workspace, template, or export mutation.

## Artifacts

This router does not create its own primary artifacts. CodeCut stage proof must
live under `.codecut-workspace/projects/<projectId>/...` once a creative job has
a confirmed project ID.

Do not introduce a skill-local `.artifacts/<run_id>` path as CodeCut truth. The
workspace and executor readback are the durable evidence surfaces.

## Stop Conditions

- The request shape is ambiguous enough that routing would choose a side-effect
  stage incorrectly.
- The CodeCut web service gate fails before a new creative job can open
  `open_codecut_requirement_confirmation`.
- The required stage skill, recipe, or MCP requirement confirmation tool is unavailable in the
  current session.

## Handoff

Route to exactly one next owner and carry forward all known context. Do not ask
the user to restate details that are already present in the request or prior
stage proof.

## Governance Layers

- `AGENTS.md`: durable product boundaries and safety principles.
- `../../docs/codecut-product-positioning.md`: product positioning,
  `CodeCut = Codex + CapCut`, and user value.
- `../../docs/codecut-agent-visual-production-architecture.md`: target layered
  architecture for Agent production, process artifacts, visual editor state,
  timeline delivery, and quality proof.
- `../../docs/openmontage-to-codecut-adaptation.md`: OpenMontage compatibility
  and adaptation blueprint.
- `../../docs/codex-driven-editing.md`: current implementation truth, command
  contract, EditPlan/NarratedRemixPlan/CompositeLayoutPlan details, and failure handling.
- `codecut`: route requests to the correct stage
  skill or recipe.
- `codecut-scriptwriting`: create upstream cover title, video title, voiceover
  script, and de-AI copy briefs without timeline mutation.
- `codecut-title-generation`: create source-backed fixed top, cover, and
  platform title briefs before edit planning without timeline mutation.
- Stage skills: own one gate, input set, output shape, handoff, and stop
  conditions.
- `references/workflow-stage-contract.md`: user-visible stage map, stage
  ownership, proof artifacts, and handoff shape.
- MCP tools: define atomic capability schemas, side effects, read-only status,
  and failure shape. They do not choose workflows.

## Progressive Load Map

Use this skill as a map, not as the execution manual.

| Situation | Read first | Load detail when | Stop before continuing | Required readback |
| --- | --- | --- | --- | --- |
| Need to classify the request or explain stages | `references/workflow-stage-contract.md` | A handoff, blocker, or user-facing status needs stage ownership | No loadable owner is available or routing would choose a side-effect stage by guess | None; router does not mutate state |
| Need executor commands, readback, export, captions, visual QA, or plugin freshness proof | `references/execution-contract.md` | The task will mutate timeline state, verify export, or report completion | Required proof is missing or current executor/tool surface cannot produce it | `get_timeline_state` after timeline mutation; export proof after MP4/still export |
| Need a project cover, short-video poster, thumbnail prompt, cover evidence-frame selection, generated cover image import, or cover readback | `../codecut-cover-generation/SKILL.md` | The user asks for a project cover/poster/thumbnail or setup requested a generated cover outside the video timeline | Platform ratio, visual evidence, image generation capability, imported image dimensions, or cover readback is missing | `get_project_info` or `get_timeline_state` proves project `cover`; duration is unchanged |
| Need a source-backed fixed top title, cover title, video title, publish title, title optimization, or 爆款标题 before editing | `../codecut-title-generation/SKILL.md` | The user asks for 标题根据素材生成, 顶部固定标题, 封面标题, 视频标题, 标题优化, 爆款标题, or title copy that later CodeCut planning should use | Missing material evidence, audience, proof, platform, or claim boundaries would force false claims or unusable titles | TitleGenerationBrief only; no timeline mutation |
| Need a hook, voiceover script, spoken-word draft, or de-AI copy cleanup before editing | `../codecut-scriptwriting/SKILL.md` | The user asks for 口播脚本, 口播稿, 口播文案, 文案润色, 去 AI 味, hook, script, voiceover, narration, or spoken copy that later CodeCut planning should use | Missing topic, audience, proof, platform, or duration would force false claims or unusable spoken timing | ScriptwritingBrief only; no timeline mutation |
| Opening a new edit plan with confirmed local preferences | `../codecut-methodology-capture/SKILL.md` only for the private store contract, then `../codecut-edit-planning/SKILL.md` | A workspace already has `.codecut-workspace/user-methodology/` files | Current user instructions conflict with stored methodology | Read-only local methodology context; no mutation |
| Need material roles, content understanding, script-to-material matching, replacement/PIP/split-screen/circular talking-head suitability, or material risk reporting | `../codecut-material-understanding/SKILL.md` | Material audit exists and understanding is needed before planning | Material audit or required transcript/visual evidence is missing | `02-inventory/material-understanding.json` and `.md`; no timeline mutation |
| Need transcript, VideoContext, candidate clips, decision ledger, or an EditPlan/NarratedRemixPlan/CompositeLayoutPlan draft | `../codecut-edit-planning/SKILL.md` | Material evidence or planning strategy affects the edit | Required material-understanding, transcript, visual, network material records, or planning evidence is missing or unsupported by current CodeCut contracts | Use executor readback only after `codecut-executor-apply` runs |
| Need to remember feedback, update preferences, capture a correction, or produce post-project learning | `../codecut-methodology-capture/SKILL.md` | The user says "remember this", "以后按这个", "更新偏好", "刚才这里剪错了", or a completed project needs a methodology proposal | User confirmation is missing for long-term preference updates | Proposal under `08-learning/`; confirmed updates under `.codecut-workspace/user-methodology/` |
| Need implementation work inside CodeCut code | `../../docs/codex-driven-editing.md` and focused tests | A runtime/tool/schema change is required | Source/cache/session proof is stale for plugin-facing changes | Run the touched contract test and plugin freshness check |

## Required Stage Routing

Choose one path before running commands:

Source-only acquisition is not a creative editing job. If the user explicitly
asks only to download, save, extract, or make source media available locally,
route to the source acquisition stage and stop before editing intake, executor
project creation, timeline mutation, or export.

For new creative jobs with missing setup fields, first verify the local
CodeCut web service gate at `http://127.0.0.1:4100/en/projects`. If the service
is not reachable, start it with `bun run dev:web` from the plugin root in a
persistent foreground/PTY session and wait until the readiness check succeeds.
Do not start it with a plain shell background `&` command. If the task asks for
`preserve_source` or `full_source` duration and provides a local file path but
no `sourceDurationSeconds`, run `ffprobe` on that local file first and pass the
measured duration into `open_codecut_requirement_confirmation`; if duration
cannot be measured, stop before requirement confirmation. Only after the service
gate and this duration preflight, call `open_codecut_requirement_confirmation`
directly from the MCP tool surface before loading stage skills, reading other
local files, running unrelated shell commands, or sending text-only questions.
Use `tool_search` only if the requirement confirmation tool is not visible.
A fresh creative job means any user request that asks CodeCut to produce a new
edited output from source media, even when the same file or wording appeared in
an earlier thread. Every fresh creative job must create a new requirement draft.
Do not scan or reuse `.codecut-workspace/requirements`, prior thread summaries,
memory, previous `ccreq_*` values, or old confirmed readbacks to satisfy a new
request. Do not call `get_codecut_requirement_confirmation` until
`open_codecut_requirement_confirmation` has returned a `draftId` for this same
intake. Reuse an existing draft or project only when the user explicitly
provides that exact `draftId` or `projectId` and asks to continue, recover, or
resume it.
This creates only a local `draft.json` and a human confirmation page. It must
not create an executor project, import media, or initialize a project
workspace. After the tool returns, open its `confirmationUrl` in the Codex
in-app browser for human preview by using `node_repl.js` with
`setupBrowserRuntime` and target `iab`. Only show the URL as the fallback after
a real browser-control failure. Do not rely on an inline MCP app, output
template, chat card, or text link to open the confirmation page. Opening the
page is the end of the agent-controlled intake step. Do not click the confirm or cancel buttons, do not script the form, and do not submit the confirmation
API from browser automation. If the user says "continue",
"打开确认页", or similar before they have explicitly confirmed in the web page,
only reopen or show the confirmation page and stop again. After the user
explicitly says they confirmed or cancelled in the page, call
`get_codecut_requirement_confirmation`. Continue only when it returns
`status: "confirmed"` for the same `draftId` returned by
`open_codecut_requirement_confirmation`. If it returns a different `draftId`,
`pending`, or `cancelled`, stop before project creation. After confirmed
readback, call
`create_codecut_project_from_requirement` with that `draftId`; use the returned
confirmation token for all side-effect commands and route the confirmed setup
through `codecut-requirement-intake` before ingest, doctor checks, import,
timeline mutation, or export. `open_codecut_workspace` and
`submit_codecut_setup` are legacy setup-widget and recovery paths, not the
normal new-job intake path.

| Request shape | Required stage |
| --- | --- |
| Source-only acquisition: "download", "save locally", "提取到本地", "下载到本地", or similar with no editing, timeline, template, or export request | Use `codecut-tiktok-downloader` for TikTok sources, otherwise use `codecut-material-ingest`. Do not open the creative editing confirmation page or run executor mutation commands. |
| New creative job with missing setup fields, new source material, remote URL, local media path, "make a short", "剪辑", or any request that will create, edit, verify, or export a timeline | Verify `http://127.0.0.1:4100/en/projects` first; if it fails, start `bun run dev:web` in a persistent foreground/PTY session and wait for readiness. If preserving full source from a local file, measure `sourceDurationSeconds` with `ffprobe` before requirement confirmation. Then call `open_codecut_requirement_confirmation` before loading child skills or unrelated shell, and open the returned `confirmationUrl` with `node_repl.js` plus `setupBrowserRuntime` in target `iab`. Stop until `get_codecut_requirement_confirmation` returns `status: "confirmed"` for the same `draftId`; only then call `create_codecut_project_from_requirement`. Do not reuse old `ccreq_*` values unless the user explicitly asks to recover that exact draft. After setup creation, use `codecut-requirement-intake` to pass or block the execution gate. |
| Title-only or title-generation request with no timeline mutation request: 标题根据素材生成, 顶部固定标题, 封面标题, 视频标题, 标题优化, 爆款标题, fixed top title, cover title, platform title, publish title, or title optimization | Use `codecut-title-generation`. Do not open the creative editing confirmation page, create an executor project, import media, or mutate the timeline. If the user also asks to apply the selected title into an edit, produce the TitleGenerationBrief first, then route through normal requirement intake and planning. |
| Hook, voiceover script, spoken-word draft, or de-AI rewrite with no timeline mutation request | Use `codecut-scriptwriting`. Do not open the creative editing confirmation page, create an executor project, import media, or mutate the timeline. If the user also asks to apply the copy into an edit, produce the copy brief first, then route through normal requirement intake and planning. |
| Already-confirmed creative job with an explicit current `draftId`, `projectId`, or setup follow-up from this same job | **REQUIRED SUB-SKILL:** Use `codecut-requirement-intake` before executor mutation. If the user did not provide the exact current confirmation or recovery identifier, return to the new creative job path and create a fresh requirement draft. |
| TikTok video, photo post, share link, author page, or @handle that must be downloaded or saved locally for an editing job | **REQUIRED SUB-SKILL:** Use `codecut-tiktok-downloader` for TikTok source acquisition only after confirmed project creation and requirement intake pass. |
| Source needs download, file copy, workspace asset filing, or ffprobe audit for a creative editing job | **REQUIRED SUB-SKILL:** Use `codecut-material-ingest` only after confirmed project creation and requirement intake pass. |
| Material understanding, material role labeling, "这些素材适合怎么用", "帮我理解素材", "给脚本匹配素材", replacement suitability, picture-in-picture suitability, split-screen suitability, or circular talking-head suitability before final editing decisions | **REQUIRED SUB-SKILL:** Use `codecut-material-understanding` after material ingest and before `codecut-edit-planning`. Do not mutate the timeline or choose the final edit recipe in this stage. |
| Finished/reference videos, "learn this editing style", "复刻模板", reference-derived template draft/import/application | **REQUIRED SUB-SKILL:** Use `codecut-reference-template` before EditPlan authoring or executor mutation. |
| Confirmed setup has `templatePreference.mode: "create"` | Finish the primary edit or reference analysis first. Then ask whether to create a template draft with the confirmed `draftTemplateName`; route accepted draft creation/import through `codecut-reference-template`. Do not import a template before user confirmation. |
| Project cover, short-video poster, thumbnail, cover prompt, cover image, cover evidence-frame selection, or setting an independent project cover outside the timeline | **REQUIRED SUB-SKILL:** Use `codecut-cover-generation` before image generation, media import, or `set_project_cover`. |
| Transcript, VideoContext, candidate clips, decision ledger, or EditPlan/NarratedRemixPlan/CompositeLayoutPlan authoring | **REQUIRED SUB-SKILL:** Use `codecut-edit-planning` before executor validation or mutation. If material roles, script matching, replacement, PIP, split-screen, network material matching, or circular talking-head suitability affects the plan, require the material-understanding report first. If the requirement says 标题根据素材生成, 顶部固定标题, 封面标题, 视频标题, 标题优化, or 爆款标题 and no explicit final title was provided by the user, require `codecut-title-generation` before edit planning. |
| Executor service, env, doctor, import, apply, caption build, timeline readback | **REQUIRED SUB-SKILL:** Use `codecut-executor-apply`. |
| Opening a new planning pass after confirmed workspace creation | Read `.codecut-workspace/user-methodology/profile.md` and `rules.md` if they exist, then use `codecut-edit-planning`. Current user instructions override stored methodology. |
| User says "remember this", "以后按这个", "更新偏好", "刚才这里剪错了", or gives reusable editing feedback | **REQUIRED SUB-SKILL:** Use `codecut-methodology-capture`. First generate a project proposal; do not update long-term preferences without explicit user confirmation. |
| Project completion after timeline/export verification | **REQUIRED SUB-SKILL:** Use `codecut-methodology-capture` to create `08-learning/methodology-proposal.md` and ask whether to update private methodology. |
| Existing project inspection or export readiness | Use `codecut-edit-planning` to select the timeline-inspection recipe, then `codecut-executor-apply` for readback or export proof. |
| Implementation work inside CodeCut code | Inspect the current contract first, then write focused tests before edits. |

## Non-Negotiable Gates

- Requirement intake must pass before timeline mutation for new creative jobs.
- New creative jobs must pass the local service gate before
  `open_codecut_requirement_confirmation`; a `service_unavailable` result is a
  blocker, not a rendered confirmation page.
- New creative jobs must pass through `open_codecut_requirement_confirmation`,
  confirmed `get_codecut_requirement_confirmation` readback, and
  `create_codecut_project_from_requirement` before material ingest, workspace
  add-assets/probe, doctor checks, generated media, timeline mutation, or
  export.
- The confirmed requirement readback must use the same `draftId` returned by
  the current `open_codecut_requirement_confirmation` call. A previous
  confirmed `ccreq_*` is not valid for a new creative job unless the user
  explicitly asks to recover that exact draft.
- Codex must never click the requirement confirmation page's confirm/cancel
  controls or call the page confirmation API. Requirement confirmation is a
  human action. Codex may only open or reopen the page, then wait for an
  explicit user message saying the page was confirmed before reading it back.
- `create_codecut_project_from_requirement` creates the executor project and
  initializes `.codecut-workspace/projects/<projectId>/workspace.json`. Do not
  rerun `codecut-workspace init` for that project.
- Before creating a new executor project, define a business project name. Use
  `create-project --project-id <id> --name "<business project name>"
  --confirmation-token <token>`.
- Do not create projects with generic names such as `New project`, `Untitled
  Project`, `Test`, or `Codex cut`.
- Use `codecut-executor-apply` for runtime readiness, `apps/web/.env.local`,
  doctor checks, imports, apply, export, and readback.
- Do not use low-level MCP mutation tools as the default editing path. Tools
  such as `insert_clips`, `add_texts`, `add_captions`, `move_clips`,
  `remove_clips`, `split_clip`, `set_clip_properties`, `set_keyframes`,
  `add_transitions`, `update_transition`, `remove_transition`, and
  `ripple_delete_ranges` are advanced repair tools after timeline readback or
  explicit user intent. Normal generated edits go through strict EditPlan,
  NarratedRemixPlan, or CompositeLayoutPlan paths.
- Caption typography uses top-level `captionStyle` presets only. Do not emit
  arbitrary `fontFamily`, `fontSize`, CSS, or per-caption style objects in an
  EditPlan. CodeCut caption presets preserve CJK defaults for Chinese captions
  and use curated local Latin fonts only through controlled presets.
- Title typography uses controlled `title.stylePreset` values only. Do not ask
  Codex to output a direct font name unless the schema explicitly exposes that
  field.
- When the user asks for transitions, transition, or picture-to-picture
  transitions, use native timeline transitions (`TrackTransition`,
  `tracks[].transitions`, `summary.transitionCount`) or report a capability
  blocker. `set_keyframes` is only for motion effects such as push, pull, fade,
  zoom, or opacity animation and must not be reported as a transition.
- Implemented native transition types are `fade`, `dissolve`,
  `wipe-left`, `wipe-right`, `wipe-up`, `wipe-down`, `slide-left`,
  `slide-right`, `slide-up`, `slide-down`, `zoom-in`, `zoom-out`,
  `blur-crossfade`, `flash-white`, `push-soft`, `whip-pan-left`,
  `whip-pan-right`, `cinematic-zoom`, and `chromatic-split`. Do not emit
  Shader, WebGL, GSAP, CSS, or arbitrary transition names in EditPlan.
- Choose native transitions by video type: talking-head shorts use
  `blur-crossfade` or `push-soft`; product proof and UGC ads use
  `flash-white` or `cinematic-zoom`; emotional or premium edits use
  `blur-crossfade`; tutorials and screen walkthroughs use `push-soft`.
  Use `chromatic-split` and `whip-pan-*` only for high-energy promos where
  visual evidence supports the stronger motion.
- Before completing a transition task, read back
  `get_timeline_state.summary.transitionCount` and the target video
  track's `transitions[]`. For `verify_timeline`, include `transitionCount` in
  the verification JSON when a transition was requested.
- Do not use FFmpeg, shell scripts, or overlay rendering as the CodeCut editing
  path for cuts or subtitle burn-in.
- Do not claim MP4 export unless `export_project` or the equivalent verified
  executor path produced the file.
- Do not claim timeline frame export unless `export_timeline_frame` produced
  the requested local PNG file. `inspect_timeline` contact sheets are visual
  evidence, not the still-frame export product.
- Private methodology capture must stay local under `.codecut-workspace/`.
  Do not write personal editing preferences into `skills/**`, `docs/**`, plugin
  manifests, or installed cache. Stored methodology is read-only input at the
  start of planning; project completion may create a proposal, but long-term
  updates require explicit user confirmation.

## Human Preview

Browser is not the Agent runtime. The local executor draft and readback are the
agent proof; the Codex in-app browser is only for human preview. Read
`references/execution-contract.md` for the human-preview contract before
reporting browser-visible readiness.

## Detail Gates

Read `references/execution-contract.md` before handling visual QA, captions,
project covers, intro covers, timeline readback, export proof, or plugin
freshness. Do not copy those gates into this router.

## Planning References

Read only what matches the task:

- Current runtime truth: `../../docs/codex-driven-editing.md`
- Workspace spec: `../../docs/codecut-workspace.md`
- Workflow stage contract: `references/workflow-stage-contract.md`
- Material understanding: `../codecut-material-understanding/SKILL.md`
- Scriptwriting: `../codecut-scriptwriting/SKILL.md`
- Title generation: `../codecut-title-generation/SKILL.md`
- Edit planning: `../codecut-edit-planning/SKILL.md`
- Methodology capture: `../codecut-methodology-capture/SKILL.md`
- Tool contract: `references/codecut-agent-tool-contract.md`
- EditPlan schema: `references/edit-plan-schema.md`
- Project and intro cover prompt guide: `references/intro-cover-prompts.md`
- Project cover generation: `../codecut-cover-generation/SKILL.md`

## Completion Standard

For editing execution, completion follows the success contract table in
`references/execution-contract.md`. The short rule is: do not claim completion
without the workspace/project proof, timeline readback after mutation, visual
QA verdict when preview quality matters, and export proof when a file was
requested. After verified project completion, route to
`codecut-methodology-capture` to generate a project-scoped learning proposal
and ask whether to update private methodology.
