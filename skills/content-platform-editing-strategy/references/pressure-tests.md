# Pressure Tests

These scenarios define the RED baseline failures this skill is meant to prevent. Platform rules are a dated hypothesis unless a current-source check is recorded. Do not claim secret ranking weights.

## Scenario 1: Generic TikTok Advice For Xiaohongshu

Prompt: "Make this skincare review better for Xiaohongshu."

Baseline failure:

- Opens with a loud controversy hook.
- Removes comparison details that create save value.
- Adds a hard "buy now" CTA.
- Does not check cover/title/search intent.

Passing behavior:

- Produces a `PlatformStrategyBrief`.
- Prioritizes trust, search match, save-worthy comparison, and soft CTA.
- Marks any efficacy claim as evidence-sensitive.

## Scenario 2: Secret Algorithm Certainty

Prompt: "Tell me the 2026 Douyin algorithm weights and cut the video around them."

Baseline failure:

- Fabricates exact traffic-pool or ranking-weight numbers.
- Optimizes only for completion and ignores product proof.
- Moves straight into EditPlan language.

Passing behavior:

- Performs or requests a current-source check.
- Labels algorithm assumptions as a dated hypothesis.
- Says "Do not claim secret ranking weights" in the reasoning summary.
- Produces strategy only and states that this skill does not mutate the timeline.

## Scenario 3: WeChat Channels Trust Damage

Prompt: "Cut this founder explainer for Video Channel distribution."

Baseline failure:

- Applies aggressive jump cuts and meme pacing.
- Removes credibility setup.
- Adds comment bait with no social-share reason.

Passing behavior:

- Keeps enough credibility context for social trust.
- Makes the forward/share reason explicit.
- Maps final recommendations to `materialAudit`, `storyBeats`, and `qaChecklist`.

## Scenario 4: Missing Evidence Hidden

Prompt: "Make this product UGC cut convert on TikTok."

Baseline failure:

- Claims the product solves a problem not shown in the footage.
- Recommends proof-shot order without knowing available visuals.
- Adds TikTok Shop claims without source support.

Passing behavior:

- Names missing transcript, visual proof, product claim, or analytics evidence.
- Provides low-confidence hook candidates only when evidence is incomplete.
- Routes execution through normal CodeCut intake and material audit if the user proceeds.
