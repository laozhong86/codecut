import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { applyEditPlanToEditor } from "@/lib/agent-bridge/edit-plan/apply";
import { applyNarratedRemixPlanToEditor } from "@/lib/agent-bridge/narrated-remix/apply";
import {
	type ProbeAudio,
	buildVideoContextWithTranscriber,
} from "@/lib/codex-executor/video-context";
import {
	type ExecutorTranscribeMedia,
	type ExecutorTranscribeMediaRange,
	parseExecutorTranscriptionLanguage,
	parseExecutorTranscriptionModelId,
	probeMediaAudioWithFfprobe,
	transcribeMediaRangeWithNodeRuntime,
	transcribeMediaWithNodeRuntime,
} from "@/lib/codex-executor/transcription";
import {
	createHumanPipEffect,
	createTextBackgroundEffect,
} from "@/lib/derived-assets/masked-effects";
import { serializeElementVisualProperties } from "@/lib/timeline/element-serialization";
import {
	addTransitionToTrack,
	areElementsAdjacent,
	buildTrackTransition,
} from "@/lib/timeline/transition-utils";
import { buildEmptyTrack } from "@/lib/timeline/track-utils";
import { calculateTotalDuration } from "@/lib/timeline";
import type { MediaAsset } from "@/types/assets";
import type { DerivedAsset } from "@/types/project";
import type {
	CreateTimelineElement,
	TimelineElement,
	TimelineTrack,
	TrackType,
	TrackTransition,
	TransitionType,
	VideoTrack,
} from "@/types/timeline";
import { generateUUID } from "@/utils/id";

type ExecutorToolName =
	| "get_project_info"
	| "update_project_settings"
	| "list_media_assets"
	| "import_media_file"
	| "transcribe_media"
	| "build_video_context"
	| "apply_edit_plan"
	| "apply_narrated_remix_plan"
	| "create_text_background_effect"
	| "create_human_pip_effect"
	| "get_timeline_state";

interface ExecutorMediaAsset {
	id: string;
	name: string;
	type: "image" | "video" | "audio";
	mimeType: string;
	duration?: number;
	width?: number;
	height?: number;
	size: number;
	lastModified: number;
	path: string;
}

interface ExecutorProjectState {
	version: 1;
	revision: number;
	project: {
		id: string;
		name: string;
		settings: {
			canvasSize: { width: number; height: number };
			fps: number;
			background: { type: "color"; color: string };
		};
		createdAt: string;
		updatedAt: string;
	};
	mediaAssets: ExecutorMediaAsset[];
	derivedAssets: DerivedAsset[];
	tracks: TimelineTrack[];
}

export interface ExecutorStatus {
	projectId: string;
	status: "idle" | "running" | "succeeded" | "failed";
	tool?: ExecutorToolName;
	message: string;
	updatedAt: string;
	revision?: number;
}

interface ExecutorCommand {
	id: string;
	tool: ExecutorToolName;
	args: Record<string, unknown>;
}

const commandSchema = z
	.object({
		id: z.string().min(1),
		tool: z.enum([
			"get_project_info",
			"update_project_settings",
			"list_media_assets",
			"import_media_file",
			"transcribe_media",
			"build_video_context",
			"apply_edit_plan",
			"apply_narrated_remix_plan",
			"create_text_background_effect",
			"create_human_pip_effect",
			"get_timeline_state",
		]),
		args: z.record(z.string(), z.unknown()),
	})
	.strict();

const envelopeSchema = z
	.object({
		version: z.literal(1),
		projectId: z.string().min(1),
		source: z.literal("codex"),
		commands: z.array(commandSchema).min(1).max(20),
	})
	.strict();

const importMediaArgsSchema = z
	.object({
		fileName: z.string().min(1),
		mimeType: z.string().min(1),
		base64: z.string().min(1),
		size: z.number().int().nonnegative(),
		lastModified: z.number(),
		duration: z.number().positive().optional(),
		width: z.number().positive().optional(),
		height: z.number().positive().optional(),
	})
	.strict();

const updateProjectSettingsArgsSchema = z
	.object({
		width: z.number().positive().optional(),
		height: z.number().positive().optional(),
		fps: z.number().positive().optional(),
		backgroundColor: z.string().min(1).optional(),
	})
	.strict();

const applyPlanArgsSchema = z
	.object({
		plan: z.unknown(),
		replaceExisting: z.boolean(),
	})
	.strict();

const applyNarratedRemixPlanArgsSchema = z
	.object({
		plan: z.unknown(),
		replaceExisting: z.boolean(),
	})
	.strict();

const transcribeMediaArgsSchema = z
	.object({
		mediaId: z.string().min(1),
		language: z.unknown(),
		modelId: z.unknown(),
	})
	.strict();

const buildVideoContextArgsSchema = z
	.object({
		mediaId: z.string().min(1),
		language: z.unknown(),
		modelId: z.unknown(),
	})
	.strict();

const createTextBackgroundEffectArgsSchema = z
	.object({
		sourceMediaId: z.string().min(1),
		derivedAssetId: z.string().min(1),
		content: z.string().min(1),
		startTime: z.number(),
		duration: z.number(),
		replaceExisting: z.boolean(),
	})
	.strict();

const createHumanPipEffectArgsSchema = z
	.object({
		foregroundMediaId: z.string().min(1),
		backgroundMediaId: z.string().min(1),
		derivedAssetId: z.string().min(1),
		placement: z.enum([
			"right_down",
			"right_up",
			"left_down",
			"left_up",
			"center",
		]),
		scale: z.number(),
		startTime: z.number(),
		duration: z.number(),
		replaceExisting: z.boolean(),
	})
	.strict();

function executorRoot(): string {
	return (
		process.env.CODECUT_EXECUTOR_STATE_DIR ??
		join(process.cwd(), ".codecut-executor")
	);
}

function projectDirectory({ projectId }: { projectId: string }): string {
	return join(executorRoot(), "projects", projectId);
}

function projectStatePath({ projectId }: { projectId: string }): string {
	return join(projectDirectory({ projectId }), "project.json");
}

function projectStatusPath({ projectId }: { projectId: string }): string {
	return join(projectDirectory({ projectId }), "status.json");
}

function mediaDirectory({ projectId }: { projectId: string }): string {
	return join(projectDirectory({ projectId }), "media");
}

async function writeJson({ path, value }: { path: string; value: unknown }) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson<T>({ path }: { path: string }): Promise<T> {
	return JSON.parse(await readFile(path, "utf8")) as T;
}

function mediaTypeForMimeType({
	mimeType,
}: {
	mimeType: string;
}): "image" | "video" | "audio" {
	if (mimeType.startsWith("video/")) return "video";
	if (mimeType.startsWith("audio/")) return "audio";
	if (mimeType.startsWith("image/")) return "image";
	throw new Error(`Unsupported media MIME type: ${mimeType}`);
}

function fileForMediaAsset(asset: ExecutorMediaAsset): File {
	return new File([], asset.name, { type: asset.mimeType });
}

function toMediaAsset(asset: ExecutorMediaAsset): MediaAsset {
	return {
		id: asset.id,
		name: asset.name,
		type: asset.type,
		duration: asset.duration,
		width: asset.width,
		height: asset.height,
		file: fileForMediaAsset(asset),
	};
}

function serializeTrack(track: TimelineTrack) {
	return {
		id: track.id,
		type: track.type,
		name: track.name,
		isMain: "isMain" in track ? track.isMain : false,
		...("muted" in track ? { muted: track.muted } : {}),
		...("hidden" in track ? { hidden: track.hidden } : {}),
		elements: track.elements.map((element) => ({
			id: element.id,
			type: element.type,
			name: element.name,
			startTime: element.startTime,
			duration: element.duration,
			trimStart: element.trimStart,
			trimEnd: element.trimEnd,
			...("content" in element ? { content: element.content } : {}),
			...("mediaId" in element ? { mediaId: element.mediaId } : {}),
			...serializeElementVisualProperties(element),
		})),
		...(track.type === "video" ? { transitions: track.transitions ?? [] } : {}),
	};
}

function insertElement({
	state,
	element,
	trackId,
}: {
	state: ExecutorProjectState;
	element: CreateTimelineElement;
	trackId: string;
}) {
	const elementWithId = { ...element, id: generateUUID() } as TimelineElement;
	state.tracks = state.tracks.map((track) =>
		track.id === trackId
			? ({
					...track,
					elements: [...track.elements, elementWithId],
				} as TimelineTrack)
			: track,
	);
}

function addTrack({
	state,
	type,
	index,
}: {
	state: ExecutorProjectState;
	type: TrackType;
	index?: number;
}): string {
	const id = generateUUID();
	const track = buildEmptyTrack({ id, type });
	if (typeof index === "number") {
		state.tracks = [
			...state.tracks.slice(0, index),
			track,
			...state.tracks.slice(index),
		];
	} else {
		state.tracks = [...state.tracks, track];
	}
	return id;
}

function addTransition({
	state,
	trackId,
	fromElementId,
	toElementId,
	type,
	duration,
}: {
	state: ExecutorProjectState;
	trackId: string;
	fromElementId: string;
	toElementId: string;
	type: TransitionType;
	duration: number;
}): TrackTransition | null {
	const track = state.tracks.find((candidate) => candidate.id === trackId);
	if (track?.type !== "video") return null;

	const fromElement = track.elements.find(
		(element) => element.id === fromElementId,
	);
	const toElement = track.elements.find(
		(element) => element.id === toElementId,
	);
	if (!fromElement || !toElement) return null;
	if (!areElementsAdjacent({ elementA: fromElement, elementB: toElement })) {
		return null;
	}

	const transition = buildTrackTransition({
		type,
		duration,
		fromElementId,
		toElementId,
	});
	const updatedTrack = addTransitionToTrack({
		track: track as VideoTrack,
		transition,
	});
	state.tracks = state.tracks.map((candidate) =>
		candidate.id === trackId ? updatedTrack : candidate,
	);
	return transition;
}

async function saveProjectState({ state }: { state: ExecutorProjectState }) {
	state.revision += 1;
	state.project.updatedAt = new Date().toISOString();
	await writeJson({
		path: projectStatePath({ projectId: state.project.id }),
		value: state,
	});
}

async function setStatus(status: ExecutorStatus) {
	await writeJson({
		path: projectStatusPath({ projectId: status.projectId }),
		value: status,
	});
}

async function loadProjectState({
	projectId,
}: {
	projectId: string;
}): Promise<ExecutorProjectState> {
	try {
		return await readJson<ExecutorProjectState>({
			path: projectStatePath({ projectId }),
		});
	} catch {
		throw new Error(`Executor project "${projectId}" was not found.`);
	}
}

export async function createExecutorProject({
	projectId,
	name,
}: {
	projectId: string;
	name: string;
}): Promise<ExecutorProjectState> {
	const now = new Date().toISOString();
	const state: ExecutorProjectState = {
		version: 1,
		revision: 1,
		project: {
			id: projectId,
			name,
			settings: {
				canvasSize: { width: 1080, height: 1920 },
				fps: 30,
				background: { type: "color", color: "#000000" },
			},
			createdAt: now,
			updatedAt: now,
		},
		mediaAssets: [],
		derivedAssets: [],
		tracks: [],
	};
	await mkdir(mediaDirectory({ projectId }), { recursive: true });
	await writeJson({ path: projectStatePath({ projectId }), value: state });
	await setStatus({
		projectId,
		status: "idle",
		message: "Executor project is ready.",
		updatedAt: now,
		revision: state.revision,
	});
	return state;
}

export async function getExecutorProjectState({
	projectId,
}: {
	projectId: string;
}): Promise<ExecutorProjectState> {
	return loadProjectState({ projectId });
}

export async function getExecutorProjectSnapshot({
	projectId,
}: {
	projectId: string;
}) {
	const state = await loadProjectState({ projectId });
	const duration = calculateTotalDuration({ tracks: state.tracks });
	return {
		project: state.project,
		revision: state.revision,
		duration,
		tracks: state.tracks,
		mediaAssets: state.mediaAssets.map((asset) => ({
			id: asset.id,
			name: asset.name,
			type: asset.type,
			mimeType: asset.mimeType,
			duration: asset.duration,
			width: asset.width,
			height: asset.height,
			size: asset.size,
			lastModified: asset.lastModified,
			url: `/api/codex-executor/media?projectId=${encodeURIComponent(projectId)}&mediaId=${encodeURIComponent(asset.id)}`,
		})),
		derivedAssets: state.derivedAssets,
	};
}

export async function readExecutorMedia({
	projectId,
	mediaId,
}: {
	projectId: string;
	mediaId: string;
}): Promise<{ asset: ExecutorMediaAsset; bytes: Buffer }> {
	const state = await loadProjectState({ projectId });
	const asset = state.mediaAssets.find((entry) => entry.id === mediaId);
	if (!asset) {
		throw new Error(`Executor media "${mediaId}" was not found.`);
	}
	return {
		asset,
		bytes: Buffer.from(await readFile(asset.path)),
	};
}

export async function getExecutorStatus({
	projectId,
}: {
	projectId: string;
}): Promise<ExecutorStatus> {
	try {
		return await readJson<ExecutorStatus>({
			path: projectStatusPath({ projectId }),
		});
	} catch {
		const state = await loadProjectState({ projectId });
		return {
			projectId,
			status: "idle",
			message: "No executor status has been recorded.",
			updatedAt: new Date().toISOString(),
			revision: state.revision,
		};
	}
}

async function runImportMedia({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = importMediaArgsSchema.parse(args);
	const bytes = Buffer.from(parsed.base64, "base64");
	if (bytes.byteLength !== parsed.size) {
		throw new Error("Imported file size does not match payload size.");
	}
	const type = mediaTypeForMimeType({ mimeType: parsed.mimeType });
	if ((type === "video" || type === "audio") && !parsed.duration) {
		throw new Error("Imported video/audio duration is required.");
	}

	const mediaId = generateUUID();
	const mediaPath = join(
		mediaDirectory({ projectId: state.project.id }),
		mediaId,
	);
	await writeFile(mediaPath, bytes);
	const asset: ExecutorMediaAsset = {
		id: mediaId,
		name: parsed.fileName,
		type,
		mimeType: parsed.mimeType,
		duration: parsed.duration,
		width: parsed.width,
		height: parsed.height,
		size: parsed.size,
		lastModified: parsed.lastModified,
		path: mediaPath,
	};
	state.mediaAssets = [...state.mediaAssets, asset];
	await saveProjectState({ state });
	return {
		success: true,
		message: "Imported 1 media asset(s)",
		data: {
			assets: [
				{
					id: asset.id,
					name: asset.name,
					type: asset.type,
					duration: asset.duration,
					width: asset.width,
					height: asset.height,
					size: asset.size,
				},
			],
		},
	};
}

function runGetProjectInfo({ state }: { state: ExecutorProjectState }) {
	const duration = calculateTotalDuration({ tracks: state.tracks });
	return {
		success: true,
		message: "Project info retrieved",
		data: {
			name: state.project.name,
			canvasSize: state.project.settings.canvasSize,
			fps: state.project.settings.fps,
			background: state.project.settings.background,
			duration,
			tracks: state.tracks.map((track) => ({
				id: track.id,
				type: track.type,
				name: track.name,
				elementCount: track.elements.length,
				isMain: "isMain" in track ? track.isMain : false,
			})),
			mediaAssets: state.mediaAssets.map((asset) => ({
				id: asset.id,
				name: asset.name,
				type: asset.type,
				duration: asset.duration,
				width: asset.width,
				height: asset.height,
			})),
			derivedAssets: state.derivedAssets,
		},
	};
}

function runListMediaAssets({ state }: { state: ExecutorProjectState }) {
	const assets = state.mediaAssets.map((asset) => ({
		id: asset.id,
		name: asset.name,
		type: asset.type,
		duration: asset.duration,
		width: asset.width,
		height: asset.height,
		size: asset.size,
	}));
	return {
		success: true,
		message: `Found ${assets.length} media asset(s)`,
		data: { assets },
	};
}

async function runUpdateProjectSettings({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = updateProjectSettingsArgsSchema.parse(args);
	const updated: string[] = [];

	if (parsed.width || parsed.height) {
		state.project.settings.canvasSize = {
			width: parsed.width ?? state.project.settings.canvasSize.width,
			height: parsed.height ?? state.project.settings.canvasSize.height,
		};
		updated.push("canvasSize");
	}
	if (parsed.fps) {
		state.project.settings.fps = parsed.fps;
		updated.push("fps");
	}
	if (parsed.backgroundColor) {
		state.project.settings.background = {
			type: "color",
			color: parsed.backgroundColor,
		};
		updated.push("background");
	}
	if (updated.length === 0) {
		return {
			success: false,
			message: "No settings to update",
		};
	}

	await saveProjectState({ state });
	return {
		success: true,
		message: `Project settings updated: ${updated.join(", ")}`,
	};
}

async function runApplyEditPlan({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = applyPlanArgsSchema.parse(args);
	const result = applyEditPlanToEditor({
		plan: parsed.plan,
		projectId: state.project.id,
		replaceExisting: parsed.replaceExisting,
		editor: {
			media: {
				getAssets: () => state.mediaAssets.map(toMediaAsset),
			},
			timeline: {
				getTracks: () => state.tracks,
				updateTracks: (tracks) => {
					state.tracks = tracks;
				},
				addTrack: ({ type, index }) => addTrack({ state, type, index }),
				insertElement: ({ element, placement }) => {
					if (placement.mode !== "explicit") {
						throw new Error("Executor requires explicit track placement.");
					}
					insertElement({ state, element, trackId: placement.trackId });
				},
				addTransition: ({
					trackId,
					fromElementId,
					toElementId,
					type,
					duration,
				}) =>
					addTransition({
						state,
						trackId,
						fromElementId,
						toElementId,
						type,
						duration,
					}),
			},
		},
	});
	if (result.success) {
		await saveProjectState({ state });
	}
	return result;
}

async function runApplyNarratedRemixPlan({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = applyNarratedRemixPlanArgsSchema.parse(args);
	const result = applyNarratedRemixPlanToEditor({
		plan: parsed.plan,
		projectId: state.project.id,
		replaceExisting: parsed.replaceExisting,
		editor: {
			media: {
				getAssets: () => state.mediaAssets.map(toMediaAsset),
			},
			timeline: {
				getTracks: () => state.tracks,
				updateTracks: (tracks) => {
					state.tracks = tracks;
				},
			},
		},
	});

	if (!result.success) {
		return result;
	}

	await saveProjectState({ state });
	return {
		success: true,
		message: `Applied NarratedRemixPlan with ${result.summary.visualBeatCount} visual beat(s).`,
		data: result.summary,
	};
}

function summarizeEffect({
	effect,
	tracks,
}: {
	effect: "text-background" | "human-pip";
	tracks: TimelineTrack[];
}) {
	return {
		effect,
		trackCount: tracks.length,
		elementCount: tracks.reduce(
			(total, track) => total + track.elements.length,
			0,
		),
		totalDuration: calculateTotalDuration({ tracks }),
	};
}

function assertTimelineCanBeReplaced({
	state,
	replaceExisting,
}: {
	state: ExecutorProjectState;
	replaceExisting: boolean;
}) {
	if (state.tracks.length > 0 && !replaceExisting) {
		return {
			success: false,
			message: "Timeline is not empty. Set replaceExisting=true to replace it.",
		};
	}
	return null;
}

async function runCreateTextBackgroundEffect({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = createTextBackgroundEffectArgsSchema.parse(args);
	const blocked = assertTimelineCanBeReplaced({
		state,
		replaceExisting: parsed.replaceExisting,
	});
	if (blocked) return blocked;

	const result = createTextBackgroundEffect({
		sourceMediaId: parsed.sourceMediaId,
		derivedAssetId: parsed.derivedAssetId,
		content: parsed.content,
		startTime: parsed.startTime,
		duration: parsed.duration,
		mediaAssets: state.mediaAssets.map(toMediaAsset),
		derivedAssets: state.derivedAssets,
	});
	state.tracks = result.tracks;
	await saveProjectState({ state });

	const summary = summarizeEffect({
		effect: "text-background",
		tracks: result.tracks,
	});
	return {
		success: true,
		message: `Created text-background effect with ${summary.trackCount} track(s).`,
		data: summary,
	};
}

async function runCreateHumanPipEffect({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = createHumanPipEffectArgsSchema.parse(args);
	const blocked = assertTimelineCanBeReplaced({
		state,
		replaceExisting: parsed.replaceExisting,
	});
	if (blocked) return blocked;

	const result = createHumanPipEffect({
		foregroundMediaId: parsed.foregroundMediaId,
		backgroundMediaId: parsed.backgroundMediaId,
		derivedAssetId: parsed.derivedAssetId,
		placement: parsed.placement,
		scale: parsed.scale,
		startTime: parsed.startTime,
		duration: parsed.duration,
		mediaAssets: state.mediaAssets.map(toMediaAsset),
		derivedAssets: state.derivedAssets,
	});
	state.tracks = result.tracks;
	await saveProjectState({ state });

	const summary = summarizeEffect({
		effect: "human-pip",
		tracks: result.tracks,
	});
	return {
		success: true,
		message: `Created human-pip effect with ${summary.trackCount} track(s).`,
		data: summary,
	};
}

async function runTranscribeMedia({
	state,
	args,
	transcribeMedia,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	transcribeMedia: ExecutorTranscribeMedia;
}) {
	const parsed = transcribeMediaArgsSchema.parse(args);
	const language = parseExecutorTranscriptionLanguage(parsed.language);
	const modelId = parseExecutorTranscriptionModelId(parsed.modelId);
	const mediaAsset = state.mediaAssets.find(
		(asset) => asset.id === parsed.mediaId,
	);

	if (!mediaAsset) {
		return {
			success: false,
			message: `Media asset '${parsed.mediaId}' not found`,
		};
	}
	if (mediaAsset.type !== "video" && mediaAsset.type !== "audio") {
		return {
			success: false,
			message: `Media asset '${mediaAsset.name}' is type '${mediaAsset.type}', expected video or audio`,
		};
	}

	const result = await transcribeMedia({ mediaAsset, language, modelId });
	return {
		success: true,
		message: `Transcribed '${mediaAsset.name}'`,
		data: {
			text: result.text,
			segments: result.segments,
			language: result.language,
			modelId: result.modelId ?? modelId,
			duration: mediaAsset.duration,
		},
	};
}

async function runBuildVideoContext({
	state,
	args,
	probeAudio,
	transcribeMediaRange,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	probeAudio: ProbeAudio;
	transcribeMediaRange: ExecutorTranscribeMediaRange;
}) {
	const parsed = buildVideoContextArgsSchema.parse(args);
	const language = parseExecutorTranscriptionLanguage(parsed.language);
	const modelId = parseExecutorTranscriptionModelId(parsed.modelId);
	const mediaAsset = state.mediaAssets.find(
		(asset) => asset.id === parsed.mediaId,
	);

	if (!mediaAsset) {
		return {
			success: false,
			message: `Media asset '${parsed.mediaId}' not found`,
		};
	}
	if (mediaAsset.type !== "video" && mediaAsset.type !== "audio") {
		return {
			success: false,
			message: `Media asset '${mediaAsset.name}' is type '${mediaAsset.type}', expected video or audio`,
		};
	}

	const videoContextMediaAsset = {
		id: mediaAsset.id,
		name: mediaAsset.name,
		type: mediaAsset.type,
		durationSeconds: mediaAsset.duration,
		width: mediaAsset.width,
		height: mediaAsset.height,
		path: mediaAsset.path,
	};

	const context = await buildVideoContextWithTranscriber({
		mediaAsset: videoContextMediaAsset,
		probeAudio,
		transcribeRange: async ({
			mediaAsset: targetMediaAsset,
			startSeconds,
			endSeconds,
		}) => {
			const result = await transcribeMediaRange({
				mediaAsset: {
					id: targetMediaAsset.id,
					name: targetMediaAsset.name,
					path: mediaAsset.path,
					duration: mediaAsset.duration,
				},
				language,
				modelId,
				range: { start: startSeconds, end: endSeconds },
			});

			return {
				text: result.text,
				language: result.language,
				modelId: result.modelId ?? modelId,
				segments: result.segments,
			};
		},
	});

	return {
		success: true,
		message: `Built VideoContext for '${mediaAsset.name}'`,
		data: {
			version: context.version,
			mediaId: context.mediaId,
			name: context.name,
			qualityLevel: context.qualityLevel,
			metadata: context.metadata,
			transcript: context.transcript,
			analysisChunks: context.analysisChunks,
			assetTypeGuess: context.assetTypeGuess,
			editingHints: context.editingHints,
			warnings: context.warnings,
		},
	};
}

function runGetTimelineState({ state }: { state: ExecutorProjectState }) {
	const duration = calculateTotalDuration({ tracks: state.tracks });
	return {
		success: true,
		message: `Timeline has ${state.tracks.length} track(s), total duration: ${duration.toFixed(2)}s`,
		data: {
			tracks: state.tracks.map(serializeTrack),
			totalDuration: duration,
			derivedAssets: state.derivedAssets,
		},
	};
}

async function executeCommand({
	state,
	command,
	transcribeMedia,
	probeAudio,
	transcribeMediaRange,
}: {
	state: ExecutorProjectState;
	command: ExecutorCommand;
	transcribeMedia: ExecutorTranscribeMedia;
	probeAudio: ProbeAudio;
	transcribeMediaRange: ExecutorTranscribeMediaRange;
}) {
	if (command.tool === "get_project_info") {
		return runGetProjectInfo({ state });
	}
	if (command.tool === "update_project_settings") {
		return runUpdateProjectSettings({ state, args: command.args });
	}
	if (command.tool === "list_media_assets") {
		return runListMediaAssets({ state });
	}
	if (command.tool === "import_media_file") {
		return runImportMedia({ state, args: command.args });
	}
	if (command.tool === "transcribe_media") {
		return runTranscribeMedia({
			state,
			args: command.args,
			transcribeMedia,
		});
	}
	if (command.tool === "build_video_context") {
		return runBuildVideoContext({
			state,
			args: command.args,
			probeAudio,
			transcribeMediaRange,
		});
	}
	if (command.tool === "apply_edit_plan") {
		return runApplyEditPlan({ state, args: command.args });
	}
	if (command.tool === "apply_narrated_remix_plan") {
		return runApplyNarratedRemixPlan({ state, args: command.args });
	}
	if (command.tool === "create_text_background_effect") {
		return runCreateTextBackgroundEffect({ state, args: command.args });
	}
	if (command.tool === "create_human_pip_effect") {
		return runCreateHumanPipEffect({ state, args: command.args });
	}
	if (command.tool === "get_timeline_state") {
		return runGetTimelineState({ state });
	}
	throw new Error(`Unsupported executor tool: ${command.tool}`);
}

const defaultBuildVideoContextProbeAudio: ProbeAudio = async ({
	mediaAsset,
}) => {
	if (!("path" in mediaAsset) || typeof mediaAsset.path !== "string") {
		throw new Error("VideoContext probe requires a media asset path.");
	}

	return probeMediaAudioWithFfprobe({
		mediaAsset: {
			id: mediaAsset.id,
			name: mediaAsset.name,
			path: mediaAsset.path,
		},
	});
};

export async function executeCodexExecutorEnvelope({
	envelope,
	transcribeMedia = transcribeMediaWithNodeRuntime,
	probeAudio = defaultBuildVideoContextProbeAudio,
	transcribeMediaRange = transcribeMediaRangeWithNodeRuntime,
}: {
	envelope: unknown;
	transcribeMedia?: ExecutorTranscribeMedia;
	probeAudio?: ProbeAudio;
	transcribeMediaRange?: ExecutorTranscribeMediaRange;
}) {
	const parsedEnvelope = envelopeSchema.parse(envelope);
	const state = await loadProjectState({ projectId: parsedEnvelope.projectId });
	const results = [];

	for (const command of parsedEnvelope.commands) {
		await setStatus({
			projectId: parsedEnvelope.projectId,
			status: "running",
			tool: command.tool,
			message: `Running ${command.tool}`,
			updatedAt: new Date().toISOString(),
			revision: state.revision,
		});
		try {
			const result = await executeCommand({
				state,
				command,
				transcribeMedia,
				probeAudio,
				transcribeMediaRange,
			});
			const success = result.success !== false;
			const message =
				"message" in result ? result.message : `${command.tool} completed.`;
			results.push({
				commandId: command.id,
				tool: command.tool,
				...result,
			});
			await setStatus({
				projectId: parsedEnvelope.projectId,
				status: success ? "succeeded" : "failed",
				tool: command.tool,
				message,
				updatedAt: new Date().toISOString(),
				revision: state.revision,
			});
			if (!success) break;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Executor command failed.";
			results.push({
				commandId: command.id,
				tool: command.tool,
				success: false,
				message,
			});
			await setStatus({
				projectId: parsedEnvelope.projectId,
				status: "failed",
				tool: command.tool,
				message,
				updatedAt: new Date().toISOString(),
				revision: state.revision,
			});
			break;
		}
	}

	return {
		id: generateUUID(),
		status: "completed",
		projectId: parsedEnvelope.projectId,
		results,
	};
}
