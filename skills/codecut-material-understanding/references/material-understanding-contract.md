# Material Understanding Contract

Use this reference when writing
`.codecut-workspace/projects/<projectId>/02-inventory/material-understanding.json`
and
`.codecut-workspace/projects/<projectId>/02-inventory/material-understanding.md`.

## JSON Shape

The report is a read-only evidence artifact, not an edit plan.

Required top-level fields:

- `schemaVersion`: `material-understanding.v1`.
- `projectId`: confirmed Codecut project ID when available.
- `generatedFrom`: paths or IDs for `material-audit.md`, asset manifest,
  transcript, VideoContext, visual context, contact sheet, range inspection, or
  frame evidence used by the report.
- `assets`: one entry per reviewed media asset.
- `scriptMatches`: optional match suggestions when the user supplied a script,
  outline, caption beats, or storyboard beats.
- `blockers`: missing evidence or unsafe claims that stop planning.
- `nextHandoff`: recommended next stage, usually `codecut-edit-planning`.

Asset entries use this shape:

```json
{
  "assetId": "asset-001",
  "path": "/absolute/path/to/source.mp4",
  "roles": ["talking_head_subject"],
  "summary": "Presenter explains the product offer from 00:05 to 00:42.",
  "evidence": [
    {
      "kind": "transcript",
      "source": "video-context.json",
      "range": { "startSec": 5.2, "endSec": 42.0 },
      "note": "Presenter explains product offer."
    }
  ],
  "compositionAffordances": {
    "mainShotReplacement": "supported",
    "pictureInPicture": "supported",
    "splitScreen": "needs_visual_review",
    "circularTalkingHead": "supported",
    "cropNeeded": true
  },
  "risks": [
    {
      "severity": "medium",
      "kind": "subject_edge_risk",
      "evidence": "visual-context window 00:12",
      "note": "Presenter is close to the right edge."
    }
  ],
  "confidence": 0.82
}
```

## Role Labels

Use only these role labels unless the skill is updated with a tested contract:

- `talking_head_subject`
- `b_roll`
- `product_demo`
- `screen_recording`
- `proof_asset`
- `ambience`
- `low_usability`

Role labels require evidence. Do not infer a role from filename, folder name,
or user guess alone.

## Composition Affordances

Affordances describe what the asset can support, not what the final edit will
do. Use one of:

- `supported`
- `not_supported`
- `needs_transcript_review`
- `needs_visual_review`
- `blocked`

Track these affordances when relevant:

- `mainShotReplacement`
- `pictureInPicture`
- `splitScreen`
- `circularTalkingHead`
- `cropNeeded`

For circular talking-head suitability, record whether the presenter remains
inside a stable crop area. Do not claim a person mask exists unless readback
proves one.

## Script Matches

Script matches are suggestions for planning, not timeline instructions.

Each match must include:

- `segmentId` or a short segment label.
- `assetId`.
- `reason`.
- `evidence`.
- `confidence` from 0 to 1.
- `risk` when timing, crop, audio, caption conflict, rights, or evidence gaps
  affect the match.

Do not output clip start/end times as final edit ranges unless the evidence
source already provides timed proof and the field is clearly labeled as a
candidate evidence range.

## Markdown Report

The Markdown report should be readable by the user and include:

- Reviewed material list.
- What each asset is useful for.
- Best matching script or story beats.
- Composition opportunities and risks.
- Blockers.
- Next handoff.

Keep it as material understanding. Do not include a final edit recipe,
timeline, export promise, or executor command.
