---
name: codecut-scriptwriting
description: |
  Use when CodeCut needs pre-edit content writing for short-form video: hooks, voiceover scripts, spoken-word drafts, script rewrites, and de-AI / 去 AI 味 copy cleanup before editing or timeline planning. Title-only requests should use codecut-title-generation first. Trigger on requests mentioning 口播脚本, 口播稿, 口播文案, 去AI味, 去 AI 味, 文案润色, hook, script, voiceover, narration, or spoken script for a CodeCut job.
---

# CodeCut Scriptwriting

## Core Boundary

This skill creates an upstream copywriting brief for CodeCut. It does not open
a workspace, download media, mutate the timeline, import assets, apply an
EditPlan, or claim export readiness.

Use it before CodeCut editing when the job needs one or more of:

- Title support inside a broader script brief: consume or reference a
  `TitleGenerationBrief` when a title is part of a larger scriptwriting job.
- Voiceover script: spoken copy with beats, duration, and visual intent.
- De-AI rewrite: removing generic AI tone while preserving facts and proof.

Title-only requests belong to `codecut-title-generation`: 标题根据素材生成,
顶部固定标题, 封面标题, 视频标题, 标题优化, 爆款标题, fixed top title, cover
title, platform title, publish title, and title optimization. If a request mixes
title generation with voiceover script or De-AI work, run
`codecut-title-generation` first, then use this skill for the spoken or rewrite
lanes.

If the user asks to place the title into the actual timeline, set a project
cover, add text overlays, or export the edited video, hand off to the normal
CodeCut intake/planning/executor path after the scriptwriting brief is ready.

## Inputs

Collect or extract the minimum facts needed to avoid invented copy:

- Topic or product: what the video is about.
- Audience: who should stop, watch, or act.
- Platform: Douyin, Xiaohongshu, TikTok, WeChat Channels, Instagram Reels, or
  "unknown".
- Proof: real result, demo, case, data, quote, before/after, screenshot, or
  source transcript.
- Desired action: save, comment, buy, book, follow, learn, trust, or share.
- Duration or beat budget for voiceover. If duration is unknown, mark the script
  as unbudgeted instead of inventing a runtime.
- Brand and compliance constraints: banned claims, required wording, forbidden
  slang, and terms that must stay exact.

Ask a short blocking question only when the missing fact would force a false
claim or unusable script. Otherwise continue and label the gap in the output.

## Workflow

### Step 1: Build the Copy Brief

Extract the core claim in one sentence:

```text
This video should make [audience] believe [claim] because [proof], then [action].
```

Keep source truth separate from assumptions. If the user supplied transcript,
material-audit, video-context, storyboard, existing title, or prior script,
treat those as evidence. Current user instructions override stored methodology.

### Step 2: Choose Output Lanes

Decide which lanes are required:

- `coverTitle`: short, visual, readable on a phone, built for stopping the swipe.
- `videoTitle`: slightly more descriptive, built for discovery/search/caption.
- `voiceoverScript`: spoken beats that can drive later CodeCut planning.
- `deAiRewrite`: diagnosis plus rewritten copy.

For title-only jobs, stop here and route to `codecut-title-generation` instead
of generating title candidates in this skill.

Do not merge cover title and video title. A good cover title can be too short
for discovery, and a good video title can be too long for the cover.

### Step 3: Generate Cover Titles

Cover titles should usually be 5-12 Chinese characters, one or two short lines.
Use stronger contrast and fewer words than the video title.

For each candidate, provide:

- `title`
- `formula`: the trigger family used
- `why`: why it fits this topic and audience
- `proofCheck`: what real proof supports it, or what proof is missing

Use trigger families as tools, not as a fixed formula lock:

- Cognitive conflict: breaks a common belief.
- Curiosity gap: withholds the answer.
- Loss / avoid: shows what the viewer may be doing wrong.
- Identity: names a specific viewer.
- Number / list: lowers effort.
- Result promise: names an outcome and condition.
- Social proof: uses a real case or result.
- Controversy: creates a fair disagreement.
- Scenario: names a timely situation.
- Action: makes the next step obvious.

Reject titles that reveal the full answer, overclaim results, or cannot be
supported by the supplied proof.

### Step 4: Generate Video Titles

Video titles can be longer than cover titles, but keep Chinese short-video
titles within 20 Chinese characters unless the target platform or user says
otherwise.

Generate 6-10 candidates across at least 3 trigger families. Return a Top 3
with judgment, not just variety. Each title must include:

- `title`
- `lane`: `videoTitle`
- `formula`
- `targetViewer`
- `why`
- `risk`: overclaim, ambiguity, platform mismatch, or none

If the user asks for current platform algorithm rules, run a current-source
check or route to `content-platform-editing-strategy` before presenting platform
claims as guidance.

### Step 5: Write Voiceover Scripts

A CodeCut voiceover script should be usable by later editing/planning. Write it
as beats, not one dense paragraph.

Use this spoken structure when it fits the job:

1. Hook: stop the viewer in the first 1-3 seconds.
2. Setup: name the scene, problem, or stakes.
3. Proof: show the concrete evidence.
4. Turn: reveal the useful point or contrast.
5. Landing: ask for the next action without sounding generic.

For each beat, include:

- `beatId`
- `durationSec` when a duration is provided
- `voiceover`
- `visualIntent`: what the viewer should see during this line
- `proofSource`: transcript, material, user fact, or missing
- `captionHint`: optional short subtitle emphasis

Keep spoken Mandarin natural. As a budget check, ordinary short-video Mandarin
often lands around 4-6 Chinese characters per second. If the requested duration
and script length conflict, report the mismatch instead of silently stretching
or compressing.

### Step 6: Remove AI Taste

De-AI cleanup is not "make it casual" by default. Diagnose first, then rewrite.

Flag and remove:

- Empty setup: "今天给大家分享", "在当今时代", "你是否曾经".
- Generic summaries: "总而言之", "不容忽视", "值得注意的是".
- Corporate fog: "赋能", "打造闭环", "提升体验", "高效解决方案".
- Fake intimacy: forced slang, fake dialect, fake "朋友们" tone.
- Unsupported certainty: guaranteed growth, guaranteed results, fake numbers.
- Same-length sentence rhythm across every line.

Replace with:

- Specific scene, object, action, result, or quote.
- Short spoken sentences mixed with one longer sentence where needed.
- Real hesitation only when it matches the creator's voice.
- Concrete proof before conclusion.
- Words the creator would actually say out loud.

Preserve product names, facts, numbers, legal constraints, and user-approved
claims. Do not add a personality the brand did not ask for.

## Output Contract

Use `templates/scriptwriting-brief.md` when the output has more than one lane.

Minimum final output:

- `Input Facts`: known facts and missing facts.
- `Cover Title Candidates`: if requested.
- `Video Title Candidates`: if requested.
- `Voiceover Script`: if requested.
- `De-AI Rewrite Log`: if rewriting existing copy.
- `CodeCut Handoff`: what later planning can use, and what is still blocked.

If the user only wants final copy, keep the answer short but still separate
cover title from video title.

## Quality Gates

- Cover title and video title are not collapsed into one field.
- Every title has a trigger family and proof check.
- The Top 3 recommendation explains the tradeoff.
- Voiceover beats can map to visuals later.
- De-AI rewrite preserves facts and removes generic AI phrasing.
- Unsupported claims are called out, not softened into hidden assumptions.
- The skill does not mutate the CodeCut timeline.

## References

- `references/source-patterns.md`: local open-source patterns adopted and
  rejected for CodeCut scriptwriting.
- `templates/scriptwriting-brief.md`: reusable output shape for title, script,
  de-AI, and CodeCut handoff.
