# Codecut Widget Intake Fresh-Thread Verification

Use this checklist after any change to Codecut plugin prompts, skills, MCP tool
schemas, MCP resources, widgets, or Codex-host tool routing.

This is the required fresh-thread proof for widget intake changes.

## Success Criteria

The change is verified only when a fresh `@codecut` thread produces a real
`codecut_mcp.open_codecut_workspace` MCP call. Source files, installed cache
contents, and unit tests are necessary but not sufficient.

The validation thread must not run shell commands, write files, download media,
create projects, import media, transcribe, mutate timelines, or send text-only
fallback questions.

For missing setup fields, the expected first Codecut action is the widget MCP
call itself. Reading local skill files first is a failure because it means
startup routing has not given Codex enough instruction to enter widget intake
without shell.

## Checklist

1. Confirm the active plugin source, cache, and Codex CLI compatibility:

```bash
bun run plugin:freshness
which -a codex
codex --version
```

`plugin:freshness` is the primary release gate because it verifies the source,
installed cache, enabled config, and marketplace entry without depending on the
local Codex CLI's plugin-list command surface. The output must show
`codecut@local-opc` enabled, the marketplace entry pointing at this source tree,
and the installed cache matching the source tree.

`codex plugin list --json` is useful only when the local `codex` binary supports
that subcommand. Before using it as a readback, confirm support with:

```bash
codex plugin --help
```

If `list` is missing from the help output, do not treat that as a Codecut plugin
failure. Record the `codex --version` output in the release matrix and continue
with `plugin:freshness`, installed-cache readback, and fresh-session tool
discovery.

2. Sync from that exact source:

```bash
node scripts/sync-codex-local-plugin.mjs
```

The JSON output must show `sourceRoot` as the active source path and
`cacheRoot` as the installed Codecut cache.

For release-level changes, record the exact Git SHA, plugin version, cache path,
Codex CLI/App versions, and fresh-session proof in
`docs/codecut-version-release-matrix.md`.

3. Confirm source and cache contain the new widget-intake contract:

```bash
rg -n "open_codecut_workspace|verify-codecut-widget-intake-thread.mjs" AGENTS.md docs .codex-plugin skills
rg -n "open_codecut_workspace" /Users/x/.codex/plugins/cache/local-opc/codecut
```

4. Confirm Codex host tool discovery can find the widget tool:

Use `tool_search` with:

```text
open_codecut_workspace Codecut workspace setup widget
```

The expected callable tool is
`mcp__codecut_mcp.open_codecut_workspace`.

5. Create a fresh `@codecut` validation thread with a minimal prompt:

```text
[@codecut](plugin://codecut@local-opc) Validate intake behavior: I have a local
video to edit into one 1-minute short. Do not download, do not edit, do not
write files, do not inspect skills, do not read local files, and do not run
shell commands. Use tool_search only if open_codecut_workspace is not visible.
The only allowed Codecut MCP tool call is codecut_mcp.open_codecut_workspace.
If editing setup fields are missing, use the normal Codecut plugin intake path
and render the setup widget instead of sending text questions.
```

6. Inspect the fresh thread with `read_thread` and verify it contains:

```text
mcpToolCall server=codecut_mcp tool=open_codecut_workspace
```

It must not contain `exec_command`, `fileChange`, or text fallback prompts such
as `直接回复` or `C/A/A/A/A`.

7. Run the verifier:

```bash
node scripts/verify-codecut-widget-intake-thread.mjs --thread-id <threadId>
```

If the local session file is not discoverable by thread id, export the
`read_thread` JSON or use the session JSONL directly:

```bash
node scripts/verify-codecut-widget-intake-thread.mjs --thread-id <threadId> --session-file /absolute/path/thread.json
```

## Failure Meaning

- Missing `open_codecut_workspace`: the agent did not enter widget intake.
- Text fallback prompt: the skill routing regressed to chat-only clarification.
- `exec_command`: the validation prompt was not kept read-only.
- `fileChange`: the validation prompt changed local state and is not a clean
  intake proof.
