# get_timeline_state Contract

## Purpose

`get_timeline_state` is the only canonical Codecut timeline readback contract.
It orients Codex over the same local executor draft that the web editor displays.

The local executor draft remains the source of truth:

```text
apps/web/.codecut-executor/projects/<projectId>/project.json
```

## Compatibility Rules

- `get_timeline_state` is read-only. It must not mutate project state or
  increment `revision`.
- Calling `get_timeline_state` with `{}` returns the canonical rich readback
  shape.
- `format` is not accepted. Do not pass `format: "v2"` or add a
  `get_timeline_state_v2` tool.
- Time values use seconds as the primary unit. Frame fields are derived from
  `project.settings.fps` only when `includeFrames` is true.
- `includeReferencedMedia` controls whether referenced media metadata is
  included in the response.

## Request

```ts
{
  startTime?: number;
  endTime?: number;
  includeFrames?: boolean;
  includeReferencedMedia?: boolean;
}
```

Windowing rules:

- `startTime` defaults to `0`.
- `endTime` defaults to the full timeline duration.
- `startTime` and `endTime` are seconds.
- `endTime` must be greater than or equal to `startTime`.
- A returned element overlaps the window when
  `element.startTime < endTime && element.endTime > startTime`.

## Response

```ts
{
  schemaVersion: 2;
  project: {
    id: string;
    name: string;
    revision: number;
    settings: {
      fps: number;
      canvasSize: { width: number; height: number };
      background: { type: "color"; color: string };
    };
    totalDuration: number;
    totalFrames?: number;
  };
  cover?: unknown;
  window: {
    startTime: number;
    endTime: number;
    startFrame?: number;
    endFrame?: number;
    totalElementCount: number;
    returnedElementCount: number;
  };
  summary: {
    trackCount: number;
    elementCount: number;
    returnedElementCount: number;
    transitionCount: number;
    derivedAssetCount: number;
    trackTypeCounts: {
      video: number;
      text: number;
      audio: number;
      sticker: number;
    };
  };
  tracks: Array<{
    id: string;
    type: "video" | "text" | "audio" | "sticker";
    name: string;
    index: number;
    isMain?: boolean;
    muted?: boolean;
    hidden?: boolean;
    timeRange: {
      startTime: number;
      endTime: number;
      duration: number;
    };
    elementCount: number;
    returnedElementCount: number;
    elements: Array<{
      id: string;
      type: "video" | "image" | "text" | "audio" | "sticker";
      name: string;
      trackId: string;
      trackIndex: number;
      index: number;
      startTime: number;
      duration: number;
      endTime: number;
      startFrame?: number;
      durationFrames?: number;
      endFrame?: number;
      trimStart: number;
      trimEnd: number;
      trimStartFrame?: number;
      trimEndFrame?: number;
      mediaId?: string;
      content?: string;
      visual?: unknown;
      style?: unknown;
      audio?: unknown;
      keyframes?: unknown;
      motion?: unknown;
    }>;
    transitions?: unknown[];
  }>;
  referencedMedia?: Record<string, {
    id: string;
    name: string;
    type: "image" | "video" | "audio";
    mimeType: string;
    duration?: number;
    width?: number;
    height?: number;
  }>;
  derivedAssets: unknown[];
}
```
