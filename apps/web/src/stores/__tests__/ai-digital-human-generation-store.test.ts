import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import type { TProject } from "@/types/project";

const submitDigitalHumanTask = mock(async () => ({
	taskId: "task-1",
	status: "running" as const,
}));
const getDigitalHumanTask = mock(async () => ({
	taskId: "task-1",
	status: "succeeded" as const,
	videoUrl: "https://www.runninghub.cn/output/result.mp4",
}));
const downloadDigitalHumanResult = mock(
	async () => new Blob(["video-bytes"], { type: "video/mp4" }),
);
const processMediaAssets = mock(async ({ files }: { files: File[] }) => [
	{
		name: files[0]?.name ?? "digital-human-task-1.mp4",
		type: "video" as const,
		file: files[0] ?? new File(["video-bytes"], "digital-human-task-1.mp4"),
		url: "blob:local-digital-human-video",
		duration: 4,
		width: 1280,
		height: 720,
		fps: 25,
	},
]);
const saveMediaAsset = mock(async () => undefined);
const toastSuccess = mock(() => undefined);
const toastError = mock(() => undefined);

mock.module("@/lib/ai/providers", () => ({
	DIGITAL_HUMAN_PROVIDERS: [],
	IMAGE_PROVIDERS: [],
	VIDEO_PROVIDERS: [],
	getDigitalHumanProvider: () => ({
		id: "runninghub-digital-human",
		name: "RunningHub Digital Human",
		description: "RunningHub fixed AI App digital human generation",
		submitDigitalHumanTask,
		getDigitalHumanTask,
		downloadDigitalHumanResult,
	}),
	getImageProvider: () => null,
	getVideoProvider: () => null,
}));

mock.module("@/lib/media/processing", () => ({
	processMediaAssets,
}));

mock.module("@/services/storage/service", () => ({
	storageService: {
		saveMediaAsset,
		loadAllMediaAssets: mock(async () => []),
		deleteMediaAsset: mock(async () => undefined),
	},
}));

mock.module("sonner", () => ({
	toast: {
		success: toastSuccess,
		error: toastError,
	},
}));

const timerWindow = {
	setTimeout,
	clearTimeout,
	addEventListener: () => undefined,
	removeEventListener: () => undefined,
};

function projectFixture(): TProject {
	const now = new Date("2026-06-21T00:00:00.000Z");
	return {
		metadata: {
			id: "project-1",
			name: "Project",
			duration: 0,
			createdAt: now,
			updatedAt: now,
		},
		scenes: [
			{
				id: "scene-1",
				name: "Main scene",
				isMain: true,
				tracks: [],
				bookmarks: [],
				createdAt: now,
				updatedAt: now,
			},
		],
		currentSceneId: "scene-1",
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

function mediaAsset({
	id,
	name,
	type,
	fileMimeType,
}: {
	id: string;
	name: string;
	type: MediaAsset["type"];
	fileMimeType: string;
}): MediaAsset {
	return {
		id,
		name,
		type,
		file: new File([type], name, { type: fileMimeType }),
		url: `blob:${id}`,
	};
}

describe("AI digital human generation store", () => {
	beforeEach(async () => {
		Object.defineProperty(globalThis, "window", {
			value: timerWindow,
			configurable: true,
		});
		const storage = new Map<string, string>();
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) => storage.get(key) ?? null,
				setItem: (key: string, value: string) => {
					storage.set(key, value);
				},
				removeItem: (key: string) => {
					storage.delete(key);
				},
			},
		});

		submitDigitalHumanTask.mockClear();
		getDigitalHumanTask.mockClear();
		downloadDigitalHumanResult.mockClear();
		processMediaAssets.mockClear();
		saveMediaAsset.mockClear();
		toastSuccess.mockClear();
		toastError.mockClear();

		const { EditorCore } = await import("@/core");
		EditorCore.reset();
		const editor = EditorCore.getInstance();
		editor.project.setActiveProject({ project: projectFixture() });
		editor.media.setAssets({
			assets: [
				mediaAsset({
					id: "image-1",
					name: "portrait.png",
					type: "image",
					fileMimeType: "image/png",
				}),
				mediaAsset({
					id: "audio-1",
					name: "voice.mp3",
					type: "audio",
					fileMimeType: "audio/mpeg",
				}),
			],
		});
	});

	test("downloads the RunningHub result and adds it as a local video media asset", async () => {
		const { useAISettingsStore } = await import("../ai-settings-store");
		const { useAIDigitalHumanGenerationStore } = await import(
			"../ai-digital-human-generation-store"
		);
		const { EditorCore } = await import("@/core");

		useAISettingsStore
			.getState()
			.setDigitalHumanProvider("runninghub-digital-human");
		useAISettingsStore.getState().setRunningHubApiKey("rh-key");
		useAIDigitalHumanGenerationStore.setState({
			imageMediaId: "image-1",
			audioMediaId: "audio-1",
			scriptText: "欢迎来到今天的口播",
			motionPrompt: "女人自然点头微笑",
			width: 1280,
			height: 720,
			fps: 25,
			isGenerating: false,
			generatedVideos: [],
		});

		await useAIDigitalHumanGenerationStore.getState().generate();

		expect(downloadDigitalHumanResult).toHaveBeenCalledWith({
			videoUrl: "https://www.runninghub.cn/output/result.mp4",
		});
		expect(processMediaAssets).toHaveBeenCalledTimes(1);
		const generatedVideo = useAIDigitalHumanGenerationStore.getState()
			.generatedVideos[0];
		expect(generatedVideo).toMatchObject({
			taskId: "task-1",
			taskStatus: "succeeded",
			assetStatus: "added",
			videoUrl: "blob:local-digital-human-video",
		});
		expect(generatedVideo?.videoUrl).not.toBe(
			"https://www.runninghub.cn/output/result.mp4",
		);
		const editor = EditorCore.getInstance();
		const addedVideo = editor.media
			.getAssets()
			.find((asset) => asset.id === generatedVideo?.mediaId);
		expect(addedVideo).toMatchObject({
			name: "digital-human-task-1.mp4",
			type: "video",
			url: "blob:local-digital-human-video",
		});
		expect(saveMediaAsset).toHaveBeenCalledWith({
			projectId: "project-1",
			mediaAsset: expect.objectContaining({
				type: "video",
				url: "blob:local-digital-human-video",
			}),
		});
	});
});
