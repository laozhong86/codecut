import type { MediaAsset } from "@/types/assets";
import type {
	AudioTrack,
	TextElement,
	TextTrack,
	TimelineTrack,
	UploadAudioElement,
	VideoElement,
	VideoTrack,
} from "@/types/timeline";
import { calculateTotalDuration } from "@/lib/timeline";
import { resolveCaptionStylePreset } from "@/lib/agent-bridge/edit-plan/text-presets";
import {
	buildTextElement,
	buildUploadAudioElement,
	buildVideoElement,
} from "@/lib/timeline/element-utils";
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
				audioElementCount: number;
				captionCount: number;
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

function buildVisualBeatElement({
	visualBeat,
	mediaAssets,
}: {
	visualBeat: NarratedRemixPlan["visualBeats"][number];
	mediaAssets: MediaAsset[];
}): VideoElement {
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

	return [videoTrack, audioTrack, textTrack];
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
			audioElementCount: 1,
			captionCount: normalizedPlan.captions.length,
			totalDuration: calculateTotalDuration({ tracks: nextTracks }),
			rationale: normalizedPlan.rationale,
		},
	};
}
