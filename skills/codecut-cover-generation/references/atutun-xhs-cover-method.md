# Atutun Xiaohongshu Cover Method

This file adapts the local reference skill at
`/Users/x/Desktop/Project/github/atutun-xhs-cover/atutun-xhs-cover/SKILL.md`.
Treat it as a reusable visual method, not as platform truth.

## Core Pattern

- Fixed `3:4` Xiaohongshu cover composition.
- Human appears as the main subject, usually 35%-55% of the canvas.
- Strong expression or gesture: shock, thumbs-up, pointing, confused thinking,
  confident fist, or explanatory open hands.
- Main Chinese title is the first visual priority.
- Title fill uses soft yellow `#FDFFA7` or white with thick black outline.
- Any yellow title fill, keyword, banner, arrow, or block should use `#FDFFA7`,
  not neon yellow, gold, or orange-yellow.
- Human edge has a clear cutout outline in `#FDFFA7`, white, or another
  high-contrast color.
- Common support elements: green checklist, arrows, question marks, emoji,
  stickers, small cards, product or UI screenshots.
- Composition is high-contrast, dense, emotional, and readable at a glance.

## Video Adaptation

The original Atutun skill asks the user to upload a person reference image.
For Codecut video covers, replace that step with selected evidence frames:

- `frame 1`: primary human emotion frame from the source video.
- `frame 2`: product, screen, result, or proof frame when available.
- `frame 3`: atmosphere or background frame when it helps the cover.

Do not fabricate a default influencer. If no person or usable subject appears
in the video, choose another archetype such as `tutorial-screen-proof`,
`product-proof-cover`, or `cinematic-mood-cover`.

## Style Variants

Use only the variant that fits the video and user goal:

1. `big-title-top`: huge top title, human centered lower half.
2. `split-word-impact`: 2-4 large words around the human subject.
3. `beginner-explainer`: question marks plus simple explanatory title.
4. `tutorial-checklist`: three green checklist bullets plus tool/result frame.
5. `review-ranking`: large number, product cards, arrows, comparison labels.
6. `recommendation`: friendly gesture, warm background, recommendation stickers.
7. `sticker-collage`: human plus screenshot/product/tool cards.
8. `dark-workflow`: dark tool wall, checklist, bright title.

## Prompt Requirements

Every prompt should name:

- Target ratio: `3:4`.
- Primary frame role and support frame roles.
- Exact title text.
- Human position, expression, and gesture.
- Title placement, title hierarchy, fill color, and thick black outline.
- Safe-zone instruction for face, mouth, eyes, product, proof, and checklist.
- Background and support elements.

Use this color sentence when the Atutun style is selected:

```text
Use soft yellow #FDFFA7 for all yellow title fills, keywords, title blocks,
banners, arrows, and human cutout outline accents; avoid neon yellow, gold,
orange-yellow, or low-contrast gray.
```
