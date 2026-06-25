# Research Source Map

This file records how outside research should be used. It is not a static algorithm database.

## Source quality ladder

1. `official platform source`: platform-owned support, newsroom, creator center, transparency center, or policy material. Use for public ranking factors, safety constraints, search behavior, and creator tools.
2. `local skill pattern`: local creative and editing heuristics. Use for workflow and judgment patterns, not as platform truth.
3. `third-party hypothesis`: agency, analytics vendor, research note, media report, or creator analysis. Use only as a dated hypothesis.
4. `unsupported lore`: exact weights, traffic-pool thresholds, or secret formula claims without current proof. Do not use.

## absorbed pattern: Source Handling

- Separate "what the platform publicly says" from "what creators infer works".
- Record source freshness when the user asks for latest rules.
- Prefer durable signals that map to content quality: viewer interest, watch behavior, search match, interaction, trust, originality, and recommendation eligibility.
- Do not turn third-party numbers into editing rules.

## Platform Source Anchors

| Platform | Best current source type | Strategy use |
| --- | --- | --- |
| TikTok | `official platform source`: Support and Newsroom recommender explanations | User interactions, video information, device/account settings, full watch/skip, search match, safety eligibility |
| Instagram Reels | `official platform source`: Instagram/Meta ranking and transparency pages | User activity, reel information, engagement, prediction systems, recommendation eligibility |
| Douyin | `official platform source` when available from creator/e-commerce centers; otherwise `third-party hypothesis` | Quality content, viewing behavior, interaction, search and commerce relevance |
| Xiaohongshu | `official platform source` from creator service pages for tooling; `third-party hypothesis` for ranking mechanics | Search intent, save value, note quality, social trust, title/cover fit |
| WeChat Channels | Platform/owner material when available; otherwise `third-party hypothesis` | Social graph spread, originality, share value, trust, topic relevance |

## Current-Source Check Output

When checking current sources, record:

- `sourceQuality`: official platform source, local skill pattern, third-party hypothesis, or unsupported lore.
- `accessDate`: date the source was checked.
- `supportedClaim`: the guidance directly supported by the source.
- `strategyTranslation`: the `ContentCreationStrategy` or `editingImplication` derived from that claim.
- `confidence`: high for official current guidance, medium for stable local skill pattern, low for third-party hypothesis, reject for unsupported lore.
