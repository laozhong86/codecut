import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";
import { applyEditPlanToEditor } from "@/lib/agent-bridge/edit-plan/apply";
import { validateEditPlan } from "@/lib/agent-bridge/edit-plan/validate";
import { applyNarratedRemixPlanToEditor } from "@/lib/agent-bridge/narrated-remix/apply";
import {
	type ProbeAudio,
	buildVideoContextWithTranscriber,
} from "@/lib/codex-executor/video-context";
import { buildVisualContextWithInspector } from "@/lib/codex-executor/visual-context";
import { inspectVideoRange as inspectVideoRangeWithNodeRuntime } from "@/lib/codex-executor/video-range-inspection";
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
	type RunningHubExecutorMediaAsset,
	generateRunningHubDigitalHumanFromExecutorMedia,
	type RunningHubGeneratedDigitalHuman,
} from "@/lib/ai/providers/runninghub-digital-human-server";
import { RUNNINGHUB_DIGITAL_HUMAN_PROVIDER_ID } from "@/lib/ai/providers/runninghub-digital-human";
import type { DigitalHumanGenerationRequest } from "@/lib/ai/providers";
import {
	createHumanPipEffect,
	createTextBackgroundEffect,
	requireHumanPipPlacement,
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
	VideoElement,
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
	| "build_visual_context"
	| "inspect_video_range"
	| "build_post_cut_captions"
	| "validate_edit_plan"
	| "preview_edit_plan"
	| "apply_edit_plan"
	| "apply_narrated_remix_plan"
	| "create_text_background_effect"
	| "create_human_pip_effect"
	| "generate_digital_human"
	| "export_project"
	| "verify_timeline"
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

export interface ExecutorProjectState {
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

export type CodecutDraftV1 = ExecutorProjectState;

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
			"build_visual_context",
			"inspect_video_range",
			"build_post_cut_captions",
			"validate_edit_plan",
			"preview_edit_plan",
			"apply_edit_plan",
			"apply_narrated_remix_plan",
			"create_text_background_effect",
			"create_human_pip_effect",
			"generate_digital_human",
			"export_project",
			"verify_timeline",
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

const editPlanOnlyArgsSchema = z
	.object({
		plan: z.unknown(),
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

const buildVisualContextArgsSchema = z
	.object({
		mediaId: z.string().min(1),
		targetAspectRatio: z.enum(["9:16", "16:9", "1:1"]),
	})
	.strict();

const inspectVideoRangeArgsSchema = z
	.object({
		mediaId: z.string().min(1),
		startSeconds: z.number(),
		endSeconds: z.number(),
		frameCount: z.number().int().optional(),
	})
	.strict();

const buildPostCutCaptionsArgsSchema = z
	.object({
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
		placement: z.string().min(1),
		scale: z.number(),
		startTime: z.number(),
		duration: z.number(),
		replaceExisting: z.boolean(),
	})
	.strict();

const generateDigitalHumanArgsSchema = z
	.object({
		imageMediaId: z.string().min(1),
		audioMediaId: z.string().min(1),
		scriptText: z.string().trim().min(1),
		motionPrompt: z.string().trim().min(1),
		width: z.number().positive(),
		height: z.number().positive(),
		fps: z.number().positive(),
	})
	.strict();

const exportProjectArgsSchema = z
	.object({
		format: z.string().min(1),
		quality: z.string().min(1),
		includeAudio: z.boolean(),
		outputFile: z.string().min(1),
		overwrite: z.boolean(),
	})
	.strict();

const verifyTimelineArgsSchema = z
	.object({
		verification: z
			.object({
				totalDuration: z.number().nonnegative().optional(),
				trackCount: z.number().int().nonnegative().optional(),
				clipCount: z.number().int().nonnegative().optional(),
				captionCount: z.number().int().nonnegative().optional(),
				audioCount: z.number().int().nonnegative().optional(),
				mediaIds: z.array(z.string().min(1)).optional(),
			})
			.strict(),
	})
	.strict();

export type ExecutorGenerateDigitalHuman = (params: {
	apiKey: string;
	imageAsset: RunningHubExecutorMediaAsset;
	audioAsset: RunningHubExecutorMediaAsset;
	request: DigitalHumanGenerationRequest;
}) => Promise<RunningHubGeneratedDigitalHuman>;

type ExecutorExportFormat = "mp4" | "webm";
type ExecutorExportQuality = "low" | "medium" | "high" | "very_high";

export type ExecutorExportProject = (params: {
	state: ExecutorProjectState;
	format: ExecutorExportFormat;
	quality: ExecutorExportQuality;
	includeAudio: boolean;
}) => Promise<ArrayBuffer | Uint8Array>;

function executorRoot(): string {
	return (
		process.env.CODECUT_EXECUTOR_STATE_DIR ??
		join(process.cwd(), ".codecut-executor")
	);
}

function projectDirectory({ projectId }: { projectId: string }): string {
	return join(executorRoot(), "projects", projectId);
}

function projectsDirectory(): string {
	return join(executorRoot(), "projects");
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

async function fileForMediaAsset(asset: ExecutorMediaAsset): Promise<File> {
	let bytes: Buffer;
	try {
		bytes = await readFile(asset.path);
	} catch {
		throw new Error(`Failed to load executor media asset ${asset.id}.`);
	}
	if (bytes.byteLength === 0) {
		throw new Error(`Executor media asset ${asset.id} is empty.`);
	}
	if (bytes.byteLength !== asset.size) {
		throw new Error(`Executor media asset size mismatch for ${asset.id}.`);
	}
	const fileBytes = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
	return new File([fileBytes], asset.name, {
		type: asset.mimeType,
		lastModified: asset.lastModified,
	});
}

async function toMediaAsset(asset: ExecutorMediaAsset): Promise<MediaAsset> {
	return {
		id: asset.id,
		name: asset.name,
		type: asset.type,
		duration: asset.duration,
		width: asset.width,
		height: asset.height,
		file: await fileForMediaAsset(asset),
	};
}

async function toMediaAssets(
	assets: ExecutorMediaAsset[],
): Promise<MediaAsset[]> {
	return Promise.all(assets.map(toMediaAsset));
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

async function readProjectStatusOrNull({
	projectId,
}: {
	projectId: string;
}): Promise<ExecutorStatus | null> {
	try {
		return await readJson<ExecutorStatus>({
			path: projectStatusPath({ projectId }),
		});
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return null;
		}
		throw error;
	}
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

export async function listExecutorProjects() {
	let entries: Dirent[];
	try {
		entries = await readdir(projectsDirectory(), { withFileTypes: true });
	} catch (error) {
		if ((error as { code?: string }).code === "ENOENT") {
			return { projects: [] };
		}
		throw error;
	}

	const projects = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const state = await loadProjectState({ projectId: entry.name });
		projects.push({
			projectId: state.project.id,
			name: state.project.name,
			revision: state.revision,
			updatedAt: state.project.updatedAt,
			mediaAssetCount: state.mediaAssets.length,
			trackCount: state.tracks.length,
			totalDuration: calculateTotalDuration({ tracks: state.tracks }),
		});
	}
	projects.sort((left, right) => left.projectId.localeCompare(right.projectId));
	return { projects };
}

export async function renameExecutorProject({
	projectId,
	name,
}: {
	projectId: string;
	name: string;
}) {
	const state = await loadProjectState({ projectId });
	state.project.name = name;
	await saveProjectState({ state });
	return {
		projectId: state.project.id,
		name: state.project.name,
		revision: state.revision,
	};
}

export async function deleteExecutorProject({
	projectId,
}: {
	projectId: string;
}) {
	await loadProjectState({ projectId });
	await rm(projectDirectory({ projectId }), { recursive: true, force: false });
	return { projectId };
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

async function runGetProjectInfo({
	state,
	lastStatus,
}: {
	state: ExecutorProjectState;
	lastStatus?: ExecutorStatus | null;
}) {
	const duration = calculateTotalDuration({ tracks: state.tracks });
	const elementCount = state.tracks.reduce(
		(total, track) => total + track.elements.length,
		0,
	);
	return {
		success: true,
		message: "Project info retrieved",
		data: {
			revision: state.revision,
			name: state.project.name,
			canvasSize: state.project.settings.canvasSize,
			fps: state.project.settings.fps,
			background: state.project.settings.background,
			duration,
			draft: {
				version: state.version,
				revision: state.revision,
				mediaCount: state.mediaAssets.length,
				trackCount: state.tracks.length,
				elementCount,
				updatedAt: state.project.updatedAt,
			},
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
			...(lastStatus
				? {
						lastStatus: {
							status: lastStatus.status,
							tool: lastStatus.tool,
							message: lastStatus.message,
							updatedAt: lastStatus.updatedAt,
							revision: lastStatus.revision,
						},
					}
				: {}),
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

async function runValidateEditPlan({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = editPlanOnlyArgsSchema.parse(args);
	const mediaAssets = await toMediaAssets(state.mediaAssets);
	const validation = validateEditPlan({
		plan: parsed.plan,
		projectId: state.project.id,
		mediaAssets,
	});
	if (!validation.success) {
		return {
			success: false,
			message: validation.message,
			data: {
				valid: false,
				revision: state.revision,
				...(validation.path ? { path: validation.path } : {}),
			},
		};
	}

	return {
		success: true,
		message: "EditPlan is valid.",
		data: {
			valid: true,
			revision: state.revision,
		},
	};
}

async function runPreviewEditPlan({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = editPlanOnlyArgsSchema.parse(args);
	const mediaAssets = await toMediaAssets(state.mediaAssets);
	const validation = validateEditPlan({
		plan: parsed.plan,
		projectId: state.project.id,
		mediaAssets,
	});
	if (!validation.success) {
		return {
			success: false,
			message: validation.message,
			data: {
				valid: false,
				revision: state.revision,
				...(validation.path ? { path: validation.path } : {}),
			},
		};
	}

	const plan = validation.normalizedPlan;
	const audioCount =
		(plan.audio?.bgm ? 1 : 0) + (plan.audio?.sfx?.length ?? 0);
	const totalClipDuration = plan.clips.reduce(
		(total, clip) => total + clip.sourceEnd - clip.sourceStart,
		0,
	);
	return {
		success: true,
		message: `Previewed EditPlan with ${plan.clips.length} clip(s).`,
		data: {
			valid: true,
			revision: state.revision,
			summary: {
				sourceMediaId: plan.sourceMediaId,
				targetDuration: plan.target.durationSec,
				totalClipDuration,
				aspectRatio: plan.target.aspectRatio,
				clipCount: plan.clips.length,
				captionCount: plan.captions?.length ?? 0,
				audioCount,
				transitionCount: plan.transitions?.length ?? 0,
				willReplaceTimeline: true,
			},
			clips: plan.clips.map((clip) => ({
				id: clip.id,
				sourceStart: clip.sourceStart,
				sourceEnd: clip.sourceEnd,
				timelineStart: clip.timelineStart,
				duration: clip.sourceEnd - clip.sourceStart,
				reason: clip.reason,
				...(clip.fit ? { fit: clip.fit } : {}),
			})),
		},
	};
}

function requireExportFormat(value: string): ExecutorExportFormat {
	if (value === "mp4" || value === "webm") return value;
	throw new Error("--format must be mp4 or webm");
}

function requireExportQuality(value: string): ExecutorExportQuality {
	if (
		value === "low" ||
		value === "medium" ||
		value === "high" ||
		value === "very_high"
	) {
		return value;
	}
	throw new Error("--quality must be low, medium, high, or very_high");
}

async function localFileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if ((error as { code?: string }).code === "ENOENT") return false;
		throw error;
	}
}

function exportBytesToBuffer(bytes: ArrayBuffer | Uint8Array): Buffer {
	if (bytes instanceof ArrayBuffer) {
		return Buffer.from(bytes);
	}
	return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

async function runExportProject({
	state,
	args,
	exportProject,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	exportProject: ExecutorExportProject;
}) {
	const parsed = exportProjectArgsSchema.parse(args);
	const format = requireExportFormat(parsed.format);
	const quality = requireExportQuality(parsed.quality);
	if (!isAbsolute(parsed.outputFile)) {
		throw new Error("--output-file must be an absolute path");
	}
	if (
		!parsed.overwrite &&
		(await localFileExists(parsed.outputFile))
	) {
		throw new Error("Output file already exists. Set overwrite=true to replace it.");
	}

	const totalDuration = calculateTotalDuration({ tracks: state.tracks });
	if (state.tracks.length === 0 || totalDuration <= 0) {
		throw new Error("Cannot export an empty timeline.");
	}

	const exported = await exportProject({
		state,
		format,
		quality,
		includeAudio: parsed.includeAudio,
	});
	const bytes = exportBytesToBuffer(exported);
	if (bytes.byteLength <= 0) {
		throw new Error("Local exporter returned an empty file.");
	}
	await writeFile(parsed.outputFile, bytes);

	return {
		success: true,
		message: `Exported ${format} to ${parsed.outputFile}`,
		data: {
			outputFile: parsed.outputFile,
			byteLength: bytes.byteLength,
			format,
			includeAudio: parsed.includeAudio,
			revision: state.revision,
			totalDuration,
		},
	};
}

function timelineVerificationActuals({ state }: { state: ExecutorProjectState }) {
	const mediaIds = new Set<string>();
	let clipCount = 0;
	let captionCount = 0;
	let audioCount = 0;

	for (const track of state.tracks) {
		for (const element of track.elements) {
			if ("mediaId" in element && typeof element.mediaId === "string") {
				mediaIds.add(element.mediaId);
			}
			if (track.type === "video" && element.type === "video") {
				clipCount += 1;
			}
			if (track.type === "text" && element.type === "text") {
				captionCount += 1;
			}
			if (track.type === "audio" && element.type === "audio") {
				audioCount += 1;
			}
		}
	}

	return {
		totalDuration: calculateTotalDuration({ tracks: state.tracks }),
		trackCount: state.tracks.length,
		clipCount,
		captionCount,
		audioCount,
		mediaIds: [...mediaIds].sort(),
	};
}

function arraysEqual(left: string[], right: string[]): boolean {
	if (left.length !== right.length) return false;
	return left.every((value, index) => value === right[index]);
}

function runVerifyTimeline({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = verifyTimelineArgsSchema.parse(args);
	const expected = parsed.verification;
	const actual = timelineVerificationActuals({ state });
	const failures: Array<{
		field: string;
		expected: number | string[];
		actual: number | string[];
	}> = [];

	for (const field of [
		"totalDuration",
		"trackCount",
		"clipCount",
		"captionCount",
		"audioCount",
	] as const) {
		if (expected[field] !== undefined && actual[field] !== expected[field]) {
			failures.push({
				field,
				expected: expected[field],
				actual: actual[field],
			});
		}
	}
	if (expected.mediaIds !== undefined) {
		const expectedMediaIds = [...expected.mediaIds].sort();
		if (!arraysEqual(expectedMediaIds, actual.mediaIds)) {
			failures.push({
				field: "mediaIds",
				expected: expectedMediaIds,
				actual: actual.mediaIds,
			});
		}
	}

	if (failures.length > 0) {
		return {
			success: false,
			message: `Timeline verification failed: ${failures.map((failure) => failure.field).join(", ")}`,
			data: { failures, actual },
		};
	}
	return {
		success: true,
		message: "Timeline verification passed.",
		data: { failures: [], actual },
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
	const mediaAssets = await toMediaAssets(state.mediaAssets);
	const result = applyEditPlanToEditor({
		plan: parsed.plan,
		projectId: state.project.id,
		replaceExisting: parsed.replaceExisting,
		editor: {
			media: {
				getAssets: () => mediaAssets,
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
	const mediaAssets = await toMediaAssets(state.mediaAssets);
	const result = applyNarratedRemixPlanToEditor({
		plan: parsed.plan,
		projectId: state.project.id,
		replaceExisting: parsed.replaceExisting,
		editor: {
			media: {
				getAssets: () => mediaAssets,
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
	const mediaAssets = await toMediaAssets(state.mediaAssets);

	const result = createTextBackgroundEffect({
		sourceMediaId: parsed.sourceMediaId,
		derivedAssetId: parsed.derivedAssetId,
		content: parsed.content,
		startTime: parsed.startTime,
		duration: parsed.duration,
		mediaAssets,
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
	const mediaAssets = await toMediaAssets(state.mediaAssets);

	const result = createHumanPipEffect({
		foregroundMediaId: parsed.foregroundMediaId,
		backgroundMediaId: parsed.backgroundMediaId,
		derivedAssetId: parsed.derivedAssetId,
		placement: requireHumanPipPlacement(parsed.placement),
		scale: parsed.scale,
		startTime: parsed.startTime,
		duration: parsed.duration,
		mediaAssets,
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

function requireExecutorMediaAsset({
	state,
	mediaId,
	expectedType,
}: {
	state: ExecutorProjectState;
	mediaId: string;
	expectedType: ExecutorMediaAsset["type"];
}): ExecutorMediaAsset {
	const mediaAsset = state.mediaAssets.find((asset) => asset.id === mediaId);
	if (!mediaAsset) {
		throw new Error(`Media asset '${mediaId}' not found`);
	}
	if (mediaAsset.type !== expectedType) {
		throw new Error(
			`Media asset '${mediaAsset.name}' is type '${mediaAsset.type}', expected ${expectedType}`,
		);
	}
	return mediaAsset;
}

function digitalHumanFileName({ taskId }: { taskId: string }): string {
	const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, "-");
	return `digital-human-${safeTaskId}.mp4`;
}

async function runGenerateDigitalHuman({
	state,
	args,
	env,
	generateDigitalHuman,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	env: Record<string, string | undefined>;
	generateDigitalHuman: ExecutorGenerateDigitalHuman;
}) {
	const parsed = generateDigitalHumanArgsSchema.parse(args);
	const apiKey = env.RUNNINGHUB_API_KEY;
	if (!apiKey) {
		throw new Error("RUNNINGHUB_API_KEY is required");
	}
	const imageAsset = requireExecutorMediaAsset({
		state,
		mediaId: parsed.imageMediaId,
		expectedType: "image",
	});
	const audioAsset = requireExecutorMediaAsset({
		state,
		mediaId: parsed.audioMediaId,
		expectedType: "audio",
	});
	const request: DigitalHumanGenerationRequest = {
		imageMediaId: parsed.imageMediaId,
		audioMediaId: parsed.audioMediaId,
		scriptText: parsed.scriptText,
		motionPrompt: parsed.motionPrompt,
		width: parsed.width,
		height: parsed.height,
		fps: parsed.fps,
	};
	const generated = await generateDigitalHuman({
		apiKey,
		imageAsset,
		audioAsset,
		request,
	});
	if (generated.videoBytes.byteLength <= 0) {
		throw new Error("RunningHub returned an empty digital human video");
	}
	const mimeType = generated.mimeType || "video/mp4";
	if (!mimeType.startsWith("video/")) {
		throw new Error(`RunningHub returned unsupported video MIME type: ${mimeType}`);
	}

	const mediaId = generateUUID();
	const name = digitalHumanFileName({ taskId: generated.taskId });
	const mediaPath = join(
		mediaDirectory({ projectId: state.project.id }),
		mediaId,
	);
	await writeFile(mediaPath, generated.videoBytes);
	const asset: ExecutorMediaAsset = {
		id: mediaId,
		name,
		type: "video",
		mimeType,
		duration: generated.duration,
		width: parsed.width,
		height: parsed.height,
		size: generated.videoBytes.byteLength,
		lastModified: Date.now(),
		path: mediaPath,
	};
	state.mediaAssets = [...state.mediaAssets, asset];
	await saveProjectState({ state });
	return {
		success: true,
		message: `Generated digital human video '${name}'`,
		data: {
			mediaId,
			taskId: generated.taskId,
			provider: RUNNINGHUB_DIGITAL_HUMAN_PROVIDER_ID,
			duration: generated.duration,
			name,
		},
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

type InspectVideoRange = typeof inspectVideoRangeWithNodeRuntime;

async function runBuildVisualContext({
	state,
	args,
	inspectVideoRange,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	inspectVideoRange: InspectVideoRange;
}) {
	const parsed = buildVisualContextArgsSchema.parse(args);
	const mediaAsset = state.mediaAssets.find(
		(asset) => asset.id === parsed.mediaId,
	);

	if (!mediaAsset) {
		return {
			success: false,
			message: `Media asset '${parsed.mediaId}' not found`,
		};
	}
	if (mediaAsset.type !== "video") {
		return {
			success: false,
			message: `Media asset '${mediaAsset.name}' is type '${mediaAsset.type}', expected video`,
		};
	}

	const context = await buildVisualContextWithInspector({
		mediaAsset: {
			id: mediaAsset.id,
			name: mediaAsset.name,
			type: mediaAsset.type,
			durationSeconds: mediaAsset.duration,
			width: mediaAsset.width,
			height: mediaAsset.height,
			path: mediaAsset.path,
		},
		targetAspectRatio: parsed.targetAspectRatio,
		outputDirectory: join(
			projectDirectory({ projectId: state.project.id }),
			"visual-context",
		),
		inspectRange: inspectVideoRange,
	});

	return {
		success: true,
		message: `Built VisualContext for '${mediaAsset.name}'`,
		data: context,
	};
}

async function runInspectVideoRange({
	state,
	args,
	inspectVideoRange,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	inspectVideoRange: InspectVideoRange;
}) {
	const parsed = inspectVideoRangeArgsSchema.parse(args);
	const mediaAsset = state.mediaAssets.find(
		(asset) => asset.id === parsed.mediaId,
	);

	if (!mediaAsset) {
		return {
			success: false,
			message: `Media asset '${parsed.mediaId}' not found`,
		};
	}
	if (mediaAsset.type !== "video") {
		return {
			success: false,
			message: `Media asset '${mediaAsset.name}' is type '${mediaAsset.type}', expected video`,
		};
	}

	const result = await inspectVideoRange({
		mediaAsset: {
			id: mediaAsset.id,
			name: mediaAsset.name,
			type: mediaAsset.type,
			durationSeconds: mediaAsset.duration,
			path: mediaAsset.path,
		},
		startSeconds: parsed.startSeconds,
		endSeconds: parsed.endSeconds,
		frameCount: parsed.frameCount,
		outputDirectory: join(
			projectDirectory({ projectId: state.project.id }),
			"inspect",
		),
	});

	return {
		success: true,
		message: `Inspected video range for '${mediaAsset.name}'`,
		data: result,
	};
}

function roundTimelineSeconds(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function isVisibleVideoElement(element: TimelineElement): element is VideoElement {
	return (
		element.type === "video" &&
		!(
			("muted" in element && element.muted) ||
			("hidden" in element && element.hidden)
		)
	);
}

async function runBuildPostCutCaptions({
	state,
	args,
	transcribeMediaRange,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	transcribeMediaRange: ExecutorTranscribeMediaRange;
}) {
	const parsed = buildPostCutCaptionsArgsSchema.parse(args);
	const language = parseExecutorTranscriptionLanguage(parsed.language);
	const modelId = parseExecutorTranscriptionModelId(parsed.modelId);
	const clips = state.tracks
		.filter(
			(track) =>
				track.type === "video" &&
				!("muted" in track && track.muted) &&
				!("hidden" in track && track.hidden),
		)
		.flatMap((track) =>
			track.elements
				.filter(isVisibleVideoElement)
				.map((element) => ({ element, trackId: track.id })),
		)
		.sort((left, right) => left.element.startTime - right.element.startTime);

	if (clips.length === 0) {
		return {
			success: false,
			message:
				"No unmuted edited video clips were found for post-cut caption transcription.",
		};
	}

	const captions: Array<{
		text: string;
		startTime: number;
		duration: number;
	}> = [];
	const trace: Array<{
		mediaId: string;
		timelineStart: number;
		sourceStart: number;
		sourceEnd: number;
		captionCount: number;
	}> = [];

	for (const { element } of clips) {
		const mediaId = element.mediaId;
		const mediaAsset = state.mediaAssets.find((asset) => asset.id === mediaId);
		if (!mediaAsset) {
			return {
				success: false,
				message: `Media asset '${mediaId}' not found`,
			};
		}
		if (mediaAsset.type !== "video" && mediaAsset.type !== "audio") {
			return {
				success: false,
				message: `Media asset '${mediaAsset.name}' is type '${mediaAsset.type}', expected video or audio`,
			};
		}
		if (element.trimEnd <= element.trimStart) {
			return {
				success: false,
				message: `Timeline video element '${element.id}' has an invalid trim range.`,
			};
		}

		const beforeCount = captions.length;
		const result = await transcribeMediaRange({
			mediaAsset: {
				id: mediaAsset.id,
				name: mediaAsset.name,
				path: mediaAsset.path,
				duration: mediaAsset.duration,
			},
			language,
			modelId,
			range: { start: element.trimStart, end: element.trimEnd },
		});

		for (const segment of result.segments) {
			const text = segment.text.trim();
			const relativeStart = Math.max(0, segment.start);
			const relativeEnd = Math.min(element.duration, segment.end);
			const startTime = roundTimelineSeconds(element.startTime + relativeStart);
			const endTime = roundTimelineSeconds(element.startTime + relativeEnd);
			const duration = roundTimelineSeconds(endTime - startTime);
			if (!text || duration <= 0) continue;
			captions.push({
				text,
				startTime,
				duration,
			});
		}

		trace.push({
			mediaId,
			timelineStart: element.startTime,
			sourceStart: element.trimStart,
			sourceEnd: element.trimEnd,
			captionCount: captions.length - beforeCount,
		});
	}

	return {
		success: true,
		message: `Built ${captions.length} post-cut caption(s) from ${clips.length} video clip(s).`,
		data: {
			source: "edited_video_clip_audio",
			language,
			modelId,
			captionStyle: {
				preset: "talking-head-pop",
				position: "lower-safe",
			},
			captions,
			trace,
		},
	};
}

function runGetTimelineState({ state }: { state: ExecutorProjectState }) {
	const duration = calculateTotalDuration({ tracks: state.tracks });
	return {
		success: true,
		message: `Timeline has ${state.tracks.length} track(s), total duration: ${duration.toFixed(2)}s`,
		data: {
			revision: state.revision,
			tracks: state.tracks.map(serializeTrack),
			totalDuration: duration,
			derivedAssets: state.derivedAssets,
		},
	};
}

async function executeCommand({
	state,
	command,
	lastStatus,
	transcribeMedia,
	probeAudio,
	transcribeMediaRange,
	inspectVideoRange,
	env,
	generateDigitalHuman,
	exportProject,
}: {
	state: ExecutorProjectState;
	command: ExecutorCommand;
	lastStatus?: ExecutorStatus | null;
	transcribeMedia: ExecutorTranscribeMedia;
	probeAudio: ProbeAudio;
	transcribeMediaRange: ExecutorTranscribeMediaRange;
	inspectVideoRange: InspectVideoRange;
	env: Record<string, string | undefined>;
	generateDigitalHuman: ExecutorGenerateDigitalHuman;
	exportProject: ExecutorExportProject;
}) {
	if (command.tool === "get_project_info") {
		return runGetProjectInfo({ state, lastStatus });
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
	if (command.tool === "build_visual_context") {
		return runBuildVisualContext({
			state,
			args: command.args,
			inspectVideoRange,
		});
	}
	if (command.tool === "inspect_video_range") {
		return runInspectVideoRange({
			state,
			args: command.args,
			inspectVideoRange,
		});
	}
	if (command.tool === "build_post_cut_captions") {
		return runBuildPostCutCaptions({
			state,
			args: command.args,
			transcribeMediaRange,
		});
	}
	if (command.tool === "validate_edit_plan") {
		return runValidateEditPlan({ state, args: command.args });
	}
	if (command.tool === "preview_edit_plan") {
		return runPreviewEditPlan({ state, args: command.args });
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
	if (command.tool === "generate_digital_human") {
		return runGenerateDigitalHuman({
			state,
			args: command.args,
			env,
			generateDigitalHuman,
		});
	}
	if (command.tool === "export_project") {
		return runExportProject({ state, args: command.args, exportProject });
	}
	if (command.tool === "verify_timeline") {
		return runVerifyTimeline({ state, args: command.args });
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

const defaultGenerateDigitalHuman: ExecutorGenerateDigitalHuman = ({
	apiKey,
	imageAsset,
	audioAsset,
	request,
}) =>
	generateRunningHubDigitalHumanFromExecutorMedia({
		apiKey,
		imageAsset,
		audioAsset,
		request,
	});

const defaultExportProject: ExecutorExportProject = async () => {
	throw new Error(
		"Local executor export requires a Node-compatible renderer. Browser download export is not supported by codex-bridge export.",
	);
};

export async function executeCodexExecutorEnvelope({
	envelope,
	transcribeMedia = transcribeMediaWithNodeRuntime,
	probeAudio = defaultBuildVideoContextProbeAudio,
	transcribeMediaRange = transcribeMediaRangeWithNodeRuntime,
	inspectVideoRange = inspectVideoRangeWithNodeRuntime,
	env = process.env,
	generateDigitalHuman = defaultGenerateDigitalHuman,
	exportProject = defaultExportProject,
}: {
	envelope: unknown;
	transcribeMedia?: ExecutorTranscribeMedia;
	probeAudio?: ProbeAudio;
	transcribeMediaRange?: ExecutorTranscribeMediaRange;
	inspectVideoRange?: InspectVideoRange;
	env?: Record<string, string | undefined>;
	generateDigitalHuman?: ExecutorGenerateDigitalHuman;
	exportProject?: ExecutorExportProject;
}) {
	const parsedEnvelope = envelopeSchema.parse(envelope);
	const state = await loadProjectState({ projectId: parsedEnvelope.projectId });
	const results = [];

	for (const command of parsedEnvelope.commands) {
		const previousStatus = await readProjectStatusOrNull({
			projectId: parsedEnvelope.projectId,
		});
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
				lastStatus: previousStatus,
				transcribeMedia,
				probeAudio,
				transcribeMediaRange,
					inspectVideoRange,
					env,
					generateDigitalHuman,
					exportProject,
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
