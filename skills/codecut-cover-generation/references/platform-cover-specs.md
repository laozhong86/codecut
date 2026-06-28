# Platform Cover Specs

Use this file to choose a cover canvas and source quality level. Platform pages
change, so keep claims dated and label source strength.

Source quality:

- `official`: directly from a platform help, ads, or business specification.
- `secondary`: from a public creator guide, design guide, or local skill pattern.
- `current-check-required`: known to drift or blocked by dynamic official docs.

## Presets

| Platform | Video type | Recommended cover canvas | Source quality | Notes |
| --- | --- | --- | --- | --- |
| YouTube | long video | `16:9`; high resolution; minimum width at least 640px | official | YouTube currently recommends a large custom thumbnail and says 16:9 is the most used player and preview ratio. |
| YouTube Shorts | short video | `9:16` visual with center-safe crop; custom surface can differ by device | current-check-required | Do not assume the long-video 16:9 thumbnail is honored everywhere for vertical Shorts. |
| TikTok | short video or ad | `9:16` vertical; support frames for `16:9` and `1:1` only when requested | official | TikTok Ads specs list vertical 9:16 as recommended, plus horizontal 16:9 and square 1:1 minimums. |
| Instagram Reels | short video | `9:16` canvas with center `1:1` profile-grid safe area | official | Reels cover display can be cropped in grid contexts. Keep title and face away from edges. |
| Douyin | short video | `9:16` default; confirm current official specs for ads or commerce | secondary | Use as a China-market preset unless a current official source is available in the task. |
| Xiaohongshu | short video or note-style cover | `3:4` for Atutun-style cover; verify if user targets video feed only | secondary | Local Atutun skill uses fixed `3:4`; treat it as style methodology, not platform law. |
| WeChat Channels | short video | `9:16` video-safe cover; keep center-safe title area | secondary | Public official cover specs are inconsistent; require current check for exact publishing constraints. |
| Bilibili | long video | `16:9` or current uploader-recommended thumbnail ratio | secondary | Public exact cover specs drift. For long-form thumbnails, preserve readable title and subject at 16:9. |
| LinkedIn | video ad or business post | `16:9`, `9:16`, `1:1`, or `4:5` to match placement | official | LinkedIn video ad specs support optional custom thumbnail and multiple ratios. |
| X | video ad or post | Match the video ratio; common assets include `16:9`, `1:1`, and `9:16` | official | X creative specs say thumbnail aspect ratio should match the video. |
| Pinterest | video pin | Prefer vertical `9:16` when full-screen behavior matters | official | Pinterest Help references full-screen `9:16` video Pins; confirm ad placement specs when paid media is requested. |

## Hard Rules

- If a platform is explicit, use its ratio as a hard constraint.
- If the platform is unknown, stop before image generation when the ratio would
  change the final cover.
- If the platform source is `secondary`, label the output as a platform preset,
  not an official requirement.
- For short vertical platforms, keep faces, products, title, and proof away from
  bottom and side UI zones.
- For long-form 16:9 thumbnails, keep title legible at small sizes and avoid
  placing the subject at the extreme left or right crop edge.
