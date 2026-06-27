# Codex-Driven Codecut Editing

This workflow keeps all LLM and agent reasoning outside Codecut. Codex operates Codecut through deterministic local CLI/executor tools. The browser editor is for human preview, manual adjustment, and live status visibility. Codex owns user intent, clip selection, EditPlan creation, retries, and user communication.

## Product Boundary

Codecut does:

- Show the editor UI and timeline state.
- Store media assets imported through the UI or the local Codex bridge.
- Run deterministic local executor transcription for an existing audio or video asset.
- Validate an explicit EditPlan.
- Preview an explicit EditPlan without mutating timeline state.
- Apply a valid EditPlan to the timeline.
- Verify timeline metrics against explicit verification JSON.
- Export the current project to an explicit local file when the Node-compatible renderer is available.

Codecut does not:

- Configure or store an LLM provider.
- Call OpenAI, Anthropic, or any OpenAI-compatible API.
- Run an internal editing agent.
- Understand natural-language editing requests.
- Generate, complete, guess, or repair an EditPlan.

Codex is the only LLM and Agent layer. Codecut is the visual executor and validator.

For a user-visible stage map that separates requirement intake, material ingest,
evidence building, planning, executor application, verification/export, and
reference-template work, use
`skills/codecut/references/workflow-stage-contract.md`.
That reference owns stage status, proof artifacts, stop conditions, and handoff
shape; this document remains the runtime command and plan-contract truth.

When clip selection requires business, story, conversion, or tutorial judgment,
Codex should create an EditingDecisionLedger after VideoContext and before
EditPlan. The ledger is a Codex-side reasoning artifact with five narrow fields:
`materialAudit`, `storyBeats`, `candidateClips`, `selectedStructure`, and
`qaChecklist`. It must not be sent to `apply_edit_plan`, persisted as Codecut
project state, or added to the EditPlan v1 schema.

The ledger must be evidence-first. Candidate clips should be compared with the
same small rubric before Codex selects the final structure: hook strength,
standalone coherence, user value, energy or pacing, platform fit, crop
viability, and source coverage. A selected range must name the transcript,
visual, product, or user-provided evidence that supports its role. If the
required evidence is absent, Codex should stop with the missing proof instead of
choosing a weaker template, inventing claims, or silently downgrading the edit.

Quality gates stay in Codex planning unless they protect timeline validity.
They do not add fields to EditPlan v1. Use them to decide which implemented
clips, captions, title, and project settings to send to Codecut, then verify the
result with executor readback.

Browser is the human interface, not the Agent runtime. Opening the browser is only a convenience for the user to inspect the project URL and manually adjust the result. Codex command execution must not depend on a visible browser tab, screenshots, DOM control, or a page-mounted heartbeat.

## Pre-Edit Workspace

When the user provides source materials, Codecut editing starts with a local
creative workspace before any executor project is created. This separates
business understanding and material planning from timeline mutation.

Workspace root:

```text
.codecut-workspace/projects/<projectId>
```

One `projectId` represents one creative job: user brief, source assets, material
inventory, clarification answers, planning documents, execution files,
verification notes, and later the Codecut executor project. Variants can be
subfolders or documents inside the same workspace when they share the same
source pack; unrelated jobs should get separate project IDs.

Required pre-edit order for user-provided materials:

1. Understand the user message and write intent analysis.
2. Reserve a concrete `projectId` and business project name.
3. Initialize the workspace with `scripts/codecut-workspace.mjs`.
4. Copy provided files into categorized local folders.
5. Run ffprobe material inventory for video/audio assets.
6. Ask clarification questions with concrete choices and exactly one
   recommended option per question.
7. Write workflow route, content breakdown, hook selection, script documents,
   decision ledger, and timeline restructure notes when they are relevant.
8. Create the Codecut executor project only after the workspace is ready and the
   user-facing editing direction is clear.

Workspace files are local evidence and planning artifacts. They are not Codecut
timeline state and are excluded from git and plugin-cache sync.

## Video Template Manifest

P0 video templates live in `apps/web/src/lib/video-templates/registry.ts` and are validated by `apps/web/src/lib/video-templates/schema.ts`. They are Agent planning constraints, not a runtime template marketplace, automatic repair layer, or silent fallback.

Every manifest declares:

- `intent`: what business or editing outcome the template serves.
- `requiredEvidence`: material facts that must exist before planning.
- `defaultStructure`: the required story or sequence shape.
- `captionPreset`: an implemented EditPlan caption preset when the execution path supports one.
- `executionPath`: `edit-plan-v1`, `speech-cleanup-to-edit-plan-v1`, or `narrated-remix-v1`.
- `stopConditions`: unsupported requests that must stop before mutation.
- `verification`: the readback proof expected after apply.

P0 template ids:

| Template ID | Use case | Required evidence | Execution path |
| --- | --- | --- | --- |
| `talking-head-short` | Talking-head cleanup, filler removal, short-form polish | transcript | `speech-cleanup-to-edit-plan-v1` |
| `tutorial-demo` | Tutorial, software demo, step-by-step explanation | transcript, visual proof | `edit-plan-v1` |
| `product-proof-ad` | UGC/product ad and conversion edit | transcript, visual proof, product facts | `edit-plan-v1` |
| `narrated-broll` | Existing narration audio plus visual B-roll remix | existing narration audio, visual B-roll | `narrated-remix-v1` |

Selection order:

```text
material audit
  -> template resolve
  -> EditingDecisionLedger or NarratedRemixPlan
  -> strict EditPlan v1 or NarratedRemixPlan v1
  -> apply_edit_plan or apply_narrated_remix_plan
  -> get_timeline_state readback
```

If required evidence is missing, Codex must report the selected template and the missing evidence. It must not use another template as a downgrade path. Unsupported capabilities such as TTS, animated subtitle templates, arbitrary CSS, smart face crop, BGM/SFX inside narrated remix, append mode, and template effects must fail fast unless the current plan contract supports them.

## Required Local Environment

The Codex bridge CLI reads bridge access only from local environment variables:

From the plugin root, load the local bridge env before running CLI commands:

```bash
set -a
source apps/web/.env.local
set +a
```

```bash
export CODECUT_AGENT_BRIDGE_URL="http://localhost:4100"
export CODECUT_AGENT_BRIDGE_TOKEN="<local bridge token>"
export CODECUT_AGENT_BRIDGE_TIMEOUT_MS="120000"
export CODECUT_AGENT_BRIDGE_INTERVAL_MS="1000"
```

Do not pass the token as a CLI flag. Do not commit local tokens or `.env` files. `apps/web/.env.local` is the supported local env file for this repo; do not infer bridge settings from the shell alone or from a repository-root `.env.local`. `CODECUT_AGENT_BRIDGE_*` is the only supported prefix; missing keys must fail fast instead of being inferred from legacy names.

Provider-backed Volcengine OpenSpeech tools read the API key only from:

```bash
export VOLCENGINE_OPEN_SPEECH_API_KEY="<volcengine open speech api key>"
```

Do not pass the key as a CLI flag, MCP argument, request body field, or checked-in
document. Volcengine ASR and subtitle tools accept only public `https://` audio
or video URLs; local files are not uploaded implicitly.

## Local Web Service Gate

Before calling `open_codecut_workspace`, asking the user to open a setup
widget, or navigating the Codex in-app browser, Codex must verify that Codecut
is serving the MVP origin:

```bash
curl -fsS -o /dev/null http://127.0.0.1:4100/en/projects
```

If the readiness check fails, start the local Codecut web app from the plugin root:

```bash
bun run dev:web
```

Wait until the same readiness check succeeds. If the app cannot start or `http://127.0.0.1:4100/en/projects` remains unavailable, stop the workflow and report `P0 blocked: Codecut web service is not available on 127.0.0.1:4100`.

Do not render `open_codecut_workspace`, ask the user to open the Browser,
import media, inspect bridge env, or send bridge commands until this service
gate passes. `open_codecut_workspace` must return `service_unavailable` instead
of widget metadata when this gate fails. Do not switch to another port,
external origin, or magic default. The browser URL, bridge URL, and editor
origin must stay aligned on `http://127.0.0.1:4100`.

If a host mounts the workspace widget for a failed or malformed
`open_codecut_workspace` result, the widget must fail closed: no setup form, no
project creation CTA, and no `submit_codecut_setup` call without the pending
confirmation ID from a successful `open_codecut_workspace` result.

## CLI Runtime And Human Preview

Codecut editing commands should be consumed by a local CLI/executor process that reads and writes the project state directly. The browser page subscribes to project state and displays progress/results for the human user.

## Draft Truth Contract

The local executor draft is the shared source of truth for Codex and the GUI:

```text
apps/web/.codecut-executor/projects/<projectId>/project.json
```

Codex must treat an EditPlan as an intent, not as proof of completion. The
executor validates the intent, writes the draft, increments `revision`, and the
browser editor syncs from the draft snapshot. Codex must read the current draft
state back through `get_project_info`, `get_timeline_state`, or the project
snapshot before reporting completion or doing another edit.

Codex must not directly edit `project.json`. Codex also must not use FFmpeg,
Pillow, shell scripts, or external MP4 post-processing as the editing path for
cuts, subtitle burn-in, or final assembly. FFmpeg is allowed only as an internal
executor dependency for transcription, media inspection, or a future verified
Codecut export runtime.

Completion means the Codecut draft contains the requested timeline state. A
local MP4 file without matching draft tracks is not a completed Codecut edit.

Opening a browser page is not a startup gate for Codex. After the service is
ready, Codex should actively open the local projects page in the Codex in-app
browser. After `create-project` succeeds, Codex must immediately open the
returned `editorUrl`. Do not reconstruct a bare `/editor/<projectId>` URL for
executor projects; the returned URL carries the browser bridge token required
for the editor to load executor state.

This link is for human preview and manual adjustment only. Do not use browser visibility, screenshots, DOM control, macOS global hotkeys, AppleScript, external browser windows, or standalone Playwright as an Agent execution dependency.

Current implementation gap:

- Some existing bridge commands are still consumed by `AgentBridgeProvider` in the editor page.
- If a command requires browser-mounted heartbeat, report `P0 blocked: command execution still depends on browser-mounted bridge`.
- Do not ask the user to open or refresh the browser merely so Codex can execute commands.
- The structural fix is to move command consumption into a local executor and make the browser subscribe to project state.

The editing target must be explicit before Codex sends bridge commands:

- Use the project ID from the user's request, a local project listing, or the CLI response that created the project.
- Before creating a new executor project, define a business project name from the user's brief or ask for one when the brief does not contain enough context.
- Create projects with `node scripts/codex-bridge.mjs create-project --project-id <id> --name "<business project name>" --confirmation-token <token>`.
- Immediately open the returned `editorUrl` in the Codex in-app browser.
- Treat a missing `editorUrl` in the create-project response as a product
  contract failure. Stop and fix the local executor or API response instead of
  constructing a bare `/editor/<projectId>` URL.
- Do not create projects with generic names such as `New project`, `Untitled Project`, or `Codex cut`.
- Do not reuse a stale project ID from a previous run.
- The CLI `--project-id` must match the local project store entry being modified.

If a command remains pending until timeout, stop sending more commands. Do not recover by refreshing the browser. Treat this as executor unavailability and fix the local command consumer.

Before the first business bridge command, run:

```bash
node scripts/codex-bridge.mjs doctor-install --project-id <id>
```

`doctor-install` checks the source plugin, installed Codex plugin cache, source-to-cache sync state, `CODECUT_AGENT_BRIDGE_*` environment, the 4100 web service, and the executor project. It verifies that the token exists but never prints the token value. If `plugin_sync` fails, run `node scripts/sync-codex-local-plugin.mjs` from the plugin root, then rerun `doctor-install`.

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
    fit?: "cover",
    sourceCrop?: {
      x: number,
      y: number,
      width: number,
      height: number,
      fit?: "cover-to-canvas"
    },
    reason: string
  }>,
  title?: {
    text: string,
    startTime: number,
    duration: number,
    stylePreset?:
      | "hook_title"
      | "lower_title"
      | "social_hook"
      | "product_badge"
      | "chapter_bumper",
    motionPreset?: "slam-in" | "soft-reveal" | "pop-bounce",
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
    preset:
      | "creator-clean"
      | "short-form-bold"
      | "black-bar"
      | "talking-head-pop"
      | "tutorial-clean"
      | "documentary-soft"
      | "product-punch"
      | "lifestyle-warm"
      | "cinematic-serif"
      | "social-highlight"
      | "comment-bubble"
      | "minimal-reel",
    position: "lower-safe" | "center",
    motionPreset?: "slam-in" | "soft-reveal" | "pop-bounce"
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
      | "zoom-out"
      | "blur-crossfade"
      | "flash-white"
      | "push-soft"
      | "whip-pan-left"
      | "whip-pan-right"
      | "cinematic-zoom"
      | "chromatic-split",
    duration: number
  }>,
  rationale: string
}
```

Codecut validates and executes this plan. If validation fails, Codecut returns a structured error. Codex must generate a corrected plan and retry.

`clips[].sourceCrop` is the only native explicit source crop in EditPlan v1. It
is allowed only on video source media with known dimensions. The rectangle must
stay within source pixels, have positive width and height, and match
`target.aspectRatio` unless `sourceCrop.fit` is explicitly
`cover-to-canvas`. Do not combine `sourceCrop` with `clips[].fit`.

Use `sourceCrop` when visual evidence supports cropping old burned-in subtitles
out of the source pixels while keeping new subtitles as editable text tracks.
After apply, verify `visual.sourceCrop` through `get_timeline_state` and use
native export for MP4 output. If the requested reframe needs a face anchor,
animated crop, arbitrary transform, or any source crop that cannot be expressed
by this field, stop and present exactly two choices: wait for native Codecut
capability, or generate a one-time fallback MP4. A chosen fallback must be
recorded in project documentation with the reason, command, verification, and
limitations; baked subtitles are not editable and `build_video_quality_report`
cannot inspect them as timeline text captions.

When `captions` contains one or more items, Codex must include
`captionStyle`. When `captions` is empty or omitted, `captionStyle` must be
omitted. Caption styling is intentionally limited to top-level local presets:
`creator-clean`, `short-form-bold`, `black-bar`, `talking-head-pop`,
`tutorial-clean`, `documentary-soft`, `product-punch`, `lifestyle-warm`, and
`cinematic-serif`, `social-highlight`, `comment-bubble`, and `minimal-reel`.
Codecut does not accept arbitrary CSS, per-caption style
objects, arbitrary `fontFamily`, `fontSize`, or `color` fields,
`bold_caption`, `keyword_caption`, or `keyword-highlight` in this contract.
Caption presets resolve to controlled local renderer styles and curated local
CJK renderer fonts.

The default creator-caption standard is `creator-clean`: local serif font,
white text, no heavy black stroke, subtle shadow, and balanced lower-safe
one- or two-line captions. Use font choice and line breaking for perceived
quality before adding motion or high-contrast effects. Use `richSpans` for at
most one key phrase per sentence; do not turn every caption into a decorative
style effect. Commercial fonts from source references are style references
only unless redistribution rights are provided.

Caption quality is part of validation, post-cut caption generation,
`add_captions`, and the read-only video quality report. Captions must not
overlap, each caption duration must be `0.5s..4s`, and the selected
`captionStyle` must render each item as no more than two lines with no
1-2 character orphan final line. Codecut rejects invalid caption plans instead
of repairing text, changing timing, or switching presets.
Post-cut caption text uses punctuation as a phrase boundary, not as automatic
display text. For short-form generated captions, strip trailing full stops,
commas, colons, semicolons, and enumeration punctuation after chunking; keep
question marks and exclamation marks, and preserve punctuation inside numeric
values such as decimals and thousands separators.

Caption timing must declare a post-cut caption source. Prefer edited audio transcription
from edited clip ranges through `build-post-cut-captions`: apply a clip-only
EditPlan first, run `build-post-cut-captions`, copy the returned captions into
the final EditPlan with `captionStyle`, then apply the final EditPlan. If that
path is not available, use source transcript remap: convert source transcript
segment timestamps into output timeline timestamps through the selected
`clips[]`. Do not copy source transcript timestamps directly into
`captions[].startTime`.
Do not replace this flow with rewritten summary captions or external subtitle
burn-in. The final proof must be text elements in the Codecut timeline.

Caption preset routing:

- `creator-clean`: default Chinese creator-caption route, especially polished
  talking-head or Xiaohongshu-style edits.
- `talking-head-pop`: vertical opinion or creator talking-head clips.
- `tutorial-clean`: screen recording, tutorial, product walkthrough, or demo.
- `documentary-soft`: calmer narrative, interview, essay, or YouTube-style edit.
- `product-punch`: product proof, UGC ad, deal hook, or comparison demo.
- `lifestyle-warm`: vlog, Xiaohongshu-style lifestyle, travel, food, or daily routine.
- `cinematic-serif`: brand story, fashion, emotional montage, or premium product film.
- `social-highlight`: TikTok/Reels keyword-highlight style for fast social hooks.
- `comment-bubble`: comment, testimonial, reaction, or social proof clips.
- `minimal-reel`: visual-heavy reels where captions should support the footage.
- `short-form-bold`: legacy bold short-form look only when explicitly requested.
- `black-bar`: explicit boxed subtitle look only; not a mask for old burned-in captions.

`title.stylePreset` is optional. If omitted, Codecut keeps the existing default
text behavior. If present, it must be `hook_title`, `lower_title`,
`social_hook`, `product_badge`, or `chapter_bumper`.
Title presets resolve to controlled local renderer styles. Chinese-safe title
routes continue to use curated local CJK fonts; high-impact Latin title routes
use curated `@fontsource` fonts such as Outfit, Archivo Black, Montserrat, and
JetBrains Mono. Do not send arbitrary title font fields in EditPlan.

`title.motionPreset` and `captionStyle.motionPreset` are optional. If present,
they must be `slam-in`, `soft-reveal`, or `pop-bounce`. Codecut resolves these
names to deterministic local renderer keyframes on editable `TextElement`s.
Do not send HTML, Remotion code, arbitrary CSS, JavaScript animation, custom
cubic curves, or per-caption custom keyframes in EditPlan.

Text motion preset routing:

- `slam-in`: high-energy hooks, hard cuts, offer reveals, or short-form moments
  where the text should land with visible impact.
- `soft-reveal`: product walkthroughs, tutorials, explainers, or premium clips
  where the text should feel calm and avoid stealing attention from footage.
- `pop-bounce`: creator reactions, testimonials, comments, stickers, or social
  proof moments where the text should feel responsive and lightweight.

Every motion preset must be verified through `get_timeline_state` readback.
The readback must expose `style.motionPreset` and `motion.keyframes`, proving
that the preset became editable timeline state rather than a baked video effect.

`title.richSpans` and `captions[].richSpans` are optional keyword styling
ranges. Ranges use `[start, end)` code point indexes over `Array.from(text)`.
Spans must be integer, ordered, non-overlapping, and inside the text length.
Invalid rich spans fail validation; Codecut does not repair or clamp them.

### Text Motion Visual Acceptance

Text motion preset acceptance is based on sampled composed frames plus timeline
readback. Tests passing alone is not a visual acceptance substitute.

- `slam-in`: inspect frames near text start, midpoint, and the end of the first
  `0.6s`. The text should begin off-position and transparent, overshoot scale
  once, then settle at the configured position without changing timeline state.
- `soft-reveal`: inspect frames near text start, `0.35s`, and `0.7s`. The text
  should fade and move gently into place, with no scale pop and no sudden jump.
- `pop-bounce`: inspect frames near text start, `0.22s`, and `0.5s`. The text
  should fade in, bounce scale once, and settle cleanly without leaving its
  readable safe area.

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
Codecut does not move clips to make them valid. Transition `type` must be one
of the implemented native transition names in the schema above; do not use
keyframes, Shader, WebGL, CSS, or arbitrary effect names to satisfy a
transition request.

Native transition routing:

- Talking-head, opinion, and interview shorts: `blur-crossfade` or `push-soft`.
- Product proof and UGC ads: `flash-white` or `cinematic-zoom`.
- Emotional, cinematic, or premium edits: `blur-crossfade`.
- Tutorial, demo, and screen walkthrough: `push-soft`.
- High-energy launch, sports, music, or promo: `chromatic-split`,
  `whip-pan-left`, or `whip-pan-right` when source motion supports it.

`clips[].fit` currently supports only `cover`. Use it when a horizontal source
must fill a vertical or square canvas without letterboxing. Cover fit requires a
video source with known `width` and `height`; invalid or dimensionless sources
fail validation. Codecut converts `cover` into a deterministic centered
`visual.transform.scale` that is readable through `get_timeline_state`.

## Speech Cleanup Contract

For talking-head cleanup, Codex may generate a local `SpeechCleanupPlan` before
creating the final EditPlan v1. This keeps semantic judgment in Codex and keeps
timeline reconstruction deterministic in Codecut.

Flow:

```text
transcribe_media
  -> Codex labels SpeechCleanupDecision[]
  -> rebuildTimelineFromSpeechCleanup({ captionMode: "clip-only" })
  -> clip-only EditPlan v1 projection
  -> apply_edit_plan
  -> build_post_cut_captions
  -> final captioned EditPlan v1 if captions are requested
  -> get_timeline_state
```

Rules:

- Use seconds for all source and timeline fields.
- Mark every transcript segment as `keep` or `drop`.
- Every `drop` decision must include `dropReason`.
- Every `drop` decision must include `risk: "low" | "high"`.
- `keep` decisions must not include `dropReason`.
- Source ranges must be sorted, non-overlapping, and have
  `sourceEnd > sourceStart`.
- Do not auto-fix overlapping, reversed, or unlabeled decisions.
- Do not use audio VAD as a semantic deletion substitute.
- Drop earlier restarts or repeats and keep the later complete version unless
  the user explicitly asks to keep the earlier take.
- If a script, outline, or article draft is available, use it only as semantic
  alignment evidence. Do not run word-by-word diffs against the script; instead
  check whether the retained take covers the intended meaning.
- Compare source duration with transcript coverage before projection. Leading or
  trailing untranscribed audio longer than 0.3 seconds must be represented as an
  explicit keep/drop decision or reported as a cleanup blocker.
  `rebuildTimelineFromSpeechCleanup()` fails fast when the first or last
  decision leaves that coverage gap unclassified.
- For every `drop` decision, classify each dropped range as low or high risk.
  Low-risk drops are pauses, exact prefix repeats, or very short filler tokens
  with no standalone meaning. High-risk drops are full-sentence removals,
  repeated openings with divergent endings, or long repeated spans.
- High-risk drops require explicit retained-meaning evidence in the decision
  `retainedMeaningEvidence`, proving that a kept segment preserves the dropped
  segment's useful meaning. Use `reason` for the human-readable deletion
  rationale.
- Count filler removal only from explicit `drop` decisions with
  `dropReason: "filler"`. Do not infer filler counts from words such as
  "um", "uh", "嗯", or "额" inside kept text.
- Do not claim word-level precision unless the selected transcription model
  supports word timestamps.
- `rebuildTimelineFromSpeechCleanup()` requires an explicit `captionMode`.
  Use `captionMode: "clip-only"` when edited audio transcription is available;
  the projected EditPlan must omit `captions` and `captionStyle` so
  the non-mutating `build_post_cut_captions` Agent/executor tool can create
  captions from the edited audio.
- Use `captionMode: "source-transcript-remap"` only when post-cut caption
  building is unavailable and every kept source transcript segment maps cleanly
  into the selected clips. Do not send source-remapped captions by default.
- Apply only the generated EditPlan v1 projection through `apply_edit_plan`.
- After the clip-only cleanup plan is applied, call `build_post_cut_captions`
  or the equivalent `build-post-cut-captions` CLI path to rebuild captions from
  the edited timeline audio. Copy the returned `captions` and `captionStyle`
  into the final EditPlan, then apply that final plan. Do not reuse source
  captions when edited audio transcription is available.

The cleanup report is an execution artifact. It is not persisted in project
storage in the first implementation phase.

## NarratedRemixPlan Contract

For existing narration audio plus multi-asset B-roll, Codex may use the
separate `NarratedRemixPlan v1` contract with `apply_narrated_remix_plan`.

P1 supports only:

- already imported narration audio;
- already imported video B-roll assets;
- already imported image B-roll assets;
- optional editable text overlays as independent timed `TextElement`s with
  controlled style fields;
- captions authored by Codex;
- full timeline replacement after validation.

P1 does not support:

- TTS or speech generation fields;
- BGM, SFX, or generated audio;
- partial append mode;
- visual effects or template effects.

Product gap note: business copy that must be revised later, such as real-estate
price, title, region, layout, and bottom selling point, must not be pre-rendered
into a derived slideshow video by default. Use top-level `textOverlays` only
when those fields are needed so they remain editable `TextElement`s in the
timeline. Text overlays are timed independently from image and video beats. If
the user asks for no extra on-screen text, omit `textOverlays`. One-time
rendered videos are allowed only as explicitly documented runtime-gap fallbacks,
and the limitation must be recorded in the project verification artifact.

```ts
{
  version: 1,
  projectId: string,
  target: {
    durationSec: number,
    aspectRatio: "9:16" | "16:9" | "1:1"
  },
  visualBeats: Array<
    | {
        id: string,
        mediaType?: "video",
        mediaId: string,
        sourceStart: number,
        sourceEnd: number,
        timelineStart: number,
        muted: true,
        reason: string
      }
    | {
        id: string,
        mediaType: "image",
        mediaId: string,
        timelineStart: number,
        duration: number,
        fit: "cover",
        reason: string
      }
  >,
  narration: {
    mediaId: string,
    sourceStart: number
  },
  textOverlays?: Array<{
    name: string,
    text: string,
    startTime: number,
    duration: number,
    fontSize: number,
    color: string,
    backgroundColor?: string,
    backgroundOpacity?: number,
    backgroundPaddingX?: number,
    backgroundPaddingY?: number,
    backgroundBorderRadius?: number,
    boxWidth: number,
    position: { x: number, y: number },
    textAlign: "left" | "center" | "right",
    fontWeight: "normal" | "bold"
  }>,
  captions: Array<{
    text: string,
    startTime: number,
    duration: number
  }>,
  captionStyle: {
    preset:
      | "creator-clean"
      | "short-form-bold"
      | "black-bar"
      | "talking-head-pop"
      | "tutorial-clean"
      | "documentary-soft"
      | "product-punch"
      | "lifestyle-warm"
      | "cinematic-serif",
    position: "lower-safe" | "center"
  },
  rationale: string
}
```

Validation is all-or-nothing:

- `projectId` must match the active project.
- `narration.mediaId` must resolve to an imported audio asset with known duration.
- every video beat `mediaId` must resolve to an imported video asset with known
  duration.
- every video beat source range must be inside the source asset and have
  `sourceEnd > sourceStart`.
- every image beat must use `mediaType: "image"`, `fit: "cover"`, and an
  imported image asset with known width and height.
- image beats never own text overlay fields.
- top-level `textOverlays`, when present, must fit inside
  `target.durationSec` and use controlled local `TextElement` style fields;
  arbitrary CSS is not accepted.
- visual beats must be continuous from `0` with no gaps or overlaps.
- total visual beat duration must equal `target.durationSec`.
- captions must fit inside `target.durationSec`.
- captions require top-level `captionStyle`.
- unknown fields such as `generateSpeech`, `text`, or `voiceId` fail schema
  validation.

When applied, Codecut replaces the timeline with:

- one video track containing muted video B-roll clips and image elements;
- one audio track containing the narration audio;
- one `Text Overlays` text track when the plan includes top-level
  `textOverlays`;
- one `Captions` text track containing narration captions only.

After application, Codex must verify `get_timeline_state` proof fields:

- video elements expose `visual.muted`;
- image elements expose `mediaId`, timing, and `visual.transform`;
- text overlay elements expose `content` in the `Text Overlays` track and can
  be revised through text element property mutation without regenerating media;
- audio elements expose `audio.sourceType`, `audio.volume`, and `audio.muted`;
- track-level `muted` and `hidden` fields are present when the track type
  supports them.

## End-to-End Workflow

1. Codex reads the user message and writes intent analysis before creating a
   Codecut executor project.
2. Codex reserves one concrete `projectId` and business project name for the
   creative job.
3. Codex initializes `.codecut-workspace/projects/<projectId>`.
4. Codex copies provided local materials into categorized asset folders.
5. Codex runs ffprobe material inventory and writes asset manifest, ffprobe
   report, and material audit.
6. Codex asks clarification questions with choices and one recommended option
   per question when platform, aspect ratio, duration, video type, editing
   style, caption policy, or business facts are missing.
7. Codex writes the workflow route and planning documents: content breakdown,
   hook selection, scripts when needed, decision ledger when needed, and
   timeline restructure notes.
8. Codex confirms the local Codecut service is ready.
9. Codex creates the Codecut executor project with the same `projectId` and
   business project name, then immediately opens the returned `editorUrl` in the
   Codex in-app browser.
10. Codex calls `doctor-install` and `doctor` to confirm the local executor is
    ready.
11. The user imports a long video into the active project, or Codex imports a
    local media file with `import-media`.
12. Codex calls `get_project_info` to confirm the active project.
13. Codex calls `list_media_assets` to inspect available media.
14. Codex selects the target media asset for editing.
15. Codex calls `transcribe_media` for that media asset when the selected outcome needs transcript evidence.
16. Codex audits material facts: transcript, visual proof, product facts, existing narration audio, and visual B-roll.
17. Codex resolves one P0 video template or reports why no implemented template can satisfy the request.
18. Codex calls `build_video_context` for transcript-first planning when a long
   source video needs structured context.
19. Codex calls `build-visual-context` when tutorial, product-proof,
    screen-recording, or horizontal-to-vertical jobs need timeline-wide visual
    evidence before final EditPlan authoring. Treat returned artifacts as
    evidence. Do not claim OCR, subject-safe crop, burned-caption detection, or
    semantic scene recognition unless a later tool returns those facts
    explicitly.
20. Codex calls `inspect-video-range` for source ranges where visual continuity,
    waveform shape, silence gaps, caption overlap, or reframe risk affects the
    EditPlan decision.
21. Codex updates the EditingDecisionLedger for EditPlan templates, or writes a strict NarratedRemixPlan for `narrated-broll`.
22. Codex projects the selected structure into an implemented EditPlan v1 JSON
    file under `05-execution/`, or keeps `narrated-broll` inside NarratedRemixPlan v1 only.
23. For EditPlan paths, Codex calls `validate-edit-plan` and
    `preview-edit-plan` before applying any clip-first or final plan.
24. For EditPlan templates, Codex calls `apply_edit_plan` with a stable
    clip-first EditPlan when edited audio transcription from edited clip ranges
    is required.
25. For EditPlan templates with captions, Codex runs
    `build-post-cut-captions`, then writes those returned captions into the
    final EditPlan with the matching `captionStyle`.
26. Codex calls `apply_edit_plan` or `apply_narrated_remix_plan` with the final
    strict plan.
27. Codex calls `verify-timeline`, `get_timeline_state`, and
    `build-video-quality-report` to verify clips, text style, text motion
    preset/keyframes, audio source and volume, video transitions, and sampled
    composited frames.
    This readback must include the expected video track clip count, text track
    caption count, timeline duration, and clip trim ranges before the edit can
    be reported as complete.
    `build-video-quality-report` is a P0 structural quality gate for EditPlan
    validation, title/caption readback, text bounds, transition readback, and a
    contact sheet. It must report OCR, face detection, subject-safe crop, and
    burned-caption detection as unavailable or conservative unknown unless a
    later tool returns those facts explicitly.
28. Codex inspects the timeline contact sheet and records a visual QA verdict
    under `.codecut-workspace/projects/<projectId>/06-verification/visual-qa/<runId>/`.
    `inspect_timeline` and `build-video-quality-report` generate evidence only;
    they are not a visual pass by themselves.
29. Codex writes verification notes under `06-verification/`.
30. Codex keeps the opened editor URL available so the user can preview the result or ask for another revision.
31. Before any long render or MP4 export, Codex reruns `doctor-install` and
    `doctor` so source, installed plugin cache, bridge env, and executor
    readiness are fresh before expensive work begins.
32. If export is requested, Codex calls `export` with explicit output path and
    overwrite policy. If the local renderer runtime is unavailable, report that
    runtime gap.
    For a still-frame export, Codex calls `export-timeline-frame` with explicit
    `--time-seconds`, `--format png`, output path, and overwrite policy.
33. After MP4 export, Codex samples the final exported MP4 with
    `codecut-workspace extract-export-frames`, inspects the export contact
    sheet, compares it against the timeline contact sheet, and records the
    final visual QA verdict with `codecut-workspace record-visual-qa`.
    Timeline frames prove editor state; exported MP4 frames prove the delivered
    file. They cannot substitute for each other.

```bash
node scripts/codex-bridge.mjs build-visual-context \
  --project-id <project-id> \
  --media-id <media-id> \
  --target-aspect-ratio 9:16
```

## Fast Path: Local File To Short

When the request includes one absolute local media file and a concrete target such as "1 minute vertical short", Codex should execute directly:

1. Reserve a readable `projectId` and business project name.
2. Call `open_codecut_workspace` with the known setup fields and wait for
   `submit_codecut_setup` to return the confirmed setup token.
   If the widget created the project but the Codex thread did not receive the
   follow-up prompt, call `recover_codecut_setup` with that `projectId` and the
   original `pendingConfirmationId` before opening another setup widget.
3. Initialize `.codecut-workspace/projects/<projectId>` with
   `--confirmation-token <token>`.
4. Add the local file with `codecut-workspace add-assets
   --confirmation-token <token>`.
5. Run `codecut-workspace probe-assets --confirmation-token <token>`.
6. Ask any missing clarification questions with choices and one recommended option.
7. Write workflow route, content breakdown, hook selection, and timeline restructure notes with the confirmed setup token.
8. Confirm the local Codecut service is ready.
9. Create the executor project with the same `projectId`, immediately open the
   returned `editorUrl` in the Codex in-app browser, then run `doctor-install`
   and `doctor`.
10. Apply explicit project settings for vertical/square output.
11. Import the local file with the confirmed setup token.
12. List media and select the imported audio/video asset.
13. Transcribe through the local executor when the selected outcome needs transcript evidence.
14. Audit material facts and resolve one P0 video template.
15. Build local VideoContext with `build-video-context` when long-video or transcript-first planning needs source-timestamped context.
16. Inspect ambiguous or reframe-sensitive source ranges with
   `inspect-video-range` before writing the EditPlan.
17. Write an EditingDecisionLedger for EditPlan templates, or a strict NarratedRemixPlan for `narrated-broll`.
18. For EditPlan templates, generate, validate, preview, and apply a clip-first
    EditPlan v1 when edited audio captions are required.
19. For EditPlan templates with captions, run `build-post-cut-captions`, then
    validate, preview, and apply the final EditPlan v1 with captions.
20. For `narrated-broll`, apply the final strict NarratedRemixPlan v1.
21. Verify with `verify-timeline`, `get_timeline_state`, and
    `build-video-quality-report`.
22. Keep the opened editor URL available for human preview.

Do not spend the first turn auditing all skill references. Read only the workflow document and the matching recipe unless an implementation or validation failure requires deeper reference lookup.

## CLI Commands

After `open_codecut_workspace` and `submit_codecut_setup` return a confirmed
setup token, initialize the local pre-edit workspace before editing execution:

If the widget submit path consumed the pending confirmation but the follow-up
message did not reach the Codex thread, recover the same confirmed setup first:

```text
recover_codecut_setup(projectId: "<id>", pendingConfirmationId: "ccpending_...")
```

```bash
node scripts/codecut-workspace.mjs init \
  --project-id <id> \
  --name "<business project name>" \
  --user-message "<original user request>" \
  --confirmation-token <token>
```

Copy and classify local materials:

```bash
node scripts/codecut-workspace.mjs add-assets \
  --project-id <id> \
  --file /absolute/path/source.mp4 \
  --file /absolute/path/brief.pdf \
  --confirmation-token <token>
```

Run ffprobe material inventory for video/audio assets:

```bash
node scripts/codecut-workspace.mjs probe-assets \
  --project-id <id> \
  --confirmation-token <token>
```

Write a planning document after intent analysis or clarification:

```bash
node scripts/codecut-workspace.mjs write-doc \
  --project-id <id> \
  --kind workflow-route \
  --content-file /absolute/path/workflow-route.md \
  --confirmation-token <token>
```

Check that the local executor is ready before sending business commands:

Create the executor project with a concrete business project name:

```bash
node scripts/codex-bridge.mjs create-project \
  --project-id <id> \
  --name "<business project name>" \
  --confirmation-token <token>
```

Do not create projects with generic names such as `New project`, `Untitled Project`, or `Codex cut`.

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
  --file-path /absolute/path/source.mp4 \
  --confirmation-token <token>
```

The local file path stays on the Codex side. The CLI reads the file bytes and sends a base64 payload through the local bridge; very large source videos can hit local request size or timeout limits.
For local `--file-path` imports, the bridge runs ffprobe when video metadata is
incomplete and sends required metadata with the import payload. Local video
imports must read back `duration`, `width`, and `height`; local audio imports
must read back `duration`. Explicit CLI metadata flags override probe results.
Bytes/base64 imports do not have a reliable source path to probe, so callers
must provide required video or audio metadata explicitly. Verify imports with
`list_media_assets` before sourceCrop, cover-fit, or export-sensitive planning.

Import a user-confirmed reference-derived template draft into Codecut system
templates only after explicit confirmation:

```bash
node scripts/codex-bridge.mjs import-system-template-script \
  --project-id <id> \
  --template-json-file /absolute/path/local-template-script.json \
  --confirmed-by-user true
```

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

Inspect one video source range with local visual and audio evidence:

```bash
node scripts/codex-bridge.mjs inspect-video-range \
  --project-id <id> \
  --media-id <id> \
  --start-seconds 12.5 \
  --end-seconds 18.0 \
  --frame-count 8
```

`inspect-video-range` returns a local PNG contact sheet path plus frame
timestamps, waveform samples, silence ranges, and warnings. It is read-only and
does not mutate media assets, derived assets, project settings, tracks, or the
timeline.

Build captions from the already edited video clip audio ranges:

```bash
node scripts/codex-bridge.mjs build-post-cut-captions \
  --project-id <id> \
  --language zh \
  --model-id whisper-base
```

`build_post_cut_captions` is also exposed as a Codex Agent tool with the same
`language` and `modelId` inputs. The tool reads the current timeline,
transcribes each unmuted edited video or uploaded-audio clip range from
`trimStart` to `trimEnd`, and offsets the returned segments into output
timeline time. It returns caption items, a recommended `captionStyle`,
`captionQuality`, and a trace; it does not mutate the timeline. When the audio
asset has `spokenScript` metadata from imported TTS or RunningHub voice
generation, the tool uses the scripted caption text and only borrows ASR timing
segments, so ASR misrecognition cannot rewrite the user-approved script. In
that case the response also includes a `voiceConsistency` summary without raw
script text or protected term values. Codex must copy those captions into the
final EditPlan and apply that plan.

RunningHub and Volcengine voice generation can bind protected terms to the
generated audio asset. Volcengine uses an existing `voice_type`; it does not
train a new voice:

```bash
node scripts/codex-bridge.mjs generate-runninghub-voice-design \
  --project-id <id> \
  --text "approved narration script" \
  --protected-term "BrandName" \
  --protected-term "$2.34"
```

```bash
node scripts/codex-bridge.mjs generate-volcengine-cloned-voice \
  --project-id <id> \
  --voice-type "<existing voice_type>" \
  --text "approved narration script" \
  --protected-term "BrandName"
```

The generated media asset stores sanitized `spokenScript` metadata with the
provider and task id. `list_media_assets`, referenced media readback, and
quality reports expose counts and provider identifiers, not the raw script or
protected term text.

Volcengine public URL transcript and subtitle generation are exposed as MCP
tools `transcribe_volcengine_url` and `build_volcengine_url_captions`. They
return transcript/caption data only and do not mutate the timeline; use
`add_texts`, `add_captions`, or an EditPlan path to place returned captions.

Apply a local EditPlan file:

```bash
node scripts/codex-bridge.mjs validate-edit-plan \
  --project-id <id> \
  --plan-json-file /absolute/path/edit-plan.json
```

```bash
node scripts/codex-bridge.mjs preview-edit-plan \
  --project-id <id> \
  --plan-json-file /absolute/path/edit-plan.json
```

```bash
node scripts/codex-bridge.mjs apply-plan \
  --project-id <id> \
  --plan-json-file /absolute/path/edit-plan.json \
  --replace-existing true
```

Apply a NarratedRemixPlan file:

```bash
node scripts/codex-bridge.mjs apply-narrated-remix-plan \
  --project-id <id> \
  --plan-json-file /absolute/path/remix-plan.json \
  --replace-existing true
```

Verify the applied timeline against explicit acceptance criteria:

```bash
node scripts/codex-bridge.mjs verify-timeline \
  --project-id <id> \
  --verification-json-file /absolute/path/verification.json
```

Check the applied timeline:

```bash
node scripts/codex-bridge.mjs send \
  --project-id <id> \
  --tool get_timeline_state \
  --args-json '{}'
```

Run read-only fresh-session spokenScript/readback acceptance on an existing
scripted project with explicit expected evidence:

```bash
node scripts/codex-bridge.mjs fresh-session-smoke \
  --project-id <id> \
  --scripted-media-name <name> \
  --expected-caption-line-count <n> \
  --expected-protected-term-count <n> \
  --expected-caption-texts-json '["$2.34","Venmo that ASAP"]'
```

Build an EditPlan quality report without mutating the timeline:

```bash
node scripts/codex-bridge.mjs build-video-quality-report \
  --project-id <id> \
  --plan-json-file /absolute/path/edit-plan.json \
  --start-time 0 \
  --end-time 6 \
  --frame-count 4 \
  --title-rubric-json-file /absolute/path/title-rubric.json \
  --output-file /absolute/path/final.mp4 \
  --format mp4 \
  --include-audio true
```

`build_video_quality_report` returns `schemaVersion: 2`. It includes
`caption_quality`, `voice_consistency`, optional `title_quality`, optional
export probe, and optional audio-presence checks alongside the existing
readback, layout, transition, and contact-sheet evidence. It remains read-only
and does not export files, infer a platform, or claim OCR, face detection, or
burned-in subtitle detection. Title quality runs only when Codex provides a
rubric file such as `{"platform":"youtube","primaryKeyword":"retention"}`.
Export probe runs only when Codex provides `--output-file`, `--format`, and
`--include-audio` for an already exported local file.

Record visual QA after inspecting the timeline contact sheet:

```bash
node scripts/codecut-workspace.mjs record-visual-qa \
  --project-id <id> \
  --run-id qa-YYYYMMDD-HHMMSS \
  --verdict-json-file /absolute/path/visual-qa-verdict.json \
  --confirmation-token <token>
```

`record-visual-qa` validates `visual-qa-verdict.json`, copies the timeline
contact sheet to
`.codecut-workspace/projects/<projectId>/06-verification/visual-qa/<runId>/timeline-contact-sheet.png`,
and writes both `visual-qa-verdict.json` and `visual-qa-verdict.md`. The verdict
must include:

- timeline contact sheet path, frame count, sampled timestamps, and pass/fail;
- issues found and whether each issue was fixed;
- all required checks: `first_frame_not_black`, `title_not_clipped`,
  `text_layers_not_overlapping`, `subject_not_cropped_by_cover`,
  `bottom_safe_area_clear`, `ending_normal`, and
  `export_matches_timeline_preview`.
  `export_matches_timeline_preview` may be `not_applicable` only when no MP4
  export was requested; the final report must then state that no MP4 was
  produced.

After MP4 export, sample the final delivered file:

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

`extract-export-frames` writes `export-contact-sheet.png`,
`export-frames-manifest.json`, and individual exported MP4 frames under the
same `06-verification/visual-qa/<runId>/` directory. Codex must inspect this
contact sheet before recording the final MP4 verdict. A timeline contact sheet
cannot prove the exported file, and an exported-file contact sheet cannot prove
current editor state.

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

Manage local executor projects:

```bash
node scripts/codex-bridge.mjs list-projects
node scripts/codex-bridge.mjs rename-project --project-id <id> --name "<business project name>"
node scripts/codex-bridge.mjs delete-project --project-id <id>
```

Export after timeline visual QA passes:

```bash
node scripts/codex-bridge.mjs export \
  --project-id <id> \
  --format mp4 \
  --quality high \
  --include-audio true \
  --output-file /absolute/path/out.mp4 \
  --overwrite false
```

`export` is executor-native and writes only to the local `--output-file`. It
does not trigger browser download. If the current server runtime lacks a
Node-compatible renderer, the command fails fast and reports that runtime gap.
Export success is not final delivery success. After export, run
`codecut-workspace extract-export-frames`, inspect the final MP4 contact sheet,
and update the visual QA verdict before reporting completion.

Export one composed timeline frame as a PNG file:

```bash
node scripts/codex-bridge.mjs export-timeline-frame \
  --project-id <id> \
  --time-seconds 1.25 \
  --format png \
  --output-file /absolute/path/frame.png \
  --overwrite false \
  --confirmation-token <token>
```

`export-timeline-frame` is executor-native and writes only to the local
`--output-file`. It does not trigger browser download and does not replace
`inspect_timeline` contact sheets or a recorded visual QA verdict.

Before running this command for a long render, rerun:

```bash
node scripts/codex-bridge.mjs doctor-install --project-id <id>
```

```bash
node scripts/codex-bridge.mjs doctor --project-id <id>
```

Do not start the render if either freshness gate fails.

## Failure Handling

- If `import_media` fails, Codex must verify the source path, file type, URL or payload shape, and explicit executor project before retrying.
- If `transcribe_media` cannot find the media asset, Codex must call `list_media_assets` again and select a valid asset.
- If `apply_edit_plan` fails validation, Codex must correct the EditPlan. Codecut must not auto-fix it.
- If `validate_edit_plan` or `preview_edit_plan` fails, Codex must correct the plan before applying. Do not skip directly to `apply_edit_plan`.
- If `apply_narrated_remix_plan` fails validation, Codex must correct the NarratedRemixPlan. Codecut must not auto-fix it.
- If `verify_timeline` fails, Codex must inspect the returned mismatch fields and correct the plan or verification JSON. Do not treat a failed verification as success because `apply_edit_plan` completed.
- If the timeline is not empty, Codex must pass `replaceExisting=true` only when replacing the current cut is intentional.
- If BGM/SFX is requested, Codex must import or select valid audio assets before writing the EditPlan. Missing or non-audio assets must stop the workflow.
- If TTS, BGM, SFX, append mode, arbitrary CSS, or visual effects are requested for narrated remix, stop and report that the current `NarratedRemixPlan v1` path only supports existing narration audio, video or image B-roll, optional independent controlled text overlays, and captions.
- If transitions are requested, Codex must generate adjacent clip timings before applying the EditPlan. Do not rely on Codecut to reposition clips.
- A transition request is complete only after readback shows native
  `TrackTransition` state: `get_timeline_state.summary.transitionCount`
  must match the expected count or be greater than zero for open-ended
  transition requests, and the target video track's `transitions[]` must expose
  the expected `type`, `duration`, `fromElementId`, and `toElementId`.
- When using `verify_timeline` for a transition request, include
  `transitionCount` in the verification JSON. Do not accept duration, caption,
  audio, or media-only verification as transition completion.
- `set_keyframes` can implement visual motion such as fade, push, pull, zoom,
  or opacity animation, but it is not a native transition and must not be
  reported as a completed transition.
- If a masked effect is requested, Codex must verify `get_timeline_state` exposes a matching `derivedAssets[]` person-mask entry before calling the effect action.
- If `create_text_background_effect` or `create_human_pip_effect` fails, fix the media or derived-asset input. Do not simulate the effect with unrelated low-level timeline tools.
- If export fails with the Node-compatible renderer runtime gap, report that blocker. Do not use browser download as a fallback.

`generate_captions` is not part of the Codex-only MVP automation path. Captions in this workflow come from the Codex-authored EditPlan and are applied by `apply_edit_plan`.
