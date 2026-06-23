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

### Human-Visible Editing State

- CodeCut should expose enough status for the web editor to show what Codex is doing now: tool name, operation summary, affected clips or tracks, timeline revision, success or failure, and latest readback summary.
- The web editor status view is product evidence for the human user. It should not be the agent's only source of truth when code or executor readback is available.
- After timeline mutation tools, return machine-readable data that supports both Codex self-correction and human-visible UI updates.

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
