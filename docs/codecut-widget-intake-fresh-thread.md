# CodeCut Requirement Confirmation Fresh-Thread Verification

Use this checklist after any change to CodeCut plugin prompts, skills, MCP tool
schemas, MCP resources, widgets, or Codex-host tool routing.

This is the required fresh-thread proof for requirement confirmation changes.

## Success Criteria

The change is verified only when a fresh `@codecut` thread produces a real
`codecut_mcp.open_codecut_requirement_confirmation` MCP call and a confirmed
`codecut_mcp.get_codecut_requirement_confirmation` readback. Source files,
installed cache contents, and unit tests are necessary but not sufficient.

Before running the fresh-thread proof, the local CodeCut web service must
already be reachable at `http://127.0.0.1:4100/en/projects`. If
`open_codecut_requirement_confirmation` returns `service_unavailable`, the
runtime is blocked; that result is not a rendered confirmation page and does
not satisfy intake proof.

The validation thread must not run shell commands, write files, download media,
create projects, import media, transcribe, mutate timelines, or send text-only
fallback questions.

`open_codecut_requirement_confirmation` must be called exactly once and return a
`draftId` plus confirmation page URL. It must write only requirement
confirmation files. It must not create an executor project, import media, or
initialize `.codecut-workspace/projects/<projectId>/`.

The requirement confirmation tool must not render an inline MCP App opener or
return an `openai/outputTemplate`. The actual form is the local web page at the
returned confirmation URL. The expected preview path is a `node_repl.js`
browser-control call that runs `setupBrowserRuntime`, targets `iab`, makes the
browser visible, and navigates to that URL only when needed. A plain link is
only a fallback when that browser-control call fails.

Codex must not click the requirement page's confirm or cancel controls, script
the form, or submit the confirmation API. Requirement confirmation is a human
action. If a validation thread contains browser automation such as clicking a
`确认需求` button, the test fails even if the later readback says
`status: "confirmed"`.

After the user confirms in the web page, the thread must call
`get_codecut_requirement_confirmation` and read back `status: "confirmed"`.
The confirmed readback `draftId` must match the `draftId` returned by the
current `open_codecut_requirement_confirmation` call. Reusing an older
confirmed `ccreq_*` from another thread, workspace file, or memory summary is a
fresh-intake failure unless the validation prompt explicitly asks to recover
that exact draft.
Fresh-thread intake proof no longer requires a visible host follow-up message.
Project creation is a later step through `create_codecut_project_from_requirement`
and must not run during intake verification.

For missing setup fields, the expected first CodeCut action is the requirement
confirmation MCP call itself. Reading local skill files first is a failure
because it means startup routing has not given Codex enough instruction to
enter requirement confirmation without shell.

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

If `list` is missing from the help output, do not treat that as a CodeCut plugin
failure. Record the `codex --version` output in the release matrix and continue
with `plugin:freshness`, installed-cache readback, and fresh-session tool
discovery.

2. Sync from that exact source:

```bash
node scripts/sync-codex-local-plugin.mjs
```

The JSON output must show `sourceRoot` as the active source path and
`cacheRoot` as the installed CodeCut cache.

For release-level changes, record the exact Git SHA, plugin version, cache path,
Codex CLI/App versions, and fresh-session proof in
`docs/codecut-version-release-matrix.md`.

3. Confirm source and cache contain the new requirement-confirmation contract:

```bash
rg -n "open_codecut_requirement_confirmation|get_codecut_requirement_confirmation|create_codecut_project_from_requirement|verify-codecut-widget-intake-thread.mjs" AGENTS.md docs .codex-plugin mcp scripts skills
rg -n "open_codecut_requirement_confirmation|get_codecut_requirement_confirmation|create_codecut_project_from_requirement" /Users/x/.codex/plugins/cache/local-opc/codecut
```

4. Confirm Codex host tool discovery can find the requirement confirmation tool:

Use `tool_search` with:

```text
open_codecut_requirement_confirmation CodeCut requirement confirmation page
```

The expected callable tool is
`mcp__codecut_mcp.open_codecut_requirement_confirmation`.

5. Confirm the local CodeCut web service is ready before opening the
   confirmation page:

```bash
curl -fsS -o /dev/null http://127.0.0.1:4100/en/projects
```

If the readiness check fails, start the app from the plugin root and wait until
the same check succeeds:

```bash
bun run dev:web
```

6. Create a fresh `@codecut` validation thread with normal user wording first.
   Do not add special "do not create project" or "wait for click" guardrails to
   this prompt; the point is to prove the default CodeCut routing works for a
   real user request:

```text
@codecut 把 /Users/x/Downloads/22.mp4 做成中文解说口播短视频。必须保留原片完整时长，不能删减、不能裁掉时间线片段；新增同步中文解说字幕；顶部固定标题常驻；配音选择无配音，不生成 TTS 或旁白音轨；保留原视频音频；不使用转场；导出高质量 MP4。
```

The expected first CodeCut MCP side effect is
`open_codecut_requirement_confirmation`. A fresh thread that first searches for
old `ccreq_*` records, calls `get_codecut_requirement_confirmation` for an old
draft, or creates a project before a same-thread confirmation page has been
opened is a failure.
The agent may open or reopen the confirmation page, but it must stop before
clicking `确认需求`; the human tester must click that button manually before
sending the next "continue" message.

For a narrower no-side-effect smoke after the natural prompt proof passes, use
this guarded prompt:

```text
[@codecut](plugin://codecut@local-opc) Validate intake behavior: I have a local
video to edit into one 1-minute short. Do not download, do not edit, do not
write files, do not inspect skills, do not read local files, and do not run
shell commands. Use tool_search only if open_codecut_requirement_confirmation
is not visible. The only allowed CodeCut MCP tools are
codecut_mcp.open_codecut_requirement_confirmation and, after I confirm in the
web page, codecut_mcp.get_codecut_requirement_confirmation. If editing setup
fields are missing, use the normal CodeCut plugin intake path and open the web
requirement confirmation page instead of sending text questions. Stop before
project creation.
```

7. Inspect the fresh thread with `read_thread` and verify it contains:

```text
exactly one mcpToolCall server=codecut_mcp tool=open_codecut_requirement_confirmation
opened draftId is present
no inline MCP App opener or outputTemplate for the requirement confirmation tool
node_repl.js browser-control action opens the returned confirmation URL in target iab
no browser automation that clicks the confirmation page confirm/cancel controls
at least one mcpToolCall server=codecut_mcp tool=get_codecut_requirement_confirmation returning status=confirmed
confirmed readback draftId equals the opened draftId
```

It must not contain `exec_command`, `fileChange`, or text fallback prompts such
as `直接回复` or `C/A/A/A/A`.

8. Run the verifier:

```bash
node scripts/verify-codecut-widget-intake-thread.mjs --thread-id <threadId> --require-confirmed-requirement true
```

If the local session file is not discoverable by thread id, export the
`read_thread` JSON or use the session JSONL directly:

```bash
node scripts/verify-codecut-widget-intake-thread.mjs --thread-id <threadId> --session-file /absolute/path/thread.json --require-confirmed-requirement true
```

Legacy setup-widget verification remains available with `--require-follow-up
true` for old recovery paths, but it is not the default proof for new creative
job intake.

## Failure Meaning

- `service_unavailable`: the local CodeCut web service was not ready before
  requirement confirmation; start `bun run dev:web`, wait for the readiness curl
  to pass, and rerun the fresh-thread proof.
- Missing `open_codecut_requirement_confirmation`: the agent did not enter
  requirement confirmation intake.
- Missing `node_repl.js` browser open after requirement draft creation: the
  thread only emitted a link or chat card. This fails unless the thread records
  a real `agent.browsers` or browser-control unavailable error.
- Multiple `open_codecut_requirement_confirmation` calls: the agent retried
  confirmation page creation in one intake thread, which can leave duplicate
  pending requirement drafts.
- Missing confirmed `get_codecut_requirement_confirmation`: the thread did not
  prove the user's web confirmation was readable by Codex.
- Confirmed readback draftId mismatch: the thread reused an old requirement
  confirmation instead of the current fresh creative job.
- Agent clicked human confirmation: the thread replaced the user's approval
  with browser automation and the confirmation is not trustworthy.
- `get_codecut_requirement_confirmation` before the current
  `open_codecut_requirement_confirmation`: the thread tried to recover or reuse
  previous requirement state without an explicit user-provided recovery ID.
- `create_codecut_project_from_requirement`: the thread created a project during
  intake verification; project creation must wait until confirmed requirement
  readback has been accepted as the next step.
- Text fallback prompt: the skill routing regressed to chat-only clarification.
- `exec_command`: the validation prompt was not kept read-only.
- `fileChange`: the validation prompt changed local state and is not a clean
  intake proof.
