# Frame Selection Rubric

Use this file before creating a cover prompt from video evidence.

## Evidence Levels

1. `L1-first-frame`: only the first frame is available. Use only when the user
   explicitly accepts a fast cover.
2. `L2-range-contact-sheet`: `inspect_video_range` produced a contact sheet,
   waveform, silence ranges, and frame timestamps for a candidate range.
3. `L3-visual-context`: `build_visual_context` or multiple range inspections
   cover the likely opening, proof, result, and emotional beats.

Prefer `L3-visual-context` when the project is long, horizontal-to-vertical, or
emotion/atmosphere matters. Use `L2-range-contact-sheet` when the user already
identified a source range or the video is short.

## Scoring

Score candidate frames from 0 to 3:

- `emotion`: face, body, gesture, tension, surprise, confidence, uncertainty, or
  warmth is readable without the transcript.
- `atmosphere`: lighting, location, color mood, motion, or scene texture says
  what kind of video this is.
- `subject`: person, product, screen, place, or object is large and identifiable.
- `proof`: result, before/after, interface state, product use, receipt,
  packaging, comparison, or visible claim support is present.
- `title-space`: there is clean room for a title without covering the face,
  product, or proof.
- `platform-fit`: the frame can survive the target ratio and safe-zone crop.

Pick the primary frame with the strongest combined emotion, subject, and
title-space score. Use support frames for proof or atmosphere when the primary
frame cannot carry both.

## Required Ledger Fields

Record each candidate:

```text
mediaId:
sourceTimeSeconds:
artifactPath:
role: primary-emotion | proof | atmosphere | subject | fallback
scores:
  emotion:
  atmosphere:
  subject:
  proof:
  title-space:
  platform-fit:
selected: yes | no
reason:
```

## Failure Rules

- Do not choose a black frame, blank screen, motion-blurred face, unreadable UI,
  or frame with key subject cut off.
- Do not use a silent or low-action range as emotional evidence unless the video
  is intentionally calm and atmospheric.
- Do not claim face-safe, product-safe, or title-safe crop if only transcript
  evidence exists.
- Do not invent scene details not visible in the evidence artifacts.
