# Project And Intro Cover Prompt Guide

Use this guide when creating a project cover poster or, separately, a timeline
opening image. Codecut runtime does not generate images. Codex generates the
cover through an available image generation capability, then imports the
resulting image with `import_media`.

Project cover is outside the timeline and must be set with `set_project_cover`.
`EditPlan.introCover` is only for a timeline opening image that becomes an
actual image element at the start of the video.

## Required Project Cover Workflow

1. Decide the final first video clip before cover generation.
2. Use that clip's `sourceMediaId` and `sourceStart` as the first-frame target.
   Inspect a still frame or a tight source range with `inspect_video_range`.
3. Classify the video type into one of the prompt families below.
4. Generate a separate image from the inspected first-frame evidence. Preserve
   the recognizable person, product, place, or screen state unless the user
   asked for a different concept.
5. Import the generated image with `import_media`.
6. Call `set_project_cover` with the imported image `mediaId`, title text,
   prompt, and style preset metadata. Verify the cover is present without
   changing timeline duration:

```json
{
  "mediaId": "imported-cover-image-id",
  "title": "这里替换标题文本内容",
  "prompt": "竖版 9:16 短视频封面，标题设计是画面核心，超大中文标题占据顶部或中部，2-3 行错落排版，粗宋体与粗黑体混排，文字带厚描边、强投影、高对比，关键词使用亮黄、红色、绿色或橙色跳色强调，可加入半透明色块、标签底板、括号、话题符号作为标题装饰，背景真实、有轻微虚化和景深，主体居中或偏下，给标题保留充足留白，暖色自然光，清晰商业感，适合知识、情感、教育、带货、工具教程等多类型短视频封面，多元丰富但统一为爆款中文标题封面风格。标题：这里替换标题文本内容",
  "stylePreset": "viral_chinese_title_cover"
}
```

Project cover must not create timeline elements and must not change exported
video duration.

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
