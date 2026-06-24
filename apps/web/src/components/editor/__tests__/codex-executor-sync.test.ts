import { afterEach, describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/types/assets";
import type { TProject } from "@/types/project";

const generateThumbnail = mock(
	async () => "data:image/jpeg;base64,executor-thumb",
);

mock.module("@/lib/media/processing", () => ({
	generateThumbnail,
}));

const {
	applyCodexExecutorSnapshot,
	EXECUTOR_STATUS_DOT_CLASS,
	getExecutorStatusDotState,
	loadCodexExecutorSnapshot,
	loadCodexExecutorStatus,
	shouldSyncExecutorRevision,
} = await import("../codex-executor-sync");

const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;

function editorStub({ capturedAssets }: { capturedAssets: MediaAsset[][] }) {
	return {
		save: {
			pause: () => undefined,
			resume: () => undefined,
		},
		media: {
			clearAllAssets: () => undefined,
			setAssets: ({ assets }: { assets: MediaAsset[] }) => {
				capturedAssets.push(assets);
			},
		},
		scenes: {
			clearScenes: () => undefined,
			setScenes: () => undefined,
		},
		project: {
			setActiveProject: () => undefined,
		},
		timeline: {
			updateTracks: () => undefined,
		},
	} as unknown as EditorCore;
}

function editorCaptureStub({
	capturedAssets,
	capturedProjects,
	capturedTracks,
}: {
	capturedAssets: MediaAsset[][];
	capturedProjects: TProject[];
	capturedTracks: unknown[];
}) {
	return {
		save: {
			pause: () => undefined,
			resume: () => undefined,
		},
		media: {
			clearAllAssets: () => undefined,
			setAssets: ({ assets }: { assets: MediaAsset[] }) => {
				capturedAssets.push(assets);
			},
		},
		scenes: {
			clearScenes: () => undefined,
			setScenes: () => undefined,
		},
		project: {
			setActiveProject: ({ project }: { project: TProject }) => {
				capturedProjects.push(project);
			},
		},
		timeline: {
			updateTracks: (tracks: unknown[]) => {
				capturedTracks.push(tracks);
			},
		},
	} as unknown as EditorCore;
}

function executorSnapshot() {
	return {
		project: {
			id: "project-1",
			name: "Project",
			settings: {
				fps: 30,
				canvasSize: { width: 1080, height: 1920 },
				originalCanvasSize: null,
				background: { type: "color", color: "#000000" },
			} satisfies TProject["settings"],
			createdAt: "2026-06-21T00:00:00.000Z",
			updatedAt: "2026-06-21T00:00:00.000Z",
		},
		revision: 7,
		duration: 3,
		tracks: [
			{
				id: "video-track-1",
				type: "video" as const,
				name: "Video Track",
				isMain: true,
				muted: false,
				hidden: false,
				elements: [],
			},
		],
		derivedAssets: [],
		mediaAssets: [
			{
				id: "media-1",
				name: "clip.mp4",
				type: "video" as const,
				mimeType: "video/mp4",
				duration: 3,
				width: 1920,
				height: 1080,
				size: 11,
				lastModified: 123,
				url: "/api/codex-executor/media?projectId=project-1&mediaId=media-1",
			},
		],
	};
}

describe("applyCodexExecutorSnapshot", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
		URL.createObjectURL = originalCreateObjectURL;
		generateThumbnail.mockClear();
	});

	test("loads executor snapshots with the browser bridge token", async () => {
		const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			fetchCalls.push({ url: String(input), init });
			return new Response(
				JSON.stringify({ ...executorSnapshot(), mediaAssets: [] }),
				{ headers: { "content-type": "application/json" } },
			);
		}) as unknown as typeof fetch;

		await loadCodexExecutorSnapshot({
			projectId: "project-1",
			bridgeToken: "browser-token-1",
		});

		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(
			"/api/codex-executor/project?projectId=project-1",
		);
		expect(fetchCalls[0].init?.headers).toMatchObject({
			"x-codecut-editor-bridge-token": "browser-token-1",
		});
	});

	test("loads executor status with the browser bridge token", async () => {
		const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			fetchCalls.push({ url: String(input), init });
			return new Response(
				JSON.stringify({
					projectId: "project-1",
					status: "succeeded",
					message: "ok",
					updatedAt: "2026-06-21T00:00:00.000Z",
				}),
				{ headers: { "content-type": "application/json" } },
			);
		}) as unknown as typeof fetch;

		await loadCodexExecutorStatus({
			projectId: "project-1",
			bridgeToken: "browser-token-1",
		});

		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(
			"/api/codex-executor/status?projectId=project-1",
		);
		expect(fetchCalls[0].init?.headers).toMatchObject({
			"x-codecut-editor-bridge-token": "browser-token-1",
		});
	});

	test("hydrates media assets with browser-readable blob URLs before syncing", async () => {
		const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			fetchCalls.push({ url: String(input), init });
			return new Response(new Blob(["video-bytes"], { type: "video/mp4" }));
		}) as unknown as typeof fetch;
		const objectUrlBlobs: Blob[] = [];
		URL.createObjectURL = ((blob: Blob) => {
			objectUrlBlobs.push(blob);
			return `blob:executor-media-${objectUrlBlobs.length}`;
		}) as typeof URL.createObjectURL;
		const capturedAssets: MediaAsset[][] = [];

		await applyCodexExecutorSnapshot({
			editor: editorStub({ capturedAssets }),
			snapshot: executorSnapshot(),
			bridgeToken: "browser-token-1",
		});

		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(
			"/api/codex-executor/media?projectId=project-1&mediaId=media-1&revision=7",
		);
		expect(fetchCalls[0].init?.headers).toMatchObject({
			"x-codecut-editor-bridge-token": "browser-token-1",
		});
		expect(capturedAssets).toHaveLength(1);
		expect(capturedAssets[0][0].file.size).toBe(11);
		expect(objectUrlBlobs).toHaveLength(1);
		expect(objectUrlBlobs[0].size).toBe(11);
		expect(capturedAssets[0][0].url).toBe("blob:executor-media-1");
		expect(capturedAssets[0][0].thumbnailUrl).toBe(
			"data:image/jpeg;base64,executor-thumb",
		);
		expect(generateThumbnail).toHaveBeenCalledWith({
			videoFile: capturedAssets[0][0].file,
			timeInSeconds: 1,
		});
	});

	test("syncs project media and timeline from the executor draft snapshot", async () => {
		globalThis.fetch = (async () =>
			new Response(
				new Blob(["video-bytes"], { type: "video/mp4" }),
			)) as unknown as typeof fetch;
		const capturedAssets: MediaAsset[][] = [];
		const capturedProjects: TProject[] = [];
		const capturedTracks: unknown[] = [];
		const snapshot = executorSnapshot();

		await applyCodexExecutorSnapshot({
			editor: editorCaptureStub({
				capturedAssets,
				capturedProjects,
				capturedTracks,
			}),
			snapshot,
		});

		expect(capturedProjects[0].metadata.id).toBe("project-1");
		expect(capturedProjects[0].metadata.duration).toBe(snapshot.duration);
		expect(capturedAssets[0]).toHaveLength(1);
		expect(capturedTracks[0]).toEqual(snapshot.tracks);
	});

	test("syncs executor project cover into the active project without timeline mutation", async () => {
		globalThis.fetch = (async () =>
			new Response(
				new Blob(["image-bytes"], { type: "image/png" }),
			)) as unknown as typeof fetch;
		const capturedAssets: MediaAsset[][] = [];
		const capturedProjects: TProject[] = [];
		const capturedTracks: unknown[] = [];
		const snapshot = {
			...executorSnapshot(),
			duration: 3,
			mediaAssets: [
				{
					id: "cover-1",
					name: "cover.png",
					type: "image" as const,
					mimeType: "image/png",
					width: 1080,
					height: 1920,
					size: 11,
					lastModified: 123,
					url: "/api/codex-executor/media?projectId=project-1&mediaId=cover-1",
				},
			],
			cover: {
				mediaId: "cover-1",
				source: "media_asset" as const,
				title: "别乱花钱",
				prompt: "竖版 9:16 短视频封面，标题设计是画面核心",
				stylePreset: "viral_chinese_title_cover",
				width: 1080,
				height: 1920,
				updatedAt: "2026-06-21T00:00:00.000Z",
			},
		};

		await applyCodexExecutorSnapshot({
			editor: editorCaptureStub({
				capturedAssets,
				capturedProjects,
				capturedTracks,
			}),
			snapshot,
		});

		expect(capturedProjects[0].cover).toEqual(snapshot.cover);
		expect(capturedProjects[0].metadata.duration).toBe(3);
		expect(capturedTracks[0]).toEqual(snapshot.tracks);
		expect(capturedAssets[0]).toHaveLength(1);
	});

	test("fails before syncing when an executor media blob cannot be loaded", async () => {
		globalThis.fetch = (async () =>
			new Response("missing", { status: 404 })) as unknown as typeof fetch;
		const capturedAssets: MediaAsset[][] = [];

		await expect(
			applyCodexExecutorSnapshot({
				editor: editorStub({ capturedAssets }),
				snapshot: executorSnapshot(),
			}),
		).rejects.toThrow("Failed to load executor media asset media-1.");

		expect(capturedAssets).toEqual([]);
	});

	test("fails before syncing when an executor media blob is empty", async () => {
		globalThis.fetch = (async () =>
			new Response(
				new Blob([], { type: "video/mp4" }),
			)) as unknown as typeof fetch;
		const capturedAssets: MediaAsset[][] = [];
		const snapshot = executorSnapshot();
		snapshot.mediaAssets[0].size = 0;

		await expect(
			applyCodexExecutorSnapshot({
				editor: editorStub({ capturedAssets }),
				snapshot,
			}),
		).rejects.toThrow("Executor media asset media-1 is empty.");

		expect(capturedAssets).toEqual([]);
	});
});

describe("getExecutorStatusDotState", () => {
	test("models a compact top-right indicator with revision sync context", () => {
		const state = getExecutorStatusDotState({
			status: {
				projectId: "project-1",
				status: "succeeded",
				tool: "get_timeline_state",
				message: "Timeline has 1 track(s), total duration: 60.48s",
				updatedAt: "2026-06-21T10:00:00.000Z",
				revision: 4,
			},
			error: null,
			isSyncing: false,
		});

		expect(EXECUTOR_STATUS_DOT_CLASS).toContain("size-1.5");
		expect(EXECUTOR_STATUS_DOT_CLASS).not.toContain("fixed");
		expect(EXECUTOR_STATUS_DOT_CLASS).not.toContain("size-7");
		expect(EXECUTOR_STATUS_DOT_CLASS).not.toContain("bg-background");
		expect(state.ariaLabel).toBe("Codex executor succeeded");
		expect(state.title).toBe(
			"Codex executor succeeded. get_timeline_state: Timeline has 1 track(s), total duration: 60.48s. Revision 4 is synced.",
		);
	});
});

describe("shouldSyncExecutorRevision", () => {
	test("syncs only when executor revision is newer than the applied draft", () => {
		expect(
			shouldSyncExecutorRevision({ nextRevision: 8, appliedRevision: 7 }),
		).toBe(true);
		expect(
			shouldSyncExecutorRevision({ nextRevision: 7, appliedRevision: 7 }),
		).toBe(false);
		expect(
			shouldSyncExecutorRevision({ nextRevision: 0, appliedRevision: 7 }),
		).toBe(false);
	});
});
