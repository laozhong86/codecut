---
name: codecut-title-generation
description: Use when CodeCut needs source-backed short-video title generation before edit planning, including 标题根据素材生成, 顶部固定标题, 封面标题, 视频标题, 爆款标题, title optimization, cover title, fixed top title, platform title, or publish title requests.
---

# CodeCut Title Generation

## Core Boundary

This skill creates source-backed title candidates before CodeCut edit planning.
It does not open a workspace, download media, import assets, mutate the
timeline, apply an EditPlan, or claim export readiness.

Use this skill when a CodeCut job needs titles generated from material evidence:

- `fixedTopTitle`: the persistent top title inside the video timeline.
- `coverTitle`: the short poster or first-frame title.
- `platformTitle`: the platform-facing discovery or publish title.

The goal is stronger title judgment, not guaranteed virality. The output must
help later planning choose a title with clear formula source, material evidence,
risk, and recommendation reason.

## Progressive Load Map

| Situation | Read first | Stop before continuing | Required readback |
| --- | --- | --- | --- |
| Need title candidates from source material | Current material audit, transcript, VideoContext, visual context, or user brief | Material evidence is missing enough that every title would invent a claim | TitleGenerationBrief only; no timeline mutation |
| Need platform-specific title judgment | `../content-platform-editing-strategy/SKILL.md` when current platform rules matter | The platform claim would rely on stale or unsupported ranking rules | Platform assumption and source quality notes in the brief |
| Need formula families for short-video titles | `../codecut-scriptwriting/references/source-patterns.md` plus local `dbs-xhs-title` methodology when available | The formula would overfit Xiaohongshu or hide unsupported claims | Formula family, formula source, and proof check per candidate |
| Need the title placed into an edit | `../codecut-edit-planning/SKILL.md` after title generation | No selected candidate or title quality handoff exists | Edit planning consumes the selected title; executor readback happens later |

## Stage Ownership

This skill owns title judgment only:

- extract the title promise from material evidence
- choose title lanes needed for the job
- generate candidates across multiple trigger families
- rank the Top 3 with tradeoffs
- report platform assumptions, proof gaps, and overclaim risk
- hand off selected title data to edit planning and title quality checks

It does not write voiceover scripts, rewrite long copy, set project covers,
compose timelines, generate images, import media, run executor commands, or
export files. Voiceover script and De-AI work remain in
`codecut-scriptwriting`.

## Inputs

- User request and explicit title lane, if provided.
- Material evidence: transcript, material audit, VideoContext, visual context,
  frame evidence, storyboard, product facts, or user brief.
- Platform: TikTok, Xiaohongshu, YouTube, Instagram, Douyin, WeChat Channels,
  or `generic short-video` when unspecified.
- Audience, product, claim, offer, proof, banned claims, and brand constraints
  when available.
- Existing title, if the task is title improvement.

Use `generic short-video` as the platform only when the user does not specify a
platform. Mark it as an assumption instead of pretending it is user-confirmed.

## Outputs

Return a `TitleGenerationBrief` with:

- `Input Facts`: known material facts, assumptions, missing facts, and platform.
- `Title Lanes`: requested lanes: `fixedTopTitle`, `coverTitle`,
  `platformTitle`.
- `Candidate Pool`: 6-10 candidates across at least 3 trigger families.
- `Top 3`: ranked candidates with title, lane, platform, formula source,
  trigger family, material evidence, proof check, risk, and recommendation reason.
- `Selected Title`: the recommended candidate for each requested lane.
- `Title Quality Handoff`: platform, primary keyword, title purpose, and weak
  title risk for `title_quality`.
- `CodeCut Handoff`: what edit planning may use and what is still blocked.

Every candidate must contain these exact fields in substance:

- `title`
- `lane`
- `platform`
- `formula source`
- `trigger family`
- `material evidence`
- `proof check`
- `risk`
- `recommendation reason`

## Artifacts

When a CodeCut workspace project exists, write the brief under:

```text
.codecut-workspace/projects/<projectId>/04-planning/title-generation-brief.md
```

If no project exists, return the brief in the chat handoff only. Do not create a
skill-local `.artifacts` folder as project truth.

## Stop Conditions

- No material evidence supports a title promise and any candidate would invent a
  claim.
- The requested platform rule requires current-source verification and no
  verification is available.
- The user asks for a guaranteed viral title, fake proof, fake numbers, or an
  unsupported before/after claim.
- A downstream step asks this skill to mutate the timeline, import media, run
  executor commands, or export video.

## Handoff

Hand off exactly one selected candidate per requested lane. Include the Top 3
and keep missing evidence explicit.

Use this status shape:

```text
Stage: title-generation
Status: title brief ready
Proof: Top 3 generated from transcript, visual evidence, and product proof
Next: codecut-edit-planning consumes selected fixedTopTitle and title_quality handoff
Risk: platform is generic short-video because the user did not specify one
```

## Title Method

Use formula families as thinking tools, not as fixed templates. `dbs-xhs-title`
is a formula source for trigger families and ranking discipline:

- cognitive conflict
- curiosity gap
- loss / avoid
- identity
- number / list
- result promise
- social proof
- controversy
- scenario
- action
- authority
- interaction / test

Do not copy all 75 formulas into CodeCut. Select the few formula families that
fit the material, audience, and platform. Reject candidates that sound catchy
but lack material evidence.

## Quality Rules

- Top titles should stop the swipe without revealing the whole answer.
- `fixedTopTitle` must stay short enough for on-frame use.
- `coverTitle` can be punchier than the platform title.
- `platformTitle` can include a clearer keyword for discovery.
- No guaranteed viral claims.
- No timeline mutation.
- No fake scarcity, fake data, fake testimonials, or unsupported medical,
  financial, legal, or product-performance claims.
- Do not turn a category label into the final title when a stronger material
  hook exists. For example, prefer an evidence-backed action or tension title
  over a bare label like `遮白发`.
