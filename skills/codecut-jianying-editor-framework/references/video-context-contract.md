# VideoContext Contract

VideoContext is the source of truth Codex uses before creating an EditPlan. Codex should not infer video content from file names, project names, or user guesses when structured context is available.

Current MVP boundary: local `build_video_context` is implemented for L2 transcript context on one imported audio/video asset. It builds merged source-timestamped transcript context from deterministic local transcription, splitting media longer than 300 seconds into fixed 5-minute analysis chunks without creating temporary media assets. Durable `VideoContext` storage and richer visual/audio analysis remain future work.

## Principle

Do not ask Codex to "watch an MP4" directly. Convert media into searchable, timestamped, and inspectable context first.

## MVP VideoContext

```json
{
  "mediaId": "media_123",
  "name": "interview.mp4",
  "metadata": {
    "durationSeconds": 1830.4,
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "hasAudio": true
  },
  "transcript": {
    "language": "zh",
    "segments": []
  },
  "scenes": [],
  "audioEvents": [],
  "ocr": [],
  "warnings": []
}
```

## Required For Long-To-Short MVP

| Context | Required | Reason |
| --- | --- | --- |
| media id | yes | Bind plan to real Codecut asset |
| duration | yes | Validate source ranges |
| width/height | yes | Choose aspect-ratio strategy |
| audio availability | yes | Decide transcript feasibility |
| transcript segments | yes for talking video | Select meaning-bearing clips |
| scenes/keyframes | optional for MVP | Visual validation later |
| audio events | optional for MVP | Silence/dead-air trimming later |
| OCR | optional | Useful for tutorials and screen recordings |

## Transcript Segment

```json
{
  "start": 12.42,
  "end": 17.9,
  "text": "这里最重要的是先把计划变成可执行的时间轴。",
  "confidence": 0.91
}
```

Rules:

- Timestamps use source-video seconds.
- Keep original words when possible.
- Do not merge segments so broadly that exact cuts become impossible.
- If transcript confidence is low, mark a warning instead of pretending certainty.

## Scene Context

```json
{
  "id": "scene_1",
  "start": 0,
  "end": 4.2,
  "keyframeTime": 0.5,
  "description": "Presenter at desk, slide visible.",
  "ocrText": "Step 1: Import media"
}
```

Use scenes for:

- visual proof
- tutorial step boundaries
- AI artifact checks
- screen recording structure

Do not treat scene boundaries as mandatory cut points. Transcript timestamps can be more precise.

## Audio Events

```json
{
  "type": "silence",
  "start": 43.2,
  "end": 44.1,
  "duration": 0.9
}
```

Use audio events for:

- removing dead air
- detecting pacing issues
- avoiding pops at cut boundaries

## OCR Items

```json
{
  "time": 25.4,
  "text": "Export settings",
  "source": "keyframe"
}
```

OCR helps tutorial/demo edits and product proof. If OCR is missing, Codex should say visual text was not available rather than inventing it.

## Context Quality Levels

| Level | Available context | Suitable intents |
| --- | --- | --- |
| L1 Metadata only | duration, dimensions | basic placement, manual user-provided cuts |
| L2 Transcript | metadata + transcript | long-to-short, talking-head polish, captions |
| L3 Visual | transcript + scenes/keyframes/OCR | tutorials, UGC/product proof, AI artifact checks |
| L4 Full analysis | visual + audio events + business notes | platform-ready short-form edit |

MVP should target L2 for long-to-short talking videos.

Implemented for MVP:

- L2 transcript context through local `build_video_context`
- fixed 300-second analysis chunking for long media
- source-video timestamp normalization across chunks
- deterministic transcript-based `oral_candidate` and filler hints

## Warnings

VideoContext must carry warnings when context is incomplete:

- no audio track
- transcription failed
- unsupported codec
- visual analysis not run
- OCR skipped
- long video may take time to process

Warnings should influence the plan. For example, if there is no transcript, Codex should not claim it selected the strongest spoken argument.

## Codecut Mapping

Existing Codecut capabilities already cover part of this contract:

- media metadata from media processing
- audio extraction from timeline/media utilities
- L2 transcript context from the local `build_video_context` executor, which reuses the transcription service
- captions from caption chunk builder

Missing or future capabilities:

- scene detection
- keyframe/contact sheet generation as first-class context
- OCR
- audio-event detection
- explicit VideoContext storage and retrieval
