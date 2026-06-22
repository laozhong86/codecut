import { beforeEach, describe, expect, test } from "bun:test";
import { EditorCore } from "@/core";
import { buildDefaultScene } from "@/lib/scenes";
import { buildEmptyTrack } from "@/lib/timeline/track-utils";
import type {
	ClipboardItem,
	TextElement,
	TextTrack,
	TimelineTrack,
	VideoElement,
	VideoTrack,
} from "@/types/timeline";
import type { TProject } from "@/types/project";

const timerWindow = {
	setTimeout,
	clearTimeout,
	addEventListener: () => undefined,
	removeEventListener: () => undefined,
};

function setupEditor({ tracks }: { tracks: TimelineTrack[] }) {
	Object.defineProperty(globalThis, "window", {
		value: timerWindow,
		configurable: true,
	});
	EditorCore.reset();
	const editor = EditorCore.getInstance();
	const scene = {
		...buildDefaultScene({ name: "Main scene", isMain: true }),
		id: "scene-1",
		tracks,
	};
	editor.project.setActiveProject({ project: projectFixture({ sceneId: scene.id }) });
	editor.scenes.initializeScenes({ scenes: [scene], currentSceneId: scene.id });
	return editor;
}

function projectFixture({ sceneId }: { sceneId: string }): TProject {
	const now = new Date("2026-06-22T00:00:00.000Z");
	return {
		metadata: {
			id: "project-1",
			name: "Undo redo project",
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
		derivedAssets: [],
	};
}

function videoTrack({
	id,
	elements,
	isMain = true,
}: {
	id: string;
	elements: VideoElement[];
	isMain?: boolean;
}): VideoTrack {
	return {
		...buildEmptyTrack({ id, type: "video", name: id }),
		isMain,
		elements,
	} as VideoTrack;
}

function textTrack({
	id,
	elements,
}: {
	id: string;
	elements: TextElement[];
}): TextTrack {
	return {
		...buildEmptyTrack({ id, type: "text", name: id }),
		elements,
	} as TextTrack;
}

function videoElement({
	id,
	startTime,
	duration,
}: {
	id: string;
	startTime: number;
	duration: number;
}): VideoElement {
	return {
		id,
		type: "video",
		mediaId: `${id}-media`,
		name: id,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		muted: false,
		hidden: false,
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
	};
}

function textElement({
	id,
	startTime,
	content = id,
}: {
	id: string;
	startTime: number;
	content?: string;
}): TextElement {
	return {
		id,
		type: "text",
		name: id,
		content,
		richSpans: [],
		duration: 2,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		fontSize: 48,
		fontFamily: "Inter",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
	};
}

function stateSnapshot(editor: EditorCore) {
	return {
		tracks: editor.timeline.getTracks(),
		selection: editor.selection.getSelectedElements(),
	};
}

describe("timeline command undo/redo contracts", () => {
	beforeEach(() => {
		EditorCore.reset();
	});

	test("split keeps stable right-side element ids across undo and redo", () => {
		const editor = setupEditor({
			tracks: [
				videoTrack({
					id: "main-track",
					elements: [videoElement({ id: "clip-1", startTime: 0, duration: 10 })],
				}),
			],
		});
		editor.selection.setSelectedElements({
			elements: [{ trackId: "main-track", elementId: "clip-1" }],
		});

		const before = stateSnapshot(editor);

		editor.timeline.splitElements({
			elements: [{ trackId: "main-track", elementId: "clip-1" }],
			splitTime: 4,
		});
		const afterExecute = stateSnapshot(editor);

		editor.command.undo();
		expect(stateSnapshot(editor)).toEqual(before);

		editor.command.redo();
		expect(stateSnapshot(editor)).toEqual(afterExecute);
	});

	test("delete removes elements and restores the exact timeline on undo and redo", () => {
		const editor = setupEditor({
			tracks: [
				videoTrack({
					id: "main-track",
					elements: [videoElement({ id: "clip-1", startTime: 0, duration: 10 })],
				}),
				textTrack({
					id: "text-track",
					elements: [textElement({ id: "caption-1", startTime: 1 })],
				}),
			],
		});
		const before = stateSnapshot(editor);

		editor.timeline.deleteElements({
			elements: [{ trackId: "text-track", elementId: "caption-1" }],
		});
		const afterExecute = stateSnapshot(editor);

		editor.command.undo();
		expect(stateSnapshot(editor)).toEqual(before);

		editor.command.redo();
		expect(stateSnapshot(editor)).toEqual(afterExecute);
	});

	test("move restores source and target tracks across undo and redo", () => {
		const editor = setupEditor({
			tracks: [
				videoTrack({
					id: "main-track",
					elements: [videoElement({ id: "clip-1", startTime: 0, duration: 4 })],
				}),
				videoTrack({
					id: "overlay-track",
					isMain: false,
					elements: [],
				}),
			],
		});
		const before = stateSnapshot(editor);

		editor.timeline.moveElement({
			sourceTrackId: "main-track",
			targetTrackId: "overlay-track",
			elementId: "clip-1",
			newStartTime: 6,
		});
		const afterExecute = stateSnapshot(editor);

		editor.command.undo();
		expect(stateSnapshot(editor)).toEqual(before);

		editor.command.redo();
		expect(stateSnapshot(editor)).toEqual(afterExecute);
	});

	test("paste keeps generated track and element ids stable across undo and redo", () => {
		const editor = setupEditor({
			tracks: [
				videoTrack({
					id: "main-track",
					elements: [videoElement({ id: "clip-1", startTime: 0, duration: 4 })],
				}),
			],
		});
		const clipboardItems: ClipboardItem[] = [
			{
				trackId: "main-track",
				trackType: "text",
				element: textElement({ id: "caption-source", startTime: 1 }),
			},
		];
		const before = stateSnapshot(editor);

		editor.timeline.pasteAtTime({ time: 5, clipboardItems });
		const afterExecute = stateSnapshot(editor);

		editor.command.undo();
		expect(stateSnapshot(editor)).toEqual(before);

		editor.command.redo();
		expect(stateSnapshot(editor)).toEqual(afterExecute);
	});

	test("track reorder restores the exact order across undo and redo", () => {
		const editor = setupEditor({
			tracks: [
				textTrack({ id: "text-track", elements: [] }),
				videoTrack({
					id: "main-track",
					elements: [videoElement({ id: "clip-1", startTime: 0, duration: 4 })],
				}),
				textTrack({ id: "title-track", elements: [] }),
			],
		});
		const before = stateSnapshot(editor);

		editor.timeline.reorderTracks({
			trackIds: ["title-track", "main-track", "text-track"],
		});
		const afterExecute = stateSnapshot(editor);

		editor.command.undo();
		expect(stateSnapshot(editor)).toEqual(before);

		editor.command.redo();
		expect(stateSnapshot(editor)).toEqual(afterExecute);
	});
});
