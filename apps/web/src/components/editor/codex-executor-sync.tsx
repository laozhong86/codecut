"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
	derivedAssets: TProject["derivedAssets"];
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

export const EXECUTOR_STATUS_DOT_CLASS =
	"fixed top-4 right-52 z-50 inline-flex size-7 items-center justify-center rounded-full border border-border/70 bg-background/85 shadow-sm backdrop-blur transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default";

export function getExecutorStatusDotState({
	status,
	error,
	isSyncing,
}: {
	status: ExecutorStatus | null;
	error: string | null;
	isSyncing: boolean;
}) {
	if (error || status?.status === "failed") {
		return {
			ariaLabel: "Codex executor failed",
			title: "Codex executor failed. Click to sync.",
			dotClassName: "bg-destructive shadow-[0_0_0_4px_rgba(239,68,68,0.16)]",
		};
	}
	if (isSyncing || status?.status === "running") {
		return {
			ariaLabel: "Codex executor running",
			title: "Codex executor running.",
			dotClassName:
				"animate-pulse bg-sky-400 shadow-[0_0_0_4px_rgba(56,189,248,0.16)]",
		};
	}
	if (status?.status === "succeeded") {
		return {
			ariaLabel: "Codex executor succeeded",
			title: "Codex executor succeeded. Click to sync.",
			dotClassName:
				"bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.16)]",
		};
	}
	return {
		ariaLabel: "Codex executor idle",
		title: "Codex executor idle. Click to sync.",
		dotClassName: "bg-muted-foreground",
	};
}

function appendRevision({ url, revision }: { url: string; revision: number }) {
	const separator = url.includes("?") ? "&" : "?";
	return `${url}${separator}revision=${encodeURIComponent(String(revision))}`;
}

async function loadExecutorMediaFile({
	asset,
	revision,
}: {
	asset: ExecutorSnapshot["mediaAssets"][number];
	revision: number;
}) {
	const url = appendRevision({ url: asset.url, revision });
	const response = await fetch(url, { cache: "no-store" });
	if (!response.ok) {
		throw new Error(`Failed to load executor media asset ${asset.id}.`);
	}
	const blob = await response.blob();
	if (blob.size === 0) {
		throw new Error(`Executor media asset ${asset.id} is empty.`);
	}
	if (blob.size !== asset.size) {
		throw new Error(`Executor media asset size mismatch for ${asset.id}.`);
	}
	return {
		file: new File([blob], asset.name, {
			type: asset.mimeType,
			lastModified: asset.lastModified,
		}),
		url,
	};
}

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
	return applyCodexExecutorSnapshotAsync({ editor, snapshot });
}

async function applyCodexExecutorSnapshotAsync({
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
		derivedAssets: snapshot.derivedAssets,
	};
	const mediaAssets: MediaAsset[] = await Promise.all(
		snapshot.mediaAssets.map(async (asset) => {
			const mediaFile = await loadExecutorMediaFile({
				asset,
				revision: snapshot.revision,
			});
			return {
				id: asset.id,
				name: asset.name,
				type: asset.type,
				duration: asset.duration,
				width: asset.width,
				height: asset.height,
				file: mediaFile.file,
				url: mediaFile.url,
			};
		}),
	);

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
			await applyCodexExecutorSnapshot({ editor, snapshot });
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

	const dot = getExecutorStatusDotState({ status, error, isSyncing });

	return (
		<button
			type="button"
			aria-label={dot.ariaLabel}
			title={dot.title}
			onClick={() => {
				void syncSnapshot().catch((err) => {
					setError(err instanceof Error ? err.message : "Executor sync failed.");
				});
			}}
			disabled={isSyncing}
			className={EXECUTOR_STATUS_DOT_CLASS}
		>
			<span
				aria-hidden="true"
				className={`size-2.5 rounded-full ${dot.dotClassName}`}
			/>
			<span className="sr-only">
				{summary
					? `${summary.trackCount} tracks, ${summary.mediaCount} media, ${summary.duration.toFixed(2)} seconds, revision ${summary.revision}`
					: dot.ariaLabel}
			</span>
		</button>
	);
}
