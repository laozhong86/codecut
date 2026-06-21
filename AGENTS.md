# AGENTS.md

## Overview

Privacy-first video editor, with a focus on simplicity and ease of use.

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
- If the working tree already contains unrelated modifications, keep the change scoped and do not rewrite, stage, or clean up those files.
- For non-trivial code changes or PR-bound work, use an isolated feature branch or git worktree before editing. This repo does not define Gxgen's `npm run worktree:*` helpers; do not cite or run those commands unless this repo adds equivalents.
- In one session, keep tracked-file writes anchored to one branch or worktree. Do not spread one task across multiple worktrees without explicit user approval.

### PR And Review

- Create PRs with an explicit base. Unless repo evidence says otherwise, use `main` / `origin/main` as the base.
- Verify the exact current head before requesting review, merging, or reporting a clean PR.
- Separate external review-provider limits from code defects. Quota, billing, spending-limit, account payment, or prepaid-credit failures may be recorded as external gates; real failed checks, request-changes reviews, unresolved actionable comments, or current-head findings must be fixed or escalated.

### Merge And Cleanup

- Merge through the remote PR or remote merge flow first; treat GitHub PR state, merge commit, and `origin/main` as the merge truth.
- If a local merge command fails after the remote reports merged, re-check GitHub truth before assuming the merge failed.
- After remote merge succeeds, fast-forward local `main` from `origin/main`. If it cannot fast-forward, stop and report drift.
- Remove temporary worktrees or local feature branches only after merge truth is verified. Preserve remote branches unless the user explicitly asks to delete them.
