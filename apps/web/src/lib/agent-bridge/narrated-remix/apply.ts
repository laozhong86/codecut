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
import { validateNarratedRemixPlan } from "./validate";

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
				cardTextElementCount: number;
				totalDuration: number;
				rationale: string;
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
	return {
		...buildUploadAudioElement({
			mediaId: plan.narration.mediaId,
			name: getAssetName({
				mediaAssets,
				mediaId: plan.narration.mediaId,
			}),
			duration: plan.target.durationSec,
			startTime: 0,
		}),
		id: generateUUID(),
		trimStart: plan.narration.sourceStart,
		trimEnd: plan.narration.sourceStart + plan.target.durationSec,
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

function buildCardTextElement({
	name,
	content,
	startTime,
	duration,
	raw,
}: {
	name: string;
	content: string;
	startTime: number;
	duration: number;
	raw: Parameters<typeof buildTextElement>[0]["raw"];
}): TextElement {
	const element = buildTextElement({
		raw: {
			...raw,
			name,
			content,
			duration,
		},
		startTime,
	});
	if (element.type !== "text") {
		throw new Error("Card text builder returned a non-text element.");
	}
	return { ...element, id: generateUUID() };
}

function buildCardTextElements({
	visualBeat,
}: {
	visualBeat: NarratedRemixImageBeat;
}): TextElement[] {
	const base = {
		fontFamily: CODECUT_CJK_FONT_FAMILY,
		textAlign: "center" as const,
		fontWeight: "bold" as const,
		fontStyle: "normal" as const,
		textDecoration: "none" as const,
		opacity: 1,
		boxWidth: 52,
	};
	return [
		buildCardTextElement({
			name: "Card title",
			content: visualBeat.cardText.title,
			startTime: visualBeat.timelineStart,
			duration: visualBeat.duration,
			raw: {
				...base,
				fontSize: 5.6,
				color: "#ffffff",
				backgroundColor: "#000000",
				backgroundOpacity: 0.86,
				backgroundPaddingX: 22,
				backgroundPaddingY: 10,
				backgroundBorderRadius: 8,
				transform: { scale: 1, position: { x: 0, y: -780 }, rotate: 0 },
			},
		}),
		buildCardTextElement({
			name: "Card info",
			content: visualBeat.cardText.info,
			startTime: visualBeat.timelineStart,
			duration: visualBeat.duration,
			raw: {
				...base,
				fontSize: 4.8,
				color: "#141414",
				backgroundColor: "#ffca21",
				backgroundOpacity: 0.92,
				backgroundPaddingX: 20,
				backgroundPaddingY: 9,
				backgroundBorderRadius: 8,
				transform: { scale: 1, position: { x: 0, y: -710 }, rotate: 0 },
			},
		}),
		buildCardTextElement({
			name: "Card bottomText",
			content: visualBeat.cardText.bottomText,
			startTime: visualBeat.timelineStart,
			duration: visualBeat.duration,
			raw: {
				...base,
				fontSize: 5.2,
				color: "#ffffff",
				backgroundColor: "#000000",
				backgroundOpacity: 0.84,
				backgroundPaddingX: 22,
				backgroundPaddingY: 12,
				backgroundBorderRadius: 10,
				transform: { scale: 1, position: { x: 0, y: 430 }, rotate: 0 },
			},
		}),
	];
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

	const cardTextElements = plan.visualBeats
		.filter(isImageBeat)
		.flatMap((visualBeat) => buildCardTextElements({ visualBeat }));
	const cardTextTrack: TextTrack | null =
		cardTextElements.length > 0
			? {
					id: generateUUID(),
					type: "text",
					name: "Card Text",
					hidden: false,
					elements: cardTextElements,
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
		...(cardTextTrack ? [cardTextTrack] : []),
		textTrack,
	];
}

export function applyNarratedRemixPlanToEditor({
	plan,
	projectId,
	replaceExisting,
	editor,
}: {
	plan: unknown;
	projectId: string;
	replaceExisting: boolean;
	editor: NarratedRemixEditor;
}): ApplyNarratedRemixPlanResult {
	const mediaAssets = editor.media.getAssets();
	const validation = validateNarratedRemixPlan({
		plan,
		projectId,
		mediaAssets,
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
			cardTextElementCount:
				normalizedPlan.visualBeats.filter(isImageBeat).length * 3,
			totalDuration: calculateTotalDuration({ tracks: nextTracks }),
			rationale: normalizedPlan.rationale,
		},
	};
}
