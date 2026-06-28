# AGENTS.md

## Overview

Privacy-first video editor, with a focus on simplicity and ease of use.

## Codex And CodeCut Boundaries

CodeCut is a Codex-first editing plugin. Design it so Codex can autonomously use CodeCut capabilities to replace manual editing work while the human user can watch the editing state update in the web editor.

### Agent Surfaces

- The built-in browser Agent is temporarily deprecated and should not receive new feature investment. Keep the code path only for preservation or explicitly requested future reopening.
- External Codex Agent control through the CodeCut plugin, skills, MCP tools, and local executor is the active product direction.
- The built-in Agent and external Codex Agent should relate to the editor the same way Palmier's internal and external agent surfaces relate to its editor: both are clients of the same editing capability layer, not separate editing products with separate semantics.
- New editing capabilities should be added to shared editor, executor, timeline, media, transcript, visual-evidence, readback, and export primitives so external Codex can use them directly and the web editor can display their state.
- Do not add internal-Agent-only editing behavior, hidden internal-only workflows, or separate timeline mutation semantics.

### Instruction Surfaces

- `AGENTS.md` is for durable repository rules and high-level boundaries.
- Skills may constrain and guide Codex editing behavior, including judgment rules, recommended evidence to inspect, and known failure patterns.
- Tool and MCP descriptions must define atomic capabilities, inputs, outputs, side effects, failure shape, and what the web UI can show after the action.
- Runtime code should enforce only necessary product and data safety rules. Do not encode creative strategy or fixed editing workflows in code unless the rule prevents invalid state, data loss, timeline corruption, security exposure, or an unrecoverable export failure.

### Feature Development Audit

- Before adding a new feature, first judge whether it creates a high-priority improvement for CodeCut's product position: a Codex-first, local-first, explainable, verifiable video editor.
- Do not add features because they are generally useful, competitor-visible, or technically interesting. If the user value is not directly tied to CodeCut's target editing scenarios, do not implement it.
- Prefer strengthening existing capabilities before creating new ones: improve Codex control over the editor, timeline readback, local execution, visual evidence, export verification, and human-visible editing state.
- Prefer improving skill guidance, MCP/tool schemas, validation rules, readback contracts, and workflow constraints when they can make Codex use CodeCut correctly without expanding runtime surface area.
- Runtime feature work is justified only when guidance and tool contracts cannot deliver the target user outcome, and the feature has a clear verification path through editor state, executor readback, or exported media.

### CodeCut Capability Design

- Keep every CodeCut capability atomic and independently usable. Codex should decide how to combine tools for each editing task.
- Do not turn CodeCut editing into a hard-coded workflow lock, template lock, or multi-step gate in runtime code.
- Prefer strong capability descriptions over hidden behavior. A capable human should understand how to use a tool from its name, description, schema, and result.
- Each editing tool should make these facts clear: purpose, required inputs, optional inputs, whether it mutates the timeline, returned data, visible editor status, and failure meaning.
- Use structured schemas, enums, and validation for invalid states such as unknown IDs, negative durations, reversed ranges, unsupported formats, unsafe paths, or corrupt timeline mutations.
- Avoid magic defaults, silent repair, automatic downgrade, and fallback editing paths. Fail clearly when the requested operation cannot be represented safely.

### Skill Guidance

- Use skills to teach Codex better editing judgment: when to read timeline state, when to inspect media, when transcript evidence is useful, when visual evidence is needed, and when to verify the edited result.
- Skill guidance can say "prefer", "consider", "useful when", or "stop if evidence is missing"; it should not pretend that every video must follow the same editing sequence.
- Do not design CodeCut for Claude runtime or generic external agents. Palmier may be used only as a structural reference for the internal-agent and external-agent relationship, not as a runtime target.
- If a prior plan describes CodeCut as a contract-driven system, reinterpret it as capability guidance unless the rule is a necessary code-level safety check.

### Local Video Reference Projects

- When planning CodeCut product direction, designing a skill, or adding video editing or creation capabilities, inspect the relevant local reference projects under `/Users/x/Desktop/Project/github` before inventing a new pattern.
- Use these projects to extract methodology, UX patterns, agent workflows, verification loops, and engineering tradeoffs. Do not copy a workflow into CodeCut unless it fits the local-first, explainable, verifiable editor direction above.
- Treat this index as a starting point, not proof that a referenced project is current or production-ready. Re-read the target repo before relying on it.

Editor and timeline product references:
- `/Users/x/Desktop/Project/github/OpenCut-current` - current OpenCut rewrite; study editor API, plugin-first architecture, MCP, headless mode, and automation direction.
- `/Users/x/Desktop/Project/github/OpenCut` - classic OpenCut implementation; study simple web timeline, project management, and contributor focus areas.
- `/Users/x/Desktop/Project/github/freecut` - browser-local multi-track editor; study WebCodecs/WebGPU/OPFS workspace, timeline tools, preview, analysis, captions, and export.
- `/Users/x/Desktop/Project/github/palmier-pro` - AI-native desktop editor with MCP; study how internal and external agents share one timeline surface.
- `/Users/x/Desktop/Project/github/videosos` - browser AI video editor; study model/provider selection, cost tracking, timeline editing, and client-side Remotion/FFmpeg.wasm export.
- `/Users/x/Desktop/Project/github/capcut` - CapCut API-backed web clone; study external draft/API/cloud-render integration only after verifying the current implementation.
- `/Users/x/Desktop/Project/github/capcut-mcp` - CapCut/Jianying draft API and MCP reference; study draft creation, subtitle insertion, save/validate flow, and failure shape.

Agent-driven cutting and skill workflow references:
- `/Users/x/Desktop/Project/github/video-use` - agent-native local editing workflow; study transcript-first reasoning, on-demand visual checks, EDL render, and self-eval loops.
- `/Users/x/Desktop/Project/github/Youtube-clipper-skill` - YouTube clipping skill; study semantic chaptering, precise FFmpeg clipping, bilingual subtitles, and burn-in delivery.
- `/Users/x/Desktop/Project/github/chengfeng-videocut-skills` - talking-head cutting and finished-video skill pack; study review pages, confirmation gates, storyboard previews, and vertical MP4 delivery.
- `/Users/x/Desktop/Project/github/jianying-editor-skill` - Jianying automation skill; study draft automation, media import, subtitles, voiceover alignment, and export scripts.
- `/Users/x/Desktop/Project/github/bggg-skills/bggg-tiktok-readvideo` - video readback skill; study timeline extraction, keyframes, OCR/ASR evidence, and edit-plan rendering.
- `/Users/x/Desktop/Project/github/bggg-skills/bggg-tiktok-cut` - short-video cutting skill; study local FFmpeg/Whisper project layout, 9:16 edit plans, and publishable render checks.
- `/Users/x/Desktop/Project/github/bggg-skills/bggg-tiktok-capcut` - CapCut draft generation skill; study template reuse, draft indexing, structure validation, and AI-video artifact checks.

Programmatic rendering and creative methodology references:
- `/Users/x/Desktop/Project/github/remotion` - React-based programmatic video framework; study composition, rendering, player, and licensing tradeoffs.
- `/Users/x/Desktop/Project/github/remotion-templates` - reusable Remotion templates; study motion patterns, template packaging, and component-level video building blocks.
- `/Users/x/Desktop/Project/github/hyperframes` - HTML/CSS/GSAP to MP4 runtime; study deterministic headless Chrome plus FFmpeg rendering and agent-readable composition contracts.
- `/Users/x/Desktop/Project/github/html-video` - local agent HTML-to-video studio; study storyboard IR, pluggable render engines, template manifests, soundtrack mixing, and real MP4 delivery.
- `/Users/x/Desktop/Project/github/openmontage` - video creation skill and pipeline library; study staged director skills, creative rubrics, provider selectors, and QA gates.
- `/Users/x/Desktop/Project/github/video-production-skills` - reusable video-production skills; study reference-video QC, style-specific production skills, preview media, and evidence-driven delivery.
- `/Users/x/Desktop/Project/github/mediakit-cli` - agent-native audio/video CLI; study cloud/local command split, schema-friendly tools, FFmpeg policy, and local editing primitives.

Generation, localization, enhancement, and inspiration references:
- `/Users/x/Desktop/Project/github/MoneyPrinterTurbo` - automated short-video generator; study topic-to-script-to-materials-to-subtitles-to-BGM assembly and batch generation.
- `/Users/x/Desktop/Project/github/KrillinAI` - AI video translation and dubbing; study subtitle segmentation, translation, dubbing, voice clone, and cross-platform composition.
- `/Users/x/Desktop/Project/github/heygen-skills/heygen-video` - avatar/presenter video skill; study video producer flow, readiness gates, style selection, and clean delivery.
- `/Users/x/Desktop/Project/github/OpenCLI/gxgen-data` - video inspiration and template data; study content/material indexes, hook libraries, template datasets, and ingestion contracts.
- `/Users/x/Desktop/Project/github/deer-flow/skills/public/video-generation` - video generation skill example; study structured prompt inputs, reference-image flow, and generated-video output contract.
- `/Users/x/Desktop/Project/github/video2x` - video enhancement/upscaling reference; study enhancement boundaries, FFmpeg integration, and native dependency handling.
- `/Users/x/Desktop/Project/github/Open-Higgsfield-AI` - AI cinema/image studio; study cinematic prompt controls and model UI patterns, but verify current video support before treating it as a video runtime.

### Human-Visible Editing State

- CodeCut should expose enough status for the web editor to show what Codex is doing now: tool name, operation summary, affected clips or tracks, timeline revision, success or failure, and latest readback summary.
- The web editor status view is product evidence for the human user. It should not be the agent's only source of truth when code or executor readback is available.
- After timeline mutation tools, return machine-readable data that supports both Codex self-correction and human-visible UI updates.

### Plugin, Skill, And Widget Verification

- Changes to the plugin manifest, skills, MCP tool schemas, MCP resources, widgets, or Codex-host tool routing are not done with source tests alone.
- Before reporting success, prove the active plugin source from the marketplace entry, enabled config, installed cache, and current-session tool surface. Source truth alone is not enough.
- Codex plugin update state has four layers:
  - Marketplace discovery: `.agents/plugins/marketplace.json` exposes plugins and maps `codecut` to `./plugins/cutia`.
  - Enabled config: `~/.codex/config.toml` must contain `[plugins."codecut@local-opc"]` with `enabled = true`.
  - Installed cache: Codex runs the installed bundle under `~/.codex/plugins/cache/local-opc/codecut/<version>/`, not directly from the source checkout.
  - Runtime session: already-open Codex sessions and MCP server processes may keep old tool schemas or server code until a new session starts.
- For local CodeCut updates, run `node scripts/sync-codex-local-plugin.mjs` from the source checkout after manifest, skill, MCP, widget, or bridge changes. This syncs source into the installed cache, excludes runtime artifacts and local secrets, removes stale cache metadata, and verifies key source/cache checksums.
- Use `bun run plugin:freshness` for a read-only source/cache/config/session status report. It must not sync cache, edit config, start services, enqueue executor commands, or silently repair stale state.
- `codex plugin marketplace upgrade [name]` refreshes configured marketplaces, especially Git-backed marketplaces. It does not replace the CodeCut local source-to-cache sync or prove that the current session sees the new tool schema.
- If `.codex-plugin/plugin.json` changes `name` or `version`, confirm the matching cache path exists before syncing. The sync script intentionally fails when the installed cache for that plugin identity is missing.
- After cache sync, prefer a fresh Codex session for plugin manifest, skill, MCP schema, widget, or default prompt validation. Restart the Codex app only when a fresh session still shows stale plugin state.
- Confirm the Codex host tool surface can discover the target MCP tool with `tool_search`; source and cache truth are not enough when host tool schemas may be stale.
- For widget-intake behavior, create a fresh `@codecut` validation thread with a prompt that forbids downloads, shell commands, file writes, and editing execution. The proof must show a real `codecut_mcp.open_codecut_workspace` MCP call, not text fallback questions.
- Validate that fresh-thread proof with `node scripts/verify-codecut-widget-intake-thread.mjs --thread-id <threadId>` or `--session-file <path>` when using an exported `read_thread` JSON/session JSONL file. Shell calls, file changes, or text fallback prompts fail this verification.
- Keep the detailed checklist in `docs/codecut-widget-intake-fresh-thread.md` current whenever the widget intake contract changes.

## Lib vs Utils

- `lib/` - domain logic (specific to this app)
- `utils/` - small helper utils (generic, could be copy-pasted into any other app)

## Core Editor System

The editor uses a **singleton EditorCore** that manages all editor state through specialized managers.

### Architecture

```
EditorCore (singleton)
├── playback: PlaybackManager
├── timeline: TimelineManager
├── scene: SceneManager
├── project: ProjectManager
├── media: MediaManager
└── renderer: RendererManager
```

### When to Use What

#### In React Components

**Always use the `useEditor()` hook:**

```typescript
import { useEditor } from '@/hooks/use-editor';

function MyComponent() {
  const editor = useEditor();
  const tracks = editor.timeline.getTracks();

  // Call methods
  editor.timeline.addTrack({ type: 'media' });

  // Display data (auto re-renders on changes)
  return <div>{tracks.length} tracks</div>;
}
```

The hook:

- Returns the singleton instance
- Subscribes to all manager changes
- Automatically re-renders when state changes

#### Outside React Components

**Use `EditorCore.getInstance()` directly:**

```typescript
// In utilities, event handlers, or non-React code
import { EditorCore } from "@/core";

const editor = EditorCore.getInstance();
await editor.export({ format: "mp4", quality: "high" });
```

## Actions System

Actions are the trigger layer for user-initiated operations. The single source of truth is `@/lib/actions/definitions.ts`.

**To add a new action:**

1. Add it to `ACTIONS` in `@/lib/actions/definitions.ts`:

```typescript
export const ACTIONS = {
  "my-action": {
    description: "What the action does",
    category: "editing",
    defaultShortcuts: ["ctrl+m"],
  },
  // ...
};
```

2. Add handler in `@/hooks/use-editor-actions.ts`:

```typescript
useActionHandler(
  "my-action",
  () => {
    // implementation
  },
  undefined,
);
```

**In components, use `invokeAction()` for user-triggered operations:**

```typescript
import { invokeAction } from '@/lib/actions';

// Good - uses action system
const handleSplit = () => invokeAction("split-selected");

// Avoid - bypasses UX layer (toasts, validation feedback)
const handleSplit = () => editor.timeline.splitElements({ ... });
```

Direct `editor.xxx()` calls are for internal use (commands, tests, complex multi-step operations).

## Commands System

Commands handle undo/redo. They live in `@/lib/commands/` organized by domain (timeline, media, scene).

Each command extends `Command` from `@/lib/commands/base-command` and implements:

- `execute()` - saves current state, then does the mutation
- `undo()` - restores the saved state

Actions and commands work together: actions are "what triggered this", commands are "how to do it (and undo it)".

## GitHub Management Workflow

Use this workflow for code changes that should be published or reviewed. Read-only investigation, local-only prototypes under `/tmp`, and GitHub or CI status checks do not require a PR unless the user asks.

### Before Writing

- Run `git status -sb` and identify the current branch before editing tracked files.
- Install the local checkout guard with `bun run git-hooks:install` before PR-bound work. It records the current main-checkout branch in `codecut.mainCheckoutBranch` and blocks branch switching in the main repository directory.
- Treat the main repository directory as a protected `main` checkout. Do not switch branches or edit files there unless the user explicitly authorizes it for maintenance.
- Do not run `git checkout <branch>`, `git switch <branch>`, `git checkout -b <branch>`, or `git switch -c <branch>` in the main repository directory. Create or switch branches only inside a linked worktree.
- If the working tree already contains unrelated modifications, keep the change scoped and do not rewrite, stage, or clean up those files.
- For non-trivial code changes or PR-bound work, use `bun run worktree:create -- <topic> [base-ref] --skip-install` before editing tracked files. Omit `--skip-install` only when dependency initialization is required.
- Use `bun run worktree:init -- --skip-install` inside an existing worktree when initialization metadata is enough; run without `--skip-install` only when a fresh dependency install is required.
- In one session, keep tracked-file writes anchored to one branch or worktree. Do not spread one task across multiple worktrees without explicit user approval.

### PR And Review

- Create PRs with an explicit base. Unless repo evidence says otherwise, use `main` / `origin/main` as the base.
- Verify the exact current head before requesting review, merging, or reporting a clean PR.
- Separate external review-provider limits from code defects. Quota, billing, spending-limit, account payment, or prepaid-credit failures may be recorded as external gates; real failed checks, request-changes reviews, unresolved actionable comments, or current-head findings must be fixed or escalated.

### Merge And Cleanup

- Merge through the remote PR or remote merge flow first; treat GitHub PR state, merge commit, and `origin/main` as the merge truth.
- If a local merge command fails after the remote reports merged, re-check GitHub truth before assuming the merge failed.
- After remote merge succeeds, fast-forward local `main` from `origin/main`. If it cannot fast-forward, stop and report drift.
- Remove temporary worktrees or local feature branches only after merge truth is verified. Use `bun run worktree:teardown -- <worktree-path>` for an explicit path, or `bun run worktree:cleanup -- <topic>` for `.worktrees/<topic>`. Preserve remote branches unless the user explicitly asks to delete them.
