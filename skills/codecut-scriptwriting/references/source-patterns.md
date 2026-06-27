# Source Patterns

This file records the local reference projects used to shape CodeCut
scriptwriting. It is not a formula library to copy wholesale.

## Source Quality Ladder

1. CodeCut product boundary and current user request.
2. Local open-source skill pattern with concrete workflow.
3. Prompt or pipeline pattern with clear inputs and outputs.
4. Platform lore or generic marketing advice.

Use levels 1-3 for skill behavior. Treat level 4 as weak unless refreshed with
current sources.

## Adopted Patterns

### `dbs-xhs-title`

Adopt:

- Titles should map to an explicit trigger family or formula.
- The agent should recommend Top 3 titles with reasons.
- Title selection should match topic, audience, and platform intent.
- Short-video Chinese title length should be constrained by platform and cover
  readability, not by generic creativity.

Reject:

- Copying a platform-specific 75-formula library into CodeCut.
- Pretending a formula proves expected performance.
- Using one Xiaohongshu rule for every platform.

### FireRed OpenStoryline `generate_title` and `generate_script`

Adopt:

- Title generation can return concise structured candidates.
- Script generation should use `overall`, group summaries, style, and character
  budgets instead of freeform paragraphs.
- Each script section should align with a media group or visual purpose.

Reject:

- Treating hidden pipeline nodes as CodeCut runtime requirements.
- Inventing a duration when the input does not provide one.

### `chengfeng-videocut-skills` talking-head workflow

Adopt:

- Actual audio, transcript, and subtitles outrank draft scripts.
- A spoken script should later map to "what should the viewer see here?"
- Script alignment is semantic, not strict word-by-word diff.
- Human review is needed when deletion or meaning change risk is high.

Reject:

- Bringing its export scripts or HTML player workflow into this copywriting
  skill.
- Treating a written draft as stronger truth than the recorded speech.

### OpenMontage pipeline definitions

Adopt:

- Script is a checkpointed stage before scene planning and composition.
- Review criteria should include narrative arc, duration fit, and enhancement
  cues.
- Research/proof should feed the script before assets or edit decisions.

Reject:

- Multi-stage generation as a required CodeCut runtime workflow.
- Asset generation or timeline composition inside scriptwriting.

### `unified-skills/design-content-script`

Adopt:

- Audience task first.
- One story spine.
- One message per section.
- Cut anything that does not advance the story.

Reject:

- Long report/deck structure when the user only needs short-video copy.

## CodeCut Translation

For CodeCut, the right abstraction is a `ScriptwritingBrief`:

- It is upstream of requirement intake, material understanding, and edit
  planning.
- It can be produced from a topic alone, but should mark missing proof clearly.
- It can use transcript, material audit, video context, or storyboard evidence
  when available.
- It should produce copy that later planning can map to cover, text overlays,
  captions, voiceover, candidate clips, and visual proof.
- It does not mutate the timeline.

## Anti-Patterns

- One title field that mixes cover title and video title.
- "去 AI 味" by adding random slang.
- Generic claims like "爆款", "必火", or "轻松涨粉" without proof.
- Voiceover paragraphs that cannot be mapped to visuals.
- Script edits that silently change facts, numbers, product names, or legal
  constraints.
