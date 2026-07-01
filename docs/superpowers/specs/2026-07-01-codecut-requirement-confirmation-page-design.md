# CodeCut Requirement Confirmation Page Design Spec

## Overview

CodeCut should move requirement confirmation out of the fragile create-project
follow-up path.

The current setup widget can create a project, import media, initialize the
workspace, and then ask the Codex host to post a follow-up message. Recent
failures show that the follow-up message is not reliable enough to be the
business handoff. When the host rejects or drops that message, the project may
already exist, but the Agent cannot safely continue without recovery steps.

The fix is architectural: make requirement confirmation a durable local
business record before project creation. A web page can still provide the user
experience, but the source of truth must be a local CodeCut record that Codex
can read back through a deterministic tool.

## Problem

CodeCut currently blends three separate concerns:

1. Capturing the user's editing requirements.
2. Creating the executor project and importing media.
3. Sending a host follow-up message so Codex continues the editing chain.

This creates a weak contract:

- The user sees "project created" even when the continuation message fails.
- Recovery depends on project ID, pending confirmation ID, and stored setup
  result details.
- Fresh sessions and already-open sessions may disagree about plugin or widget
  behavior.
- The validation target has drifted toward "did a follow-up message appear"
  instead of "is there a confirmed requirement contract that the Agent can
  read."

The product issue is not the create-project button itself. The issue is that
requirement confirmation has no standalone durable checkpoint.

## Research Summary

### Superpowers Visual Companion

The Superpowers brainstorming visual companion uses a local web page as a
confirmation surface. The Agent writes HTML content, the user clicks choices in
the browser, and click events are persisted locally. The important pattern is
not the temporary HTML implementation. The important pattern is this:

- user interaction happens in a browser;
- the result is persisted outside the chat message stream;
- the Agent can inspect persisted state later;
- automatic host follow-up is not the business source of truth.

This is a good model for CodeCut's requirement confirmation, but CodeCut should
use its own editor service and workspace store rather than a temporary
brainstorming page.

### OpenAI Apps SDK And MCP Apps

The current official Apps SDK direction supports interactive widgets, tool
calls, widget state, model-context updates, and host-posted messages:

- Apps SDK reference:
  <https://developers.openai.com/apps-sdk/reference>
- Build ChatGPT UI:
  <https://developers.openai.com/apps-sdk/build/chatgpt-ui>
- State management:
  <https://developers.openai.com/apps-sdk/build/state-management>
- MCP Apps compatibility:
  <https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt>

The key design rule from the state-management guidance is that business data
must live in the backend or server-owned state. Widget state is UI state, and
host messages are communication helpers. They should not be the authoritative
business record.

For CodeCut, this means:

- `sendFollowUpMessage` can be a convenience signal only.
- `setWidgetState` / model-context updates can improve context only.
- the confirmed requirement must live in CodeCut local storage and be readable
  by MCP tools.

### MCP Elicitation

MCP defines an elicitation mechanism for structured user input:

- MCP Elicitation specification:
  <https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation>

This is conceptually close to CodeCut requirement confirmation. It lets a
server ask the user for structured information with review, modification, and
cancel affordances.

However, CodeCut should not depend on MCP elicitation until the current Codex
host support is proven in a fresh session. Treat it as a future integration
option, not the P0 foundation.

### Codex Plugin Packaging

Codex plugins package skills, MCP servers, apps, hooks, and metadata:

- Codex plugins:
  <https://developers.openai.com/codex/plugins>
- Build Codex plugins:
  <https://developers.openai.com/codex/plugins/build>

This matters because CodeCut plugin changes have four observable layers:
source, installed cache, running MCP process, and fresh-session host tool
surface. A new confirmation system must have validation that proves the fresh
session sees the new tool path and that old follow-up behavior is not required.

## Goals

1. Make requirement confirmation a durable first-class CodeCut checkpoint.
2. Let the user confirm requirements in a local web page.
3. Keep project creation, media import, timeline mutation, and export blocked
   until confirmed requirements are readable.
4. Preserve the existing `ConfirmedSetup` business fields where possible.
5. Make `sendFollowUpMessage` optional, not critical.
6. Make fresh-session validation prove durable confirmation readback, not
   visible continuation messages.
7. Provide a clean recovery path from `draftId` without relying on `projectId`.

## Non-Goals

- Do not remove the existing setup widget in the first implementation.
- Do not depend on MCP elicitation as the only confirmation path in P0.
- Do not create an executor project before requirement confirmation.
- Do not import media, generate media, mutate timelines, or export files during
  requirement confirmation.
- Do not store confirmed business requirements only in widget state or host
  model context.
- Do not silently fall back from the new confirmation flow to the old
  create-project follow-up flow.

## Decision

Create a new CodeCut requirement confirmation flow:

```text
User request
  -> open requirement confirmation draft
  -> local web page renders editable requirement form
  -> user confirms or cancels
  -> CodeCut writes confirmed requirement record
  -> Codex reads confirmed requirement record
  -> project creation consumes confirmed requirement
  -> media ingest, planning, timeline mutation, and export continue
```

The confirmation record is the handoff. The follow-up message is only a
notification.

## Proposed User Flow

1. User asks for a video edit in a normal CodeCut prompt.
2. Codex calls `open_codecut_requirement_confirmation`.
3. CodeCut creates a requirement draft and returns:
   - `draftId`;
   - `confirmationUrl`;
   - normalized defaults;
   - current status: `awaiting_user_confirmation`.
4. The user opens or views the local page.
5. The page shows:
   - project name;
   - source media list;
   - target aspect ratio;
   - duration mode;
   - subtitle language;
   - subtitle style;
   - voice option: none, podcast female, podcast male;
   - output format and quality;
   - full free-text requirements;
   - detected risks and fields that need user attention.
6. The user clicks "Confirm requirements" or "Cancel".
7. CodeCut writes the confirmed or cancelled state locally.
8. Codex calls `get_codecut_requirement_confirmation`.
9. If confirmed, Codex continues to project creation with the confirmed
   requirement record.
10. If cancelled or still pending, Codex stops before side effects.

## Storage Contract

Requirement confirmation lives outside project folders because there may not be
a project yet.

```text
.codecut-workspace/
  requirements/
    <draftId>/
      draft.json
      confirmed.json
      events.jsonl
```

### `draft.json`

```json
{
  "version": 1,
  "draftId": "ccreq_22_abc123",
  "status": "awaiting_user_confirmation",
  "createdAt": "2026-07-01T00:00:00.000Z",
  "source": "codecut_requirement_confirmation",
  "originalUserMessage": "22号解说口播保留原时长",
  "requestedProjectName": "22号解说口播保留原时长",
  "requestedProjectId": "22-abc123",
  "mediaSources": [
    {
      "kind": "filePath",
      "filePath": "/Users/x/Downloads/22.mp4"
    }
  ],
  "taskType": "edit_execution",
  "timelinePreferences": {
    "aspectRatio": "9:16",
    "durationGoal": {
      "mode": "auto"
    },
    "durationContract": {
      "totalDurationMode": "preserve_source",
      "sourceCoverageMode": "full_source",
      "sourceDurationSeconds": 28.866667,
      "toleranceSeconds": 0.05
    },
    "transitionPreference": "none",
    "generateIntroCover": false,
    "requirements": "保留源视频完整长度，不删减原片，新增中文配音和同步字幕。"
  },
  "captionPreferences": {
    "language": "zh-CN",
    "font": "auto",
    "size": "medium",
    "stylePreset": "short-form-bold"
  },
  "voicePreferences": {
    "voicePackId": "none"
  },
  "exportPreferences": {
    "format": "mp4",
    "quality": "high",
    "includeAudio": true
  },
  "checks": [
    {
      "id": "source-duration",
      "ok": true,
      "message": "Source duration is available for preserve-source mode."
    }
  ]
}
```

### `confirmed.json`

`confirmed.json` is written only after the user confirms or cancels.

```json
{
  "version": 1,
  "draftId": "ccreq_22_abc123",
  "status": "confirmed",
  "confirmedAt": "2026-07-01T00:01:00.000Z",
  "source": "codecut_requirement_confirmation",
  "confirmedBy": "local_web_page",
  "confirmedSetup": {
    "version": 1,
    "taskType": "edit_execution",
    "confirmedAt": "2026-07-01T00:01:00.000Z",
    "source": "codecut_setup_confirmation",
    "timelinePreferences": {
      "aspectRatio": "9:16",
      "durationGoal": {
        "mode": "auto"
      },
      "durationContract": {
        "totalDurationMode": "preserve_source",
        "sourceCoverageMode": "full_source",
        "sourceDurationSeconds": 28.866667,
        "toleranceSeconds": 0.05
      },
      "transitionPreference": "none",
      "generateIntroCover": false,
      "requirements": "保留源视频完整长度，不删减原片，新增中文配音和同步字幕。"
    },
    "captionPreferences": {
      "language": "zh-CN",
      "font": "auto",
      "size": "medium",
      "stylePreset": "short-form-bold"
    },
    "voicePreferences": {
      "voicePackId": "none"
    },
    "exportPreferences": {
      "format": "mp4",
      "quality": "high",
      "includeAudio": true
    },
    "changes": []
  }
}
```

This intentionally embeds the existing `ConfirmedSetup` shape so later executor
code can consume the same preference groups. A follow-up implementation can
rename `source` to a more precise enum, but P0 should minimize executor
contract churn.

### `events.jsonl`

`events.jsonl` is an audit trail only. It is not the business source of truth.

```jsonl
{"type":"draft_created","at":"2026-07-01T00:00:00.000Z"}
{"type":"field_changed","at":"2026-07-01T00:00:30.000Z","field":"voicePreferences.voicePackId","oldValue":"none","newValue":"podcast-female"}
{"type":"confirmed","at":"2026-07-01T00:01:00.000Z"}
```

## Tool Contract

### `open_codecut_requirement_confirmation`

Purpose: create or update a requirement draft and return the confirmation page.

Side effects:

- writes `.codecut-workspace/requirements/<draftId>/draft.json`;
- appends `draft_created` or `draft_updated` to `events.jsonl`;
- does not create projects;
- does not import media;
- does not mutate timelines;
- does not export files.

Result:

```json
{
  "status": "awaiting_user_confirmation",
  "draftId": "ccreq_22_abc123",
  "confirmationUrl": "http://127.0.0.1:4100/en/requirements/ccreq_22_abc123",
  "nextAction": "wait_for_user_confirmation"
}
```

### `get_codecut_requirement_confirmation`

Purpose: read the current requirement confirmation status.

Side effects: none.

Result when confirmed:

```json
{
  "status": "confirmed",
  "draftId": "ccreq_22_abc123",
  "confirmedSetup": {
    "version": 1,
    "taskType": "edit_execution"
  },
  "nextAction": "create_project_from_confirmed_requirement"
}
```

Result when pending:

```json
{
  "status": "awaiting_user_confirmation",
  "draftId": "ccreq_22_abc123",
  "confirmationUrl": "http://127.0.0.1:4100/en/requirements/ccreq_22_abc123",
  "nextAction": "wait_for_user_confirmation"
}
```

### `create_codecut_project_from_requirement`

Purpose: consume a confirmed requirement and create the executor project.

Side effects:

- creates executor project;
- imports user-approved media sources if they were part of the confirmed
  requirement;
- initializes `.codecut-workspace/projects/<projectId>`;
- persists the setup recovery record.

This should replace the side-effect part of the current `submit_codecut_setup`
path for new sessions. The old tool can remain as a compatibility path during
migration.

## Web Page Contract

Route:

```text
/:locale/requirements/:draftId
```

API routes:

```text
GET  /api/codex-requirements/:draftId
POST /api/codex-requirements/:draftId/confirm
POST /api/codex-requirements/:draftId/cancel
```

The page reads the draft from the local requirement store. The confirm endpoint
validates the posted data against the same schema used by the MCP tool, writes
`confirmed.json`, appends an event, and returns the readback snapshot.

The page may try to post a host follow-up message when running inside a Codex
widget environment, but that call must be best-effort. A rejected follow-up
must not change the confirmation result.

## State Ownership

| State | Owner | Durable | Agent-visible | Notes |
| --- | --- | --- | --- | --- |
| Requirement draft | CodeCut local store | Yes | Yes | `.codecut-workspace/requirements/<draftId>/draft.json` |
| Confirmed requirement | CodeCut local store | Yes | Yes | `.codecut-workspace/requirements/<draftId>/confirmed.json` |
| Widget form state | Browser page | No | No | Can be reconstructed from draft |
| Host follow-up message | Codex host | No | Maybe | Convenience only |
| Project workspace | CodeCut local store | Yes | Yes | Created after confirmation |
| Timeline state | Executor/editor | Yes | Yes | Mutated after project creation |

## Recovery Contract

The recovery prompt should change from:

```text
recover_codecut_setup(projectId, pendingConfirmationId)
```

to:

```text
get_codecut_requirement_confirmation(draftId)
```

If a project was created later, project recovery remains valid. But the first
recovery object should be the requirement draft, not the project.

This gives the user and Agent a stable handle even when:

- the browser window is closed;
- the follow-up message is rejected;
- Codex starts a fresh session;
- the local web service restarts;
- the project has not been created yet.

## Validation Strategy

### Unit Tests

- Requirement schema accepts the current setup fields including built-in voice
  choices.
- Requirement schema rejects missing media sources, invalid duration contracts,
  and unknown voice choices.
- Requirement store writes `draft.json`, `confirmed.json`, and `events.jsonl`.
- `get_codecut_requirement_confirmation` is read-only.

### MCP Tests

- `open_codecut_requirement_confirmation` returns a `draftId` and
  `confirmationUrl`.
- The open tool does not call `create_project`.
- The open tool does not import media or mutate timelines.
- The get tool returns pending before confirmation.
- The get tool returns confirmed after `confirmed.json` exists.

### Web Tests

- Requirement page renders draft values.
- Built-in voice selection shows none, podcast female, and podcast male.
- Confirm writes `confirmed.json`.
- Cancel writes cancelled status.
- Follow-up failure does not block confirmation.

### Fresh-Session Verification

Replace the current "visible follow-up message required" validation with:

1. Fresh thread opens requirement confirmation.
2. Machine verifier proves the tool call was
   `open_codecut_requirement_confirmation`.
3. No project creation, ingest, timeline mutation, or export occurred before
   confirmation.
4. After simulated or real confirmation, `get_codecut_requirement_confirmation`
   returns `status: confirmed`.

## Migration Plan

1. Keep `open_codecut_workspace` and `submit_codecut_setup` working.
2. Add the new requirement confirmation path.
3. Update CodeCut skill guidance so new creative jobs use requirement
   confirmation first.
4. Update fresh-thread verifier to accept the new durable-confirmation proof.
5. Mark follow-up verification as optional compatibility evidence.
6. After fresh-session proof is stable, route default create-project flows
   through `create_codecut_project_from_requirement`.

## Risks

### Risk: The user expects one click to create a project

Mitigation: P0 should label the button "Confirm requirements". A later button
can say "Confirm and create project", but only after the durable requirement
record exists.

### Risk: Two confirmation systems confuse Agents

Mitigation: Skill guidance must state that the new requirement confirmation
path is the default for new creative jobs. The old setup widget is compatibility
only.

### Risk: Codex host tool surface keeps old schemas

Mitigation: Plugin verification must continue to check source, installed cache,
running session, and fresh-session tool discovery separately.

### Risk: Web page confirmation writes business state without schema parity

Mitigation: The web API and MCP tools must import the same schema module.

## Success Criteria

- A normal user request can reach a web requirement confirmation page without
  custom prompt wording.
- Confirmation creates a durable local record before project creation.
- Codex can read the confirmed requirement through a deterministic tool.
- Project creation is not required to prove requirement confirmation.
- `sendFollowUpMessage` failure no longer blocks continuation or recovery.
- The fresh-thread verifier no longer treats visible follow-up as the core
  success contract.
