# Platform Signal Model

Platform guidance is a dated hypothesis unless the agent has performed a current-source check for the specific platform, date, and market. Do not claim secret ranking weights, guaranteed traffic pools, or private scoring formulas.

Public anchors checked on 2026-06-25:

- TikTok Support and Newsroom describe personalized recommendations using user interactions, video information, device/account settings, and negative feedback.
- Instagram/Meta public ranking materials describe Reels and suggested posts as prediction systems influenced by user activity, content information, engagement, and recommendation eligibility.
- Douyin creator and e-commerce public materials are more fragmented; use them as current-source check anchors for content quality, watch behavior, interaction, search, and commerce rules, not exact weights.
- Xiaohongshu and WeChat Channels public materials are less explicit about ranking details; treat search, save/share, social trust, and content fit as operating hypotheses unless a logged-in creator center or official source is checked.

Use `references/research-source-map.md` before translating sources. Official material can support public signal categories; local skill pattern material can support workflow design; third-party hypothesis material can inspire tests but cannot become a fixed rule.

## Stable Signals To Translate

| Signal | What to inspect | Editing lever | CodeCut planning output |
| --- | --- | --- | --- |
| Stop-scroll | First frame, first sentence, product/result visibility | Put payoff, conflict, result, or human face first | `candidateClips`, first-frame QA |
| Early retention | First 1-3 seconds, setup delay, dead air | Cut setup, open on proof, compress filler | `storyBeats`, `selectedStructure` |
| Completion | Runtime, beat clarity, unresolved curiosity | Shorten or chapter the story; remove repeated claims | `qaChecklist` |
| Rewatch or loop | Reveal timing, before/after, payoff-return | End on a loop-back or unresolved visual comparison | `selectedStructure` |
| Save value | Tutorial utility, checklist, purchase criteria | Add step labels, comparison tables, clear takeaways | `storyBeats` |
| Share value | Social identity, humor, useful warning, giftable insight | Make the reason-to-share explicit without engagement bait | `qaChecklist` |
| Comment trigger | Legitimate debate, question, uncertainty | Ask one specific question tied to the content evidence | `selectedStructure` |
| Search fit | Topic keywords, title/overlay language, user intent | Align title, captions, and first spoken line to the same query | `materialAudit` |
| Trust/proof | Demo, receipt, side-by-side, source credibility | Prioritize proof shots over abstract claims | `storyBeats` |
| Negative feedback | Misleading hook, policy risk, low quality, repetitive clips | Remove bait, unsupported claims, unsafe crop, low-quality audio | `qaChecklist` |

## Signal To ContentCreationStrategy

| Signal | ContentCreationStrategy field |
| --- | --- |
| Search fit | `audienceIntent`, `contentAngle`, `scriptPromise` |
| Early retention | `scriptPromise`, `editingImplication` |
| Save value | `audienceIntent`, `proofAsset`, `interactionDesign` |
| Share value | `contentAngle`, `interactionDesign` |
| Comment trigger | `interactionDesign` |
| Trust/proof | `proofAsset` |
| Negative feedback | `editingImplication`, risk notes |

## Current-Source Check

Run a current-source check before giving advice framed as "latest", "current algorithm", "2026 rule", exact ranking weight, policy limit, monetization rule, or platform enforcement advice.

The check should record:

- Source name and URL.
- Access date.
- Whether the source is official, platform-owned, creator-center material, or third-party analysis.
- Which recommendation is directly supported and which remains a dated hypothesis.

## Translation Rule

Algorithm signals are business proxies, not editing commands. A stronger edit should improve the viewer's reason to watch, understand, trust, save, share, or act. If a signal does not map to a visible source asset or a clear business goal, keep it out of the `PlatformStrategyBrief`.
