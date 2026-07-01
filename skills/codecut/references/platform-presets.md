# Platform Presets

Use platform presets to constrain EditPlan defaults. Presets are planning defaults, not hidden runtime fallbacks. If the user gives a different requirement, use the user's explicit requirement and state the tradeoff.

Codecut templates read these presets as parameter guidance after template resolution. Presets do not select a weaker template, invent missing evidence, or repair unsupported execution paths. The execution order is material audit -> template resolve -> platform preset parameters -> decision ledger or strict plan -> apply -> readback.

## Short-Form Vertical

Applies to TikTok, Reels, Shorts, and similar feeds.

| Field | Default |
| --- | --- |
| Aspect ratio | 9:16 |
| Resolution | 1080x1920 |
| FPS | 30 |
| Duration | 15-45 seconds |
| Structure | hook -> proof/demo -> value beat -> CTA or loop |
| Captions | Resolved template caption preset, such as `talking-head-pop` or `product-punch`; no hidden fallback |
| BGM with voice | 0.08-0.14 |
| BGM without voice | 0.18-0.28 |
| Decision ledger | Required before EditPlan when the request is a platform cut, highlight, or broad short-form improvement |

Rules:

- First frame should show a result, product, action, or visual payoff.
- First 1-3 seconds need a reason to keep watching.
- The EditingDecisionLedger must name hook candidates, proof/value beats, selected structure, and first-3-second QA before EditPlan generation.
- Avoid bottom-right overlays because platform UI often covers them.
- Use `cover` only when subject stays safe in vertical crop; otherwise use `blur-bg` or `contain`.
- Landscape source requires visual preflight before `cover`; verify subject safe area, burned-in captions, and where new captions will sit.
- For horizontal talking-head footage with bottom burned-in captions, prefer `vertical_face_safe_crop_above_burned_captions` when the face and torso can remain large while the old subtitle band is cropped away. Express it with EditPlan `sourceCrop` when a fixed source rectangle is enough.
- Do not use `black-bar` as a subtitle mask for burned-in captions. Choose native `sourceCrop`, preserve the original captions, or stop on the missing runtime capability.

## YouTube Horizontal

| Field | Default |
| --- | --- |
| Aspect ratio | 16:9 |
| Resolution | 1920x1080 |
| FPS | source or 30 |
| Duration | user-defined |
| Structure | intro promise -> chapters -> payoff/summary |
| Captions | optional, `documentary-soft` or `cinematic-serif` lower third |

Rules:

- Preserve narrative continuity more than fast cuts.
- Use chapters for tutorials, essays, and demos.
- Avoid over-large TikTok captions unless user wants Shorts style.

## Square Feed

| Field | Default |
| --- | --- |
| Aspect ratio | 1:1 |
| Resolution | 1080x1080 |
| Duration | 15-60 seconds |
| Structure | result/hook -> supporting proof -> CTA |
| Captions | center-lower, compact; use `lifestyle-warm` for lifestyle content |

Rules:

- Use square when product/image composition benefits from balanced space.
- Ensure subtitles do not crowd the visual center.

## Tutorial / Demo

| Field | Default |
| --- | --- |
| Aspect ratio | source aspect or requested platform |
| Duration | 45-180 seconds for MVP |
| Structure | problem -> step 1 -> step 2 -> result |
| Captions | `tutorial-clean` captions, step labels, and concise explanations |
| Visual context | OCR and scene boundaries preferred |

Rules:

- Preserve chronological order.
- Do not over-optimize for viral pacing if it harms comprehension.
- Use overlays for step labels, not unsupported claims.

## UGC / Product Ad

| Field | Default |
| --- | --- |
| Aspect ratio | 9:16 |
| Duration | 15-35 seconds |
| Structure | hook -> pain/proof -> demo/process -> CTA |
| Captions | `product-punch`, claim-focused and short |
| Visual priority | proof shots over explanation |
| Decision ledger | Required before EditPlan |

Rules:

- Do not invent price, shipping time, guarantee, or platform claims.
- The EditingDecisionLedger must map each claim, proof beat, and CTA to transcript or visual evidence when available.
- Prefer visible proof: product close-up, comparison, order page, packaging, shipping, QC.
- End with one CTA or loop-back; do not stack multiple actions.

## Talking-Head Polish

| Field | Default |
| --- | --- |
| Aspect ratio | source or target platform |
| Duration | user goal |
| Structure | strongest statement first, then supporting beats |
| Captions | transcript-derived with `talking-head-pop` for vertical opinion clips |

Rules:

- Remove filler, repeated setup, and dead air.
- Keep sentence boundaries intact.
- Do not cut mid-word.
- Preserve tone and meaning over aggressive compression.

## AI Video Re-Edit

| Field | Default |
| --- | --- |
| Aspect ratio | target platform |
| Duration | 15-45 seconds |
| Structure | best clean visuals first |
| Captions | overlay-driven if no voice |

Rules:

- Inspect frames when available.
- Remove malformed hands/faces, warped text/logos, flicker, style drift, and subject exits.
- If source has no useful audio, use captions/overlays plus BGM rhythm.

## Safe Zone Guidance

For short-form vertical planning:

- Hook overlays: top safe zone or center badge.
- Spoken captions: middle-lower safe zone.
- CTA: center or top safe zone.
- Avoid bottom edge and right rail.
- After visual preflight finds burned-in captions, place new captions away from that region or choose a native `sourceCrop` reframe policy that removes it.

## Caption Preset Routing

Use implemented caption presets only:

- `talking-head-pop`: default for spoken talking-head, vertical opinion, creator talking-head, and high-retention claim clips. It is tuned for light-background readability with white text, translucent dark backing, and stronger shadow.
- `creator-clean`: clean Chinese creator-caption route for visually controlled backgrounds, especially Xiaohongshu or polished font-first clips that do not need a boxed spoken-caption look.
- `tutorial-clean`: screen recording, product walkthrough, step-by-step demo.
- `documentary-soft`: calmer essay, interview, narrative explanation, horizontal YouTube-style edit.
- `product-punch`: product proof, UGC ad, deal hook, comparison demo, before/after.
- `social-highlight`: platform-native punchy highlights, listicle points, and short social claims.
- `comment-bubble`: reply-to-comment, testimonial, DM/comment reading, and quote-like captions.
- `minimal-reel`: quiet personal reel or creator recap where captions still need a subtle backing on light backgrounds.
- `lifestyle-warm`: vlog, Xiaohongshu-style lifestyle, food, travel, daily routine, soft recommendation.
- `cinematic-serif`: brand story, fashion, emotional montage, premium product film.
- `short-form-bold`: legacy bold short-form route only when the user explicitly asks for that heavier look; do not use it as a hidden fallback.
- `black-bar`: only when the user explicitly wants a boxed subtitle look; Do not use it to mask burned-in captions.

## Native Transition Routing

Use implemented native transition presets only; never use keyframes, Shader,
WebGL, CSS, or arbitrary transition names to satisfy a transition request.

- Talking-head, opinion, and interview shorts: `blur-crossfade` for calm
  continuity, or `push-soft` for point-to-point pacing.
- Tutorial, demo, and screen walkthrough: `push-soft` to show progression
  without distracting from the proof.
- Product proof, UGC ad, deal hook, before/after: `flash-white` for reveal or
  `cinematic-zoom` for product emphasis.
- Brand story, fashion, emotional montage, premium product film:
  `blur-crossfade` as the default restrained transition.
- High-energy launch, sports, music, or promo: `chromatic-split`,
  `whip-pan-left`, or `whip-pan-right` when the source motion can support it.

## Preset Selection

If user says:

- "TikTok", "Reels", "Shorts", "竖屏" -> Short-Form Vertical.
- "YouTube", "横屏", "长视频" -> YouTube Horizontal unless the user asks for Shorts.
- "教程", "demo", "演示" -> Tutorial / Demo.
- "带货", "商品", "广告", "UGC" -> UGC / Product Ad.
- "试吃", "试喝", "探店", "vlog", "小红书", "生活方式" -> lifestyle-warm caption route unless the business goal is a hard product ad.
- "品牌片", "情绪片", "高级感", "电影感" -> cinematic-serif caption route.
- "口播", "去废话", "精剪" -> Talking-Head Polish.
- "AI 视频", "二创", "修一下" -> AI Video Re-Edit.

When multiple presets apply, choose the business goal first and platform second. For example, "TikTok 商品广告" uses UGC / Product Ad with Short-Form Vertical output settings.

Decision ledger fields are planning defaults only. Keep `materialAudit`, `storyBeats`, `candidateClips`, `selectedStructure`, and `qaChecklist` outside EditPlan v1.
