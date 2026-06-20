# Subtitle Pass Recipe

Use this recipe when the user asks for subtitles, caption cleanup, subtitle timing repair, translation subtitles, or caption readability improvements.

## Success Criteria

- Captions are derived from transcript or user-supplied timed text.
- Captions fit inside the generated timeline.
- Text stays on text tracks.
- `get_timeline_state` confirms caption element count and timing bounds.

## Required Context

- Existing transcript segments, or user-supplied caption segments.
- Current timeline duration if editing an existing project.
- Target language only when translation is explicitly requested.

## Execution Path

1. Complete the main P0 CLI Runtime Gate and executor readiness check.
2. Inspect project and media state.
3. If timed captions are missing, transcribe the selected media first.
4. Normalize caption text for readability:
   - Chinese: short phrases, usually 10-18 characters.
   - English: short phrase groups, usually 3-7 words.
5. Keep caption timing tied to source or output timeline, depending on whether the cut has already been applied.
6. Generate an implemented EditPlan v1 with `captions`.
7. Apply and verify with `get_timeline_state`.

## Boundary

Do not route simple fixed title text, labels, badges, or stickers into this recipe. Use the implemented title field only when the user asks for a title-like overlay and the current EditPlan v1 supports the request.

## Stop Conditions

- No transcript or timed caption source exists.
- The user requests animated subtitle templates, karaoke words, or styling not represented in current EditPlan v1.
- Translation is requested but no translation source/tool is available in the current workflow.

## Report Back

Return caption count, language, timing source, and any unsupported style requests.
