# Codecut Version Release Matrix

Use this matrix for any Codecut change that affects plugin prompts, skills, MCP
tool schemas, MCP resources, widgets, Codex-host routing, bridge code, or local
executor release behavior.

The product goal is to prevent one common false positive: source tests and cache
sync pass, but the active Codex session still sees an older tool schema or a
different `codex` binary. A release is only ready when every layer below has a
recorded readback.

## Publication Readiness Checklist

Use this checklist before asking another user to install Codecut or before
claiming a local plugin update is visible in Codex:

- manifest version: `.codex-plugin/plugin.json` has the intended `name` and
  `version`, and the release notes name both values.
- MCP server version: the MCP server reports the same release version as the
  plugin manifest. Codecut currently reads this from the manifest at runtime;
  keep it that way instead of adding a second version constant.
- skills: the installed bundle includes every intended `skills/*/SKILL.md`
  entry and the public `codecut` skill still routes to stage skills rather than
  hard-coded workflows.
- source-to-cache sync: `node scripts/sync-codex-local-plugin.mjs` has run for
  the target marketplace, and the follow-up dry run or `bun run
  plugin:freshness` shows no release-relevant drift.
- enabled config: Codex config enables the intended `codecut@<marketplace-name>`
  entry, and the marketplace source points at the source checkout being
  released.
- fresh-session tool surface: after cache sync, a fresh Codex session can find
  `mcp__codecut_mcp.open_codecut_workspace` through `tool_search`; current
  sessions may still hold stale host schemas.

## Required Matrix

| Layer | Required Evidence | Command Or Readback | Pass Criteria |
| --- | --- | --- | --- |
| Git source | Branch, clean status, commit SHA | `git status -sb`; `git rev-parse HEAD`; `git log -1 --pretty='%h %cd %s' --date=iso-strict` | Release source is the intended branch or landed mainline commit. Unrelated dirty files are not part of the release. |
| Plugin manifest | Plugin name and version | `jq '{name,version}' .codex-plugin/plugin.json` | `name` is `codecut`; `version` is the release version being installed. |
| Marketplace and config | Enabled plugin entry and marketplace source | `bun run plugin:freshness` | `codecut@<marketplace-name>` is enabled, and the marketplace entry points to the source checkout being released. |
| Installed cache | Cache path and source-to-cache sync | `bun run plugin:freshness`; `node scripts/sync-codex-local-plugin.mjs --dry-run` | Cache version path matches the manifest version, and `plugin_sync` is ok or the dry-run reports no release-relevant drift. |
| Codex CLI and app | Every visible Codex binary and version | `which -a codex`; `codex --version`; `/Applications/Codex.app/Contents/Resources/codex --version` when present | The release note records the binary actually used. Missing `codex plugin list --json` support is treated as CLI-version drift, not a Codecut plugin failure. |
| Host tool surface | Current or fresh-session tool discovery | `tool_search` query: `open_codecut_workspace Codecut MCP workspace setup widget` | The callable tool `mcp__codecut_mcp.open_codecut_workspace` is visible after cache sync. |
| Fresh-session proof | Real `@codecut` validation thread | `docs/codecut-widget-intake-fresh-thread.md`; `node scripts/verify-codecut-widget-intake-thread.mjs --thread-id <threadId>` | The thread contains a real `codecut_mcp.open_codecut_workspace` call and no shell, file write, media import, timeline mutation, or text fallback. |
| Runtime readiness | Required only when editing execution is part of the release | `node scripts/codex-bridge.mjs doctor-install --project-id <id>`; `node scripts/codex-bridge.mjs doctor --project-id <id>` | Source, cache, bridge env, web service, executor project, and executor status all pass. Widget-only releases may mark this layer not applicable. |

## Release Record Template

Copy this block into the PR, release notes, or handoff before reporting a plugin
release as ready.

```text
Release date:
Release owner:
Scope:

Git source:
- Branch:
- Commit SHA:
- Clean status:

Plugin manifest:
- Name:
- Version:

Marketplace/config:
- Enabled plugin:
- Marketplace root:
- Source path:

Installed cache:
- Cache root:
- plugin_sync:
- Sync command:

Codex CLI/App:
- PATH codex:
- PATH codex version:
- Codex app bundled CLI version:
- Plugin-list command support:

Host tool surface:
- tool_search query:
- Expected tool visible:
- Session type: current / fresh

Fresh-session proof:
- Thread id:
- Verifier command:
- Verifier result:

Runtime readiness:
- Project id:
- doctor-install:
- doctor:
- Not applicable reason:

Decision:
- Ready / blocked:
- Blocker owner:
- Residual risk:
```

## Current Local Baseline Example

This example records the local evidence observed on 2026-06-24. Replace it for
every new release; do not treat it as current truth after source, cache, Codex,
or session state changes.

| Layer | Observed Value |
| --- | --- |
| Git source | `main` at `1ef590c222f16e4021f6146e6eec0c67037f9886`; last commit `1ef590c 2026-06-24T10:18:50+08:00 Document active Codecut browser navigation` |
| Plugin manifest | `codecut@0.1.1+codex.p0-verifiable-loop-20260622` |
| Installed cache | `/Users/x/.codex/plugins/cache/local-opc/codecut/0.1.1+codex.p0-verifiable-loop-20260622` |
| `plugin:freshness` | Source, cache, and config ok; session marked manual-check-required until host tool discovery is verified |
| Codex binaries | `/opt/homebrew/bin/codex` = `codex-cli 0.122.0`; `/Users/x/.nvm/versions/node/v25.8.0/bin/codex` = `codex-cli 0.141.0`; `/Applications/Codex.app/Contents/Resources/codex` = `codex-cli 0.142.0` |
| CLI command drift | PATH `codex plugin --help` exposes `marketplace` only; `codex plugin list --json` is not available from the PATH binary |
| Host tool surface | Current host `tool_search` found `mcp__codecut_mcp.open_codecut_workspace` |

## Decision Rules

- Do not publish from a dirty source checkout unless the dirty files are the
  intentional release diff.
- Do not treat marketplace discovery as plugin enablement.
- Do not treat installed cache freshness as current-session freshness.
- Do not treat an old local `codex` binary as a Codecut plugin regression.
- Do not run editing execution checks for a widget-only release unless the
  change also affects bridge or executor behavior.
