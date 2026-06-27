import type { MediaAsset } from "@/types/assets";
import type {
	AudioTrack,
	ImageElement,
	TextElement,
	TextTrack,
	TimelineTrack,
	UploadAudioElement,
	VideoElement,
	VideoTrack,
	Transform,
} from "@/types/timeline";
import { calculateTotalDuration } from "@/lib/timeline";
import { resolveCaptionStylePreset } from "@/lib/agent-bridge/edit-plan/text-presets";
import {
	buildImageElement,
	buildTextElement,
	buildUploadAudioElement,
	buildVideoElement,
} from "@/lib/timeline/element-utils";
import { CODECUT_CJK_FONT_FAMILY } from "@/lib/codecut-fonts";
import { generateUUID } from "@/utils/id";
import type { NarratedRemixPlan } from "./schema";
import {
	type NarratedRemixDurationContract,
	type NarratedRemixDurationContractSummary,
	type NarratedRemixDurationGoal,
	resolveNarratedRemixNarrationPlacement,
	validateNarratedRemixPlan,
} from "./validate";

export interface NarratedRemixEditor {
	media: {
		getAssets(): MediaAsset[];
	};
	timeline: {
		getTracks(): TimelineTrack[];
		updateTracks(tracks: TimelineTrack[]): void;
	};
}

export type ApplyNarratedRemixPlanResult =
	| {
			success: true;
			summary: {
				visualBeatCount: number;
				imageBeatCount: number;
				audioElementCount: number;
				captionCount: number;
				textOverlayElementCount: number;
				totalDuration: number;
				rationale: string;
				durationContract?: NarratedRemixDurationContractSummary;
			};
	  }
	| { success: false; message: string; path?: string };

function hasTimelineElements({ tracks }: { tracks: TimelineTrack[] }): boolean {
	return tracks.some((track) => track.elements.length > 0);
}

function getAssetName({
	mediaAssets,
	mediaId,
}: {
	mediaAssets: MediaAsset[];
	mediaId: string;
}): string {
	const asset = mediaAssets.find((candidate) => candidate.id === mediaId);
	if (!asset) {
		throw new Error(`NarratedRemixPlan media asset "${mediaId}" disappeared.`);
	}
	return asset.name;
}

type NarratedRemixVisualBeat = NarratedRemixPlan["visualBeats"][number];
type NarratedRemixImageBeat = Extract<
	NarratedRemixVisualBeat,
	{ mediaType: "image" }
>;
type NarratedRemixTextOverlay = NonNullable<
	NarratedRemixPlan["textOverlays"]
>[number];

function isImageBeat(
	visualBeat: NarratedRemixVisualBeat,
): visualBeat is NarratedRemixImageBeat {
	return visualBeat.mediaType === "image";
}

function getAspectRatioDimensions({
	aspectRatio,
}: {
	aspectRatio: NarratedRemixPlan["target"]["aspectRatio"];
}): { width: number; height: number } {
	if (aspectRatio === "9:16") return { width: 9, height: 16 };
	if (aspectRatio === "1:1") return { width: 1, height: 1 };
	return { width: 16, height: 9 };
}

function requireSourceDimension({
	value,
	label,
}: {
	value: number | undefined;
	label: string;
}): number {
	if (typeof value !== "number" || value <= 0) {
		throw new Error(
			`NarratedRemixPlan image cover fit requires source media ${label}.`,
		);
	}
	return value;
}

function getCoverTransform({
	sourceWidth,
	sourceHeight,
	aspectRatio,
}: {
	sourceWidth: number;
	sourceHeight: number;
	aspectRatio: NarratedRemixPlan["target"]["aspectRatio"];
}): Transform {
	const target = getAspectRatioDimensions({ aspectRatio });
	const containScale = Math.min(
		target.width / sourceWidth,
		target.height / sourceHeight,
	);
	const coverScale = Math.max(
		target.width / sourceWidth,
		target.height / sourceHeight,
	);
	return {
		scale: coverScale / containScale,
		position: { x: 0, y: 0 },
		rotate: 0,
	};
}

function buildVisualBeatElement({
	visualBeat,
	mediaAssets,
	plan,
}: {
	visualBeat: NarratedRemixPlan["visualBeats"][number];
	mediaAssets: MediaAsset[];
	plan: NarratedRemixPlan;
}): VideoElement | ImageElement {
	if (isImageBeat(visualBeat)) {
		const mediaAsset = mediaAssets.find(
			(candidate) => candidate.id === visualBeat.mediaId,
		);
		if (!mediaAsset) {
			throw new Error(
				`NarratedRemixPlan media asset "${visualBeat.mediaId}" disappeared.`,
			);
		}
		return {
			...buildImageElement({
				mediaId: visualBeat.mediaId,
				name: `${mediaAsset.name} ${visualBeat.id}`,
				duration: visualBeat.duration,
				startTime: visualBeat.timelineStart,
			}),
			id: generateUUID(),
			transform: getCoverTransform({
				sourceWidth: requireSourceDimension({
					value: mediaAsset.width,
					label: "width",
				}),
				sourceHeight: requireSourceDimension({
					value: mediaAsset.height,
					label: "height",
				}),
				aspectRatio: plan.target.aspectRatio,
			}),
		};
	}

	return {
		...buildVideoElement({
			mediaId: visualBeat.mediaId,
			name: `${getAssetName({
				mediaAssets,
				mediaId: visualBeat.mediaId,
			})} ${visualBeat.id}`,
			duration: visualBeat.sourceEnd - visualBeat.sourceStart,
			startTime: visualBeat.timelineStart,
		}),
		id: generateUUID(),
		trimStart: visualBeat.sourceStart,
		trimEnd: visualBeat.sourceEnd,
		muted: true,
	};
}

function buildNarrationElement({
	plan,
	mediaAssets,
}: {
	plan: NarratedRemixPlan;
	mediaAssets: MediaAsset[];
}): UploadAudioElement {
	const narrationAsset = mediaAssets.find(
		(candidate) => candidate.id === plan.narration.mediaId,
	);
	if (!narrationAsset) {
		throw new Error(
			`NarratedRemixPlan media asset "${plan.narration.mediaId}" disappeared.`,
		);
	}
	const placement = resolveNarratedRemixNarrationPlacement({
		plan,
		narrationAsset,
	});
	return {
		...buildUploadAudioElement({
			mediaId: plan.narration.mediaId,
			name: getAssetName({
				mediaAssets,
				mediaId: plan.narration.mediaId,
			}),
			duration: placement.durationSec,
			startTime: placement.timelineStart,
		}),
		id: generateUUID(),
		trimStart: placement.sourceStart,
		trimEnd: placement.sourceEnd,
		volume: 1,
		muted: false,
	};
}

function buildCaptionElement({
	text,
	startTime,
	duration,
	plan,
}: {
	text: string;
	startTime: number;
	duration: number;
	plan: NarratedRemixPlan;
}): TextElement {
	if (!plan.captionStyle) {
		throw new Error("NarratedRemixPlan captionStyle is required for captions.");
	}
	const element = buildTextElement({
		raw: {
			...resolveCaptionStylePreset({
				captionStyle: plan.captionStyle,
				aspectRatio: plan.target.aspectRatio,
			}),
			name: "Caption",
			content: text,
			duration,
		},
		startTime,
	});
	if (element.type !== "text") {
		throw new Error("Caption builder returned a non-text element.");
	}
	return { ...element, id: generateUUID() };
}

function buildTextOverlayElement({
	overlay,
}: {
	overlay: NarratedRemixTextOverlay;
}): TextElement {
	const element = buildTextElement({
		raw: {
			name: overlay.name,
			content: overlay.text,
			duration: overlay.duration,
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: overlay.fontSize,
			color: overlay.color,
			backgroundColor: overlay.backgroundColor,
			backgroundOpacity: overlay.backgroundOpacity,
			backgroundPaddingX: overlay.backgroundPaddingX,
			backgroundPaddingY: overlay.backgroundPaddingY,
			backgroundBorderRadius: overlay.backgroundBorderRadius,
			boxWidth: overlay.boxWidth,
			textAlign: overlay.textAlign,
			fontWeight: overlay.fontWeight,
			fontStyle: "normal",
			textDecoration: "none",
			opacity: 1,
			transform: {
				scale: 1,
				position: overlay.position,
				rotate: 0,
			},
		},
		startTime: overlay.startTime,
	});
	if (element.type !== "text") {
		throw new Error("Text overlay builder returned a non-text element.");
	}
	return { ...element, id: generateUUID() };
}

function buildTextOverlayElements({
	plan,
}: {
	plan: NarratedRemixPlan;
}): TextElement[] {
	return (plan.textOverlays ?? []).map((overlay) =>
		buildTextOverlayElement({ overlay }),
	);
}

function buildNarratedRemixTracks({
	plan,
	mediaAssets,
}: {
	plan: NarratedRemixPlan;
	mediaAssets: MediaAsset[];
}): TimelineTrack[] {
	const videoTrack: VideoTrack = {
		id: generateUUID(),
		type: "video",
		name: "Narrated remix B-roll",
		isMain: true,
		muted: false,
		hidden: false,
		elements: plan.visualBeats.map((visualBeat) =>
			buildVisualBeatElement({
				visualBeat,
				mediaAssets,
				plan,
			}),
		),
	};

	const audioTrack: AudioTrack = {
		id: generateUUID(),
		type: "audio",
		name: "Narration",
		muted: false,
		elements: [buildNarrationElement({ plan, mediaAssets })],
	};

	const textOverlayElements = buildTextOverlayElements({ plan });
	const textOverlayTrack: TextTrack | null =
		textOverlayElements.length > 0
			? {
					id: generateUUID(),
					type: "text",
					name: "Text Overlays",
					hidden: false,
					elements: textOverlayElements,
				}
			: null;

	const textTrack: TextTrack = {
		id: generateUUID(),
		type: "text",
		name: "Captions",
		hidden: false,
		elements: plan.captions.map((caption) =>
			buildCaptionElement({
				text: caption.text,
				startTime: caption.startTime,
				duration: caption.duration,
				plan,
			}),
		),
	};

	return [
		videoTrack,
		audioTrack,
		...(textOverlayTrack ? [textOverlayTrack] : []),
		textTrack,
	];
}

export function applyNarratedRemixPlanToEditor({
	plan,
	projectId,
	replaceExisting,
	editor,
	durationContract,
	durationGoal,
}: {
	plan: unknown;
	projectId: string;
	replaceExisting: boolean;
	editor: NarratedRemixEditor;
	durationContract?: NarratedRemixDurationContract;
	durationGoal?: NarratedRemixDurationGoal;
}): ApplyNarratedRemixPlanResult {
	const mediaAssets = editor.media.getAssets();
	const validation = validateNarratedRemixPlan({
		plan,
		projectId,
		mediaAssets,
		durationContract,
		durationGoal,
	});
	if (!validation.success) {
		return validation;
	}

	const existingTracks = editor.timeline.getTracks();
	if (hasTimelineElements({ tracks: existingTracks }) && !replaceExisting) {
		return {
			success: false,
			message:
				"Timeline is not empty. Pass replaceExisting=true to apply a NarratedRemixPlan.",
		};
	}

	const normalizedPlan = validation.normalizedPlan;
	const nextTracks = buildNarratedRemixTracks({
		plan: normalizedPlan,
		mediaAssets,
	});
	editor.timeline.updateTracks(nextTracks);

	return {
		success: true,
		summary: {
			visualBeatCount: normalizedPlan.visualBeats.length,
			imageBeatCount: normalizedPlan.visualBeats.filter(isImageBeat).length,
			audioElementCount: 1,
			captionCount: normalizedPlan.captions.length,
			textOverlayElementCount: normalizedPlan.textOverlays?.length ?? 0,
			totalDuration: calculateTotalDuration({ tracks: nextTracks }),
			rationale: normalizedPlan.rationale,
			...(validation.durationContract
				? { durationContract: validation.durationContract }
				: {}),
		},
	};
}
