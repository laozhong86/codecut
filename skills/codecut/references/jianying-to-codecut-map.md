# Jianying To Codecut Map

## Product Translation

Jianying skill optimizes for local Jianying draft automation. Codecut optimizes for a privacy-first browser video editor. The reusable value is the operating model, not the Python implementation.

Use this translation:

| Jianying concept | Codecut equivalent |
| --- | --- |
| `JyProject` lifecycle | `EditorCore` managers and active project state |
| `project.save()` | Save manager and project persistence path |
| Draft folder validation | Timeline/project state validation plus browser-visible proof |
| `add_media_safe` | Media import plus typed `video`, `image`, or `audio` elements |
| `add_text_simple`, `import_srt` | Text track elements and subtitle/transcription surfaces |
| `add_tts_intelligent`, `add_narrated_subtitles` | Codecut TTS route, audio track insertion, and aligned text elements |
| `asset_search.py` | Existing Codecut data/API lookup or a typed registry |
| `add_effect_simple`, transitions | Timeline transition/effect model owned by Codecut types and commands |
| Keyframes in microseconds | Codecut timeline seconds and transform model |
| Web-to-video VFX | Browser-rendered preview or generated media imported as timeline assets |

## Codecut Architecture Anchors

- `apps/web/src/core/index.ts`: singleton `EditorCore`.
- `apps/web/src/hooks/use-editor.ts`: React access to editor state.
- `apps/web/src/lib/actions/definitions.ts`: source of truth for user-triggered actions.
- `apps/web/src/hooks/actions/use-editor-actions.ts`: action handlers.
- `apps/web/src/lib/commands/`: undoable mutations.
- `apps/web/src/types/timeline.ts`: timeline, track, and element contract.
- `apps/web/src/services/renderer/`: preview/render pipeline.
- `apps/web/src/lib/tts/` and `apps/web/src/app/api/tts/`: TTS path.
- `apps/web/src/stores/`: UI and feature state stores.

## What To Reuse From Jianying

### Deterministic Edit Loop

For a vague request like "make this into a short video", produce one executable plan first:

1. Define target format, duration, aspect ratio, and assets.
2. Map assets to timeline tracks.
3. Add text, audio, transitions, and effects only when they support the creator outcome.
4. Verify timeline state and visible playback.

### Acceptance Checklist

Every editing workflow should prove:

- project or active editor state exists
- timeline contains at least the requested media path
- media, text, audio, and sticker elements are on correct track types
- durations and start times match the requested structure
- audio mix is intentional when BGM and narration coexist
- subtitles exist and align when narration exists
- preview/editor UI reflects the changed state

### Asset Discipline

Never invent IDs for effects, transitions, cloud media, voices, or generated models. If a capability needs an ID, create a typed resolver or use an existing source of truth.

### Generative Editing

Translate vague style language into concrete timeline choices:

- visual rhythm
- typography
- transitions
- sound design
- aspect ratio
- pacing
- verification point

## What Not To Reuse

- Do not add Jianying installation paths to Codecut.
- Do not introduce Python wrappers to browser editor runtime.
- Do not write generated edit scripts inside a skill folder.
- Do not rely on Jianying-only auto-export or draft repair behavior.
- Do not hide missing Codecut APIs behind fallback behavior.
