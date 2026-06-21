# Codex Codecut Agent Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local MVP bridge so Codex can send structured editing commands to an open Codecut editor page, and Codecut can execute those commands through its existing Agent tools with immediate timeline updates.

**Architecture:** Codex does not click the UI and does not write IndexedDB directly. Codex posts a signed command envelope to a local Next.js API queue; the open Codecut editor page polls the queue, executes the commands in the browser with existing `AgentTool` implementations, then posts execution results back for Codex to read.

**Tech Stack:** Next.js App Router, Bun test, Zod, existing Codecut `EditorCore`, existing Codecut `AgentTool` registry.

---

## Scope

This plan covers the MVP bridge only:

- Codex can enqueue timeline/project commands for one open local editor project.
- Codecut executes commands through existing tools, so the timeline updates through `EditorCore`.
- Codex can poll command results.
- The bridge is local-dev only and requires `CODECUT_AGENT_BRIDGE_TOKEN` for external command submission.

This plan intentionally excludes:

- Direct browser automation.
- Direct IndexedDB writes.
- Cloud deployment auth.
- Automatic video export.
- Adding new editing tools beyond the current Codecut tool set.
- AI image/video provider setup.

## File Structure

- Create `apps/web/src/lib/agent-bridge/schema.ts`
  - Owns the external command envelope schema and result types.
  - Whitelists only stable Codecut tool names for the MVP.

- Create `apps/web/src/lib/agent-bridge/execute.ts`
  - Executes a validated command envelope in the browser.
  - Calls existing tools via `getToolByName`.
  - Stops on first failed command to avoid cascading edits.

- Create `apps/web/src/lib/agent-bridge/queue.ts`
  - Owns the in-memory local queue used by Next API routes.
  - Does not import browser-only editor code.

- Create `apps/web/src/app/api/agent-bridge/commands/route.ts`
  - `POST` enqueues a command envelope from Codex with bearer token.
  - `GET` lets the editor page claim pending commands for its project.

- Create `apps/web/src/app/api/agent-bridge/results/route.ts`
  - `POST` lets the editor page publish command results.
  - `GET` lets Codex read results with bearer token.

- Create `apps/web/src/components/providers/agent-bridge-provider.tsx`
  - Polls pending commands while an editor page is open.
  - Executes commands in the browser and posts results.

- Modify `apps/web/src/components/providers/editor-provider.tsx`
  - Mounts `AgentBridgeProvider` inside the existing editor runtime.

- Create tests under `apps/web/src/lib/agent-bridge/__tests__/`.

---

### Task 1: Add Bridge Schema

**Files:**
- Create: `apps/web/src/lib/agent-bridge/schema.ts`
- Test: `apps/web/src/lib/agent-bridge/__tests__/schema.test.ts`

- [ ] **Step 1: Write the failing schema tests**

Create `apps/web/src/lib/agent-bridge/__tests__/schema.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
	BridgeEnvelopeSchema,
	BridgeToolNameSchema,
} from "../schema";

describe("agent bridge schema", () => {
	test("accepts a valid command envelope", () => {
		const parsed = BridgeEnvelopeSchema.parse({
			version: 1,
			projectId: "project-123",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "add_text_to_timeline",
					args: {
						content: "Hook text",
						startTime: 0,
						duration: 3,
					},
				},
			],
		});

		expect(parsed.commands[0].tool).toBe("add_text_to_timeline");
	});

	test("requires args even when the tool has no arguments", () => {
		const result = BridgeEnvelopeSchema.safeParse({
			version: 1,
			projectId: "project-123",
			source: "codex",
			commands: [
				{
					id: "cmd-1",
					tool: "get_project_info",
				},
			],
		});

		expect(result.success).toBe(false);
	});

	test("rejects unknown tools", () => {
		const result = BridgeToolNameSchema.safeParse("delete_everything");
		expect(result.success).toBe(false);
	});

	test("rejects non-Codex sources", () => {
		const result = BridgeEnvelopeSchema.safeParse({
			version: 1,
			projectId: "project-123",
			source: "browser",
			commands: [
				{
					id: "cmd-1",
					tool: "get_project_info",
					args: {},
				},
			],
		});

		expect(result.success).toBe(false);
	});
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/__tests__/schema.test.ts
```

Expected: FAIL because `apps/web/src/lib/agent-bridge/schema.ts` does not exist.

- [ ] **Step 3: Add the schema implementation**

Create `apps/web/src/lib/agent-bridge/schema.ts`:

```ts
import { z } from "zod";

export const BridgeToolNameSchema = z.enum([
	"get_project_info",
	"update_project_settings",
	"list_media_assets",
	"get_timeline_state",
	"add_video_to_timeline",
	"add_text_to_timeline",
	"add_audio_to_timeline",
	"update_element",
	"delete_element",
	"move_element",
]);

export const BridgeCommandSchema = z.object({
	id: z.string().min(1),
	tool: BridgeToolNameSchema,
	args: z.record(z.string(), z.unknown()),
});

export const BridgeEnvelopeSchema = z.object({
	version: z.literal(1),
	projectId: z.string().min(1),
	source: z.literal("codex"),
	commands: z.array(BridgeCommandSchema).min(1).max(20),
});

export const BridgeCommandResultSchema = z.object({
	commandId: z.string().min(1),
	tool: BridgeToolNameSchema,
	success: z.boolean(),
	message: z.string(),
	data: z.record(z.string(), z.unknown()).optional(),
	skipped: z.boolean().optional(),
});

export const BridgeEnvelopeResultSchema = z.object({
	envelopeProjectId: z.string().min(1),
	results: z.array(BridgeCommandResultSchema),
});

export type BridgeToolName = z.infer<typeof BridgeToolNameSchema>;
export type BridgeCommand = z.infer<typeof BridgeCommandSchema>;
export type BridgeEnvelope = z.infer<typeof BridgeEnvelopeSchema>;
export type BridgeCommandResult = z.infer<typeof BridgeCommandResultSchema>;
export type BridgeEnvelopeResult = z.infer<typeof BridgeEnvelopeResultSchema>;
```

- [ ] **Step 4: Run the schema test**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/__tests__/schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/agent-bridge/schema.ts apps/web/src/lib/agent-bridge/__tests__/schema.test.ts
git commit -m "feat: add codex bridge command schema"
```

---

### Task 2: Add Browser-Side Command Executor

**Files:**
- Create: `apps/web/src/lib/agent-bridge/execute.ts`
- Test: `apps/web/src/lib/agent-bridge/__tests__/execute.test.ts`

- [ ] **Step 1: Write the failing executor tests**

Create `apps/web/src/lib/agent-bridge/__tests__/execute.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { executeBridgeEnvelope } from "../execute";
import type { AgentTool } from "@/lib/ai/agent/tools/types";

function tool({
	name,
	execute,
}: {
	name: string;
	execute: AgentTool["execute"];
}): AgentTool {
	return {
		name,
		description: `${name} test tool`,
		parameters: {
			type: "object",
			properties: {},
		},
		execute,
	};
}

describe("executeBridgeEnvelope", () => {
	test("executes commands sequentially", async () => {
		const calls: string[] = [];
		const result = await executeBridgeEnvelope({
			envelope: {
				version: 1,
				projectId: "project-123",
				source: "codex",
				commands: [
					{ id: "cmd-1", tool: "get_project_info", args: {} },
					{ id: "cmd-2", tool: "get_timeline_state", args: {} },
				],
			},
			resolveTool: ({ name }) =>
				tool({
					name,
					execute: async () => {
						calls.push(name);
						return { success: true, message: `${name} ok` };
					},
				}),
		});

		expect(calls).toEqual(["get_project_info", "get_timeline_state"]);
		expect(result.results.map((entry) => entry.success)).toEqual([true, true]);
	});

	test("stops after the first failed command", async () => {
		const calls: string[] = [];
		const result = await executeBridgeEnvelope({
			envelope: {
				version: 1,
				projectId: "project-123",
				source: "codex",
				commands: [
					{ id: "cmd-1", tool: "add_text_to_timeline", args: { content: "A" } },
					{ id: "cmd-2", tool: "move_element", args: { sourceTrackId: "t", elementId: "e", newStartTime: 1 } },
				],
			},
			resolveTool: ({ name }) =>
				tool({
					name,
					execute: async () => {
						calls.push(name);
						return { success: false, message: `${name} failed` };
					},
				}),
		});

		expect(calls).toEqual(["add_text_to_timeline"]);
		expect(result.results[0]).toMatchObject({
			commandId: "cmd-1",
			success: false,
		});
		expect(result.results[1]).toMatchObject({
			commandId: "cmd-2",
			success: false,
			skipped: true,
		});
	});

	test("returns a failure when a registered bridge tool has no implementation", async () => {
		const result = await executeBridgeEnvelope({
			envelope: {
				version: 1,
				projectId: "project-123",
				source: "codex",
				commands: [{ id: "cmd-1", tool: "get_project_info", args: {} }],
			},
			resolveTool: () => undefined,
		});

		expect(result.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "get_project_info",
			success: false,
		});
	});
});
```

- [ ] **Step 2: Run the failing executor test**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/__tests__/execute.test.ts
```

Expected: FAIL because `apps/web/src/lib/agent-bridge/execute.ts` does not exist.

- [ ] **Step 3: Add the executor implementation**

Create `apps/web/src/lib/agent-bridge/execute.ts`:

```ts
import { getToolByName } from "@/lib/ai/agent/tools";
import type { AgentTool } from "@/lib/ai/agent/tools/types";
import {
	BridgeEnvelopeSchema,
	type BridgeCommandResult,
	type BridgeEnvelope,
	type BridgeEnvelopeResult,
} from "./schema";

type ToolResolver = ({ name }: { name: string }) => AgentTool | undefined;

function skippedResult({
	commandId,
	tool,
}: {
	commandId: string;
	tool: BridgeCommandResult["tool"];
}): BridgeCommandResult {
	return {
		commandId,
		tool,
		success: false,
		message: "Skipped because a previous command failed.",
		skipped: true,
	};
}

export async function executeBridgeEnvelope({
	envelope,
	resolveTool = getToolByName,
}: {
	envelope: BridgeEnvelope;
	resolveTool?: ToolResolver;
}): Promise<BridgeEnvelopeResult> {
	const parsedEnvelope = BridgeEnvelopeSchema.parse(envelope);
	const results: BridgeCommandResult[] = [];
	let shouldSkipRemaining = false;

	for (const command of parsedEnvelope.commands) {
		if (shouldSkipRemaining) {
			results.push(skippedResult({ commandId: command.id, tool: command.tool }));
			continue;
		}

		const tool = resolveTool({ name: command.tool });
		if (!tool) {
			results.push({
				commandId: command.id,
				tool: command.tool,
				success: false,
				message: `Bridge tool "${command.tool}" is not implemented in Codecut.`,
			});
			shouldSkipRemaining = true;
			continue;
		}

		try {
			const result = await tool.execute(command.args);
			results.push({
				commandId: command.id,
				tool: command.tool,
				success: result.success,
				message: result.message,
				data: result.data,
			});
			if (!result.success) {
				shouldSkipRemaining = true;
			}
		} catch (error) {
			results.push({
				commandId: command.id,
				tool: command.tool,
				success: false,
				message:
					error instanceof Error
						? error.message
						: "Bridge command execution failed.",
			});
			shouldSkipRemaining = true;
		}
	}

	return {
		envelopeProjectId: parsedEnvelope.projectId,
		results,
	};
}
```

- [ ] **Step 4: Run executor tests**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/__tests__/execute.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/agent-bridge/execute.ts apps/web/src/lib/agent-bridge/__tests__/execute.test.ts
git commit -m "feat: execute codex bridge commands"
```

---

### Task 3: Add Local Queue

**Files:**
- Create: `apps/web/src/lib/agent-bridge/queue.ts`
- Test: `apps/web/src/lib/agent-bridge/__tests__/queue.test.ts`

- [ ] **Step 1: Write the failing queue tests**

Create `apps/web/src/lib/agent-bridge/__tests__/queue.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import {
	clearBridgeQueueForTests,
	completeBridgeQueueItem,
	enqueueBridgeEnvelope,
	getBridgeQueueItem,
	takePendingBridgeQueueItems,
} from "../queue";

const envelope = {
	version: 1 as const,
	projectId: "project-123",
	source: "codex" as const,
	commands: [{ id: "cmd-1", tool: "get_project_info" as const, args: {} }],
};

describe("agent bridge queue", () => {
	beforeEach(() => {
		clearBridgeQueueForTests();
	});

	test("enqueues and claims items by project", () => {
		const item = enqueueBridgeEnvelope({ envelope });
		const claimed = takePendingBridgeQueueItems({
			projectId: "project-123",
			limit: 5,
		});

		expect(claimed).toHaveLength(1);
		expect(claimed[0].id).toBe(item.id);
		expect(claimed[0].status).toBe("claimed");
	});

	test("does not claim commands from another project", () => {
		enqueueBridgeEnvelope({ envelope });
		const claimed = takePendingBridgeQueueItems({
			projectId: "other-project",
			limit: 5,
		});

		expect(claimed).toHaveLength(0);
	});

	test("stores command results", () => {
		const item = enqueueBridgeEnvelope({ envelope });
		completeBridgeQueueItem({
			id: item.id,
			results: [
				{
					commandId: "cmd-1",
					tool: "get_project_info",
					success: true,
					message: "ok",
				},
			],
		});

		const stored = getBridgeQueueItem({ id: item.id });
		expect(stored?.status).toBe("completed");
		expect(stored?.results?.[0].message).toBe("ok");
	});
});
```

- [ ] **Step 2: Run the failing queue test**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/__tests__/queue.test.ts
```

Expected: FAIL because `apps/web/src/lib/agent-bridge/queue.ts` does not exist.

- [ ] **Step 3: Add queue implementation**

Create `apps/web/src/lib/agent-bridge/queue.ts`:

```ts
import {
	BridgeEnvelopeSchema,
	type BridgeCommandResult,
	type BridgeEnvelope,
} from "./schema";

export type BridgeQueueStatus = "pending" | "claimed" | "completed";

export interface BridgeQueueItem {
	id: string;
	projectId: string;
	envelope: BridgeEnvelope;
	status: BridgeQueueStatus;
	createdAt: string;
	claimedAt?: string;
	completedAt?: string;
	results?: BridgeCommandResult[];
}

const queueItems = new Map<string, BridgeQueueItem>();

function createId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function enqueueBridgeEnvelope({
	envelope,
}: {
	envelope: BridgeEnvelope;
}): BridgeQueueItem {
	const parsedEnvelope = BridgeEnvelopeSchema.parse(envelope);
	const item: BridgeQueueItem = {
		id: createId(),
		projectId: parsedEnvelope.projectId,
		envelope: parsedEnvelope,
		status: "pending",
		createdAt: new Date().toISOString(),
	};
	queueItems.set(item.id, item);
	return item;
}

export function takePendingBridgeQueueItems({
	projectId,
	limit,
}: {
	projectId: string;
	limit: number;
}): BridgeQueueItem[] {
	const claimed: BridgeQueueItem[] = [];
	for (const item of queueItems.values()) {
		if (claimed.length >= limit) break;
		if (item.projectId !== projectId) continue;
		if (item.status !== "pending") continue;

		item.status = "claimed";
		item.claimedAt = new Date().toISOString();
		claimed.push(item);
	}
	return claimed;
}

export function completeBridgeQueueItem({
	id,
	results,
}: {
	id: string;
	results: BridgeCommandResult[];
}): BridgeQueueItem | null {
	const item = queueItems.get(id);
	if (!item) return null;

	item.status = "completed";
	item.results = results;
	item.completedAt = new Date().toISOString();
	return item;
}

export function getBridgeQueueItem({
	id,
}: {
	id: string;
}): BridgeQueueItem | null {
	return queueItems.get(id) ?? null;
}

export function clearBridgeQueueForTests(): void {
	queueItems.clear();
}
```

- [ ] **Step 4: Run queue tests**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/__tests__/queue.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/agent-bridge/queue.ts apps/web/src/lib/agent-bridge/__tests__/queue.test.ts
git commit -m "feat: add local codex bridge queue"
```

---

### Task 4: Add Bridge API Routes

**Files:**
- Create: `apps/web/src/app/api/agent-bridge/commands/route.ts`
- Create: `apps/web/src/app/api/agent-bridge/results/route.ts`

- [ ] **Step 1: Add the commands route**

Create `apps/web/src/app/api/agent-bridge/commands/route.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	enqueueBridgeEnvelope,
	takePendingBridgeQueueItems,
} from "@/lib/agent-bridge/queue";
import { BridgeEnvelopeSchema } from "@/lib/agent-bridge/schema";

const postBodySchema = z.object({
	envelope: BridgeEnvelopeSchema,
});

function validateBridgeToken(request: NextRequest): NextResponse | null {
	const expectedToken = process.env.CODECUT_AGENT_BRIDGE_TOKEN;
	if (!expectedToken) {
		return NextResponse.json(
			{ error: "CODECUT_AGENT_BRIDGE_TOKEN is required." },
			{ status: 503 },
		);
	}

	const authorization = request.headers.get("authorization");
	if (authorization !== `Bearer ${expectedToken}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return null;
}

function validateSameOrigin(request: NextRequest): NextResponse | null {
	const requestOrigin = request.nextUrl.origin;
	const origin = request.headers.get("origin");
	const referer = request.headers.get("referer");

	if (origin && origin !== requestOrigin) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	if (referer && new URL(referer).origin !== requestOrigin) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	return null;
}

export async function POST(request: NextRequest) {
	const tokenError = validateBridgeToken(request);
	if (tokenError) return tokenError;

	const body = await request.json();
	const parsedBody = postBodySchema.safeParse(body);
	if (!parsedBody.success) {
		return NextResponse.json(
			{
				error: "Invalid bridge command envelope.",
				details: parsedBody.error.flatten().fieldErrors,
			},
			{ status: 400 },
		);
	}

	const item = enqueueBridgeEnvelope({
		envelope: parsedBody.data.envelope,
	});

	return NextResponse.json({
		id: item.id,
		status: item.status,
		projectId: item.projectId,
	});
}

export async function GET(request: NextRequest) {
	const originError = validateSameOrigin(request);
	if (originError) return originError;

	const projectId = request.nextUrl.searchParams.get("projectId");
	if (!projectId) {
		return NextResponse.json(
			{ error: "projectId query parameter is required." },
			{ status: 400 },
		);
	}

	const items = takePendingBridgeQueueItems({
		projectId,
		limit: 5,
	});

	return NextResponse.json({
		items: items.map((item) => ({
			id: item.id,
			envelope: item.envelope,
			status: item.status,
		})),
	});
}
```

- [ ] **Step 2: Add the results route**

Create `apps/web/src/app/api/agent-bridge/results/route.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	completeBridgeQueueItem,
	getBridgeQueueItem,
} from "@/lib/agent-bridge/queue";
import { BridgeCommandResultSchema } from "@/lib/agent-bridge/schema";

const postBodySchema = z.object({
	id: z.string().min(1),
	results: z.array(BridgeCommandResultSchema),
});

function validateBridgeToken(request: NextRequest): NextResponse | null {
	const expectedToken = process.env.CODECUT_AGENT_BRIDGE_TOKEN;
	if (!expectedToken) {
		return NextResponse.json(
			{ error: "CODECUT_AGENT_BRIDGE_TOKEN is required." },
			{ status: 503 },
		);
	}

	const authorization = request.headers.get("authorization");
	if (authorization !== `Bearer ${expectedToken}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return null;
}

function validateSameOrigin(request: NextRequest): NextResponse | null {
	const requestOrigin = request.nextUrl.origin;
	const origin = request.headers.get("origin");
	const referer = request.headers.get("referer");

	if (origin && origin !== requestOrigin) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	if (referer && new URL(referer).origin !== requestOrigin) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	return null;
}

export async function POST(request: NextRequest) {
	const originError = validateSameOrigin(request);
	if (originError) return originError;

	const body = await request.json();
	const parsedBody = postBodySchema.safeParse(body);
	if (!parsedBody.success) {
		return NextResponse.json(
			{
				error: "Invalid bridge result body.",
				details: parsedBody.error.flatten().fieldErrors,
			},
			{ status: 400 },
		);
	}

	const item = completeBridgeQueueItem(parsedBody.data);
	if (!item) {
		return NextResponse.json({ error: "Bridge command not found." }, { status: 404 });
	}

	return NextResponse.json({
		id: item.id,
		status: item.status,
	});
}

export async function GET(request: NextRequest) {
	const tokenError = validateBridgeToken(request);
	if (tokenError) return tokenError;

	const id = request.nextUrl.searchParams.get("id");
	if (!id) {
		return NextResponse.json(
			{ error: "id query parameter is required." },
			{ status: 400 },
		);
	}

	const item = getBridgeQueueItem({ id });
	if (!item) {
		return NextResponse.json({ error: "Bridge command not found." }, { status: 404 });
	}

	return NextResponse.json({
		id: item.id,
		status: item.status,
		projectId: item.projectId,
		results: item.results ?? [],
	});
}
```

- [ ] **Step 3: Run type and unit checks**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/__tests__/schema.test.ts apps/web/src/lib/agent-bridge/__tests__/execute.test.ts apps/web/src/lib/agent-bridge/__tests__/queue.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/agent-bridge/commands/route.ts apps/web/src/app/api/agent-bridge/results/route.ts
git commit -m "feat: expose local codex bridge api"
```

---

### Task 5: Add Browser Polling Provider

**Files:**
- Create: `apps/web/src/components/providers/agent-bridge-provider.tsx`
- Modify: `apps/web/src/components/providers/editor-provider.tsx`

- [ ] **Step 1: Add the provider**

Create `apps/web/src/components/providers/agent-bridge-provider.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { executeBridgeEnvelope } from "@/lib/agent-bridge/execute";
import type {
	BridgeCommandResult,
	BridgeEnvelope,
} from "@/lib/agent-bridge/schema";

interface AgentBridgeProviderProps {
	projectId: string;
}

interface PendingBridgeItem {
	id: string;
	envelope: BridgeEnvelope;
	status: "claimed";
}

interface PendingBridgeResponse {
	items: PendingBridgeItem[];
}

async function postResults({
	id,
	results,
}: {
	id: string;
	results: BridgeCommandResult[];
}): Promise<void> {
	const response = await fetch("/api/agent-bridge/results", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ id, results }),
	});

	if (!response.ok) {
		throw new Error(`Failed to publish bridge results: ${response.status}`);
	}
}

export function AgentBridgeProvider({ projectId }: AgentBridgeProviderProps) {
	const isPollingRef = useRef(false);

	useEffect(() => {
		let cancelled = false;

		async function pollOnce() {
			if (isPollingRef.current) return;
			isPollingRef.current = true;

			try {
				const response = await fetch(
					`/api/agent-bridge/commands?projectId=${encodeURIComponent(projectId)}`,
				);
				if (!response.ok) return;

				const payload = (await response.json()) as PendingBridgeResponse;
				for (const item of payload.items) {
					if (cancelled) break;

					const execution = await executeBridgeEnvelope({
						envelope: item.envelope,
					});
					await postResults({
						id: item.id,
						results: execution.results,
					});
				}
			} finally {
				isPollingRef.current = false;
			}
		}

		void pollOnce();
		const interval = window.setInterval(() => {
			void pollOnce();
		}, 1000);

		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [projectId]);

	return null;
}
```

- [ ] **Step 2: Mount the provider in the editor runtime**

Modify `apps/web/src/components/providers/editor-provider.tsx`:

```tsx
import { AgentBridgeProvider } from "@/components/providers/agent-bridge-provider";
```

Then change the return fragment near the end of `EditorProvider` to:

```tsx
return (
	<>
		<EditorRuntimeBindings />
		<AgentBridgeProvider projectId={projectId} />
		{children}
	</>
);
```

- [ ] **Step 3: Run a focused check**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/__tests__/schema.test.ts apps/web/src/lib/agent-bridge/__tests__/execute.test.ts apps/web/src/lib/agent-bridge/__tests__/queue.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/providers/agent-bridge-provider.tsx apps/web/src/components/providers/editor-provider.tsx
git commit -m "feat: execute codex bridge commands in editor"
```

---

### Task 6: Manual End-To-End Verification

**Files:**
- No source file changes.

- [ ] **Step 1: Restart the Codecut dev server with a bridge token**

Stop the existing `bun run dev:web` process, then run:

```bash
CODECUT_AGENT_BRIDGE_TOKEN=local-dev-bridge bun run dev:web
```

Expected: Next.js starts on `http://localhost:4100`.

- [ ] **Step 2: Open the existing editor page**

Open:

```text
http://localhost:4100/en/editor/2d751fcc-2eab-4b52-a200-3aa1398aec62
```

Expected: the editor loads and the timeline is visible.

- [ ] **Step 3: Enqueue a text command from Codex**

Run:

```bash
curl -sS -X POST http://localhost:4100/api/agent-bridge/commands \
  -H "Authorization: Bearer local-dev-bridge" \
  -H "Content-Type: application/json" \
  -d '{
    "envelope": {
      "version": 1,
      "projectId": "2d751fcc-2eab-4b52-a200-3aa1398aec62",
      "source": "codex",
      "commands": [
        {
          "id": "cmd-1",
          "tool": "add_text_to_timeline",
          "args": {
            "content": "Codex Bridge OK",
            "startTime": 0,
            "duration": 3,
            "fontSize": 12,
            "positionY": -260,
            "color": "#ffffff",
            "backgroundColor": "#000000"
          }
        }
      ]
    }
  }'
```

Expected response shape:

```json
{
  "id": "generated-queue-id",
  "status": "pending",
  "projectId": "2d751fcc-2eab-4b52-a200-3aa1398aec62"
}
```

- [ ] **Step 4: Verify the page updates**

Expected: within one second, the open Codecut editor shows a new text element on the timeline or preview.

- [ ] **Step 5: Poll the result**

Use the `id` returned in Step 3:

```bash
curl -sS "http://localhost:4100/api/agent-bridge/results?id=generated-queue-id" \
  -H "Authorization: Bearer local-dev-bridge"
```

Expected response shape:

```json
{
  "id": "generated-queue-id",
  "status": "completed",
  "projectId": "2d751fcc-2eab-4b52-a200-3aa1398aec62",
  "results": [
    {
      "commandId": "cmd-1",
      "tool": "add_text_to_timeline",
      "success": true,
      "message": "Added text 'Codex Bridge OK' at 0s"
    }
  ]
}
```

- [ ] **Step 6: Run the complete local test suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 7: Commit verification note if needed**

If the team keeps local verification notes in commits, commit only source changes from prior tasks. Do not commit screenshots or Playwright artifacts.

---

## Self-Review

- Spec coverage: The plan covers a Codex-to-Codecut bridge, command schema, local queue, API routes, browser execution, and end-to-end verification.
- Placeholder scan: The plan contains no incomplete placeholders.
- Type consistency: `BridgeEnvelope`, `BridgeCommandResult`, and queue item types are defined before they are used.
- Scope check: The bridge MVP is one subsystem. Export automation and richer editing tools are explicitly deferred.

