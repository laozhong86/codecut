import { afterEach, describe, expect, test } from "bun:test";
import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/types/assets";
import type { TProject } from "@/types/project";
import {
	applyCodexExecutorSnapshot,
	EXECUTOR_STATUS_DOT_CLASS,
	getExecutorStatusDotState,
} from "../codex-executor-sync";

const originalFetch = globalThis.fetch;

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
		tracks: [],
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
	});

	test("hydrates media assets with the executor media blob before syncing", async () => {
		const requestedUrls: string[] = [];
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			requestedUrls.push(String(input));
			return new Response(new Blob(["video-bytes"], { type: "video/mp4" }));
		}) as unknown as typeof fetch;
		const capturedAssets: MediaAsset[][] = [];

		await applyCodexExecutorSnapshot({
			editor: editorStub({ capturedAssets }),
			snapshot: executorSnapshot(),
		});

		expect(requestedUrls).toEqual([
			"/api/codex-executor/media?projectId=project-1&mediaId=media-1&revision=7",
		]);
		expect(capturedAssets).toHaveLength(1);
		expect(capturedAssets[0][0].file.size).toBe(11);
		expect(capturedAssets[0][0].url).toBe(
			"/api/codex-executor/media?projectId=project-1&mediaId=media-1&revision=7",
		);
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
	test("models a compact top-right indicator without persistent details", () => {
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
		expect(EXECUTOR_STATUS_DOT_CLASS).not.toContain("size-7");
		expect(EXECUTOR_STATUS_DOT_CLASS).not.toContain("bg-background");
		expect(state.ariaLabel).toBe("Codex executor succeeded");
		expect(state.title).toBe("Codex executor succeeded.");
		expect(JSON.stringify(state)).not.toContain("get_timeline_state");
		expect(JSON.stringify(state)).not.toContain("Timeline has 1 track");
	});
});
