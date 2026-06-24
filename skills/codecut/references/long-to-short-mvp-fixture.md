# Long-to-Short MVP Fixture

This fixture defines the first repeatable acceptance scenario for Codex-driven Codecut editing. Use it to judge whether the MVP saves real editing time instead of only producing plausible prose.

## Scenario

User intent:

> 把这个长视频剪成一个 45 秒左右的竖屏短视频，保留信息密度最高的片段，加字幕和一个开头标题。

Source type:

- one talking-head, interview, course, tutorial, or product explanation video
- 10-60 minutes
- spoken audio is clear enough for transcription
- one primary source video asset already imported into Codecut

MVP should not use a pure music video or montage as the first fixture because transcript-first selection would be the wrong product assumption.

## Input Requirements

| Input | Required | Notes |
| --- | --- | --- |
| source video duration | yes | 10-60 minutes preferred |
| audio track | yes | required for transcript-first MVP |
| transcript segments | yes | word timestamps preferred, segment timestamps acceptable |
| visual scene data | no | useful later, not required for MVP |
| platform | default | TikTok/Reels/Shorts vertical when user says short video |
| target duration | default | 30-60 seconds if user does not specify |

## Expected EditPlan

The generated plan should contain:

- 3-6 clips
- total output duration between 35 and 55 seconds for a 45-second target
- first clip labeled `hook`
- every clip has a reason tied to the user goal
- captions are generated from the selected transcript text
- a short opening overlay exists for the hook
- when vertical output is requested, project settings are explicitly updated to 1080x1920 at 30 fps before export verification; `EditPlan.target.aspectRatio` alone is not proof that the canvas changed

## Candidate Selection Rules

Prefer segments that contain:

- a specific result, claim, or conclusion
- a clear before/after contrast
- a concise explanation with low filler
- product proof, process proof, or teaching value
- a line that works in the first 1-3 seconds as a hook

Avoid segments that contain:

- greetings and housekeeping
- repeated setup
- off-topic tangents
- unresolved pronouns without context
- claims not supported by visible or spoken source material

## Acceptance Checks

The fixture passes only when:

1. `get_project_info` identifies the active project, source media, project settings, and transcript readiness.
2. `transcribe_media` or user-supplied timed transcript provides the planning context for speech-led content.
3. Codex writes an implemented EditPlan v1 using only the current schema fields.
4. `apply_edit_plan` returns success.
5. `get_timeline_state` confirms at least one video track and, if captions are requested, one text track.
6. Output duration is within target tolerance.
7. No selected source range exceeds source media duration.
8. If vertical output was requested, `get_project_info` confirms the updated canvas and FPS.
9. User can preview the generated short in Codecut.
10. The result remains editable through normal Codecut controls.

## Failure Examples

Fail the fixture when:

- Codex returns only prose and no `EditPlan`
- selected timestamps do not exist in the source video
- captions are placed using source timestamps instead of output timeline timestamps
- Codecut silently drops an invalid clip and reports success
- Codex claims `VideoContext`, `previewEditPlan`, `applyEditPlan`, or `verifyEditorState` exists as a current bridge tool
- Codex claims vertical output only because `EditPlan.target.aspectRatio` is set, without verifying project settings
- the result cannot be played in the Codecut preview

## Business Measurement

For the first internal test, record:

- time from user request to previewable timeline
- number of generated clips
- number of manual edits needed before export
- whether the user accepts the AI draft as a useful starting point
- reason for rejection if the draft is not useful

The MVP succeeds when the user treats the output as a draft to refine, not as a suggestion to restart from scratch.
