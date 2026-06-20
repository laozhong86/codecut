import { describe, expect, test, beforeEach } from "bun:test";
import { EditorCore } from "@/core";
import { DEFAULT_CANVAS_SIZE } from "@/constants/project-constants";
import { buildDefaultScene } from "@/lib/scenes";
import { buildVideoElement } from "@/lib/timeline/element-utils";
import { InsertElementCommand } from "../insert-element";
import type { MediaAsset } from "@/types/assets";
import type { TProject } from "@/types/project";

const timerWindow = {
	setTimeout,
	clearTimeout,
	addEventListener: () => undefined,
	removeEventListener: () => undefined,
};

function projectFixture({ sceneId }: { sceneId: string }): TProject {
	const now = new Date("2026-06-20T00:00:00.000Z");
	return {
		metadata: {
			id: "project-1",
			name: "Project",
			duration: 0,
			createdAt: now,
			updatedAt: now,
		},
		scenes: [],
		currentSceneId: sceneId,
		settings: {
			fps: 30,
			canvasSize: { width: 1080, height: 1920 },
			originalCanvasSize: null,
			background: { type: "color", color: "#000000" },
		},
		version: 1,
	};
}

function videoAsset(): MediaAsset {
	return {
		id: "media-1",
		name: "source.mp4",
		type: "video",
		duration: 120,
		width: DEFAULT_CANVAS_SIZE.width,
		height: DEFAULT_CANVAS_SIZE.height,
		file: new File(["video"], "source.mp4", { type: "video/mp4" }),
	};
}

describe("InsertElementCommand", () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, "window", {
			value: timerWindow,
			configurable: true,
		});
		EditorCore.reset();
	});

	test("preserves a user-selected canvas size when inserting the first video element", () => {
		const editor = EditorCore.getInstance();
		const scene = buildDefaultScene({ name: "Main scene", isMain: true });
		editor.project.setActiveProject({ project: projectFixture({ sceneId: scene.id }) });
		editor.scenes.initializeScenes({ scenes: [scene], currentSceneId: scene.id });
		editor.media.setAssets({ assets: [videoAsset()] });

		new InsertElementCommand({
			element: buildVideoElement({
				mediaId: "media-1",
				name: "source.mp4",
				duration: 10,
				startTime: 0,
			}),
			placement: { mode: "auto" },
		}).execute();

		expect(editor.project.getActive().settings.canvasSize).toEqual({
			width: 1080,
			height: 1920,
		});
	});
});
