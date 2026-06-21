# get_timeline_state v2 Contract

## Purpose

`get_timeline_state` v1 is the stable executor readback contract. Existing MCP
clients call it with `{}` and depend on the current response shape for
post-edit verification. v2 is an explicit opt-in shape for faster Agent
orientation over the same local executor draft.

The local executor draft remains the source of truth:

```text
apps/web/.codecut-executor/projects/<projectId>/project.json
```

## Compatibility Rules

- Calling `get_timeline_state` with `{}` must keep returning the v1 shape.
- v1 field names, nesting, and default readback fields must not be compacted or
  renamed.
- v2 must be enabled explicitly with `format: "v2"`.
- v2 is read-only. It must not mutate project state or increment `revision`.
- v2 uses seconds as the primary unit. Frame fields are derived from
  `project.settings.fps` only when requested.
- MCP exposure is a separate decision. The existing MCP
  `get_timeline_state` tool must keep the current `projectId`-only contract
  unless a new explicit v2 tool is added.

## v1 Response

The default response remains:

```ts
{
  revision: number;
  tracks: Array<{
    id: string;
    type: "video" | "text" | "audio" | "sticker";
    name: string;
    isMain: boolean;
    muted?: boolean;
    hidden?: boolean;
    elements: Array<{
      id: string;
      type: "video" | "image" | "text" | "audio" | "sticker";
      name: string;
      startTime: number;
      duration: number;
      trimStart: number;
      trimEnd: number;
      mediaId?: string;
      content?: string;
      visual?: unknown;
      style?: unknown;
      audio?: unknown;
    }>;
    transitions?: unknown[];
  }>;
  totalDuration: number;
  derivedAssets: unknown[];
}
```

## v2 Request

```ts
{
  format: "v2";
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

## v2 Response

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

## MCP Exposure Decision

Current decision: do not change the existing MCP `get_timeline_state` schema.
Keep it as `projectId` only and reserve v2 for the executor envelope or CLI
`send --args-json` path.

If MCP clients need v2, add a new `get_timeline_state_v2` tool. Do not extend
the existing MCP tool schema unless a later compatibility review proves all
clients tolerate optional input fields and a non-default format argument.
