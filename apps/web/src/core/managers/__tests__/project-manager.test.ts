import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EditorCore } from "@/core";
import { buildDefaultScene } from "@/lib/scenes";
import { storageService } from "@/services/storage/service";
import type { DerivedAsset, TProject } from "@/types/project";

const timerWindow = {
	setTimeout,
	clearTimeout,
	addEventListener: () => undefined,
	removeEventListener: () => undefined,
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

describe("ProjectManager derived assets", () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, "window", {
			value: timerWindow,
			configurable: true,
		});
		EditorCore.reset();
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

	test("does not log an expected missing-project load as a console error", async () => {
		const editor = EditorCore.getInstance();
		const originalLoadProject = storageService.loadProject.bind(storageService);
		const originalConsoleError = console.error;
		const consoleError = mock(() => undefined);

		storageService.loadProject = async () => null;
		console.error = consoleError as unknown as typeof console.error;
		(
			editor.project as unknown as {
				storageMigrationPromise: Promise<void> | null;
			}
		).storageMigrationPromise = Promise.resolve();

		try {
			await expect(
				editor.project.loadProject({ id: "missing-project" }),
			).rejects.toThrow("Project with id missing-project not found");
			expect(consoleError).not.toHaveBeenCalled();
		} finally {
			storageService.loadProject = originalLoadProject;
			console.error = originalConsoleError;
		}
	});
});
