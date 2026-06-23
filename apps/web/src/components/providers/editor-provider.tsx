"use client";

import { useEffect, useState } from "react";
import {
	applyCodexExecutorSnapshot,
	loadCodexExecutorSnapshot,
} from "@/components/editor/codex-executor-sync";
import { AgentBridgeProvider } from "@/components/providers/agent-bridge-provider";
import { readExecutorBrowserBridgeTokenFromLocation } from "@/lib/codex-executor/browser-bridge-token";
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

interface BridgeTokenChangeTarget {
	addEventListener: (eventName: "hashchange", listener: () => void) => void;
	removeEventListener: (eventName: "hashchange", listener: () => void) => void;
}

interface LoadEditorProviderProjectParams {
	projectId: string;
	bridgeToken?: string | null;
	editor: ReturnType<typeof useEditor>;
	loadSnapshot?: LoadExecutorSnapshot;
	applySnapshot?: ApplyExecutorSnapshot;
}

function isProjectNotFoundError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.message.includes("not found") ||
			error.message.includes("does not exist"))
	);
}

export function subscribeToBridgeTokenChanges({
	target,
	readBridgeToken = readExecutorBrowserBridgeTokenFromLocation,
	onBridgeTokenChange,
}: {
	target?: BridgeTokenChangeTarget;
	readBridgeToken?: () => string | null;
	onBridgeTokenChange: (bridgeToken: string | null) => void;
}): () => void {
	const eventTarget =
		target ??
		(typeof window === "undefined"
			? null
			: (window as unknown as BridgeTokenChangeTarget));
	if (!eventTarget) return () => undefined;

	const handleHashChange = () => {
		onBridgeTokenChange(readBridgeToken());
	};
	eventTarget.addEventListener("hashchange", handleHashChange);
	return () => eventTarget.removeEventListener("hashchange", handleHashChange);
}

export async function loadEditorProviderProject({
	projectId,
	bridgeToken,
	editor,
	loadSnapshot = loadCodexExecutorSnapshot,
	applySnapshot = applyCodexExecutorSnapshot,
}: LoadEditorProviderProjectParams): Promise<{
	executorRevision?: number;
}> {
	if (bridgeToken) {
		const snapshot = await loadSnapshot({ projectId, bridgeToken });
		if (!snapshot) {
			throw new Error(`CodeCut executor project "${projectId}" was not found.`);
		}
		await applySnapshot({ editor, snapshot, bridgeToken });
		return { executorRevision: snapshot.revision };
	}

	try {
		await editor.project.loadProject({ id: projectId });
		return {};
	} catch (error) {
		if (!isProjectNotFoundError(error)) {
			throw error;
		}

		throw new Error(
			`Project "${projectId}" was not found in browser storage. If this is a CodeCut executor project, open the editorUrl returned by create-project so the browser bridge token is present.`,
		);
	}
}

export function EditorProvider({ projectId, children }: EditorProviderProps) {
	const editor = useEditor();
	const [bridgeToken, setBridgeToken] = useState<string | null>(() =>
		readExecutorBrowserBridgeTokenFromLocation(),
	);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { disableKeybindings, enableKeybindings } = useKeybindingDisabler();
	const activeProject = editor.project.getActiveOrNull();

	useEffect(() => {
		if (isLoading) {
			disableKeybindings();
		} else {
			enableKeybindings();
		}
	}, [isLoading, disableKeybindings, enableKeybindings]);

	useEffect(
		() =>
			subscribeToBridgeTokenChanges({
				onBridgeTokenChange: setBridgeToken,
			}),
		[],
	);

	useEffect(() => {
		let cancelled = false;

		const loadProject = async () => {
			try {
				setIsLoading(true);
				setError(null);
				await loadEditorProviderProject({
					projectId,
					bridgeToken,
					editor,
				});
				if (cancelled) return;
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
	}, [projectId, bridgeToken, editor]);

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
