import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import type { Dirent } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { applyEditPlanToEditor } from "@/lib/agent-bridge/edit-plan/apply";
import { validateEditPlan } from "@/lib/agent-bridge/edit-plan/validate";
import { auditCaptions } from "@/lib/agent-bridge/caption-quality";
import { KEYFRAME_INTERPOLATIONS } from "@/lib/timeline/keyframe-values";
import {
	EditPlanCaptionStyleSchema,
	EditPlanTransitionTypeSchema,
	type EditPlanCaptionStyle,
} from "@/lib/agent-bridge/edit-plan/schema";
import { buildPostCutCaptionEntries } from "@/lib/agent-bridge/edit-plan/caption-chunking";
import { resolveCaptionStylePreset } from "@/lib/agent-bridge/edit-plan/text-presets";
import { applyNarratedRemixPlanToEditor } from "@/lib/agent-bridge/narrated-remix/apply";
import {
	type ProbeAudio,
	buildVideoContextWithTranscriber,
} from "@/lib/codex-executor/video-context";
import { buildVisualContextWithInspector } from "@/lib/codex-executor/visual-context";
import { inspectVideoRange as inspectVideoRangeWithNodeRuntime } from "@/lib/codex-executor/video-range-inspection";
import { inspectTimelineWithNodeRenderer } from "@/lib/codex-executor/timeline-inspection";
import { buildVideoQualityReport } from "@/lib/codex-executor/video-quality-report";
import { buildCaptionDiagnosticsReport } from "@/lib/caption-diagnostics/caption-diagnostics";
import type { TBackground } from "@/types/project";
import {
	addTextElements,
	insertClips,
	moveClips,
	removeClips,
	rippleDeleteRanges,
	setClipProperties,
	setKeyframes,
	splitClip,
} from "@/lib/codex-executor/timeline-mutations";
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
	ConfirmedSetupSchema,
	UpdateProjectPreferencesArgsSchema,
	applyCaptionPreferencesToTextRaw,
	applyConfirmedSetupPatch,
	resolveCaptionLanguageForContract,
	resolveCaptionStyleForContract,
	resolveExportPreferencesForContract,
	type ConfirmedSetup,
} from "@/lib/codex-executor/setup-contract";
import { assertAsrProviderResult } from "@/lib/transcription/asr-provider-contract";
import {
	type RunningHubExecutorMediaAsset,
	generateRunningHubDigitalHumanFromExecutorMedia,
	type RunningHubGeneratedDigitalHuman,
} from "@/lib/ai/providers/runninghub-digital-human-server";
import { RUNNINGHUB_DIGITAL_HUMAN_PROVIDER_ID } from "@/lib/ai/providers/runninghub-digital-human";
import {
	generateRunningHubVoiceCloneFromReferenceAudioPath,
	type RunningHubGeneratedVoiceClone,
} from "@/lib/ai/providers/runninghub-voice-clone-server";
import { RUNNINGHUB_VOICE_CLONE_PROVIDER_ID } from "@/lib/ai/providers/runninghub-voice-clone";
import {
	generateRunningHubVoiceDesignFromRequest,
	type RunningHubGeneratedVoiceDesign,
} from "@/lib/ai/providers/runninghub-voice-design-server";
import { RUNNINGHUB_VOICE_DESIGN_PROVIDER_ID } from "@/lib/ai/providers/runninghub-voice-design";
import type {
	DigitalHumanGenerationRequest,
	VoiceCloneRequest,
	VoiceDesignRequest,
} from "@/lib/ai/providers";
import {
	DEFAULT_TRANSCRIPTION_MODEL,
	TRANSCRIPTION_LANGUAGES,
	TRANSCRIPTION_MODELS,
} from "@/constants/transcription-constants";
import { buildTtsSpokenScript } from "@/lib/tts/spoken-script";
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
	removeTransitionFromTrack,
} from "@/lib/timeline/transition-utils";
import { buildEmptyTrack } from "@/lib/timeline/track-utils";
import { calculateTotalDuration } from "@/lib/timeline";
import type { MediaAsset } from "@/types/assets";
import type { DerivedAsset, ProjectCover } from "@/types/project";
import type {
	AudioElement,
	CreateTimelineElement,
	ImageElement,
	PositionKeyframe,
	ScalarKeyframe,
	TextElement,
	TimelineElement,
	TimelineElementKeyframes,
	TimelineTrack,
	TrackType,
	TrackTransition,
	TransitionType,
	VideoElement,
	VideoTrack,
} from "@/types/timeline";
import { generateUUID } from "@/utils/id";

const execFileAsync = promisify(execFile);

type ExecutorToolName =
	| "get_project_info"
	| "update_project_settings"
	| "update_project_preferences"
	| "list_media_assets"
	| "import_media_file"
	| "set_project_cover"
	| "clear_project_cover"
	| "transcribe_media"
	| "build_video_context"
	| "build_visual_context"
	| "inspect_video_range"
	| "inspect_timeline"
	| "build_video_quality_report"
	| "get_transcript"
	| "build_caption_diagnostics"
	| "build_post_cut_captions"
	| "add_texts"
	| "add_captions"
	| "list_models"
	| "set_keyframes"
	| "add_transitions"
	| "update_transition"
	| "remove_transition"
	| "search_media"
	| "validate_edit_plan"
	| "preview_edit_plan"
	| "apply_edit_plan"
	| "apply_narrated_remix_plan"
	| "insert_clips"
	| "move_clips"
	| "remove_clips"
	| "split_clip"
	| "set_clip_properties"
	| "ripple_delete_ranges"
	| "create_text_background_effect"
	| "create_human_pip_effect"
	| "generate_digital_human"
	| "generate_runninghub_voice_design"
	| "generate_runninghub_voice_clone"
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
	fps?: number;
	size: number;
	lastModified: number;
	path: string;
	spokenScript?: ExecutorSpokenScript;
}

interface ExecutorSpokenScript {
	source: "tts";
	text: string;
	captions: string[];
	protectedTerms?: string[];
	provider?:
		| "imported-tts"
		| "runninghub-voice-design"
		| "runninghub-voice-clone";
	providerTaskId?: string;
}

export interface ExecutorProjectState {
	version: 1;
	revision: number;
	browserBridgeToken: string;
	project: {
		id: string;
		name: string;
		settings: {
			canvasSize: { width: number; height: number };
			fps: number;
			background: TBackground;
		};
		createdAt: string;
		updatedAt: string;
	};
	mediaAssets: ExecutorMediaAsset[];
	derivedAssets: DerivedAsset[];
	cover?: ProjectCover;
	tracks: TimelineTrack[];
	confirmedSetup?: ConfirmedSetup;
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

const DEFAULT_POST_CUT_CAPTION_STYLE = {
	preset: "talking-head-pop",
	position: "lower-safe",
} satisfies EditPlanCaptionStyle;

const commandSchema = z
	.object({
		id: z.string().min(1),
		tool: z.enum([
			"get_project_info",
			"update_project_settings",
			"update_project_preferences",
			"list_media_assets",
			"import_media_file",
			"set_project_cover",
			"clear_project_cover",
			"transcribe_media",
			"build_video_context",
			"build_visual_context",
			"inspect_video_range",
			"inspect_timeline",
			"build_video_quality_report",
			"get_transcript",
			"build_caption_diagnostics",
			"build_post_cut_captions",
			"add_texts",
			"add_captions",
			"list_models",
			"set_keyframes",
			"add_transitions",
			"update_transition",
			"remove_transition",
			"search_media",
			"validate_edit_plan",
			"preview_edit_plan",
			"apply_edit_plan",
			"apply_narrated_remix_plan",
			"insert_clips",
			"move_clips",
			"remove_clips",
			"split_clip",
			"set_clip_properties",
			"ripple_delete_ranges",
			"create_text_background_effect",
			"create_human_pip_effect",
			"generate_digital_human",
			"generate_runninghub_voice_design",
			"generate_runninghub_voice_clone",
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
		spokenScript: z
			.object({
				source: z.literal("tts"),
				text: z.string().min(1),
				captions: z.array(z.string().min(1)).min(1),
				protectedTerms: z.array(z.string().min(1)).optional(),
				provider: z
					.enum([
						"imported-tts",
						"runninghub-voice-design",
						"runninghub-voice-clone",
					])
					.optional(),
				providerTaskId: z.string().min(1).optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

const setProjectCoverArgsSchema = z
	.object({
		mediaId: z.string().min(1),
		title: z.string().trim().min(1).optional(),
		prompt: z.string().trim().min(1).optional(),
		stylePreset: z.string().trim().min(1).optional(),
		source: z.enum(["media_asset", "timeline_frame", "generated"]).optional(),
	})
	.strict();

const updateProjectSettingsArgsSchema = z
	.object({
		width: z.number().positive().optional(),
		height: z.number().positive().optional(),
		fps: z.number().positive().optional(),
		backgroundColor: z.string().min(1).optional(),
		background: z
			.discriminatedUnion("type", [
				z
					.object({
						type: z.literal("color"),
						color: z.string().min(1),
					})
					.strict(),
				z
					.object({
						type: z.literal("blur"),
						blurIntensity: z.number().nonnegative(),
					})
					.strict(),
			])
			.optional(),
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

const inspectTimelineArgsSchema = z
	.object({
		startTime: z.number().nonnegative(),
		endTime: z.number().nonnegative().optional(),
		frameCount: z.number().int().min(1).max(16).optional(),
	})
	.strict();

const videoQualityTitleRubricSchema = z
	.object({
		platform: z.enum(["youtube", "tiktok", "instagram", "linkedin", "generic"]),
		primaryKeyword: z.string().trim().min(1).optional(),
	})
	.strict();

const videoQualityExportedFileSchema = z
	.object({
		outputFile: z.string().min(1),
		format: z.enum(["mp4", "webm"]),
		includeAudio: z.boolean(),
	})
	.strict();

const videoQualityReportArgsSchema = z
	.object({
		plan: z.unknown(),
		inspection: z
			.object({
				startTime: z.number().nonnegative(),
				endTime: z.number().nonnegative(),
				frameCount: z.number().int().min(1).max(16),
			})
			.strict()
			.refine((value) => value.endTime >= value.startTime, {
				message:
					"inspection endTime must be greater than or equal to startTime.",
			}),
		titleRubric: videoQualityTitleRubricSchema.optional(),
		exportedFile: videoQualityExportedFileSchema.optional(),
	})
	.strict();

const transformSchema = z
	.object({
		scale: z.number().positive(),
		position: z
			.object({
				x: z.number(),
				y: z.number(),
			})
			.strict(),
		rotate: z.number(),
		flipX: z.boolean().optional(),
		flipY: z.boolean().optional(),
	})
	.strict();

const buildPostCutCaptionsArgsSchema = z
	.object({
		language: z.unknown(),
		modelId: z.unknown(),
		captionStyle: EditPlanCaptionStyleSchema.optional(),
	})
	.strict();

const buildCaptionDiagnosticsArgsSchema = z
	.object({
		language: z.unknown(),
		modelId: z.unknown(),
		captionStyle: EditPlanCaptionStyleSchema,
	})
	.strict();

const textStrokeSchema = z
	.object({
		color: z.string().min(1),
		width: z.number().positive(),
	})
	.strict();

const textShadowSchema = z
	.object({
		color: z.string().min(1),
		offsetX: z.number(),
		offsetY: z.number(),
		blur: z.number().nonnegative(),
	})
	.strict();

const addTextEntrySchema = z
	.object({
		startTime: z.number().nonnegative(),
		duration: z.number().positive(),
		content: z.string().min(1),
		name: z.string().min(1).optional(),
		transform: transformSchema.optional(),
		opacity: z.number().min(0).max(1).optional(),
		fontSize: z.number().positive().optional(),
		fontFamily: z.string().min(1).optional(),
		color: z.string().min(1).optional(),
		backgroundColor: z.string().min(1).optional(),
		textAlign: z.enum(["left", "center", "right"]).optional(),
		fontWeight: z.enum(["normal", "bold"]).optional(),
		fontStyle: z.enum(["normal", "italic"]).optional(),
		textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
		boxWidth: z.number().positive().optional(),
		stroke: textStrokeSchema.optional(),
		shadow: textShadowSchema.optional(),
		backgroundOpacity: z.number().min(0).max(1).optional(),
		backgroundPaddingX: z.number().nonnegative().optional(),
		backgroundPaddingY: z.number().nonnegative().optional(),
		backgroundBorderRadius: z.number().nonnegative().optional(),
	})
	.strict();

const addTextsArgsSchema = z
	.object({
		trackId: z.string().min(1).optional(),
		entries: z.array(addTextEntrySchema).min(1),
	})
	.strict();

const addCaptionsArgsSchema = z
	.object({
		language: z.unknown(),
		modelId: z.unknown(),
		captionStyle: EditPlanCaptionStyleSchema.optional(),
	})
	.strict();

const listModelsArgsSchema = z
	.object({
		type: z.enum(["transcription", "digital_human", "voice"]).optional(),
	})
	.strict();

const getTranscriptArgsSchema = z
	.object({
		granularity: z.enum(["segment", "word"]),
		language: z.unknown(),
		modelId: z.unknown(),
		startTime: z.number().nonnegative().optional(),
		endTime: z.number().nonnegative().optional(),
		includeFrames: z.boolean().optional(),
	})
	.strict();

const getTimelineStateArgsSchema = z
	.object({
		startTime: z.number().nonnegative().optional(),
		endTime: z.number().nonnegative().optional(),
		includeFrames: z.boolean().optional(),
		includeReferencedMedia: z.boolean().optional(),
	})
	.strict();

const insertClipSchema = z
	.object({
		mediaId: z.string().min(1),
		duration: z.number().positive(),
		trimStart: z.number().nonnegative().optional(),
		trimEnd: z.number().nonnegative().optional(),
		playbackRate: z.number().positive().optional(),
		name: z.string().min(1).optional(),
	})
	.strict();

const insertClipsArgsSchema = z
	.object({
		trackId: z.string().min(1),
		atTime: z.number().nonnegative(),
		clips: z.array(insertClipSchema).min(1),
	})
	.strict();

const moveClipsArgsSchema = z
	.object({
		moves: z
			.array(
				z
					.object({
						elementId: z.string().min(1),
						toTrackId: z.string().min(1).optional(),
						startTime: z.number().nonnegative().optional(),
					})
					.strict()
					.refine(
						(value) =>
							value.toTrackId !== undefined || value.startTime !== undefined,
						"move requires toTrackId or startTime",
					),
			)
			.min(1),
	})
	.strict();

const removeClipsArgsSchema = z
	.object({
		elementIds: z.array(z.string().min(1)).min(1),
	})
	.strict();

const splitClipArgsSchema = z
	.object({
		elementId: z.string().min(1),
		atTime: z.number().nonnegative(),
	})
	.strict();

const setClipPropertiesArgsSchema = z
	.object({
		elementId: z.string().min(1).optional(),
		elementIds: z.array(z.string().min(1)).min(1).optional(),
		properties: z
			.object({
				duration: z.number().positive().optional(),
				trimStart: z.number().nonnegative().optional(),
				trimEnd: z.number().nonnegative().optional(),
				opacity: z.number().min(0).max(1).optional(),
				volume: z.number().min(0).max(1).optional(),
				muted: z.boolean().optional(),
				hidden: z.boolean().optional(),
				playbackRate: z.number().positive().optional(),
				transform: transformSchema.optional(),
				content: z.string().optional(),
				fontSize: z.number().positive().optional(),
				fontFamily: z.string().min(1).optional(),
				color: z.string().min(1).optional(),
				backgroundColor: z.string().min(1).optional(),
				textAlign: z.enum(["left", "center", "right"]).optional(),
				fontWeight: z.enum(["normal", "bold"]).optional(),
				fontStyle: z.enum(["normal", "italic"]).optional(),
				textDecoration: z
					.enum(["none", "underline", "line-through"])
					.optional(),
			})
			.strict()
			.refine((value) => Object.keys(value).length > 0, {
				message: "properties must contain at least one field",
			}),
	})
	.strict()
	.refine(
		(value) =>
			(value.elementId !== undefined) !== (value.elementIds !== undefined),
		{
			message: "set_clip_properties requires elementId or elementIds",
		},
	);

const keyframeInterpolationSchema = z.enum(KEYFRAME_INTERPOLATIONS);
const scalarKeyframeSchema = z
	.object({
		time: z.number().nonnegative(),
		value: z.number(),
		interpolation: keyframeInterpolationSchema.optional(),
	})
	.strict();
const positionKeyframeSchema = z
	.object({
		time: z.number().nonnegative(),
		value: z
			.object({
				x: z.number(),
				y: z.number(),
			})
			.strict(),
		interpolation: keyframeInterpolationSchema.optional(),
	})
	.strict();
const keyframePropertySchema = z.enum([
	"opacity",
	"transform.position",
	"transform.scale",
	"transform.rotate",
]);
const setKeyframesArgsSchema = z
	.object({
		elementId: z.string().min(1),
		property: keyframePropertySchema,
		keyframes: z.array(z.union([scalarKeyframeSchema, positionKeyframeSchema])),
	})
	.strict();

const addTransitionEntrySchema = z
	.object({
		trackId: z.string().min(1),
		fromElementId: z.string().min(1),
		toElementId: z.string().min(1),
		type: EditPlanTransitionTypeSchema,
		duration: z.number().positive(),
	})
	.strict();

const addTransitionsArgsSchema = z
	.object({
		entries: z.array(addTransitionEntrySchema).min(1),
	})
	.strict();

const updateTransitionArgsSchema = z
	.object({
		trackId: z.string().min(1),
		transitionId: z.string().min(1),
		type: EditPlanTransitionTypeSchema.optional(),
		duration: z.number().positive().optional(),
	})
	.strict()
	.refine(
		(value) => value.type !== undefined || value.duration !== undefined,
		"type or duration is required",
	);

const removeTransitionArgsSchema = z
	.object({
		trackId: z.string().min(1),
		transitionId: z.string().min(1),
	})
	.strict();

const searchMediaArgsSchema = z
	.object({
		query: z.string().trim().min(1),
		scope: z.enum(["metadata", "spoken", "both"]).optional(),
		mediaId: z.string().min(1).optional(),
		limit: z.number().int().min(1).max(50).optional(),
	})
	.strict();

const rippleDeleteRangesArgsSchema = z
	.object({
		scope: z.discriminatedUnion("type", [
			z.object({ type: z.literal("timeline") }).strict(),
			z
				.object({
					type: z.literal("track"),
					trackId: z.string().min(1),
				})
				.strict(),
			z
				.object({
					type: z.literal("element"),
					elementId: z.string().min(1),
				})
				.strict(),
		]),
		ranges: z
			.array(
				z
					.tuple([z.number().nonnegative(), z.number().nonnegative()])
					.refine(([start, end]) => end > start, {
						message: "range end must be greater than range start",
					}),
			)
			.min(1),
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

const generateVoiceDesignArgsSchema = z
	.object({
		text: z.string().trim().min(1),
		emotionPrompt: z.string().trim().min(1),
		protectedTerms: z.array(z.string().trim().min(1)).optional(),
	})
	.strict();

const generateVoiceCloneArgsSchema = z
	.object({
		audioPath: z.string().trim().min(1),
		text: z.string().trim().min(1),
		protectedTerms: z.array(z.string().trim().min(1)).optional(),
	})
	.strict();

const exportProjectArgsSchema = z
	.object({
		format: z.string().min(1).optional(),
		quality: z.string().min(1).optional(),
		includeAudio: z.boolean().optional(),
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
				transitionCount: z.number().int().nonnegative().optional(),
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

export type ExecutorGenerateVoiceDesign = (params: {
	apiKey: string;
	request: VoiceDesignRequest;
}) => Promise<RunningHubGeneratedVoiceDesign>;

export type ExecutorGenerateVoiceClone = (params: {
	apiKey: string;
	referenceAudioPath: string;
	request: VoiceCloneRequest;
}) => Promise<RunningHubGeneratedVoiceClone>;

type ExecutorExportFormat = "mp4" | "webm";
type ExecutorExportQuality = "low" | "medium" | "high" | "very_high";
type ExecutorOutputProbe = {
	format: ExecutorExportFormat;
	duration: number;
	width: number;
	height: number;
	videoTrackCount: number;
	audioTrackCount: number;
};
type FfprobeStream = {
	codec_type?: unknown;
	width?: unknown;
	height?: unknown;
};

export type ExecutorExportProject = (params: {
	state: ExecutorProjectState;
	format: ExecutorExportFormat;
	quality: ExecutorExportQuality;
	includeAudio: boolean;
}) => Promise<ArrayBuffer | Uint8Array>;

export type ExecutorProbeExportedFile = (params: {
	outputFile: string;
	format: ExecutorExportFormat;
	expectedWidth: number;
	expectedHeight: number;
}) => Promise<ExecutorOutputProbe>;

function executorRoot(): string {
	return (
		process.env.CODECUT_EXECUTOR_STATE_DIR ??
		join(process.cwd(), ".codecut-executor")
	);
}

function requireSafeProjectId({ projectId }: { projectId: string }): string {
	if (
		!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(projectId) ||
		projectId === "." ||
		projectId === ".."
	) {
		throw new Error("projectId must be a safe identifier.");
	}
	return projectId;
}

function projectDirectory({ projectId }: { projectId: string }): string {
	return join(executorRoot(), "projects", requireSafeProjectId({ projectId }));
}

function projectsDirectory(): string {
	return join(executorRoot(), "projects");
}

export class ExecutorProjectNotFoundError extends Error {
	constructor(projectId: string) {
		super(`Executor project "${projectId}" was not found.`);
		this.name = "ExecutorProjectNotFoundError";
	}
}

export function isExecutorProjectNotFoundError(
	error: unknown,
): error is ExecutorProjectNotFoundError {
	return error instanceof ExecutorProjectNotFoundError;
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === code
	);
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

function transcriptCacheDirectory({
	projectId,
}: {
	projectId: string;
}): string {
	return join(projectDirectory({ projectId }), "transcripts");
}

function transcriptCachePath({
	projectId,
	mediaId,
}: {
	projectId: string;
	mediaId: string;
}): string {
	return join(transcriptCacheDirectory({ projectId }), `${mediaId}.json`);
}

async function writeJson({ path, value }: { path: string; value: unknown }) {
	await mkdir(dirname(path), { recursive: true });
	const tempPath = join(
		dirname(path),
		`.${Date.now()}.${generateUUID()}.${process.pid}.tmp`,
	);
	await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
		encoding: "utf8",
		flag: "wx",
	});
	await rename(tempPath, path);
}

async function readJson<T>({ path }: { path: string }): Promise<T> {
	const content = await readFile(path, "utf8");
	try {
		return JSON.parse(content) as T;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Invalid JSON.";
		throw new Error(`Invalid JSON file "${path}": ${message}`);
	}
}

type TranscriptCacheEntry = {
	mediaId: string;
	language: string;
	modelId: string;
	text: string;
	segments: Array<{ text: string; start: number; end: number }>;
	capabilities: unknown;
	quality: unknown;
	words?: unknown;
	updatedAt: string;
};

async function writeTranscriptCache({
	state,
	entry,
}: {
	state: ExecutorProjectState;
	entry: Omit<TranscriptCacheEntry, "updatedAt">;
}) {
	await writeJson({
		path: transcriptCachePath({
			projectId: state.project.id,
			mediaId: entry.mediaId,
		}),
		value: { ...entry, updatedAt: new Date().toISOString() },
	});
}

async function readTranscriptCacheOrNull({
	projectId,
	mediaId,
}: {
	projectId: string;
	mediaId: string;
}): Promise<TranscriptCacheEntry | null> {
	try {
		return await readJson<TranscriptCacheEntry>({
			path: transcriptCachePath({ projectId, mediaId }),
		});
	} catch {
		return null;
	}
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
		fps: asset.fps,
		sourcePath: asset.path,
		file: await fileForMediaAsset(asset),
	};
}

async function toMediaAssets(
	assets: ExecutorMediaAsset[],
): Promise<MediaAsset[]> {
	return Promise.all(assets.map(toMediaAsset));
}

function secondsToFrame(seconds: number, fps: number) {
	return Math.round(seconds * fps);
}

function elementEndTime(element: TimelineElement) {
	return element.startTime + element.duration;
}

function elementOverlapsWindow({
	element,
	startTime,
	endTime,
}: {
	element: TimelineElement;
	startTime: number;
	endTime: number;
}) {
	return element.startTime < endTime && elementEndTime(element) > startTime;
}

function trackTimeRange(track: TimelineTrack) {
	if (track.elements.length === 0) {
		return { startTime: 0, endTime: 0, duration: 0 };
	}
	const startTime = Math.min(
		...track.elements.map((element) => element.startTime),
	);
	const endTime = Math.max(...track.elements.map(elementEndTime));
	return {
		startTime,
		endTime,
		duration: endTime - startTime,
	};
}

function frameFieldsForElement({
	element,
	fps,
}: {
	element: TimelineElement;
	fps: number;
}) {
	return {
		startFrame: secondsToFrame(element.startTime, fps),
		durationFrames: secondsToFrame(element.duration, fps),
		endFrame: secondsToFrame(elementEndTime(element), fps),
		trimStartFrame: secondsToFrame(element.trimStart, fps),
		trimEndFrame: secondsToFrame(element.trimEnd, fps),
	};
}

function serializeTimelineReadbackElement({
	element,
	track,
	trackIndex,
	elementIndex,
	includeFrames,
	fps,
}: {
	element: TimelineElement;
	track: TimelineTrack;
	trackIndex: number;
	elementIndex: number;
	includeFrames: boolean;
	fps: number;
}) {
	return {
		id: element.id,
		type: element.type,
		name: element.name,
		trackId: track.id,
		trackIndex,
		index: elementIndex,
		startTime: element.startTime,
		duration: element.duration,
		endTime: elementEndTime(element),
		trimStart: element.trimStart,
		trimEnd: element.trimEnd,
		...(includeFrames ? frameFieldsForElement({ element, fps }) : {}),
		...(element.keyframes ? { keyframes: element.keyframes } : {}),
		...("content" in element ? { content: element.content } : {}),
		...("mediaId" in element ? { mediaId: element.mediaId } : {}),
		...serializeElementVisualProperties(element),
	};
}

function serializeTimelineReadbackTrack({
	track,
	trackIndex,
	startTime,
	endTime,
	includeFrames,
	fps,
}: {
	track: TimelineTrack;
	trackIndex: number;
	startTime: number;
	endTime: number;
	includeFrames: boolean;
	fps: number;
}) {
	const returnedElements = track.elements
		.map((element, elementIndex) => ({
			element: element as TimelineElement,
			elementIndex,
		}))
		.filter(({ element }) =>
			elementOverlapsWindow({ element, startTime, endTime }),
			);
		return {
		id: track.id,
		type: track.type,
		name: track.name,
		index: trackIndex,
		...("isMain" in track ? { isMain: track.isMain } : {}),
		...("muted" in track ? { muted: track.muted } : {}),
		...("hidden" in track ? { hidden: track.hidden } : {}),
		timeRange: trackTimeRange(track),
		elementCount: track.elements.length,
		returnedElementCount: returnedElements.length,
		elements: returnedElements.map(({ element, elementIndex }) =>
			serializeTimelineReadbackElement({
				element,
				track,
				trackIndex,
				elementIndex,
				includeFrames,
				fps,
			}),
		),
		...(track.type === "video" ? { transitions: track.transitions ?? [] } : {}),
	};
}

function timelineSummary({
	state,
	returnedElementCount,
}: {
	state: ExecutorProjectState;
	returnedElementCount: number;
}) {
	const trackTypeCounts: Record<TrackType, number> = {
		video: 0,
		text: 0,
		audio: 0,
		sticker: 0,
	};
	let elementCount = 0;
	let transitionCount = 0;
	for (const track of state.tracks) {
		trackTypeCounts[track.type] += 1;
		elementCount += track.elements.length;
		if (track.type === "video") {
			transitionCount += track.transitions?.length ?? 0;
		}
	}
	return {
		trackCount: state.tracks.length,
		elementCount,
		returnedElementCount,
		transitionCount,
		derivedAssetCount: state.derivedAssets.length,
		trackTypeCounts,
	};
}

function referencedMediaIds(state: ExecutorProjectState) {
	const ids = new Set<string>();
	for (const track of state.tracks) {
		for (const element of track.elements) {
			if ("mediaId" in element) {
				ids.add(element.mediaId);
			}
		}
	}
	return ids;
}

function serializeReferencedMedia(state: ExecutorProjectState) {
	const ids = referencedMediaIds(state);
	return Object.fromEntries(
		state.mediaAssets
			.filter((asset) => ids.has(asset.id))
			.map((asset) => [
				asset.id,
				{
					id: asset.id,
					name: asset.name,
					type: asset.type,
					mimeType: asset.mimeType,
					...(asset.duration !== undefined ? { duration: asset.duration } : {}),
					...(asset.width !== undefined ? { width: asset.width } : {}),
					...(asset.height !== undefined ? { height: asset.height } : {}),
					...serializeSpokenScriptSummary(asset),
				},
			]),
	);
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

function countNativeTransitions({
	state,
}: {
	state: ExecutorProjectState;
}): number {
	return state.tracks.reduce((total, track) => {
		if (track.type !== "video") return total;
		return total + (track.transitions?.length ?? 0);
	}, 0);
}

function findVideoTrackForTransition({
	state,
	trackId,
}: {
	state: ExecutorProjectState;
	trackId: string;
}): { success: true; track: VideoTrack } | { success: false; message: string } {
	const track = state.tracks.find((candidate) => candidate.id === trackId);
	if (!track) {
		return { success: false, message: `Track "${trackId}" was not found.` };
	}
	if (track.type !== "video") {
		return {
			success: false,
			message: `Track "${trackId}" is not a video track.`,
		};
	}
	return { success: true, track: track as VideoTrack };
}

function findTransitionOnTrack({
	track,
	transitionId,
}: {
	track: VideoTrack;
	transitionId: string;
}):
	| { success: true; transition: TrackTransition }
	| { success: false; message: string } {
	const transition = (track.transitions ?? []).find(
		(candidate) => candidate.id === transitionId,
	);
	if (!transition) {
		return {
			success: false,
			message: `Transition "${transitionId}" was not found.`,
		};
	}
	return { success: true, transition };
}

function validateNativeTransitionPair({
	track,
	fromElementId,
	toElementId,
	duration,
}: {
	track: VideoTrack;
	fromElementId: string;
	toElementId: string;
	duration: number;
}):
	| {
			success: true;
			fromElement: VideoElement | ImageElement;
			toElement: VideoElement | ImageElement;
	  }
	| { success: false; message: string } {
	const fromElement = track.elements.find(
		(element) => element.id === fromElementId,
	);
	if (!fromElement) {
		return {
			success: false,
			message: `Transition element "${fromElementId}" was not found.`,
		};
	}
	const toElement = track.elements.find(
		(element) => element.id === toElementId,
	);
	if (!toElement) {
		return {
			success: false,
			message: `Transition element "${toElementId}" was not found.`,
		};
	}
	if (!areElementsAdjacent({ elementA: fromElement, elementB: toElement })) {
		return { success: false, message: "Transition elements must be adjacent." };
	}
	if (duration > Math.min(fromElement.duration, toElement.duration)) {
		return {
			success: false,
			message: "Transition duration exceeds neighboring element duration.",
		};
	}
	return { success: true, fromElement, toElement };
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
		if (isNodeErrorWithCode(error, "ENOENT")) {
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
	} catch (error) {
		if (isNodeErrorWithCode(error, "ENOENT")) {
			throw new ExecutorProjectNotFoundError(projectId);
		}
		throw error;
	}
}

export async function createExecutorProject({
	projectId,
	name,
	confirmedSetup,
}: {
	projectId: string;
	name: string;
	confirmedSetup?: ConfirmedSetup;
}): Promise<ExecutorProjectState> {
	const now = new Date().toISOString();
	const state: ExecutorProjectState = {
		version: 1,
		revision: 1,
		browserBridgeToken: randomUUID(),
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
		...(confirmedSetup
			? { confirmedSetup: ConfirmedSetupSchema.parse(confirmedSetup) }
			: {}),
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

export async function getExecutorBrowserBridgeToken({
	projectId,
}: {
	projectId: string;
}): Promise<string> {
	const state = await loadProjectState({ projectId });
	if (!state.browserBridgeToken) {
		state.browserBridgeToken = randomUUID();
		await writeJson({ path: projectStatePath({ projectId }), value: state });
	}
	return state.browserBridgeToken;
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
		cover: state.cover,
		confirmedSetup: state.confirmedSetup,
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
	} catch (error) {
		if (!isNodeErrorWithCode(error, "ENOENT")) {
			throw error;
		}
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
	if (
		type === "video" &&
		(parsed.width === undefined || parsed.height === undefined)
	) {
		throw new Error("Imported video width and height are required.");
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
		spokenScript: parsed.spokenScript,
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

function requireProjectCoverImageAsset({
	state,
	mediaId,
}: {
	state: ExecutorProjectState;
	mediaId: string;
}) {
	const asset = state.mediaAssets.find((entry) => entry.id === mediaId);
	if (!asset) {
		throw new Error(`Project cover media asset "${mediaId}" was not found.`);
	}
	if (asset.type !== "image") {
		throw new Error("Project cover media must be an image asset.");
	}
	if (asset.width === undefined || asset.height === undefined) {
		throw new Error("Project cover image width and height are required.");
	}
	return asset as ExecutorMediaAsset & { width: number; height: number };
}

async function runSetProjectCover({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = setProjectCoverArgsSchema.parse(args);
	const asset = requireProjectCoverImageAsset({
		state,
		mediaId: parsed.mediaId,
	});
	const now = new Date().toISOString();
	const cover: ProjectCover = {
		mediaId: asset.id,
		source: parsed.source ?? "media_asset",
		...(parsed.title ? { title: parsed.title } : {}),
		...(parsed.prompt ? { prompt: parsed.prompt } : {}),
		...(parsed.stylePreset ? { stylePreset: parsed.stylePreset } : {}),
		width: asset.width,
		height: asset.height,
		updatedAt: now,
	};
	state.cover = cover;
	await saveProjectState({ state });
	return {
		success: true,
		message: "Project cover updated.",
		data: { cover, revision: state.revision },
	};
}

async function runClearProjectCover({
	state,
}: {
	state: ExecutorProjectState;
}) {
	if (!state.cover) {
		return {
			success: true,
			message: "Project cover is already clear.",
			data: { cover: null, revision: state.revision },
		};
	}
	delete state.cover;
	await saveProjectState({ state });
	return {
		success: true,
		message: "Project cover cleared.",
		data: { cover: null, revision: state.revision },
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
			cover: state.cover,
			confirmedSetup: state.confirmedSetup,
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
		...serializeSpokenScriptSummary(asset),
	}));
	return {
		success: true,
		message: `Found ${assets.length} media asset(s)`,
		data: { assets },
	};
}

function serializeSpokenScriptSummary(asset: ExecutorMediaAsset) {
	const spokenScript = asset.spokenScript;
	return {
		hasSpokenScript: Boolean(spokenScript),
		...(spokenScript?.provider
			? { spokenScriptProvider: spokenScript.provider }
			: {}),
		...(spokenScript?.providerTaskId
			? { spokenScriptProviderTaskId: spokenScript.providerTaskId }
			: {}),
		spokenScriptCaptionLineCount: spokenScript?.captions.length ?? 0,
		spokenScriptProtectedTermCount: spokenScript?.protectedTerms?.length ?? 0,
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
	if (parsed.background) {
		state.project.settings.background = parsed.background;
		updated.push("background");
	} else if (parsed.backgroundColor) {
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

function isCaptionTextElement(element: TextElement) {
	return element.name.startsWith("Caption ");
}

function applyCaptionSetupToExistingCaptions({
	state,
	confirmedSetup,
}: {
	state: ExecutorProjectState;
	confirmedSetup: ConfirmedSetup;
}) {
	const raw = applyCaptionPreferencesToTextRaw({
		raw: resolveCaptionStylePreset({
			captionStyle: resolveCaptionStyleForContract({ confirmedSetup }),
			aspectRatio: aspectRatioForState(state),
		}),
		captionPreferences: confirmedSetup.captionPreferences,
	});
	const updatedElementIds: string[] = [];
	for (const track of state.tracks) {
		if (track.type !== "text") continue;
		for (const element of track.elements) {
			if (!isCaptionTextElement(element)) continue;
			element.fontSize =
				typeof raw.fontSize === "number" ? raw.fontSize : element.fontSize;
			element.fontFamily = raw.fontFamily ?? element.fontFamily;
			element.color = raw.color ?? element.color;
			element.backgroundColor = raw.backgroundColor ?? element.backgroundColor;
			element.textAlign = raw.textAlign ?? element.textAlign;
			element.fontWeight = raw.fontWeight ?? element.fontWeight;
			element.fontStyle = raw.fontStyle ?? element.fontStyle;
			element.textDecoration = raw.textDecoration ?? element.textDecoration;
			element.transform = raw.transform ?? element.transform;
			element.opacity = raw.opacity ?? element.opacity;
			element.stroke = raw.stroke;
			element.shadow = raw.shadow;
			element.boxWidth = raw.boxWidth;
			element.backgroundOpacity = raw.backgroundOpacity;
			element.backgroundPaddingX = raw.backgroundPaddingX;
			element.backgroundPaddingY = raw.backgroundPaddingY;
			element.backgroundBorderRadius = raw.backgroundBorderRadius;
			updatedElementIds.push(element.id);
		}
	}
	return updatedElementIds;
}

async function runUpdateProjectPreferences({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = UpdateProjectPreferencesArgsSchema.parse(args);
	if (parsed.projectId !== state.project.id) {
		throw new Error(
			`projectId conflicts with executor envelope project: expected ${state.project.id}.`,
		);
	}
	if (parsed.baseRevision !== state.revision) {
		throw new Error(
			`baseRevision is stale: expected ${state.revision}, received ${parsed.baseRevision}.`,
		);
	}
	if (!state.confirmedSetup) {
		throw new Error(
			"confirmedSetup is required before project preferences can be updated.",
		);
	}

	const applied = applyConfirmedSetupPatch({
		confirmedSetup: state.confirmedSetup,
		patch: parsed.patch,
		reason: parsed.reason ?? "user_confirmed_preference_update",
	});
	if (applied.changedFields.length === 0) {
		return {
			success: true,
			message: "Project preferences already match the requested patch.",
			data: {
				revision: state.revision,
				confirmedSetup: state.confirmedSetup,
				updatedCaptionElementIds: [],
				requiresReplan: false,
			},
		};
	}

	state.confirmedSetup = applied.confirmedSetup;
	const updatedCaptionElementIds = parsed.patch.captionPreferences
		? applyCaptionSetupToExistingCaptions({
				state,
				confirmedSetup: state.confirmedSetup,
			})
		: [];
	await saveProjectState({ state });
	return {
		success: true,
		message: applied.requiresReplan
			? "Project preferences updated. Timeline structure requires a new edit plan."
			: "Project preferences updated.",
		data: {
			revision: state.revision,
			confirmedSetup: state.confirmedSetup,
			updatedCaptionElementIds,
			requiresReplan: applied.requiresReplan,
		},
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
	const audioCount = (plan.audio?.bgm ? 1 : 0) + (plan.audio?.sfx?.length ?? 0);
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

function assertExportFormatProbe({
	expected,
	actual,
}: {
	expected: ExecutorExportFormat;
	actual: string;
}) {
	if (expected === "mp4" && actual.includes("mp4")) return;
	if (expected === "webm" && actual.includes("webm")) return;
	throw new Error(
		`Export probe expected ${expected}, got ${actual || "unknown"}.`,
	);
}

function readPositiveNumber({
	value,
	message,
}: {
	value: unknown;
	message: string;
}): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(message);
	}
	return parsed;
}

const probeExportedFileWithFfprobe: ExecutorProbeExportedFile = async ({
	outputFile,
	format,
	expectedWidth,
	expectedHeight,
}) => {
	const { stdout } = await execFileAsync("ffprobe", [
		"-v",
		"error",
		"-print_format",
		"json",
		"-show_entries",
		"format=format_name,duration:stream=codec_type,width,height",
		outputFile,
	]);
	const payload = JSON.parse(String(stdout));
	const formatName = String(payload?.format?.format_name ?? "");
	assertExportFormatProbe({ expected: format, actual: formatName });
	const duration = readPositiveNumber({
		value: payload?.format?.duration,
		message: "Export probe could not read a positive duration.",
	});
	const streams: FfprobeStream[] = Array.isArray(payload?.streams)
		? payload.streams
		: [];
	const videoStreams = streams.filter(
		(stream) => stream?.codec_type === "video",
	);
	const audioStreams = streams.filter(
		(stream) => stream?.codec_type === "audio",
	);
	const primaryVideo = videoStreams[0];
	if (!primaryVideo) {
		throw new Error("Export probe did not find a video stream.");
	}
	const width = readPositiveNumber({
		value: primaryVideo.width,
		message: "Export probe could not read a positive video width.",
	});
	const height = readPositiveNumber({
		value: primaryVideo.height,
		message: "Export probe could not read a positive video height.",
	});
	if (width !== expectedWidth || height !== expectedHeight) {
		throw new Error(
			`Export probe dimensions ${width}x${height} do not match canvas ${expectedWidth}x${expectedHeight}.`,
		);
	}
	return {
		format,
		duration,
		width,
		height,
		videoTrackCount: videoStreams.length,
		audioTrackCount: audioStreams.length,
	};
};

async function runExportProject({
	state,
	args,
	exportProject,
	probeExportedFile,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	exportProject: ExecutorExportProject;
	probeExportedFile: ExecutorProbeExportedFile;
}) {
	const parsed = exportProjectArgsSchema.parse(args);
	const exportPreferences = resolveExportPreferencesForContract({
		confirmedSetup: state.confirmedSetup,
		explicitFormat: parsed.format,
		explicitQuality: parsed.quality,
		explicitIncludeAudio: parsed.includeAudio,
	});
	const format = requireExportFormat(exportPreferences.format);
	const quality = requireExportQuality(exportPreferences.quality);
	if (!isAbsolute(parsed.outputFile)) {
		throw new Error("--output-file must be an absolute path");
	}
	if (!parsed.overwrite && (await localFileExists(parsed.outputFile))) {
		throw new Error(
			"Output file already exists. Set overwrite=true to replace it.",
		);
	}

	const totalDuration = calculateTotalDuration({ tracks: state.tracks });
	if (state.tracks.length === 0 || totalDuration <= 0) {
		throw new Error("Cannot export an empty timeline.");
	}

	const exported = await exportProject({
		state,
		format,
		quality,
		includeAudio: exportPreferences.includeAudio,
	});
	const bytes = exportBytesToBuffer(exported);
	if (bytes.byteLength <= 0) {
		throw new Error("Local exporter returned an empty file.");
	}
	await writeFile(parsed.outputFile, bytes);
	const outputProbe = await probeExportedFile({
		outputFile: parsed.outputFile,
		format,
		expectedWidth: state.project.settings.canvasSize.width,
		expectedHeight: state.project.settings.canvasSize.height,
	});

	return {
		success: true,
		message: `Exported ${format} to ${parsed.outputFile}`,
		data: {
			outputFile: parsed.outputFile,
			byteLength: bytes.byteLength,
			format,
			includeAudio: exportPreferences.includeAudio,
			revision: state.revision,
			totalDuration,
			outputProbe,
		},
	};
}

function timelineVerificationActuals({
	state,
}: {
	state: ExecutorProjectState;
}) {
	const mediaIds = new Set<string>();
	let clipCount = 0;
	let captionCount = 0;
	let audioCount = 0;
	let transitionCount = 0;

	for (const track of state.tracks) {
		if (track.type === "video") {
			transitionCount += track.transitions?.length ?? 0;
		}
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
		transitionCount,
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
		"transitionCount",
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

function runningHubAudioExtension({ mimeType }: { mimeType: string }): string {
	if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return "wav";
	if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") return "mp3";
	if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a") return "m4a";
	if (mimeType === "audio/aac") return "aac";
	if (mimeType === "audio/ogg") return "ogg";
	if (mimeType === "audio/flac" || mimeType === "audio/x-flac") return "flac";
	throw new Error(
		`RunningHub returned unsupported audio MIME type: ${mimeType}`,
	);
}

function runningHubVoiceFileName({
	providerId,
	taskId,
	mimeType,
}: {
	providerId: string;
	taskId: string;
	mimeType: string;
}): string {
	const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, "-");
	return `${providerId}-${safeTaskId}.${runningHubAudioExtension({ mimeType })}`;
}

function runningHubVoiceSourceFileName({
	mimeType,
}: {
	mimeType: string;
}): string {
	if (mimeType === "audio/wav" || mimeType === "audio/x-wav")
		return "source.wav";
	if (mimeType === "audio/mpeg" || mimeType === "audio/mp3")
		return "source.mp3";
	if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a")
		return "source.m4a";
	if (mimeType === "audio/aac") return "source.aac";
	if (mimeType === "audio/ogg") return "source.ogg";
	if (mimeType === "audio/flac" || mimeType === "audio/x-flac")
		return "source.flac";
	throw new Error(
		`RunningHub returned unsupported audio MIME type: ${mimeType}`,
	);
}

function parseTimelineReadyWavAudio({ audioBytes }: { audioBytes: Buffer }): {
	duration: number;
} {
	if (
		audioBytes.byteLength < 44 ||
		audioBytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
		audioBytes.subarray(8, 12).toString("ascii") !== "WAVE"
	) {
		throw new Error("RunningHub voice WAV result is not a RIFF/WAVE file");
	}

	let offset = 12;
	let byteRate: number | null = null;
	let dataSize: number | null = null;
	while (offset + 8 <= audioBytes.byteLength) {
		const chunkId = audioBytes.subarray(offset, offset + 4).toString("ascii");
		const chunkSize = audioBytes.readUInt32LE(offset + 4);
		const chunkDataOffset = offset + 8;
		const nextOffset = chunkDataOffset + chunkSize + (chunkSize % 2);
		if (chunkDataOffset + chunkSize > audioBytes.byteLength) {
			throw new Error("RunningHub voice WAV result has a truncated chunk");
		}

		if (chunkId === "fmt ") {
			if (chunkSize < 16) {
				throw new Error("RunningHub voice WAV result has an invalid fmt chunk");
			}
			const audioFormat = audioBytes.readUInt16LE(chunkDataOffset);
			const channelCount = audioBytes.readUInt16LE(chunkDataOffset + 2);
			const sampleRate = audioBytes.readUInt32LE(chunkDataOffset + 4);
			const parsedByteRate = audioBytes.readUInt32LE(chunkDataOffset + 8);
			const blockAlign = audioBytes.readUInt16LE(chunkDataOffset + 12);
			const bitsPerSample = audioBytes.readUInt16LE(chunkDataOffset + 14);
			if (audioFormat !== 1 && audioFormat !== 3) {
				throw new Error(
					`RunningHub voice WAV result uses unsupported audio format: ${audioFormat}`,
				);
			}
			if (
				channelCount <= 0 ||
				sampleRate <= 0 ||
				parsedByteRate <= 0 ||
				blockAlign <= 0 ||
				bitsPerSample <= 0
			) {
				throw new Error(
					"RunningHub voice WAV result has invalid audio metadata",
				);
			}
			byteRate = parsedByteRate;
		}
		if (chunkId === "data") {
			dataSize = chunkSize;
		}

		offset = nextOffset;
	}

	if (!byteRate) {
		throw new Error("RunningHub voice WAV result is missing a fmt chunk");
	}
	if (!dataSize) {
		throw new Error("RunningHub voice WAV result is missing audio data");
	}
	const duration = dataSize / byteRate;
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error("RunningHub voice WAV result has invalid duration");
	}
	return { duration };
}

function convertDecodedRunningHubSampleToF32({
	sample,
	AudioSample,
	timestamp,
}: {
	sample: import("mediabunny").AudioSample;
	AudioSample: typeof import("mediabunny").AudioSample;
	timestamp: number;
}): import("mediabunny").AudioSample {
	const rawBytes = new Uint8Array(sample.allocationSize({ planeIndex: 0 }));
	sample.copyTo(rawBytes, { planeIndex: 0 });
	if (sample.format === "f32") {
		const buffer = rawBytes.buffer.slice(
			rawBytes.byteOffset,
			rawBytes.byteOffset + rawBytes.byteLength,
		) as ArrayBuffer;
		return new AudioSample({
			format: "f32",
			sampleRate: sample.sampleRate,
			numberOfChannels: sample.numberOfChannels,
			timestamp,
			data: buffer,
		});
	}
	if (sample.format === "s16") {
		const inputSamples = new Int16Array(
			rawBytes.buffer,
			rawBytes.byteOffset,
			rawBytes.byteLength / Int16Array.BYTES_PER_ELEMENT,
		);
		const outputSamples = new Float32Array(inputSamples.length);
		for (let index = 0; index < inputSamples.length; index += 1) {
			const value = inputSamples[index] ?? 0;
			outputSamples[index] = value < 0 ? value / 32768 : value / 32767;
		}
		return new AudioSample({
			format: "f32",
			sampleRate: sample.sampleRate,
			numberOfChannels: sample.numberOfChannels,
			timestamp,
			data: outputSamples.buffer as ArrayBuffer,
		});
	}
	throw new Error(
		`RunningHub voice WAV normalization does not support decoded sample format: ${sample.format}`,
	);
}

async function normalizeRunningHubVoiceAudio({
	audioBytes,
	mimeType,
}: {
	audioBytes: Buffer;
	mimeType: string;
}): Promise<{ audioBytes: Buffer; mimeType: "audio/wav"; duration: number }> {
	if (mimeType === "audio/wav" || mimeType === "audio/x-wav") {
		const parsedWav = parseTimelineReadyWavAudio({ audioBytes });
		return {
			audioBytes,
			mimeType: "audio/wav",
			duration: parsedWav.duration,
		};
	}

	const [
		webcodecs,
		{
			ALL_FORMATS,
			AudioSample,
			AudioSampleSink,
			AudioSampleSource,
			BlobSource,
			BufferTarget,
			Input,
			Output,
			WavOutputFormat,
		},
	] = await Promise.all([import("@napi-rs/webcodecs"), import("mediabunny")]);
	const globals = globalThis as Record<string, unknown>;
	globals.AudioData ??= webcodecs.AudioData;
	globals.AudioDecoder ??= webcodecs.AudioDecoder;
	globals.AudioEncoder ??= webcodecs.AudioEncoder;
	globals.EncodedAudioChunk ??= webcodecs.EncodedAudioChunk;
	globals.EncodedVideoChunk ??= webcodecs.EncodedVideoChunk;
	globals.VideoEncoder ??= webcodecs.VideoEncoder;
	globals.VideoFrame ??= webcodecs.VideoFrame;

	const arrayBuffer = audioBytes.buffer.slice(
		audioBytes.byteOffset,
		audioBytes.byteOffset + audioBytes.byteLength,
	) as ArrayBuffer;
	const sourceFile = new File(
		[arrayBuffer],
		runningHubVoiceSourceFileName({ mimeType }),
		{ type: mimeType },
	);
	const input = new Input({
		source: new BlobSource(sourceFile),
		formats: ALL_FORMATS,
	});
	const target = new BufferTarget();
	const output = new Output({
		format: new WavOutputFormat(),
		target,
	});

	try {
		const audioTrack = await input.getPrimaryAudioTrack();
		if (!audioTrack) {
			throw new Error("RunningHub voice result has no audio track");
		}
		if (!(await audioTrack.canDecode())) {
			throw new Error(
				`RunningHub voice result cannot be decoded: ${
					audioTrack.codec || "unknown codec"
				}`,
			);
		}

		const audioSource = new AudioSampleSource({ codec: "pcm-f32" });
		output.addAudioTrack(audioSource);
		await output.start();
		const sink = new AudioSampleSink(audioTrack);
		let duration = 0;
		try {
			for await (const sample of sink.samples()) {
				let normalizedSample: import("mediabunny").AudioSample | null = null;
				try {
					normalizedSample = convertDecodedRunningHubSampleToF32({
						sample,
						AudioSample,
						timestamp: duration,
					});
					await audioSource.add(normalizedSample);
					duration += sample.duration;
				} finally {
					normalizedSample?.close();
					sample.close();
				}
			}
		} finally {
			audioSource.close();
		}
		await output.finalize();
		if (!target.buffer || target.buffer.byteLength <= 0) {
			throw new Error("RunningHub voice WAV normalization produced no audio");
		}
		if (!Number.isFinite(duration) || duration <= 0) {
			throw new Error(
				"RunningHub voice WAV normalization produced no duration",
			);
		}
		return {
			audioBytes: Buffer.from(target.buffer),
			mimeType: "audio/wav",
			duration,
		};
	} finally {
		input.dispose();
	}
}

async function saveGeneratedRunningHubVoiceAsset({
	state,
	providerId,
	taskId,
	text,
	protectedTerms,
	audioBytes,
	mimeType,
}: {
	state: ExecutorProjectState;
	providerId: string;
	taskId: string;
	text: string;
	protectedTerms?: string[];
	audioBytes: Buffer;
	mimeType: string;
}) {
	if (audioBytes.byteLength <= 0) {
		throw new Error("RunningHub returned an empty voice audio file");
	}
	const normalizedAudio = await normalizeRunningHubVoiceAudio({
		audioBytes,
		mimeType,
	});
	const name = runningHubVoiceFileName({
		providerId,
		taskId,
		mimeType: normalizedAudio.mimeType,
	});
	const mediaId = `generated-voice-${generateUUID()}`;
	const mediaPath = join(
		mediaDirectory({ projectId: state.project.id }),
		mediaId,
	);
	await writeFile(mediaPath, normalizedAudio.audioBytes);
	const spokenScript = buildTtsSpokenScript({
		text,
		protectedTerms,
		provider:
			providerId === RUNNINGHUB_VOICE_CLONE_PROVIDER_ID
				? "runninghub-voice-clone"
				: "runninghub-voice-design",
		providerTaskId: taskId,
	});
	const asset: ExecutorMediaAsset = {
		id: mediaId,
		name,
		type: "audio",
		mimeType: normalizedAudio.mimeType,
		duration: normalizedAudio.duration,
		size: normalizedAudio.audioBytes.byteLength,
		lastModified: Date.now(),
		path: mediaPath,
		spokenScript,
	};
	state.mediaAssets = [...state.mediaAssets, asset];
	await saveProjectState({ state });
	return {
		success: true,
		message: `Generated RunningHub voice '${name}'`,
		data: {
			mediaId,
			taskId,
			provider: providerId,
			duration: normalizedAudio.duration,
			audioPath: mediaPath,
			name,
			voiceConsistency: {
				provider: providerId,
				providerTaskId: taskId,
				scriptCaptionLineCount: spokenScript.captions.length,
				protectedTermCount: spokenScript.protectedTerms?.length ?? 0,
			},
		},
	};
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
		throw new Error(
			`RunningHub returned unsupported video MIME type: ${mimeType}`,
		);
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

async function runGenerateRunningHubVoiceDesign({
	state,
	args,
	env,
	generateVoiceDesign,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	env: Record<string, string | undefined>;
	generateVoiceDesign: ExecutorGenerateVoiceDesign;
}) {
	const parsed = generateVoiceDesignArgsSchema.parse(args);
	const apiKey = env.RUNNINGHUB_API_KEY;
	if (!apiKey) {
		throw new Error("RUNNINGHUB_API_KEY is required");
	}
	const request: VoiceDesignRequest = {
		text: parsed.text,
		emotionPrompt: parsed.emotionPrompt,
	};
	const generated = await generateVoiceDesign({
		apiKey,
		request,
	});
	return saveGeneratedRunningHubVoiceAsset({
		state,
		providerId: RUNNINGHUB_VOICE_DESIGN_PROVIDER_ID,
		taskId: generated.taskId,
		text: parsed.text,
		protectedTerms: parsed.protectedTerms,
		audioBytes: generated.audioBytes,
		mimeType: generated.mimeType || "audio/mpeg",
	});
}

async function runGenerateRunningHubVoiceClone({
	state,
	args,
	env,
	generateVoiceClone,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	env: Record<string, string | undefined>;
	generateVoiceClone: ExecutorGenerateVoiceClone;
}) {
	const parsed = generateVoiceCloneArgsSchema.parse(args);
	const apiKey = env.RUNNINGHUB_API_KEY;
	if (!apiKey) {
		throw new Error("RUNNINGHUB_API_KEY is required");
	}
	if (!isAbsolute(parsed.audioPath)) {
		throw new Error("audioPath must be an absolute path");
	}
	const audioStats = await stat(parsed.audioPath);
	if (!audioStats.isFile()) {
		throw new Error("audioPath must reference a file");
	}
	const request: VoiceCloneRequest = {
		text: parsed.text,
	};
	const generated = await generateVoiceClone({
		apiKey,
		referenceAudioPath: parsed.audioPath,
		request,
	});
	return saveGeneratedRunningHubVoiceAsset({
		state,
		providerId: RUNNINGHUB_VOICE_CLONE_PROVIDER_ID,
		taskId: generated.taskId,
		text: parsed.text,
		protectedTerms: parsed.protectedTerms,
		audioBytes: generated.audioBytes,
		mimeType: generated.mimeType || "audio/mpeg",
	});
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
	assertAsrProviderResult(result, "transcribe_media");
	await writeTranscriptCache({
		state,
		entry: {
			mediaId: mediaAsset.id,
			language: result.language,
			modelId: result.modelId ?? modelId,
			text: result.text,
			segments: result.segments,
			capabilities: result.capabilities,
			quality: result.quality,
			...(result.words ? { words: result.words } : {}),
		},
	});
	return {
		success: true,
		message: `Transcribed '${mediaAsset.name}'`,
		data: {
			text: result.text,
			segments: result.segments,
			...(result.words ? { words: result.words } : {}),
			language: result.language,
			modelId: result.modelId ?? modelId,
			capabilities: result.capabilities,
			quality: result.quality,
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
			assertAsrProviderResult(
				result,
				`build_video_context range ${startSeconds.toFixed(2)}-${endSeconds.toFixed(2)}`,
			);

			return {
				text: result.text,
				language: result.language,
				modelId: result.modelId ?? modelId,
				segments: result.segments,
				...(result.words ? { words: result.words } : {}),
				capabilities: result.capabilities,
				quality: result.quality,
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
		inspectRange: async ({
			mediaAsset: targetMediaAsset,
			startSeconds,
			endSeconds,
			frameCount,
			outputDirectory,
		}) =>
			inspectVideoRange({
				mediaAsset: targetMediaAsset,
				startSeconds,
				endSeconds,
				frameCount,
				outputDirectory,
			}),
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

async function runInspectTimeline({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = inspectTimelineArgsSchema.parse(args);
	const mediaAssets = await toMediaAssets(state.mediaAssets);
	const result = await inspectTimelineWithNodeRenderer({
		state,
		mediaAssets,
		args: parsed,
		outputDirectory: join(
			projectDirectory({ projectId: state.project.id }),
			"timeline-inspect",
		),
	});
	return {
		success: true,
		message: `Inspected timeline at ${result.frameTimes.length} frame(s).`,
		data: {
			revision: state.revision,
			canvasSize: result.canvasSize,
			totalDuration: result.totalDuration,
			artifact: {
				kind: "timeline_contact_sheet",
				path: result.artifactPath,
				mimeType: "image/png",
				width: result.sheetSize.width,
				height: result.sheetSize.height,
			},
			frames: result.frameTimes.map((timeSeconds) => ({ timeSeconds })),
		},
	};
}

async function runBuildVideoQualityReport({
	state,
	args,
	probeExportedFile,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	probeExportedFile: ExecutorProbeExportedFile;
}) {
	const parsed = videoQualityReportArgsSchema.parse(args);
	const mediaAssets = await toMediaAssets(state.mediaAssets);
	let exportedFile:
		| {
				outputFile: string;
				format: ExecutorExportFormat;
				includeAudio: boolean;
				outputProbe?: ExecutorOutputProbe;
				probeError?: string;
		  }
		| undefined;
	if (parsed.exportedFile) {
		if (!isAbsolute(parsed.exportedFile.outputFile)) {
			throw new Error("exportedFile.outputFile must be an absolute path");
		}
		exportedFile = {
			outputFile: parsed.exportedFile.outputFile,
			format: parsed.exportedFile.format,
			includeAudio: parsed.exportedFile.includeAudio,
		};
		try {
			exportedFile.outputProbe = await probeExportedFile({
				outputFile: parsed.exportedFile.outputFile,
				format: parsed.exportedFile.format,
				expectedWidth: state.project.settings.canvasSize.width,
				expectedHeight: state.project.settings.canvasSize.height,
			});
		} catch (error) {
			exportedFile.probeError =
				error instanceof Error ? error.message : String(error);
		}
	}
	const report = await buildVideoQualityReport({
		state,
		mediaAssets,
		plan: parsed.plan,
		inspection: parsed.inspection,
		outputDirectory: join(
			projectDirectory({ projectId: state.project.id }),
			"timeline-inspect",
		),
		titleRubric: parsed.titleRubric,
		exportedFile,
	});
	return {
		success: true,
		message: `Built VideoQualityReport: ${report.status}`,
		data: report,
	};
}

function roundTimelineSeconds(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function isVisibleVideoElement(
	element: TimelineElement,
): element is VideoElement {
	return (
		element.type === "video" &&
		!(
			("muted" in element && element.muted) ||
			("hidden" in element && element.hidden)
		)
	);
}

function isAudibleUploadAudioElement(
	element: TimelineElement,
): element is AudioElement & { sourceType: "upload" } {
	return (
		element.type === "audio" &&
		element.sourceType === "upload" &&
		!("muted" in element && element.muted)
	);
}

type CaptionSourceElement =
	| VideoElement
	| (AudioElement & { sourceType: "upload" });

function isTranscriptElement(element: TimelineElement) {
	if (element.type === "video") {
		return !element.muted && !element.hidden;
	}
	if (element.type === "audio") {
		return element.sourceType === "upload" && !element.muted;
	}
	return false;
}

async function runGetTranscript({
	state,
	args,
	transcribeMediaRange,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	transcribeMediaRange: ExecutorTranscribeMediaRange;
}) {
	const parsed = getTranscriptArgsSchema.parse(args);
	const language = parseExecutorTranscriptionLanguage(parsed.language);
	const modelId = parseExecutorTranscriptionModelId(parsed.modelId);
	const totalDuration = calculateTotalDuration({ tracks: state.tracks });
	const windowStart = parsed.startTime ?? 0;
	const windowEnd = parsed.endTime ?? totalDuration;
	if (windowEnd < windowStart) {
		throw new Error(
			"get_transcript endTime must be greater than or equal to startTime.",
		);
	}
	const mediaById = new Map(
		state.mediaAssets.map((asset) => [asset.id, asset]),
	);
	const fps = state.project.settings.fps;
	const clips = [];

	for (const track of state.tracks) {
		for (const element of track.elements as TimelineElement[]) {
			if (!isTranscriptElement(element)) continue;
			if (!("mediaId" in element)) continue;
			const elementStart = element.startTime;
			const elementEnd = element.startTime + element.duration;
			const overlapStart = Math.max(elementStart, windowStart);
			const overlapEnd = Math.min(elementEnd, windowEnd);
			if (overlapEnd <= overlapStart) continue;
			const mediaAsset = mediaById.get(element.mediaId);
			if (!mediaAsset) {
				throw new Error(`Media asset "${element.mediaId}" was not found.`);
			}
			if (mediaAsset.type !== "video" && mediaAsset.type !== "audio") {
				throw new Error(`Media asset "${mediaAsset.id}" is not transcribable.`);
			}
			const playbackRate =
				"playbackRate" in element ? (element.playbackRate ?? 1) : 1;
			const sourceStart =
				element.trimStart + (overlapStart - element.startTime) * playbackRate;
			const sourceEnd =
				element.trimStart + (overlapEnd - element.startTime) * playbackRate;
			const result = await transcribeMediaRange({
				mediaAsset,
				language,
				modelId,
				range: { start: sourceStart, end: sourceEnd },
				timestampGranularity: parsed.granularity,
			});
			assertAsrProviderResult(result, `get_transcript clip ${element.id}`);
			if (parsed.granularity === "word" && !result.words) {
				throw new Error(
					`get_transcript word granularity requires ASR word timestamps for clip "${element.id}".`,
				);
			}
			const transcriptUnits =
				parsed.granularity === "word" ? (result.words ?? []) : result.segments;
			const rows = [];
			const rowFrames = [];
			for (const unit of transcriptUnits) {
				const absoluteSourceStart = sourceStart + unit.start;
				const absoluteSourceEnd = sourceStart + unit.end;
				const clippedSourceStart = Math.max(absoluteSourceStart, sourceStart);
				const clippedSourceEnd = Math.min(absoluteSourceEnd, sourceEnd);
				if (clippedSourceEnd <= clippedSourceStart) continue;
				const timelineStart =
					element.startTime +
					(clippedSourceStart - element.trimStart) / playbackRate;
				const timelineEnd =
					element.startTime +
					(clippedSourceEnd - element.trimStart) / playbackRate;
				if (timelineEnd <= windowStart || timelineStart >= windowEnd) continue;
				const clippedTimelineStart = Math.max(timelineStart, windowStart);
				const clippedTimelineEnd = Math.min(timelineEnd, windowEnd);
				const rowSourceStart =
					element.trimStart +
					(clippedTimelineStart - element.startTime) * playbackRate;
				const rowSourceEnd =
					element.trimStart +
					(clippedTimelineEnd - element.startTime) * playbackRate;
				const row = [
					unit.text,
					roundTimelineSeconds(clippedTimelineStart),
					roundTimelineSeconds(clippedTimelineEnd),
					roundTimelineSeconds(rowSourceStart),
					roundTimelineSeconds(rowSourceEnd),
				];
				rows.push(row);
				if (parsed.includeFrames) {
					rowFrames.push([
						secondsToFrame(row[1] as number, fps),
						secondsToFrame(row[2] as number, fps),
						secondsToFrame(row[3] as number, fps),
						secondsToFrame(row[4] as number, fps),
					]);
				}
			}
			clips.push({
				clipId: element.id,
				trackId: track.id,
				mediaId: element.mediaId,
				...(parsed.granularity === "word"
					? { words: rows }
					: { segments: rows }),
				...(parsed.includeFrames
					? parsed.granularity === "word"
						? { wordFrames: rowFrames }
						: { segmentFrames: rowFrames }
					: {}),
			});
		}
	}
	const segmentCount = clips.reduce(
		(total, clip) =>
			total +
			(parsed.granularity === "word"
				? (clip as { words: unknown[] }).words.length
				: (clip as { segments: unknown[] }).segments.length),
		0,
	);
	const rowFormat = [
		"text",
		"startTime",
		"endTime",
		"sourceStart",
		"sourceEnd",
	];
	return {
		success: true,
		message: `Transcript has ${segmentCount} ${parsed.granularity} row(s) from ${clips.length} clip(s).`,
		data: {
			revision: state.revision,
			language,
			modelId,
			...(parsed.granularity === "word"
				? { wordFormat: rowFormat }
				: { segmentFormat: rowFormat }),
			...(parsed.includeFrames
				? {
						frameFormat: [
							"startFrame",
							"endFrame",
							"sourceStartFrame",
							"sourceEndFrame",
						],
					}
				: {}),
			clips,
		},
	};
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
	const captionStyle = resolveCaptionStyleForContract({
		confirmedSetup: state.confirmedSetup,
		explicitCaptionStyle: parsed.captionStyle,
	});
	const result = await buildPostCutCaptionsData({
		state,
		language: parseExecutorTranscriptionLanguage(
			resolveCaptionLanguageForContract({
				confirmedSetup: state.confirmedSetup,
				explicitLanguage: parsed.language,
			}),
		),
		modelId: parseExecutorTranscriptionModelId(parsed.modelId),
		captionStyle,
		transcribeMediaRange,
	});
	if (!result.success) return result;
	return {
		success: true,
		message: `Built ${result.data.captions.length} post-cut caption(s) from ${result.data.trace.length} video clip(s).`,
		data: result.data,
	};
}

async function runBuildCaptionDiagnostics({
	state,
	args,
	transcribeMediaRange,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	transcribeMediaRange: ExecutorTranscribeMediaRange;
}) {
	const parsed = buildCaptionDiagnosticsArgsSchema.parse(args);
	const language = parseExecutorTranscriptionLanguage(parsed.language);
	const modelId = parseExecutorTranscriptionModelId(parsed.modelId);
	const report = await buildCaptionDiagnosticsReport({
		revision: state.revision,
		tracks: state.tracks,
		mediaAssets: state.mediaAssets,
		language,
		modelId,
		captionStyle: parsed.captionStyle,
		aspectRatio: aspectRatioForState(state),
		canvasSize: state.project.settings.canvasSize,
		timelineDuration: calculateTotalDuration({ tracks: state.tracks }),
		transcribeMediaRange: async ({
			mediaAsset,
			language: rangeLanguage,
			modelId: rangeModelId,
			range,
		}) => {
			if (!mediaAsset.path) {
				throw new Error(`Media asset '${mediaAsset.id}' has no local path.`);
			}
			return transcribeMediaRange({
				mediaAsset: {
					id: mediaAsset.id,
					name: mediaAsset.name,
					path: mediaAsset.path,
					duration: mediaAsset.duration,
				},
				language: rangeLanguage,
				modelId: rangeModelId,
				range,
			});
		},
	});
	const lowConfidenceCount = report.confidence.lowConfidenceItems.length;
	return {
		success: true,
		message:
			`Caption diagnostics ${report.status}: ` +
			`${report.summary.candidateCaptionCount} candidate caption(s), ` +
			`${lowConfidenceCount} low-confidence item(s).`,
		data: report,
	};
}

function normalizeSpokenScriptCaptionTexts({
	spokenScript,
	mediaName,
}: {
	spokenScript: ExecutorSpokenScript;
	mediaName: string;
}):
	| { success: true; captions: string[] }
	| { success: false; message: string } {
	const captions = spokenScript.captions
		.map((caption) => caption.trim())
		.filter(Boolean);
	if (captions.length === 0) {
		return {
			success: false,
			message: `Scripted TTS media '${mediaName}' must provide at least one caption line.`,
		};
	}

	const joinedCaptions = captions.join(" ");
	for (const term of spokenScript.protectedTerms ?? []) {
		if (!joinedCaptions.includes(term)) {
			return {
				success: false,
				message: `Scripted TTS media '${mediaName}' captions are missing protected term '${term}'.`,
			};
		}
	}

	return { success: true, captions };
}

type TimedTextSegment = { text: string; start: number; end: number };

function timingSegmentWeight(segment: TimedTextSegment): number {
	return Math.max(0, segment.end - segment.start);
}

function buildTimingWeights(segments: TimedTextSegment[]): number[] {
	const durationWeights = segments.map(timingSegmentWeight);
	const totalDurationWeight = durationWeights.reduce(
		(total, weight) => total + weight,
		0,
	);
	if (totalDurationWeight > 0) {
		return durationWeights;
	}
	return segments.map(() => 1);
}

function groupWeightedItemsByTiming({
	items,
	itemWeight,
	joinItems,
	timingSegments,
}: {
	items: string[];
	itemWeight: (item: string) => number;
	joinItems: (items: string[]) => string;
	timingSegments: TimedTextSegment[];
}): string[] {
	if (items.length === 0) {
		return timingSegments.map(() => "");
	}
	const weights = buildTimingWeights(timingSegments);
	const totalWeight = weights.reduce((total, weight) => total + weight, 0);
	const itemWeights = items.map((item) => Math.max(1, itemWeight(item)));
	const totalItemWeight = itemWeights.reduce(
		(total, weight) => total + weight,
		0,
	);
	const chunks: string[] = [];
	let itemIndex = 0;
	let consumedItemWeight = 0;
	let cumulativeTimingWeight = 0;

	for (
		let segmentIndex = 0;
		segmentIndex < timingSegments.length;
		segmentIndex += 1
	) {
		const remainingSegments = timingSegments.length - segmentIndex;
		const remainingItems = items.length - itemIndex;
		if (remainingSegments === 1) {
			chunks.push(joinItems(items.slice(itemIndex)));
			break;
		}
		if (remainingItems <= remainingSegments) {
			chunks.push(items[itemIndex] ?? "");
			consumedItemWeight += itemWeights[itemIndex] ?? 0;
			itemIndex += 1;
			cumulativeTimingWeight += weights[segmentIndex];
			continue;
		}

		cumulativeTimingWeight += weights[segmentIndex];
		const targetWeight =
			(totalItemWeight * cumulativeTimingWeight) / totalWeight;
		const chunkItems: string[] = [];
		let chunkWeight = 0;
		while (itemIndex < items.length - (remainingSegments - 1)) {
			const nextItem = items[itemIndex];
			const nextWeight = itemWeights[itemIndex] ?? 1;
			if (chunkItems.length > 0) {
				const currentDistance = Math.abs(
					consumedItemWeight + chunkWeight - targetWeight,
				);
				const nextDistance = Math.abs(
					consumedItemWeight + chunkWeight + nextWeight - targetWeight,
				);
				if (nextDistance > currentDistance) break;
			}
			chunkItems.push(nextItem);
			chunkWeight += nextWeight;
			itemIndex += 1;
		}
		consumedItemWeight += chunkWeight;
		chunks.push(joinItems(chunkItems));
	}

	return chunks;
}

function alignScriptedCaptionsToTimingSegments({
	captions,
	timingSegments,
}: {
	captions: string[];
	timingSegments: TimedTextSegment[];
}): TimedTextSegment[] {
	if (timingSegments.length === 0) {
		return [];
	}
	const alignedTexts =
		captions.length >= timingSegments.length
			? groupWeightedItemsByTiming({
					items: captions,
					itemWeight: (caption) => caption.length,
					joinItems: (items) => items.join(" "),
					timingSegments,
				})
			: groupWeightedItemsByTiming({
					items: captions.join(" ").split(/\s+/).filter(Boolean),
					itemWeight: (word) => word.length,
					joinItems: (items) => items.join(" "),
					timingSegments,
				});
	return timingSegments.map((segment, index) => ({
		...segment,
		text: alignedTexts[index] ?? "",
	}));
}

async function buildPostCutCaptionsData({
	state,
	language,
	modelId,
	captionStyle = DEFAULT_POST_CUT_CAPTION_STYLE,
	transcribeMediaRange,
}: {
	state: ExecutorProjectState;
	language: ReturnType<typeof parseExecutorTranscriptionLanguage>;
	modelId: ReturnType<typeof parseExecutorTranscriptionModelId>;
	captionStyle?: EditPlanCaptionStyle;
	transcribeMediaRange: ExecutorTranscribeMediaRange;
}): Promise<
	| {
			success: true;
			data: {
				source:
					| "edited_video_clip_audio"
					| "edited_timeline_audio"
					| "scripted_tts_audio";
				language: string;
				modelId: string;
				captionStyle: EditPlanCaptionStyle;
				captions: Array<{ text: string; startTime: number; duration: number }>;
				captionQuality: ReturnType<typeof auditCaptions>;
				voiceConsistency?: {
					provider: NonNullable<ExecutorSpokenScript["provider"]>;
					providerTaskId?: string;
					alignmentMethod: "scripted_captions_to_asr_segments";
					scriptCaptionLineCount: number;
					protectedTermCount: number;
				};
				trace: Array<{
					mediaId: string;
					timelineStart: number;
					sourceStart: number;
					sourceEnd: number;
					captionCount: number;
				}>;
			};
	  }
	| { success: false; message: string }
> {
	const clips = state.tracks
		.filter(
			(track) =>
				(track.type === "video" || track.type === "audio") &&
				!("muted" in track && track.muted) &&
				!("hidden" in track && track.hidden),
		)
		.flatMap(
			(track): Array<{ element: CaptionSourceElement; trackId: string }> => {
				if (track.type === "video") {
					return track.elements
						.filter(isVisibleVideoElement)
						.map((element) => ({ element, trackId: track.id }));
				}
				return track.elements
					.filter(isAudibleUploadAudioElement)
					.map((element) => ({ element, trackId: track.id }));
			},
		)
		.sort((left, right) => left.element.startTime - right.element.startTime);

	if (clips.length === 0) {
		return {
			success: false,
			message:
				"No unmuted edited media clips were found for post-cut caption transcription.",
		};
	}
	const hasScriptedTtsAudio = clips.some(({ element }) => {
		const mediaAsset = state.mediaAssets.find(
			(asset) => asset.id === element.mediaId,
		);
		return (
			element.type === "audio" && mediaAsset?.spokenScript?.source === "tts"
		);
	});
	const source = hasScriptedTtsAudio
		? "scripted_tts_audio"
		: clips.some(({ element }) => element.type === "audio")
			? "edited_timeline_audio"
			: "edited_video_clip_audio";
	const aspectRatio = aspectRatioForState(state);
	const canvasSize = state.project.settings.canvasSize;

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
	let voiceConsistency:
		| {
				provider: NonNullable<ExecutorSpokenScript["provider"]>;
				providerTaskId?: string;
				alignmentMethod: "scripted_captions_to_asr_segments";
				scriptCaptionLineCount: number;
				protectedTermCount: number;
		  }
		| undefined;

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
				message: `Timeline ${element.type} element '${element.id}' has an invalid trim range.`,
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
		assertAsrProviderResult(
			result,
			`build_post_cut_captions element ${element.id}`,
		);
		const scriptedCaptions = mediaAsset.spokenScript
			? normalizeSpokenScriptCaptionTexts({
					spokenScript: mediaAsset.spokenScript,
					mediaName: mediaAsset.name,
				})
			: null;
		if (scriptedCaptions && !scriptedCaptions.success) {
			return scriptedCaptions;
		}
		if (scriptedCaptions && mediaAsset.spokenScript) {
			voiceConsistency = {
				provider: mediaAsset.spokenScript.provider ?? "imported-tts",
				...(mediaAsset.spokenScript.providerTaskId
					? { providerTaskId: mediaAsset.spokenScript.providerTaskId }
					: {}),
				alignmentMethod: "scripted_captions_to_asr_segments",
				scriptCaptionLineCount:
					(voiceConsistency?.scriptCaptionLineCount ?? 0) +
					scriptedCaptions.captions.length,
				protectedTermCount:
					(voiceConsistency?.protectedTermCount ?? 0) +
					(mediaAsset.spokenScript.protectedTerms?.length ?? 0),
			};
		}
		const effectiveSegments = scriptedCaptions
			? alignScriptedCaptionsToTimingSegments({
					captions: scriptedCaptions.captions,
					timingSegments: result.segments,
				})
			: result.segments;
		await writeTranscriptCache({
			state,
			entry: {
				mediaId,
				language: result.language,
				modelId: result.modelId ?? modelId,
				text: mediaAsset.spokenScript?.text ?? result.text,
				segments: effectiveSegments.map((segment) => ({
					text: segment.text,
					start: roundTimelineSeconds(element.trimStart + segment.start),
					end: roundTimelineSeconds(element.trimStart + segment.end),
				})),
				capabilities: result.capabilities,
				quality: result.quality,
				...(result.words ? { words: result.words } : {}),
			},
		});

		for (const segment of effectiveSegments) {
			const text = segment.text.trim();
			const relativeStart = Math.max(0, segment.start);
			const relativeEnd = Math.min(element.duration, segment.end);
			const startTime = roundTimelineSeconds(element.startTime + relativeStart);
			const endTime = roundTimelineSeconds(element.startTime + relativeEnd);
			captions.push(
				...buildPostCutCaptionEntries({
					text,
					startTime,
					endTime,
					captionStyle,
					aspectRatio,
					canvasSize,
				}),
			);
		}

		trace.push({
			mediaId,
			timelineStart: element.startTime,
			sourceStart: element.trimStart,
			sourceEnd: element.trimEnd,
			captionCount: captions.length - beforeCount,
		});
	}
	const captionQuality = auditCaptions({
		captions,
		captionStyle,
		aspectRatio,
		canvasSize,
		timelineDuration: calculateTotalDuration({ tracks: state.tracks }),
	});

	return {
		success: true,
		data: {
			source,
			language,
			modelId,
			captionStyle,
			captions,
			captionQuality,
			...(voiceConsistency ? { voiceConsistency } : {}),
			trace,
		},
	};
}

function aspectRatioForState(
	state: ExecutorProjectState,
): "9:16" | "16:9" | "1:1" {
	const { width, height } = state.project.settings.canvasSize;
	if (width === height) return "1:1";
	return width < height ? "9:16" : "16:9";
}

async function runAddTexts({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = addTextsArgsSchema.parse(args);
	const summary = addTextElements({
		state,
		args: parsed,
	});
	await saveProjectState({ state });
	return {
		success: true,
		message: `Added ${summary.createdElementIds.length} text element(s).`,
		data: { ...summary, revision: state.revision },
	};
}

async function runAddCaptions({
	state,
	args,
	transcribeMediaRange,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	transcribeMediaRange: ExecutorTranscribeMediaRange;
}) {
	const parsed = addCaptionsArgsSchema.parse(args);
	const captionStyle = resolveCaptionStyleForContract({
		confirmedSetup: state.confirmedSetup,
		explicitCaptionStyle: parsed.captionStyle,
	});
	const captions = await buildPostCutCaptionsData({
		state,
		language: parseExecutorTranscriptionLanguage(
			resolveCaptionLanguageForContract({
				confirmedSetup: state.confirmedSetup,
				explicitLanguage: parsed.language,
			}),
		),
		modelId: parseExecutorTranscriptionModelId(parsed.modelId),
		captionStyle,
		transcribeMediaRange,
	});
	if (!captions.success) return captions;
	if (!captions.data.captionQuality.ok) {
		return {
			success: false,
			message: "Generated captions failed caption quality validation.",
			data: { captionQuality: captions.data.captionQuality },
		};
	}
	const raw = resolveCaptionStylePreset({
		captionStyle,
		aspectRatio: aspectRatioForState(state),
	});
	const captionRaw = state.confirmedSetup
		? applyCaptionPreferencesToTextRaw({
				raw,
				captionPreferences: state.confirmedSetup.captionPreferences,
			})
		: raw;
	const summary = addTextElements({
		state,
		args: {
			entries: captions.data.captions.map((caption, index) => ({
				...captionRaw,
				name: `Caption ${index + 1}`,
				content: caption.text,
				startTime: caption.startTime,
				duration: caption.duration,
			})),
		},
	});
	await saveProjectState({ state });
	return {
		success: true,
		message: `Added ${captions.data.captions.length} caption(s).`,
		data: {
			...summary,
			revision: state.revision,
			source: captions.data.source,
			captionCount: captions.data.captions.length,
			captionStyle,
		},
	};
}

function runGetTimelineState({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = getTimelineStateArgsSchema.parse(args);
	const duration = calculateTotalDuration({ tracks: state.tracks });
	const startTime = parsed.startTime ?? 0;
	const endTime = parsed.endTime ?? duration;
	if (endTime < startTime) {
		throw new Error(
			"get_timeline_state endTime must be greater than or equal to startTime.",
		);
	}
	const includeFrames = parsed.includeFrames ?? false;
	const fps = state.project.settings.fps;
	const tracks = state.tracks.map((track, trackIndex) =>
		serializeTimelineReadbackTrack({
			track,
			trackIndex,
			startTime,
			endTime,
			includeFrames,
			fps,
		}),
	);
	const returnedElementCount = tracks.reduce(
		(total, track) => total + track.returnedElementCount,
		0,
	);
	return {
		success: true,
		message: `Timeline has ${state.tracks.length} track(s), ${returnedElementCount} returned element(s)`,
		data: {
			schemaVersion: 2,
			project: {
				id: state.project.id,
				name: state.project.name,
				revision: state.revision,
				settings: state.project.settings,
				totalDuration: duration,
				...(includeFrames
					? { totalFrames: secondsToFrame(duration, fps) }
					: {}),
			},
			cover: state.cover,
			window: {
				startTime,
				endTime,
				...(includeFrames
					? {
							startFrame: secondsToFrame(startTime, fps),
							endFrame: secondsToFrame(endTime, fps),
						}
					: {}),
				totalElementCount: state.tracks.reduce(
					(total, track) => total + track.elements.length,
					0,
				),
				returnedElementCount,
			},
			summary: timelineSummary({ state, returnedElementCount }),
			tracks,
			...(parsed.includeReferencedMedia
				? { referencedMedia: serializeReferencedMedia(state) }
				: {}),
			derivedAssets: state.derivedAssets,
		},
	};
}

async function runInsertClips({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = insertClipsArgsSchema.parse(args);
	const mediaAssets = state.mediaAssets.map((asset) => ({
		id: asset.id,
		name: asset.name,
		type: asset.type,
		duration: asset.duration,
		width: asset.width,
		height: asset.height,
	}));
	const summary = insertClips({ state, mediaAssets, args: parsed });
	await saveProjectState({ state });
	return {
		success: true,
		message: `Inserted ${summary.createdElementIds.length} clip(s).`,
		data: { ...summary, revision: state.revision },
	};
}

async function runMoveClips({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = moveClipsArgsSchema.parse(args);
	const summary = moveClips({ state, args: parsed });
	await saveProjectState({ state });
	return {
		success: true,
		message: `Moved ${summary.changedElementIds.length} clip(s).`,
		data: { ...summary, revision: state.revision },
	};
}

async function runRemoveClips({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = removeClipsArgsSchema.parse(args);
	const summary = removeClips({ state, elementIds: parsed.elementIds });
	await saveProjectState({ state });
	return {
		success: true,
		message: `Removed ${summary.removedElementIds.length} clip(s).`,
		data: { ...summary, revision: state.revision },
	};
}

async function runSplitClip({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = splitClipArgsSchema.parse(args);
	const summary = splitClip({
		state,
		elementId: parsed.elementId,
		atTime: parsed.atTime,
	});
	await saveProjectState({ state });
	return {
		success: true,
		message: "Split 1 clip.",
		data: { ...summary, revision: state.revision },
	};
}

async function runSetClipProperties({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = setClipPropertiesArgsSchema.parse(args);
	const summary = setClipProperties({
		state,
		args: {
			elementIds: parsed.elementIds ?? [parsed.elementId as string],
			properties: parsed.properties,
		},
	});
	await saveProjectState({ state });
	return {
		success: true,
		message: "Updated clip properties.",
		data: { ...summary, revision: state.revision },
	};
}

async function runSetKeyframes({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = setKeyframesArgsSchema.parse(args);
	const keyframes = parsed.keyframes.map((keyframe) => ({
		...keyframe,
		interpolation: keyframe.interpolation ?? "linear",
	})) as Array<ScalarKeyframe | PositionKeyframe>;
	const summary = setKeyframes({
		state,
		args: {
			elementId: parsed.elementId,
			property: parsed.property as keyof TimelineElementKeyframes,
			keyframes,
		},
	});
	await saveProjectState({ state });
	return {
		success: true,
		message: `Set ${keyframes.length} keyframe(s) on ${parsed.property}.`,
		data: { ...summary, revision: state.revision },
	};
}

async function runAddTransitions({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = addTransitionsArgsSchema.parse(args);
	const transitions: TrackTransition[] = [];
	for (const entry of parsed.entries) {
		const trackResult = findVideoTrackForTransition({
			state,
			trackId: entry.trackId,
		});
		if (!trackResult.success) return trackResult;
		const pairResult = validateNativeTransitionPair({
			track: trackResult.track,
			fromElementId: entry.fromElementId,
			toElementId: entry.toElementId,
			duration: entry.duration,
		});
		if (!pairResult.success) return pairResult;
	}

	for (const entry of parsed.entries) {
		const transition = buildTrackTransition({
			type: entry.type as TransitionType,
			duration: entry.duration,
			fromElementId: entry.fromElementId,
			toElementId: entry.toElementId,
		});
		state.tracks = state.tracks.map((track) =>
			track.id === entry.trackId && track.type === "video"
				? addTransitionToTrack({ track: track as VideoTrack, transition })
				: track,
		);
		transitions.push(transition);
	}

	await saveProjectState({ state });
	const firstTrackId = parsed.entries[0].trackId;
	return {
		success: true,
		message: `Added ${transitions.length} transition(s).`,
		data: {
			revision: state.revision,
			trackId: firstTrackId,
			transitionCount: countNativeTransitions({ state }),
			transitions,
		},
	};
}

async function runUpdateTransition({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = updateTransitionArgsSchema.parse(args);
	const trackResult = findVideoTrackForTransition({
		state,
		trackId: parsed.trackId,
	});
	if (!trackResult.success) return trackResult;
	const transitionResult = findTransitionOnTrack({
		track: trackResult.track,
		transitionId: parsed.transitionId,
	});
	if (!transitionResult.success) return transitionResult;
	const nextDuration = parsed.duration ?? transitionResult.transition.duration;
	const pairResult = validateNativeTransitionPair({
		track: trackResult.track,
		fromElementId: transitionResult.transition.fromElementId,
		toElementId: transitionResult.transition.toElementId,
		duration: nextDuration,
	});
	if (!pairResult.success) return pairResult;

	const updatedTransition: TrackTransition = {
		...transitionResult.transition,
		...(parsed.type === undefined
			? {}
			: { type: parsed.type as TransitionType }),
		...(parsed.duration === undefined ? {} : { duration: parsed.duration }),
	};
	state.tracks = state.tracks.map((track) =>
		track.id === parsed.trackId && track.type === "video"
			? {
					...(track as VideoTrack),
					transitions: ((track as VideoTrack).transitions ?? []).map(
						(transition) =>
							transition.id === parsed.transitionId
								? updatedTransition
								: transition,
					),
				}
			: track,
	);

	await saveProjectState({ state });
	return {
		success: true,
		message: `Updated transition "${parsed.transitionId}".`,
		data: {
			revision: state.revision,
			trackId: parsed.trackId,
			transitionCount: countNativeTransitions({ state }),
			transition: updatedTransition,
		},
	};
}

async function runRemoveTransition({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = removeTransitionArgsSchema.parse(args);
	const trackResult = findVideoTrackForTransition({
		state,
		trackId: parsed.trackId,
	});
	if (!trackResult.success) return trackResult;
	const transitionResult = findTransitionOnTrack({
		track: trackResult.track,
		transitionId: parsed.transitionId,
	});
	if (!transitionResult.success) return transitionResult;
	state.tracks = state.tracks.map((track) =>
		track.id === parsed.trackId && track.type === "video"
			? removeTransitionFromTrack({
					track: track as VideoTrack,
					transitionId: parsed.transitionId,
				})
			: track,
	);

	await saveProjectState({ state });
	return {
		success: true,
		message: `Removed transition "${parsed.transitionId}".`,
		data: {
			revision: state.revision,
			trackId: parsed.trackId,
			transitionCount: countNativeTransitions({ state }),
			removedTransition: transitionResult.transition,
		},
	};
}

async function runRippleDeleteRanges({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = rippleDeleteRangesArgsSchema.parse(args);
	const summary = rippleDeleteRanges({
		state,
		scope: parsed.scope,
		ranges: parsed.ranges,
	});
	await saveProjectState({ state });
	return {
		success: true,
		message: `Ripple deleted ${summary.removedRanges.length} range(s).`,
		data: { ...summary, revision: state.revision },
	};
}

function runListModels({ args }: { args: Record<string, unknown> }) {
	const parsed = listModelsArgsSchema.parse(args);
	const models = [];
	if (!parsed.type || parsed.type === "transcription") {
		models.push(
			...TRANSCRIPTION_MODELS.map((model) => ({
				type: "transcription",
				id: model.id,
				name: model.name,
				description: model.description,
				huggingFaceId: model.huggingFaceId,
				encoderDtype: model.encoderDtype,
			})),
		);
	}
	if (!parsed.type || parsed.type === "digital_human") {
		models.push({
			type: "digital_human",
			id: RUNNINGHUB_DIGITAL_HUMAN_PROVIDER_ID,
			displayName: "RunningHub Digital Human",
			inputs: [
				"imageMediaId",
				"audioMediaId",
				"scriptText",
				"motionPrompt",
				"width",
				"height",
				"fps",
			],
			requiredMediaTypes: {
				imageMediaId: "image",
				audioMediaId: "audio",
			},
		});
	}
	if (!parsed.type || parsed.type === "voice") {
		models.push(
			{
				type: "voice",
				id: RUNNINGHUB_VOICE_DESIGN_PROVIDER_ID,
				displayName: "RunningHub Voice Design",
				inputs: ["text", "emotionPrompt"],
			},
			{
				type: "voice",
				id: RUNNINGHUB_VOICE_CLONE_PROVIDER_ID,
				displayName: "RunningHub Voice Clone",
				inputs: ["audioPath", "text"],
				requiredLocalInputs: {
					audioPath: "audio",
				},
			},
		);
	}
	return {
		success: true,
		message: `Found ${models.length} callable model(s).`,
		data: {
			models,
			defaults: { transcription: DEFAULT_TRANSCRIPTION_MODEL },
			supportedLanguages: TRANSCRIPTION_LANGUAGES.map((language) => ({
				code: language.code,
				name: language.name,
			})),
		},
	};
}

function mediaMatchesQuery({
	asset,
	query,
}: {
	asset: ExecutorMediaAsset;
	query: string;
}) {
	const haystack =
		`${asset.name} ${asset.type} ${asset.mimeType}`.toLowerCase();
	return haystack.includes(query.toLowerCase());
}

function scoreText({ text, query }: { text: string; query: string }) {
	const loweredText = text.toLowerCase();
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	return terms.reduce(
		(total, term) => total + (loweredText.includes(term) ? 1 : 0),
		0,
	);
}

async function runSearchMedia({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
}) {
	const parsed = searchMediaArgsSchema.parse(args);
	const scope = parsed.scope ?? "both";
	const limit = parsed.limit ?? 10;
	const candidates = state.mediaAssets.filter(
		(asset) => !parsed.mediaId || asset.id === parsed.mediaId,
	);
	if (parsed.mediaId && candidates.length === 0) {
		return {
			success: false,
			message: `Media asset '${parsed.mediaId}' not found`,
		};
	}
	const metadata =
		scope === "spoken"
			? []
			: candidates
					.filter((asset) => mediaMatchesQuery({ asset, query: parsed.query }))
					.slice(0, limit)
					.map((asset) => ({
						mediaId: asset.id,
						name: asset.name,
						type: asset.type,
						mimeType: asset.mimeType,
					}));
	const spoken: Array<{
		mediaId: string;
		name: string;
		startSeconds: number;
		endSeconds: number;
		text: string;
		score: number;
	}> = [];
	const unindexedMediaIds: string[] = [];
	if (scope !== "metadata") {
		for (const asset of candidates.filter(
			(candidate) => candidate.type === "video" || candidate.type === "audio",
		)) {
			const cache = await readTranscriptCacheOrNull({
				projectId: state.project.id,
				mediaId: asset.id,
			});
			if (!cache) {
				unindexedMediaIds.push(asset.id);
				continue;
			}
			for (const segment of cache.segments) {
				const score = scoreText({ text: segment.text, query: parsed.query });
				if (score <= 0) continue;
				spoken.push({
					mediaId: asset.id,
					name: asset.name,
					startSeconds: segment.start,
					endSeconds: segment.end,
					text: segment.text,
					score,
				});
			}
		}
	}
	spoken.sort((left, right) => right.score - left.score);
	return {
		success: true,
		message: `Found ${metadata.length + spoken.length} media search hit(s).`,
		data: {
			query: parsed.query,
			scope,
			metadata,
			spoken: spoken.slice(0, limit),
			unindexedMediaIds,
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
	generateVoiceDesign,
	generateVoiceClone,
	exportProject,
	probeExportedFile,
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
	generateVoiceDesign: ExecutorGenerateVoiceDesign;
	generateVoiceClone: ExecutorGenerateVoiceClone;
	exportProject: ExecutorExportProject;
	probeExportedFile: ExecutorProbeExportedFile;
}) {
	if (command.tool === "get_project_info") {
		return runGetProjectInfo({ state, lastStatus });
	}
	if (command.tool === "update_project_settings") {
		return runUpdateProjectSettings({ state, args: command.args });
	}
	if (command.tool === "update_project_preferences") {
		return runUpdateProjectPreferences({ state, args: command.args });
	}
	if (command.tool === "list_media_assets") {
		return runListMediaAssets({ state });
	}
	if (command.tool === "import_media_file") {
		return runImportMedia({ state, args: command.args });
	}
	if (command.tool === "set_project_cover") {
		return runSetProjectCover({ state, args: command.args });
	}
	if (command.tool === "clear_project_cover") {
		return runClearProjectCover({ state });
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
	if (command.tool === "inspect_timeline") {
		return runInspectTimeline({ state, args: command.args });
	}
	if (command.tool === "build_video_quality_report") {
		return runBuildVideoQualityReport({
			state,
			args: command.args,
			probeExportedFile,
		});
	}
	if (command.tool === "get_transcript") {
		return runGetTranscript({
			state,
			args: command.args,
			transcribeMediaRange,
		});
	}
	if (command.tool === "build_caption_diagnostics") {
		return runBuildCaptionDiagnostics({
			state,
			args: command.args,
			transcribeMediaRange,
		});
	}
	if (command.tool === "build_post_cut_captions") {
		return runBuildPostCutCaptions({
			state,
			args: command.args,
			transcribeMediaRange,
		});
	}
	if (command.tool === "add_texts") {
		return runAddTexts({ state, args: command.args });
	}
	if (command.tool === "add_captions") {
		return runAddCaptions({
			state,
			args: command.args,
			transcribeMediaRange,
		});
	}
	if (command.tool === "list_models") {
		return runListModels({ args: command.args });
	}
	if (command.tool === "search_media") {
		return runSearchMedia({ state, args: command.args });
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
	if (command.tool === "insert_clips") {
		return runInsertClips({ state, args: command.args });
	}
	if (command.tool === "move_clips") {
		return runMoveClips({ state, args: command.args });
	}
	if (command.tool === "remove_clips") {
		return runRemoveClips({ state, args: command.args });
	}
	if (command.tool === "split_clip") {
		return runSplitClip({ state, args: command.args });
	}
	if (command.tool === "set_clip_properties") {
		return runSetClipProperties({ state, args: command.args });
	}
	if (command.tool === "set_keyframes") {
		return runSetKeyframes({ state, args: command.args });
	}
	if (command.tool === "add_transitions") {
		return runAddTransitions({ state, args: command.args });
	}
	if (command.tool === "update_transition") {
		return runUpdateTransition({ state, args: command.args });
	}
	if (command.tool === "remove_transition") {
		return runRemoveTransition({ state, args: command.args });
	}
	if (command.tool === "ripple_delete_ranges") {
		return runRippleDeleteRanges({ state, args: command.args });
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
	if (command.tool === "generate_runninghub_voice_design") {
		return runGenerateRunningHubVoiceDesign({
			state,
			args: command.args,
			env,
			generateVoiceDesign,
		});
	}
	if (command.tool === "generate_runninghub_voice_clone") {
		return runGenerateRunningHubVoiceClone({
			state,
			args: command.args,
			env,
			generateVoiceClone,
		});
	}
	if (command.tool === "export_project") {
		return runExportProject({
			state,
			args: command.args,
			exportProject,
			probeExportedFile,
		});
	}
	if (command.tool === "verify_timeline") {
		return runVerifyTimeline({ state, args: command.args });
	}
	if (command.tool === "get_timeline_state") {
		return runGetTimelineState({ state, args: command.args });
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

const defaultGenerateVoiceDesign: ExecutorGenerateVoiceDesign = ({
	apiKey,
	request,
}) =>
	generateRunningHubVoiceDesignFromRequest({
		apiKey,
		request,
	});

const defaultGenerateVoiceClone: ExecutorGenerateVoiceClone = ({
	apiKey,
	referenceAudioPath,
	request,
}) =>
	generateRunningHubVoiceCloneFromReferenceAudioPath({
		apiKey,
		referenceAudioPath,
		request,
	});

const defaultExportProject: ExecutorExportProject = async (params) => {
	const { exportProjectWithNodeRenderer } = await import("./node-exporter");
	return exportProjectWithNodeRenderer(params);
};

export async function executeCodexExecutorEnvelope({
	envelope,
	transcribeMedia = transcribeMediaWithNodeRuntime,
	probeAudio = defaultBuildVideoContextProbeAudio,
	transcribeMediaRange = transcribeMediaRangeWithNodeRuntime,
	inspectVideoRange = inspectVideoRangeWithNodeRuntime,
	env = process.env,
	generateDigitalHuman = defaultGenerateDigitalHuman,
	generateVoiceDesign = defaultGenerateVoiceDesign,
	generateVoiceClone = defaultGenerateVoiceClone,
	exportProject = defaultExportProject,
	probeExportedFile = probeExportedFileWithFfprobe,
}: {
	envelope: unknown;
	transcribeMedia?: ExecutorTranscribeMedia;
	probeAudio?: ProbeAudio;
	transcribeMediaRange?: ExecutorTranscribeMediaRange;
	inspectVideoRange?: InspectVideoRange;
	env?: Record<string, string | undefined>;
	generateDigitalHuman?: ExecutorGenerateDigitalHuman;
	generateVoiceDesign?: ExecutorGenerateVoiceDesign;
	generateVoiceClone?: ExecutorGenerateVoiceClone;
	exportProject?: ExecutorExportProject;
	probeExportedFile?: ExecutorProbeExportedFile;
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
				generateVoiceDesign,
				generateVoiceClone,
				exportProject,
				probeExportedFile,
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
