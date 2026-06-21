"use client";

import { useEffect, useState } from "react";
import {
	applyCodexExecutorSnapshot,
	CodexExecutorSync,
	loadCodexExecutorSnapshot,
} from "@/components/editor/codex-executor-sync";
import { AgentBridgeProvider } from "@/components/providers/agent-bridge-provider";
import { useRouter } from "@/lib/navigation";
import { Loader2 } from "lucide-react";
import { useEditor } from "@/hooks/use-editor";
import {
	useKeybindingsListener,
	useKeybindingDisabler,
} from "@/hooks/use-keybindings";
import { useEditorActions } from "@/hooks/actions/use-editor-actions";

interface EditorProviderProps {
	projectId: string;
	children: React.ReactNode;
}

type LoadExecutorSnapshot = typeof loadCodexExecutorSnapshot;
type ApplyExecutorSnapshot = typeof applyCodexExecutorSnapshot;

interface LoadEditorProviderProjectParams {
	projectId: string;
	editor: ReturnType<typeof useEditor>;
	loadSnapshot?: LoadExecutorSnapshot;
	applySnapshot?: ApplyExecutorSnapshot;
	createProject?: () => Promise<string>;
}

function isProjectNotFoundError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.message.includes("not found") ||
			error.message.includes("does not exist"))
	);
}

export async function loadEditorProviderProject({
	projectId,
	editor,
	loadSnapshot = loadCodexExecutorSnapshot,
	applySnapshot = applyCodexExecutorSnapshot,
	createProject = () =>
		editor.project.createNewProject({
			name: "Untitled Project",
		}),
}: LoadEditorProviderProjectParams): Promise<{
	executorRevision?: number;
	redirectProjectId?: string;
}> {
	try {
		await editor.project.loadProject({ id: projectId });
		const snapshot = await loadSnapshot({ projectId });
		if (snapshot) {
			await applySnapshot({ editor, snapshot });
			return { executorRevision: snapshot.revision };
		}
		return {};
	} catch (error) {
		if (!isProjectNotFoundError(error)) {
			throw error;
		}

		const snapshot = await loadSnapshot({ projectId });
		if (snapshot) {
			await applySnapshot({ editor, snapshot });
			return { executorRevision: snapshot.revision };
		}

		return { redirectProjectId: await createProject() };
	}
}

export function EditorProvider({ projectId, children }: EditorProviderProps) {
	const editor = useEditor();
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [executorRevision, setExecutorRevision] = useState<number | undefined>(
		undefined,
	);
	const { disableKeybindings, enableKeybindings } = useKeybindingDisabler();
	const activeProject = editor.project.getActiveOrNull();

	useEffect(() => {
		if (isLoading) {
			disableKeybindings();
		} else {
			enableKeybindings();
		}
	}, [isLoading, disableKeybindings, enableKeybindings]);

	useEffect(() => {
		let cancelled = false;

		const loadProject = async () => {
			try {
				setIsLoading(true);
				setExecutorRevision(undefined);
				const result = await loadEditorProviderProject({ projectId, editor });
				if (cancelled) return;
				if (result.redirectProjectId) {
					router.replace(`/editor/${result.redirectProjectId}`);
					return;
				}
				setExecutorRevision(result.executorRevision);
				setIsLoading(false);
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : "Failed to load project");
				setIsLoading(false);
			}
		};

		loadProject();

		return () => {
			cancelled = true;
		};
	}, [projectId, editor, router]);

	if (error) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<p className="text-destructive text-sm">{error}</p>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">Loading project...</p>
				</div>
			</div>
		);
	}

	if (!activeProject) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">Exiting project...</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<EditorRuntimeBindings />
			<AgentBridgeProvider projectId={projectId} />
			{executorRevision !== undefined ? (
				<CodexExecutorSync
					projectId={projectId}
					editor={editor}
					initialRevision={executorRevision}
				/>
			) : null}
			{children}
		</>
	);
}

function EditorRuntimeBindings() {
	const editor = useEditor();

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!editor.save.getIsDirty()) return;
			event.preventDefault();
			(event as unknown as { returnValue: string }).returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [editor]);

	useEditorActions();
	useKeybindingsListener();
	return null;
}
