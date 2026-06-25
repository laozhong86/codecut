---
name: content-platform-editing-strategy
description: Use when planning or critiquing short-form video edits for Douyin, WeChat Channels, Xiaohongshu, TikTok, Instagram Reels, or platform-specific retention, recommendation algorithm, search, save, share, comment, hook, proof, caption, CTA, or safe-zone strategy before CodeCut EditPlan authoring.
---

# Content Platform Editing Strategy

Use this skill as a planning layer. It turns public platform distribution signals into a `ContentCreationStrategy`, then a `PlatformStrategyBrief` that can inform a CodeCut `EditingDecisionLedger`; it does not mutate the timeline, download sources, publish content, or call executor tools.

## Non-Negotiables

- Treat every platform algorithm claim as a dated hypothesis, not secret ranking truth.
- Run a current-source check when the user asks for latest rules, numeric weights, policy-sensitive advice, or a platform change.
- Do not claim secret ranking weights, fixed traffic pools, or guaranteed virality.
- Prefer evidence-backed editing choices over generic platform lore.
- Stop or label confidence low when transcript, visual proof, product claim evidence, or audience context is missing.

## Workflow

1. Identify the platform, business outcome, audience, source format, and whether the user wants strategy only or a later CodeCut edit.
2. Read only the relevant platform reference plus `references/platform-signal-model.md`, `references/content-strategy-adapter.md`, `references/source-patterns.md`, and `references/editing-decision-ledger-adapter.md`.
3. Convert algorithm signals into `ContentCreationStrategy`: `audienceIntent`, `contentAngle`, `scriptPromise`, `proofAsset`, `interactionDesign`, and `editingImplication`.
4. Produce a `PlatformStrategyBrief` using `templates/platform-strategy-brief.md`.
5. Map the brief into CodeCut planning fields: `materialAudit`, `storyBeats`, `candidateClips`, `selectedStructure`, and `qaChecklist`.
6. If the user proceeds to editing, hand the brief to the normal CodeCut intake, material audit, planning, execution, and readback stages.

## Platform References

- Douyin: `references/douyin.md`
- Xiaohongshu: `references/xiaohongshu.md`
- WeChat Channels: `references/wechat-video.md`
- TikTok: `references/tiktok.md`
- Instagram Reels: `references/instagram-reels.md`
- Common signal model: `references/platform-signal-model.md`
- Content strategy adapter: `references/content-strategy-adapter.md`
- CodeCut adapter: `references/editing-decision-ledger-adapter.md`
- Research source map: `references/research-source-map.md`
- Local source patterns: `references/source-patterns.md`
- Pressure tests: `references/pressure-tests.md`

## When Not To Use

- Source downloading or account scraping.
- Timeline mutation, export, or editor automation.
- Legal, medical, financial, or policy claims without current source validation.
- Attempts to reverse-engineer private platform systems.
