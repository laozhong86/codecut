# Editing Intent Router

Use this reference before designing or executing any Codex-driven Codecut editing workflow. The goal is to map a user's broad editing request to one primary workflow, one expected context contract, and one acceptance standard.

Do not make the router a hard runtime enum. It is a planning tool for Codex and future Codecut agent tools.

## Routing Rule

Pick the narrowest workflow that satisfies the user outcome. If the user asks for "make this video better", classify by the business result, not by the available code path.

When the user provides local materials for a new creative job, route only after the pre-edit workspace has intent analysis and material inventory. The order is: user intent -> `.codecut-workspace` init -> asset filing -> ffprobe material audit -> clarification with choices and one recommended option -> workflow route -> Codecut executor project.

After classifying the request, read the matching workflow recipe before generating an EditPlan or sending bridge commands. Recipes are execution guidance for the current Codecut MVP; they do not imply new bridge tools.

Before writing an EditingDecisionLedger, EditPlan, or NarratedRemixPlan, resolve a P0 video template when the request matches one of the implemented manifests in `apps/web/src/lib/video-templates/registry.ts`. The template is a planning constraint, not a runtime fallback. If required evidence is missing, stop and report the template stop condition instead of choosing a weaker template.

P0 template ids:

- `talking-head-short`: transcript-backed talking-head cleanup or short-form polish.
- `tutorial-demo`: transcript plus visible step evidence for tutorial or software demo.
- `product-proof-ad`: product facts plus visual proof for UGC/product conversion.
- `narrated-broll`: existing narration audio plus imported visual B-roll through NarratedRemixPlan v1 only.

## Clip Selection Quality Rule

For long-to-short, platform short, tutorial, and product-proof requests, Codex
must compare candidate clips before writing the final EditPlan. Use a small
Codex-side rubric inside `candidateClips`: hook strength, standalone coherence,
user value, energy or pacing, platform fit, crop viability, source coverage,
evidence, and risk. This rubric is planning guidance only; do not add scoring
fields to EditPlan v1.

The selected first range must work as the first-frame and first-2-second
promise: result, proof, question, pain point, or clear step. Reject or widen a
range when it starts with unresolved pronouns, missing setup, mid-sentence
context, dead air, or a visual crop that would hide the subject or collide with
captions.

Do not silently downgrade. If the business goal requires proof, visible steps,
face-safe crop, or product facts and the current evidence cannot support it,
stop at the template stop condition and report the missing evidence instead of
choosing a generic highlight edit.

## Intent Types

| Intent | Template ID | User wording | Primary value | Required context | Recipe | Current status |
| --- | --- | --- | --- | --- | --- | --- |
| Long-to-short | Resolve by business goal | "把长视频剪成短视频", "提炼精华", "剪成 45 秒" | Compression | transcript, source duration, optional scenes | [long-to-short](workflow-recipes/long-to-short.md) | Implemented through EditingDecisionLedger plus EditPlan v1 |
| Talking-head polish | `talking-head-short` | "去废话", "剪紧凑", "口播精剪" | Pace and clarity | transcript, optional silence spans, source duration | [talking-head-polish](workflow-recipes/talking-head-polish.md) | Codex transcript-first planning is implemented; word-boundary enforcement is not automatic |
| TikTok/Reels/Shorts | Resolve by business goal | "TikTok 版", "9:16", "爆款开头" | Platform fit | transcript, aspect ratio, optional scenes | [long-to-short](workflow-recipes/long-to-short.md) | Implemented as long-to-short plus EditingDecisionLedger and explicit project settings; EditPlan aspectRatio does not mutate canvas |
| Tutorial/demo | `tutorial-demo` | "教程", "软件演示", "步骤讲清楚" | Comprehension | transcript, OCR/UI text, scene steps | [long-to-short](workflow-recipes/long-to-short.md) plus visual-context warnings | Gated when OCR/scene context is missing |
| UGC/product ad | `product-proof-ad` | "商品短视频", "带货", "广告", "转化", "转化型短视频" | Proof and conversion | visual proof, transcript claims, product context | [long-to-short](workflow-recipes/long-to-short.md) plus claim guardrails | Requires EditingDecisionLedger; gated when proof or offer facts are missing |
| AI video re-edit | None in P0 | "AI 视频二创", "AI 成片修一下" | Remove artifacts and tighten story | keyframes/contact sheet, transcript if any | [timeline-inspection](workflow-recipes/timeline-inspection.md) before any edit | Gated until visual context exists |
| Subtitle/caption pass | None in P0 | "加字幕", "字幕好看点", "翻译字幕" | Readability | transcript or supplied captions | [subtitle-pass](workflow-recipes/subtitle-pass.md) | Implemented within EditPlan v1 caption limits |
| Voiceover/narration | `narrated-broll` when narration audio and visual B-roll exist | "配音", "旁白", "讲解" | Narrative clarity | approved script, existing or generated audio, target duration | [voiceover-remix](workflow-recipes/voiceover-remix.md) | Existing audio insertion and provider-backed speech generation are exposed; multi-source remix remains gated |
| Timeline inspection | None in P0 | "看看项目里有什么", "验证剪辑结果", "能导出吗" | Confidence before mutation/export | active editor project, timeline state | [timeline-inspection](workflow-recipes/timeline-inspection.md) | Implemented read-only |
| Template/style application | Only if expressible as a P0 manifest or Codecut system template script | "套模板", "像这个风格", "统一样式", "复刻这个剪辑手法" | Reusable visual language | system template, style reference, existing timeline or accessible finished reference videos | Use `codecut-reference-template` for reference-derived drafts/imports, then [timeline-inspection](workflow-recipes/timeline-inspection.md) before mutation | Gated unless expressible in system template script guidance plus current EditPlan v1/NarratedRemixPlan v1 |
| Batch variants | Resolve per variant | "批量剪", "多个版本", "不同角度" | Scale | shared assets, variant goals | [long-to-short](workflow-recipes/long-to-short.md) per variant | Gated; run one verified variant before scaling |

## Recipe Selection Rule

Use one primary recipe per execution run.

| Situation | Route |
| --- | --- |
| User asks for an actual generated short from one source | `long-to-short` |
| User emphasizes removing filler or tightening speech | `talking-head-polish` |
| User asks only about subtitles or caption quality | `subtitle-pass` |
| User asks what exists, what changed, or whether export is safe | `timeline-inspection` |
| User asks for narration, B-roll, BGM, or voiceover | `voiceover-remix`, then stop if no approved path can import/generate/place narration audio or compose the requested sources |

If a request combines multiple outcomes, execute the stable core first: inspect or cut the timeline, verify it, then handle subtitles or narration only if the current tool surface supports the next step.

## Default Workflow By Intent

### Long-to-short

Read [long-to-short](workflow-recipes/long-to-short.md) before executing.

1. Identify target length and platform.
2. Build planning context from transcript and duration.
3. Write an EditingDecisionLedger when selection depends on story, platform, conversion, proof, or tutorial structure.
4. Select source segments with rationale.
5. Generate a short-form EditPlan.
6. Validate source ranges and final duration.

Default for MVP: 30-60 seconds, transcript-first, no visual highlighter required.

### Talking-head polish

P0 template: `talking-head-short`.

Read [talking-head-polish](workflow-recipes/talking-head-polish.md) before executing.

1. Use transcript and silence spans.
2. Remove greetings, repeated setup, filler, and dead air.
3. Keep sentence boundaries intact.
4. Add readable captions only after the spoken timeline is stable.

Acceptance: transcript evidence supports the cut boundaries, subtitle timing is verified, and pacing is tighter than source. Current Codecut validation does not automatically enforce word boundaries.

### TikTok/Reels/Shorts

Route to [long-to-short](workflow-recipes/long-to-short.md), then apply platform preset guidance.

1. Apply explicit project settings first when a concrete canvas or FPS is required.
2. Write an EditingDecisionLedger that scores hook candidates, proof/value beats, standalone coherence, crop viability, and the selected structure before generating EditPlan.
3. First 1-3 seconds must show a result, proof, claim, pain point, or curiosity gap.
4. Use short captions and safe zones.
5. Prefer 15-45 seconds unless the user asks otherwise.

Acceptance: project settings reflect the requested vertical target, hook exists, first-frame composition is defensible from available evidence, and subtitles avoid UI-covered zones. `EditPlan.target.aspectRatio` alone is not canvas proof.

### Tutorial/demo

P0 template: `tutorial-demo`.

Route to [long-to-short](workflow-recipes/long-to-short.md) only if transcript or visible step context is available. Otherwise stop and report missing OCR/scene context.

1. Preserve logical sequence over virality.
2. Segment by steps, not only by highlight score.
3. Use on-screen text/OCR when available.
4. Add chapter labels or step overlays.

Acceptance: viewer can follow what happened without reading the whole transcript.

### UGC/product ad

P0 template: `product-proof-ad`.

Route to [long-to-short](workflow-recipes/long-to-short.md) only when product facts and proof are available. Otherwise ask for the missing business facts before generating claims.

1. Identify audience, product, offer, and proof.
2. Write an EditingDecisionLedger with material audit, story beats, scored candidate clips, selected structure, and QA checklist before generating EditPlan.
3. Prefer proof shots over abstract claims.
4. Structure: hook -> problem/proof -> process/demo -> CTA.
5. Do not invent prices, shipping times, guarantees, or claims.

Acceptance: first 2 seconds contain a concrete promise or question, every claim has a visible or spoken source, weak proof ranges are rejected rather than generalized, and the applied timeline matches the ledger's selected structure.

### AI video re-edit

Start with [timeline-inspection](workflow-recipes/timeline-inspection.md). Do not claim visual artifact removal unless keyframes, contact sheets, or other visual context exists.

1. Inspect keyframes/contact sheet when available.
2. Remove malformed frames, flicker, style drift, logo/text warping, and subject exits.
3. If the clip is visually good but slow, prefer small speed changes over unnecessary cuts.

Acceptance: no obvious AI artifact in selected ranges.

### Subtitle/caption pass

Read [subtitle-pass](workflow-recipes/subtitle-pass.md) before executing.

1. Confirm captions are transcript-derived or user-supplied.
2. Keep caption timing inside the current or generated timeline.
3. Refuse animated/karaoke/template styling unless supported by the current EditPlan schema.

Acceptance: captions are readable, timed, and verified through timeline state.

### Voiceover/narration

P0 template: `narrated-broll` only when existing narration audio and imported visual B-roll are both available.

Read [voiceover-remix](workflow-recipes/voiceover-remix.md) before planning or executing.

1. Separate planning from execution.
2. Confirm the narration script before mutating the timeline when it changes the user's message.
3. Stop if current bridge tools cannot import/generate/place narration audio, if the required provider key is missing, or if the requested voice ID is unknown.

Acceptance: audio, captions, and visual sequence align; if unsupported, the missing tool capability is reported directly.

### Timeline inspection

Read [timeline-inspection](workflow-recipes/timeline-inspection.md) before any read-only verification or export readiness answer.

Acceptance: project ID, track/element counts, media references, and blockers are tied to `get_timeline_state`.

## Gated Intent Rules

- Template/style application is not a free-form styling promise. If the style cannot be represented in current EditPlan v1, report the unsupported fields.
- Reference-derived template drafts are not truth until imported. After user confirmation, Codecut system template scripts guide Codex planning and must not bypass requirement intake, evidence checks, plan validation, or `get_timeline_state` readback.
- Batch variants must start with one verified variant. Do not enqueue multiple edits before the first variant passes timeline verification.
- Voiceover generation, BGM, effects, multi-source B-roll, OCR, keyframe inspection, and animated subtitle templates are gated unless the current bridge/tool surface exposes them. Existing audio assets can be placed on audio tracks, but that is not the same as bridge-exposed speech generation.
- A gated request can still produce an implementation plan, but it must not be reported as an executed edit.

## Clarification Triggers

Ask before proceeding only when the answer changes the product result:

- target platform is unknown and aspect ratio matters
- target length is unknown and source is long
- user asks for claims/offers without providing business facts
- user wants auto-publish or export side effects

For new jobs with provided materials, ask these questions after the material audit, not before it. Every clarification question must include concrete choices and exactly one recommended option.

Do not ask when a safe MVP assumption is enough:

- default short-form length can be 30-60 seconds
- default long-video MVP can be transcript-first
- default vertical platform can be 1080x1920 when user says TikTok/Reels/Shorts, but execution must use project settings rather than relying on `EditPlan.target.aspectRatio`

## Common Mistakes

- Treating every request as TikTok when the user needs a tutorial or archive.
- Letting the model produce prose instead of a structured EditPlan.
- Selecting only transcript highlights when the business goal needs visual proof.
- Choosing the earliest plausible hook instead of comparing candidates for standalone coherence, value, energy, platform fit, and crop viability.
- Skipping EditingDecisionLedger for conversion, product, platform short, tutorial, or broad highlight requests.
- Adding ledger fields such as `materialAudit`, `selectedStructure`, or `qaChecklist` to EditPlan v1 instead of keeping them as Codex-side reasoning.
- Adding style before the core cut is validated.
- Hiding missing transcript, OCR, or visual context behind a confident plan.
- Downgrading product-proof, tutorial, or vertical crop requests into generic highlight edits when required evidence is missing.
- Reading multiple recipes and merging them into a broad, unverifiable workflow.
- Treating gated recipes as implemented bridge capabilities.
