# Timeline Intro Cover Prompt Guide

Use this guide when creating a timeline opening image. Codecut runtime does not
generate images. Codex generates the image through an available image generation
capability, then imports the resulting image with `import_media`.

Project cover posters now route through `../codecut-cover-generation/SKILL.md`.
This file is only for a timeline opening image that intentionally becomes part
of the exported video.

`EditPlan.introCover` is only for a timeline opening image that becomes an
actual image element at the start of the video.

## Timeline Intro Image Workflow

Use this only when the confirmed setup intent has `generateIntroCover: true` or
the user explicitly asks for an opening image frame in the video. After importing
the generated image, write `introCover` in the EditPlan:

```json
{
  "introCover": {
    "mediaId": "imported-intro-image-id",
    "duration": 1.2,
    "fit": "cover",
    "reason": "Generated from the final first clip frame to create a clearer opening hook."
  }
}
```

The first video clip must start at `timelineStart: 1.2` when the intro image
duration is `1.2`. Use another duration only when the user or editing context
requires it, and keep the first clip aligned to that duration.

## Prompt Principles

- Start with the job: "short video project cover for..." or "opening timeline
  image for..." before style words.
- Keep one dominant subject and one hook. Product, face, screen, or place must
  be readable at phone-feed size.
- Use image-to-image when available so the cover stays consistent with the
  first frame's person, product, composition, and lighting.
- Keep contrast controlled around the subject. Avoid busy backgrounds, tiny
  props, dense UI, and unreadable charts.
- Leave platform-safe title space. For vertical covers, keep important subject
  detail away from top/bottom UI zones and side crop risk.
- For project covers, title text may be baked into the generated image when the
  user asks for short-video cover style. For timeline intro images, prefer no
  baked text and add title text through Codecut text layers unless explicitly
  required.
- Do not copy another creator's thumbnail style, face, brand marks, or exact
  composition. Use references only to infer layout constraints.

## Prompt Families

### product-proof-ad

Use for product demos, TikTok Shop style proof, before/after claims, and offer
clips.

```text
Opening video cover image for a product-proof short. Use the provided first
frame as identity and composition reference. Show the product as the dominant
subject, large and inspectable, with one clear proof cue from the video
context, clean contrasting background, controlled rim light, realistic material
detail, vertical 9:16 crop, and open title-safe space that does not cover the
product. No baked text unless explicitly requested.
```

### tutorial-demo

Use for screen recordings, app demos, workflow tutorials, and how-to videos.

```text
Opening video cover image for a tutorial demo. Use the provided first frame as
the screen-state reference. Show the key interface or tool action clearly,
large enough to read at phone size, with a simple before-after or result cue,
clean visual hierarchy, reduced background clutter, vertical 9:16 crop, and a
safe title area away from important UI. No tiny text, no invented app screens.
```

### talking-head-short

Use for founder clips, reactions, expert commentary, reviews, and educational
talking-head shorts.

```text
Opening video cover image for a talking-head short. Use the provided first
frame to preserve the speaker identity, pose, wardrobe, and room context. Make
the face the main subject with a natural expressive hook, clean separation from
the background, controlled high contrast, vertical 9:16 crop, and title-safe
space that does not cover the face or hands. No exaggerated facial distortion,
no baked text unless requested.
```

### faceless-lifestyle

Use for lifestyle B-roll, food, travel, desk setups, beauty, fitness, and other
faceless feed videos.

```text
Opening video cover image for a faceless lifestyle short. Use the provided
first frame to preserve the real object, setting, and color mood. Emphasize one
clear sensory hook, close inspectable subject scale, simple background,
controlled natural light, vertical 9:16 crop, and clean title-safe space away
from hands, food, product labels, or key action. No cluttered props, no baked
text unless requested.
```

### cinematic-story

Use for narrative, trailer-like, documentary, travel story, or cinematic mood
clips.

```text
Opening video cover image for a cinematic story short. Use the provided first
frame as the continuity reference for character, location, and mood. Create a
single dramatic story question, strong foreground subject, readable silhouette,
cinematic but realistic lighting, restrained color contrast, vertical 9:16
crop, and protected title-safe negative space. No poster collage, no fake
credits, no baked text unless requested.
```

## Source References

- Image2Studio thumbnail prompt guide:
  https://image2studio.com/en/guides/ai-youtube-thumbnail-prompt-guide
- Adobe Express AI thumbnail surface:
  https://www.adobe.com/express/create/ai/thumbnail
- Media.io image-to-image generator:
  https://www.media.io/ai/image-to-image
- YouTube custom thumbnail help:
  https://support.google.com/youtube/answer/72431?co=GENIE.Platform%3DAndroid&hl=en
- TikTok safe-zone specifications:
  https://ads.tiktok.com/help/article/tiktok-interactive-add-on-download-card-ad-specifications?lang=en
- Buffer Instagram size guide:
  https://buffer.com/resources/instagram-image-size/
