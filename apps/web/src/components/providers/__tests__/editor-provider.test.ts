import { describe, expect, test } from "bun:test";
import type { EditorCore } from "@/core";
import type { loadCodexExecutorSnapshot } from "@/components/editor/codex-executor-sync";
import { loadEditorProviderProject } from "../editor-provider";

type ExecutorSnapshot = Awaited<ReturnType<typeof loadCodexExecutorSnapshot>>;

function editorStub({
	loadProject,
	createNewProject,
}: {
	loadProject: () => Promise<void>;
	createNewProject?: () => Promise<string>;
}) {
	return {
		project: {
			loadProject,
			createNewProject: createNewProject ?? (async () => "new-project"),
		},
	} as unknown as EditorCore;
}

describe("loadEditorProviderProject", () => {
	test("applies executor snapshot when a local browser project already exists", async () => {
		const calls: string[] = [];
		const snapshot = { revision: 6 } as ExecutorSnapshot;

		const result = await loadEditorProviderProject({
			projectId: "project-1",
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
			createProject: async () => "new-project",
		});

		expect(calls).toEqual([
			"load-local-project",
			"load-executor-snapshot",
			"apply-executor-snapshot",
		]);
		expect(result).toEqual({ executorRevision: 6 });
	});

	test("creates a new project only when local and executor projects are both missing", async () => {
		const result = await loadEditorProviderProject({
			projectId: "missing-project",
			editor: editorStub({
				loadProject: async () => {
					throw new Error("Project not found");
				},
			}),
			loadSnapshot: async () => null,
			applySnapshot: async () => {
				throw new Error("should not apply snapshot");
			},
			createProject: async () => "new-project",
		});

		expect(result).toEqual({ redirectProjectId: "new-project" });
	});
});
