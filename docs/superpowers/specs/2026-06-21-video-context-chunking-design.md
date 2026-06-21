# Video Context Chunking Design Spec

## Overview

Cutia needs a local video analysis context that gives Codex enough structured evidence to make editing decisions before it writes an EditPlan. The transferable product pattern from VectCut is not the cloud API chain; it is the context pipeline: media duration, transcript timestamps, coarse asset classification, and editing hints.

This spec adds a local `build_video_context` executor tool for one imported Cutia media asset. For videos longer than 300 seconds, Cutia automatically analyzes the source in fixed 5-minute chunks and merges each chunk transcript back into original source-video timestamps.

## Success Criteria

- Codex can request context for one existing imported audio or video asset through the local executor.
- Videos with duration greater than 300 seconds are analyzed in 300-second chunks.
- Transcript segment timestamps in the final context are source-video seconds, not chunk-local seconds.
- Cutia does not create temporary media assets or mutate the timeline while building context.
- Cutia does not call cloud LLM or VectCut APIs.
- Missing visual analysis and OCR are reported as warnings instead of invented content.
- A failed chunk fails the request with the concrete chunk index and source time range.

## Product Assumptions

- The first business outcome is long-to-short and talking-head editing, so L2 transcript context is the MVP target.
- Local privacy is more valuable than cloud visual understanding for this step.
- Five-minute chunking is a product rule, not a user-configurable setting.
- The transcript produced here is for planning and clip selection only. It is not final subtitle copy for direct on-screen rendering.
- Scene detection, OCR, contact sheets, and visual descriptions remain future capabilities.

## Non-Goals

- No VectCut, OpusClip, or other cloud API calls.
- No physical video split files in the Cutia media library.
- No timeline mutation.
- No background job system.
- No preview or apply behavior changes.
- No new LLM provider settings in Cutia.
- No configurable chunk-size UI.

## User Flow

1. User imports a long video into a Cutia project, or Codex imports a local media file through the existing CLI.
2. Codex confirms the project and media asset with existing executor commands.
3. Codex runs `build_video_context` for the selected media asset.
4. Cutia probes metadata, validates the media can be analyzed, and splits the analysis into 300-second windows.
5. Cutia transcribes each analysis chunk locally.
6. Cutia returns a merged `VideoContext` with metadata, transcript, analysis chunk status, warnings, asset type guess, and editing hints.
7. Codex uses that context to write an EditPlan through the existing `apply_edit_plan` flow.

## Tool Contract

Executor tool name:

```text
build_video_context
```

Input:

```json
{
  "mediaId": "media_123",
  "language": "auto",
  "modelId": "whisper-tiny"
}
```

Rules:

- `mediaId` is required.
- `language` follows the existing transcription language parser.
- `modelId` follows the existing transcription model parser.
- Chunk length is fixed at 300 seconds.
- The tool accepts only audio and video assets.
- The tool requires a positive media duration.
- If the media has no audio track, the tool fails because visual-only context is not implemented.

Output:

```json
{
  "success": true,
  "message": "Built VideoContext for 'source.mp4'",
  "data": {
    "version": 1,
    "mediaId": "media_123",
    "name": "source.mp4",
    "qualityLevel": "L2_transcript",
    "metadata": {
      "durationSeconds": 725,
      "width": 1920,
      "height": 1080,
      "hasAudio": true
    },
    "transcript": {
      "language": "zh",
      "fullText": "完整转写文本",
      "segments": [
        {
          "start": 301.2,
          "end": 305.8,
          "text": "这一段是第二个分析切片中的内容。"
        }
      ]
    },
    "analysisChunks": [
      {
        "index": 1,
        "start": 0,
        "end": 300,
        "status": "succeeded",
        "segmentCount": 12
      },
      {
        "index": 2,
        "start": 300,
        "end": 600,
        "status": "succeeded",
        "segmentCount": 9
      },
      {
        "index": 3,
        "start": 600,
        "end": 725,
        "status": "succeeded",
        "segmentCount": 4
      }
    ],
    "assetTypeGuess": "oral_candidate",
    "editingHints": {
      "suggestTrimFillers": true,
      "hasTalkingHeadSignal": true,
      "canBeBroll": false
    },
    "warnings": [
      "visual analysis not run",
      "OCR skipped",
      "scene detection not run"
    ]
  }
}
```

Failure example:

```json
{
  "success": false,
  "message": "VideoContext chunk 2 failed for source range 300.00s-600.00s: No audio samples were extracted from media."
}
```

## Context Shape

`VideoContext` extends the existing documented contract with two MVP fields:

- `analysisChunks`: the audit trail of each 300-second analysis window.
- `assetTypeGuess` and `editingHints`: deterministic planning hints derived from transcript text and segment count.

Asset classification rules:

- `oral_candidate`: transcript has at least 3 segments and full text length is at least 20 characters.
- `mixed_or_unknown`: transcript is too short or empty.
- `broll_candidate`: reserved for future visual analysis. The MVP should not infer B-roll from a transcript-only context.

Filler hint rule:

- If transcript text contains at least two of `嗯`, `啊`, `呃`, `额`, `然后`, `就是`, set `suggestTrimFillers` to `true`.

## Architecture

### Local Executor

The local executor remains the owner of media bytes, file paths, and deterministic processing. The new tool is added to `apps/web/src/lib/codex-executor/executor.ts` and implemented through a focused `video-context.ts` module.

### Transcription Runtime

The existing Node transcription runtime is reused. It needs one range-aware entry point that extracts audio only for the requested source range before calling Transformers.js ASR.

The extracted chunk transcript stays chunk-local inside the transcription runtime. The VideoContext builder applies the source offset and returns global source timestamps.

### CLI

The CLI gains one user-facing command:

```bash
node scripts/codex-bridge.mjs build-video-context \
  --project-id <id> \
  --media-id <id> \
  --language auto \
  --model-id whisper-tiny
```

The CLI only builds and sends the executor envelope. It does not perform analysis itself.

## Validation

Minimum implementation validation:

- Unit test chunk planning for durations below, equal to, and above 300 seconds.
- Unit test timestamp offset merging across chunks.
- Unit test deterministic asset classification and filler hinting.
- Executor test proving `build_video_context` returns merged global transcript segments.
- Executor test proving non-audio/image media is rejected without invoking transcription.
- CLI test proving `build-video-context` builds the correct envelope.

## Risks

- Long local ASR jobs can be slow because chunks run serially.
- Very large source media can still be CPU-heavy even without physical splitting.
- This MVP cannot make visual claims. Codex must not say it saw products, faces, screens, or B-roll suitability from this context.
- If future subtitles use this transcript directly, subtitle quality may be lower than a dedicated subtitle pass.

## Self-Review

- No cloud APIs are introduced.
- No timeline mutation is introduced.
- Long video behavior is a single rule: analyze in fixed 300-second chunks.
- Missing visual context is explicit in warnings.
- The design has one executor path and no fallback mode.
