"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorCore } from "@/core";
import {
	executorBrowserBridgeHeaders,
	readExecutorBrowserBridgeTokenFromLocation,
} from "@/lib/codex-executor/browser-bridge-token";
import { generateThumbnail } from "@/lib/media/processing";
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
	cover?: TProject["cover"];
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
	"block size-1.5 shrink-0 rounded-full";

export function getExecutorStatusDotState({
	status,
	error,
	isSyncing,
}: {
	status: ExecutorStatus | null;
	error: string | null;
	isSyncing: boolean;
}) {
	const operationSuffix =
		status?.tool && status.message ? ` ${status.tool}: ${status.message}.` : "";
	const revisionSuffix =
		typeof status?.revision === "number"
			? ` Revision ${status.revision}${isSyncing ? " is syncing." : " is synced."}`
			: "";
	if (error || status?.status === "failed") {
		return {
			ariaLabel: "Codex executor failed",
			title: `Codex executor failed.${operationSuffix}${revisionSuffix}`,
			dotClassName: "bg-destructive",
		};
	}
	if (isSyncing || status?.status === "running") {
		return {
			ariaLabel: "Codex executor running",
			title: `Codex executor running.${operationSuffix}${revisionSuffix}`,
			dotClassName: "animate-pulse bg-sky-400",
		};
	}
	if (status?.status === "succeeded") {
		return {
			ariaLabel: "Codex executor succeeded",
			title: `Codex executor succeeded.${operationSuffix}${revisionSuffix}`,
			dotClassName: "bg-emerald-500",
		};
	}
	return {
		ariaLabel: "Codex executor idle",
		title: `Codex executor idle.${operationSuffix}${revisionSuffix}`,
		dotClassName: "bg-muted-foreground",
	};
}

function appendRevision({ url, revision }: { url: string; revision: number }) {
	const separator = url.includes("?") ? "&" : "?";
	return `${url}${separator}revision=${encodeURIComponent(String(revision))}`;
}

export function shouldSyncExecutorRevision({
	nextRevision,
	appliedRevision,
}: {
	nextRevision: number;
	appliedRevision: number;
}) {
	return nextRevision > appliedRevision;
}

async function loadExecutorMediaFile({
	asset,
	revision,
	bridgeToken,
}: {
	asset: ExecutorSnapshot["mediaAssets"][number];
	revision: number;
	bridgeToken?: string | null;
}) {
	const url = appendRevision({ url: asset.url, revision });
	const response = await fetch(url, {
		cache: "no-store",
		headers: bridgeToken
			? executorBrowserBridgeHeaders({ bridgeToken })
			: undefined,
	});
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
	const file = new File([blob], asset.name, {
		type: asset.mimeType,
		lastModified: asset.lastModified,
	});
	return {
		file,
		url: URL.createObjectURL(blob),
		thumbnailUrl:
			asset.type === "video"
				? await generateThumbnail({
						videoFile: file,
						timeInSeconds: 1,
					})
				: undefined,
	};
}

export async function loadCodexExecutorSnapshot({
	projectId,
	bridgeToken,
}: {
	projectId: string;
	bridgeToken?: string | null;
}): Promise<ExecutorSnapshot | null> {
	const response = await fetch(
		`/api/codex-executor/project?projectId=${encodeURIComponent(projectId)}`,
		{
			cache: "no-store",
			headers: bridgeToken
				? executorBrowserBridgeHeaders({ bridgeToken })
				: undefined,
		},
	);
	if (response.status === 404) return null;
	if (!response.ok) {
		throw new Error(await response.text());
	}
	return (await response.json()) as ExecutorSnapshot;
}

export async function loadCodexExecutorStatus({
	projectId,
	bridgeToken,
}: {
	projectId: string;
	bridgeToken?: string | null;
}): Promise<ExecutorStatus | null> {
	const response = await fetch(
		`/api/codex-executor/status?projectId=${encodeURIComponent(projectId)}`,
		{
			cache: "no-store",
			headers: bridgeToken
				? executorBrowserBridgeHeaders({ bridgeToken })
				: undefined,
		},
	);
	if (response.status === 404) return null;
	if (!response.ok) {
		throw new Error(await response.text());
	}

	return (await response.json()) as ExecutorStatus;
}

export function applyCodexExecutorSnapshot({
	editor,
	snapshot,
	bridgeToken,
}: {
	editor: EditorCore;
	snapshot: ExecutorSnapshot;
	bridgeToken?: string | null;
}) {
	return applyCodexExecutorSnapshotAsync({ editor, snapshot, bridgeToken });
}

async function applyCodexExecutorSnapshotAsync({
	editor,
	snapshot,
	bridgeToken,
}: {
	editor: EditorCore;
	snapshot: ExecutorSnapshot;
	bridgeToken?: string | null;
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
		cover: snapshot.cover,
	};
	const mediaAssets: MediaAsset[] = await Promise.all(
		snapshot.mediaAssets.map(async (asset) => {
			const mediaFile = await loadExecutorMediaFile({
				asset,
				revision: snapshot.revision,
				bridgeToken,
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
				thumbnailUrl: mediaFile.thumbnailUrl,
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
	const bridgeToken = readExecutorBrowserBridgeTokenFromLocation();
	const [status, setStatus] = useState<ExecutorStatus | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [summary, setSummary] = useState<ExecutorSnapshotSummary | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);
	const appliedRevisionRef = useRef(initialRevision ?? 0);

	const syncSnapshot = useCallback(async () => {
		if (!bridgeToken) return;
		setIsSyncing(true);
		try {
			const snapshot = await loadCodexExecutorSnapshot({
				projectId,
				bridgeToken,
			});
			if (!snapshot) return;
			await applyCodexExecutorSnapshot({ editor, snapshot, bridgeToken });
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
	}, [bridgeToken, editor, projectId]);

	useEffect(() => {
		if (!bridgeToken) {
			setStatus(null);
			setError(null);
			return;
		}

		let cancelled = false;

		async function poll() {
			const nextStatus = await loadCodexExecutorStatus({
				projectId,
				bridgeToken,
			});
			if (!nextStatus) {
				if (!cancelled) setStatus(null);
				return;
			}
			if (cancelled) return;

			setStatus(nextStatus);
			setError(null);

			const nextRevision = nextStatus.revision ?? 0;
			if (
				shouldSyncExecutorRevision({
					nextRevision,
					appliedRevision: appliedRevisionRef.current,
				})
			) {
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
	}, [bridgeToken, projectId, syncSnapshot]);

	if (!status && !error) return null;

	const dot = getExecutorStatusDotState({ status, error, isSyncing });

	return (
		<span
			role="status"
			aria-label={dot.ariaLabel}
			title={dot.title}
			className={`${EXECUTOR_STATUS_DOT_CLASS} ${dot.dotClassName}`}
		>
			<span className="sr-only">
				{summary
					? `${summary.trackCount} tracks, ${summary.mediaCount} media, ${summary.duration.toFixed(2)} seconds, revision ${summary.revision}`
					: dot.ariaLabel}
			</span>
		</span>
	);
}
