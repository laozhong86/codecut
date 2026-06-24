import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { EditorCore } from "@/core";
import { buildDefaultScene } from "@/lib/scenes";
import type { DerivedAsset, ProjectCover, TProject } from "@/types/project";
import {
	ProjectNotFoundError,
	shouldLogProjectLoadError,
} from "../project-manager";

const timerWindow = {
	setTimeout,
	clearTimeout,
	addEventListener: () => undefined,
	removeEventListener: () => undefined,
};

const opfsDirectoryStub = {
	getDirectoryHandle: async () => opfsDirectoryStub,
	removeEntry: async () => undefined,
};

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"navigator",
);
const originalIndexedDbDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"indexedDB",
);

function restoreGlobalProperty(
	property: "navigator" | "indexedDB",
	descriptor: PropertyDescriptor | undefined,
): void {
	if (descriptor) {
		Object.defineProperty(globalThis, property, descriptor);
		return;
	}

	Reflect.deleteProperty(globalThis, property);
}

function successRequest<T>(result?: T): IDBRequest<T> {
	const request = { result, error: null } as unknown as IDBRequest<T>;
	queueMicrotask(() => request.onsuccess?.(new Event("success")));
	return request;
}

const indexedDbStub = {
	open: () => {
		const database = {
			transaction: () => ({
				objectStore: () => ({
					delete: () => successRequest(undefined),
				}),
			}),
		};
		return successRequest(database as unknown as IDBDatabase);
	},
};

function personMask(overrides: Partial<DerivedAsset> = {}): DerivedAsset {
	return {
		id: "mask-1",
		type: "person-mask",
		sourceMediaId: "video-1",
		alphaMediaId: "alpha-1",
		duration: 10,
		width: 1920,
		height: 1080,
		fps: 30,
		confidence: 0.8,
		createdAt: "2026-06-21T00:00:00.000Z",
		...overrides,
	};
}

function projectFixture(): TProject {
	const now = new Date("2026-06-21T00:00:00.000Z");
	const scene = buildDefaultScene({ name: "Main scene", isMain: true });
	return {
		metadata: {
			id: "project-1",
			name: "Project",
			duration: 0,
			createdAt: now,
			updatedAt: now,
		},
		scenes: [scene],
		currentSceneId: scene.id,
		settings: {
			fps: 30,
			canvasSize: { width: 1080, height: 1920 },
			originalCanvasSize: null,
			background: { type: "color", color: "#000000" },
		},
		version: 5,
		derivedAssets: [],
	};
}

function projectCover(overrides: Partial<ProjectCover> = {}): ProjectCover {
	return {
		mediaId: "cover-1",
		source: "media_asset",
		title: "Cover title",
		prompt: "竖版 9:16 短视频封面，标题设计是画面核心",
		stylePreset: "viral_chinese_title_cover",
		width: 1080,
		height: 1920,
		updatedAt: "2026-06-21T00:00:00.000Z",
		...overrides,
	};
}

describe("ProjectManager derived assets", () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, "window", {
			value: timerWindow,
			configurable: true,
		});
		Object.defineProperty(globalThis, "navigator", {
			value: {
				storage: {
					getDirectory: async () => opfsDirectoryStub,
				},
			},
			configurable: true,
		});
		Object.defineProperty(globalThis, "indexedDB", {
			value: indexedDbStub,
			configurable: true,
		});
		EditorCore.reset();
	});

	afterEach(() => {
		restoreGlobalProperty("navigator", originalNavigatorDescriptor);
		restoreGlobalProperty("indexedDB", originalIndexedDbDescriptor);
	});

	test("adds and removes derived assets from the active project registry", () => {
		const editor = EditorCore.getInstance();
		editor.project.setActiveProject({ project: projectFixture() });

		editor.project.addDerivedAsset({ derivedAsset: personMask() });
		expect(editor.project.getDerivedAssets()).toEqual([personMask()]);

		editor.project.removeDerivedAsset({ id: "mask-1" });
		expect(editor.project.getDerivedAssets()).toEqual([]);
	});

	test("rejects duplicate derived asset ids", () => {
		const editor = EditorCore.getInstance();
		editor.project.setActiveProject({ project: projectFixture() });

		editor.project.addDerivedAsset({ derivedAsset: personMask() });
		expect(() =>
			editor.project.addDerivedAsset({ derivedAsset: personMask() }),
		).toThrow("Derived asset already exists.");
	});

	test("rejects invalid person-mask derived asset metadata", () => {
		const editor = EditorCore.getInstance();
		editor.project.setActiveProject({ project: projectFixture() });

		expect(() =>
			editor.project.addDerivedAsset({
				derivedAsset: personMask({ duration: 0 }),
			}),
		).toThrow("Person mask duration must be positive.");
		expect(() =>
			editor.project.addDerivedAsset({
				derivedAsset: personMask({ width: 0 }),
			}),
		).toThrow("Person mask width must be positive.");
		expect(() =>
			editor.project.addDerivedAsset({
				derivedAsset: personMask({ confidence: -0.1 }),
			}),
		).toThrow("Person mask confidence must be between 0 and 1.");
	});

	test("classifies expected missing-project loads as non-loggable", () => {
		expect(
			shouldLogProjectLoadError(new ProjectNotFoundError("missing-project")),
		).toBe(false);
		expect(shouldLogProjectLoadError(new Error("IndexedDB failed"))).toBe(true);
	});

	test("clears the project cover when its media asset is removed", async () => {
		const editor = EditorCore.getInstance();
		const project = { ...projectFixture(), cover: projectCover() };
		editor.project.setActiveProject({
			project,
		});
		editor.scenes.initializeScenes({
			scenes: project.scenes,
			currentSceneId: project.currentSceneId,
		});
		editor.media.setAssets({
			assets: [
				{
					id: "cover-1",
					name: "cover.png",
					type: "image",
					file: new File(["png"], "cover.png", { type: "image/png" }),
					width: 1080,
					height: 1920,
				},
			],
		});

		await editor.media.removeMediaAsset({
			projectId: "project-1",
			id: "cover-1",
		});

		expect(editor.project.getActive().cover).toBeUndefined();
	});

});
