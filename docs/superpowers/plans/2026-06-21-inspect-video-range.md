# CodeCut inspect_video_range Implementation Plan

## Goal

Add a local, read-only `inspect_video_range` executor tool so Codex can inspect a chosen source media time range before writing an EditPlan.

## Product Contract

- Input: `mediaId`, `startSeconds`, `endSeconds`, optional `frameCount`.
- Output: one local PNG contact sheet artifact plus frame timestamps, normalized waveform samples, silence ranges, and warnings.
- Scope: local deterministic evidence only.
- Non-goals: OCR, scene detection, cloud APIs, timeline mutation, derived asset mutation, or export quality gates.

## Implementation Tasks

1. Add `video-range-inspection.ts`.
   - Validate video media, file path, duration, range, and `frameCount`.
   - Compute evenly spaced frame timestamps.
   - Extract audio samples locally with `ffmpeg`.
   - Build waveform samples and silence ranges.
   - Render one PNG artifact through local `ffmpeg` composition.

2. Wire executor.
   - Add `inspect_video_range` to the executor tool schema.
   - Add strict args parsing.
   - Run the inspector with `.codecut-executor/projects/<projectId>/inspect` as output.
   - Do not save or mutate project state.

3. Wire CLI.
   - Add `inspect-video-range`.
   - Validate numeric flags before posting the command envelope.
   - Reuse existing executor readiness and post-envelope path.

4. Update documentation and skill references.
   - Document L3-on-demand visual/audio drill-down.
   - Keep OCR, scene detection, and full visual preflight as future work.
   - Require the tool for ambiguous cut, silence, caption-overlap, and landscape-to-vertical risk decisions.

## Verification

```bash
bun test apps/web/src/lib/codex-executor/__tests__/video-range-inspection.test.ts
bun test apps/web/src/lib/codex-executor/__tests__/executor.test.ts
bun test scripts/__tests__/codex-bridge.test.mjs
bun run lint:web
```

## Manual Acceptance

1. Start CodeCut on `127.0.0.1:4100`.
2. Create or reuse an executor project.
3. Import one small local video.
4. Run `inspect-video-range`.
5. Open the returned absolute PNG path.
6. Run `get_timeline_state` before and after; tracks must be unchanged.
