---
name: codecut-executor-apply
description: Use when a confirmed Codecut editing plan is ready for local executor commands, including service readiness, bridge env, doctor checks, media import, transcription, EditPlan application, caption build, and get_timeline_state verification.
---

# Codecut Executor Apply

## Core Rule

Executor apply mutates Codecut state. Use it only after requirement intake passes for new creative jobs.

## Runtime Gate

Use the fixed MVP origin:

```bash
curl -fsS -o /dev/null http://127.0.0.1:4100/en/projects
```

If unavailable:

```bash
bun run dev:web
```

Do not switch ports.

## Bridge Env

From plugin root:

```bash
set -a
source apps/web/.env.local
set +a
```

Required keys:

- `CODECUT_AGENT_BRIDGE_URL`
- `CODECUT_AGENT_BRIDGE_TOKEN`
- `CODECUT_AGENT_BRIDGE_TIMEOUT_MS`
- `CODECUT_AGENT_BRIDGE_INTERVAL_MS`

Do not print token values.

## Required Command Order

```bash
node scripts/codex-bridge.mjs create-project --project-id <id> --name "<business project name>"
node scripts/codex-bridge.mjs doctor-install --project-id <id>
node scripts/codex-bridge.mjs doctor --project-id <id>
node scripts/codex-bridge.mjs send --project-id <id> --tool get_project_info --args-json '{}'
node scripts/codex-bridge.mjs send --project-id <id> --tool list_media_assets --args-json '{}'
```

Import only when needed:

```bash
node scripts/codex-bridge.mjs import-media --project-id <id> --file-path /absolute/path/source.mp4
```

Import a user-confirmed reference-derived template draft into Codecut system
templates only after explicit confirmation:

```bash
node scripts/codex-bridge.mjs import-system-template-script --project-id <id> --template-json-file /absolute/path/local-template-script.json --confirmed-by-user true
```

Apply a strict implemented EditPlan:

```bash
node scripts/codex-bridge.mjs apply-plan --project-id <id> --plan-json-file /absolute/path/edit-plan.json --replace-existing true
```

Verify:

```bash
node scripts/codex-bridge.mjs send --project-id <id> --tool get_timeline_state --args-json '{}'
```

For fresh-session spokenScript/readback acceptance on an existing scripted
project, run the read-only smoke command with explicit expected evidence:

```bash
node scripts/codex-bridge.mjs fresh-session-smoke --project-id <id> --scripted-media-name <name> --expected-caption-line-count <n> --expected-protected-term-count <n> --expected-caption-texts-json '["$2.34","Venmo that ASAP"]'
```

## Failure Rule

Do not continue after `doctor-install`, `doctor`, `fresh-session-smoke`, `import-media`, `import-system-template-script`, `transcribe`, `build-post-cut-captions`, `apply-plan`, or `get_timeline_state` fails. Fix the failing gate first.

## Completion

Report:

- project ID
- editor URL
- revision
- track count
- clip count
- caption count
- total duration
- source media IDs
- whether MP4 export was produced

Do not claim MP4 export unless a verified export path produced it.
