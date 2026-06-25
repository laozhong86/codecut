# Editing Decision Ledger Adapter

This skill produces `PlatformStrategyBrief` only. It does not mutate the timeline. Use the brief to inform a later CodeCut `EditingDecisionLedger` after normal requirement intake and material audit.

## PlatformStrategyBrief Fields

- `platform`: Douyin, Xiaohongshu, WeChat Channels, TikTok, or Instagram Reels.
- `businessOutcome`: awareness, save/search discovery, lead, product proof, sale, follow, or community trust.
- `sourceFreshness`: current-source check status and date.
- `evidenceAvailable`: transcript, visual proof, product assets, creator face, before/after, comments, platform analytics, or none.
- `evidenceMissing`: facts that block confident strategy.
- `signalPriorities`: ranked signals from `platform-signal-model.md`.
- `editingBias`: platform-specific bias from the selected reference.
- `hookCandidates`: 2-5 evidence-backed openings.
- `structureRecommendation`: beat order, target duration, pacing notes, and CTA shape.
- `riskNotes`: unsupported claims, policy-sensitive claims, over-compression risk, or platform mismatch.

## Map To EditingDecisionLedger

| PlatformStrategyBrief field | EditingDecisionLedger field | Purpose |
| --- | --- | --- |
| `evidenceAvailable`, `evidenceMissing` | `materialAudit` | Prevent invented proof, transcript, or product claims |
| `hookCandidates`, `signalPriorities` | `candidateClips` | Choose openings for stop-scroll and early retention |
| `structureRecommendation` | `storyBeats` | Preserve viewer logic and platform-native pacing |
| `editingBias`, `businessOutcome` | `selectedStructure` | Explain why this structure fits the platform |
| `riskNotes`, `sourceFreshness` | `qaChecklist` | Verify freshness, claims, safe zones, and evidence gaps |

## Handoff Rule

The strategy brief can recommend what to inspect next, but it must not call executor tools, create an EditPlan, import media, export media, or edit the timeline. If the user asks for execution, route back through CodeCut intake, material audit, planning, executor apply, and readback.
