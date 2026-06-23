import { describe, expect, test } from "bun:test";
import type { EditorCore } from "@/core";
import type { loadCodexExecutorSnapshot } from "@/components/editor/codex-executor-sync";
import {
	loadEditorProviderProject,
	subscribeToBridgeTokenChanges,
} from "../editor-provider";

type ExecutorSnapshot = Awaited<ReturnType<typeof loadCodexExecutorSnapshot>>;

function editorStub({ loadProject }: { loadProject: () => Promise<void> }) {
	return {
		project: {
			loadProject,
		},
	} as unknown as EditorCore;
}

describe("loadEditorProviderProject", () => {
	test("passes the browser bridge token when loading an executor snapshot", async () => {
		const loadSnapshotCalls: unknown[] = [];
		const snapshot = { revision: 7 } as ExecutorSnapshot;

		await loadEditorProviderProject({
			projectId: "executor-only-project",
			bridgeToken: "browser-token-1",
			editor: editorStub({
				loadProject: async () => {
					throw new Error("should not load local project");
				},
			}),
			loadSnapshot: async (params) => {
				loadSnapshotCalls.push(params);
				return snapshot;
			},
			applySnapshot: async () => undefined,
		});

		expect(loadSnapshotCalls).toEqual([
			{
				projectId: "executor-only-project",
				bridgeToken: "browser-token-1",
			},
		]);
	});

	test("loads executor snapshot before local browser storage", async () => {
		const calls: string[] = [];
		const snapshot = { revision: 7 } as ExecutorSnapshot;

		const result = await loadEditorProviderProject({
			projectId: "executor-only-project",
			bridgeToken: "browser-token-1",
			editor: editorStub({
				loadProject: async () => {
					calls.push("load-local-project");
					throw new Error("Project with id executor-only-project not found");
				},
			}),
			loadSnapshot: async () => {
				calls.push("load-executor-snapshot");
				return snapshot;
			},
			applySnapshot: async () => {
				calls.push("apply-executor-snapshot");
			},
		});

		expect(calls).toEqual([
			"load-executor-snapshot",
			"apply-executor-snapshot",
		]);
		expect(result).toEqual({ executorRevision: 7 });
	});

	test("prefers executor snapshot when a local browser project also exists", async () => {
		const calls: string[] = [];
		const snapshot = { revision: 6 } as ExecutorSnapshot;

		const result = await loadEditorProviderProject({
			projectId: "project-1",
			bridgeToken: "browser-token-1",
			editor: editorStub({
				loadProject: async () => {
					calls.push("load-local-project");
				},
			}),
			loadSnapshot: async () => {
				calls.push("load-executor-snapshot");
				return snapshot;
			},
			applySnapshot: async () => {
				calls.push("apply-executor-snapshot");
			},
		});

		expect(calls).toEqual([
			"load-executor-snapshot",
			"apply-executor-snapshot",
		]);
		expect(result).toEqual({ executorRevision: 6 });
	});

	test("fails clearly instead of creating a project when browser storage is missing", async () => {
		await expect(
			loadEditorProviderProject({
				projectId: "missing-project",
				editor: editorStub({
					loadProject: async () => {
						throw new Error("Project not found");
					},
				}),
				loadSnapshot: async () => {
					throw new Error("should not load executor snapshot without token");
				},
				applySnapshot: async () => {
					throw new Error("should not apply snapshot");
				},
			}),
		).rejects.toThrow(
			'Project "missing-project" was not found in browser storage. If this is a CodeCut executor project, open the editorUrl returned by create-project so the browser bridge token is present.',
		);
	});

	test("fails executor loading instead of falling back to browser storage when bridge token is present", async () => {
		const calls: string[] = [];

		await expect(
			loadEditorProviderProject({
				projectId: "missing-project",
				bridgeToken: "browser-token-1",
				editor: editorStub({
					loadProject: async () => {
						calls.push("load-local-project");
					},
				}),
				loadSnapshot: async () => {
					calls.push("load-executor-snapshot");
					return null;
				},
				applySnapshot: async () => {
					throw new Error("should not apply snapshot");
				},
			}),
		).rejects.toThrow(
			'CodeCut executor project "missing-project" was not found.',
		);

		expect(calls).toEqual(["load-executor-snapshot"]);
	});

	test("subscribes to hash changes and re-reads the browser bridge token", () => {
		const listeners: Array<() => void> = [];
		const removedListeners: Array<() => void> = [];
		const observedTokens: Array<string | null> = [];
		const target = {
			addEventListener: (eventName: string, nextListener: () => void) => {
				expect(eventName).toBe("hashchange");
				listeners.push(nextListener);
			},
			removeEventListener: (eventName: string, nextListener: () => void) => {
				expect(eventName).toBe("hashchange");
				removedListeners.push(nextListener);
			},
		};

		const unsubscribe = subscribeToBridgeTokenChanges({
			target,
			readBridgeToken: () => "browser-token-2",
			onBridgeTokenChange: (bridgeToken) => {
				observedTokens.push(bridgeToken);
			},
		});

		expect(listeners).toHaveLength(1);
		const listener = listeners[0];
		listener();
		unsubscribe();

		expect(observedTokens).toEqual(["browser-token-2"]);
		expect(removedListeners).toEqual([listener]);
	});
});
