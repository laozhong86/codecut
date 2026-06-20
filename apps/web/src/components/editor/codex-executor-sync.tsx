"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	AlertCircle,
	CheckCircle2,
	Clock3,
	Loader2,
	RefreshCw,
} from "lucide-react";
import type { EditorCore } from "@/core";
import { CURRENT_PROJECT_VERSION } from "@/services/storage/migrations";
import type { MediaAsset } from "@/types/assets";
import type { TProject } from "@/types/project";
import type { TimelineTrack, TScene } from "@/types/timeline";

type ExecutorStatus = {
	projectId: string;
	status: "idle" | "running" | "succeeded" | "failed";
	tool?: string;
	message: string;
	updatedAt: string;
	revision?: number;
};

type ExecutorSnapshot = {
	project: {
		id: string;
		name: string;
		settings: TProject["settings"];
		createdAt: string;
		updatedAt: string;
	};
	revision: number;
	duration: number;
	tracks: TimelineTrack[];
	mediaAssets: Array<{
		id: string;
		name: string;
		type: MediaAsset["type"];
		mimeType: string;
		duration?: number;
		width?: number;
		height?: number;
		size: number;
		lastModified: number;
		url: string;
	}>;
};

const POLL_INTERVAL_MS = 1500;

type ExecutorSnapshotSummary = {
	revision: number;
	duration: number;
	trackCount: number;
	mediaCount: number;
	syncedAt: string;
};

export async function loadCodexExecutorSnapshot({
	projectId,
}: {
	projectId: string;
}): Promise<ExecutorSnapshot | null> {
	const response = await fetch(
		`/api/codex-executor/project?projectId=${encodeURIComponent(projectId)}`,
		{ cache: "no-store" },
	);
	if (response.status === 404) return null;
	if (!response.ok) {
		throw new Error(await response.text());
	}
	return (await response.json()) as ExecutorSnapshot;
}

export function applyCodexExecutorSnapshot({
	editor,
	snapshot,
}: {
	editor: EditorCore;
	snapshot: ExecutorSnapshot;
}) {
	const sceneId = `${snapshot.project.id}-executor-scene`;
	const now = new Date(snapshot.project.updatedAt);
	const scene: TScene = {
		id: sceneId,
		name: "Main scene",
		isMain: true,
		tracks: snapshot.tracks,
		bookmarks: [],
		createdAt: new Date(snapshot.project.createdAt),
		updatedAt: now,
	};
	const project: TProject = {
		metadata: {
			id: snapshot.project.id,
			name: snapshot.project.name,
			duration: snapshot.duration,
			createdAt: new Date(snapshot.project.createdAt),
			updatedAt: now,
		},
		scenes: [scene],
		currentSceneId: sceneId,
		settings: snapshot.project.settings,
		version: CURRENT_PROJECT_VERSION,
	};
	const mediaAssets: MediaAsset[] = snapshot.mediaAssets.map((asset) => ({
		id: asset.id,
		name: asset.name,
		type: asset.type,
		duration: asset.duration,
		width: asset.width,
		height: asset.height,
		file: new File([], asset.name, {
			type: asset.mimeType,
			lastModified: asset.lastModified,
		}),
		url: `${asset.url}&revision=${snapshot.revision}`,
	}));

	editor.save.pause();
	try {
		editor.media.clearAllAssets();
		editor.scenes.clearScenes();
		editor.project.setActiveProject({ project });
		editor.scenes.setScenes({ scenes: [scene], activeSceneId: sceneId });
		editor.media.setAssets({ assets: mediaAssets });
		editor.timeline.updateTracks(snapshot.tracks);
	} finally {
		editor.save.resume();
	}
}

export function CodexExecutorSync({
	projectId,
	editor,
	initialRevision,
}: {
	projectId: string;
	editor: EditorCore;
	initialRevision?: number;
}) {
	const [status, setStatus] = useState<ExecutorStatus | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [summary, setSummary] = useState<ExecutorSnapshotSummary | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);
	const appliedRevisionRef = useRef(initialRevision ?? 0);

	const syncSnapshot = useCallback(async () => {
		setIsSyncing(true);
		try {
			const snapshot = await loadCodexExecutorSnapshot({ projectId });
			if (!snapshot) return;
			applyCodexExecutorSnapshot({ editor, snapshot });
			appliedRevisionRef.current = snapshot.revision;
			setSummary({
				revision: snapshot.revision,
				duration: snapshot.duration,
				trackCount: snapshot.tracks.length,
				mediaCount: snapshot.mediaAssets.length,
				syncedAt: new Date().toISOString(),
			});
			setError(null);
		} finally {
			setIsSyncing(false);
		}
	}, [editor, projectId]);

	useEffect(() => {
		let cancelled = false;

		async function poll() {
			const response = await fetch(
				`/api/codex-executor/status?projectId=${encodeURIComponent(projectId)}`,
				{ cache: "no-store" },
			);
			if (response.status === 404) {
				if (!cancelled) setStatus(null);
				return;
			}
			if (!response.ok) {
				throw new Error(await response.text());
			}

			const nextStatus = (await response.json()) as ExecutorStatus;
			if (cancelled) return;

			setStatus(nextStatus);
			setError(null);

			const nextRevision = nextStatus.revision ?? 0;
			if (nextRevision > appliedRevisionRef.current) {
				await syncSnapshot();
			}
		}

		void poll().catch((err) => {
			if (!cancelled) {
				setError(err instanceof Error ? err.message : "Executor sync failed.");
			}
		});
		const timer = window.setInterval(() => {
			void poll().catch((err) => {
				if (!cancelled) {
					setError(
						err instanceof Error ? err.message : "Executor sync failed.",
					);
				}
			});
		}, POLL_INTERVAL_MS);

		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [projectId, syncSnapshot]);

	if (!status && !error) return null;

	const icon =
		status?.status === "running" ? (
			<Loader2 className="size-4 animate-spin" />
		) : status?.status === "failed" || error ? (
			<AlertCircle className="size-4" />
		) : status?.status === "succeeded" ? (
			<CheckCircle2 className="size-4" />
		) : (
			<Clock3 className="size-4" />
		);

	return (
		<div className="bg-background/95 text-foreground fixed right-4 bottom-4 z-50 flex max-w-[380px] items-start gap-3 rounded-md border px-3 py-2 text-xs shadow-lg backdrop-blur">
			<div className="text-muted-foreground mt-0.5">{icon}</div>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<span className="font-medium">Codex Executor</span>
					{status?.tool ? (
						<span className="text-muted-foreground">{status.tool}</span>
					) : null}
					{status?.revision ? (
						<span className="text-muted-foreground">rev {status.revision}</span>
					) : null}
					<button
						type="button"
						aria-label="Sync executor project"
						title="Sync executor project"
						onClick={() => {
							void syncSnapshot().catch((err) => {
								setError(
									err instanceof Error ? err.message : "Executor sync failed.",
								);
							});
						}}
						disabled={isSyncing}
						className="hover:bg-accent ml-auto inline-flex size-6 items-center justify-center rounded-sm disabled:opacity-50"
					>
						<RefreshCw
							className={isSyncing ? "size-3.5 animate-spin" : "size-3.5"}
						/>
					</button>
				</div>
				<div className="text-muted-foreground mt-1 break-words">
					{error ?? status?.message}
				</div>
				{summary ? (
					<div className="text-muted-foreground mt-2 grid grid-cols-4 gap-2">
						<span>{summary.trackCount} tracks</span>
						<span>{summary.mediaCount} media</span>
						<span>{summary.duration.toFixed(2)}s</span>
						<span>rev {summary.revision}</span>
					</div>
				) : null}
				{status?.updatedAt ? (
					<div className="text-muted-foreground/80 mt-1">
						{new Date(summary?.syncedAt ?? status.updatedAt).toLocaleTimeString()}
					</div>
				) : null}
			</div>
		</div>
	);
}
