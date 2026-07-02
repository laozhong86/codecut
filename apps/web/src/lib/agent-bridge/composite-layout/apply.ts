import type { MediaAsset } from "@/types/assets";
import type {
	ImageElement,
	LayoutSlot,
	TimelineTrack,
	VideoElement,
} from "@/types/timeline";
import {
	buildImageElement,
	buildVideoElement,
} from "@/lib/timeline/element-utils";
import { generateUUID } from "@/utils/id";
import type { CompositeLayoutPlan } from "./schema";
import {
	resolveCompositeLayoutSlots,
	validateCompositeLayoutPlan,
} from "./validate";

export interface CompositeLayoutEditor {
	media: {
		getAssets(): MediaAsset[];
	};
	timeline: {
		getTracks(): TimelineTrack[];
		updateTracks(tracks: TimelineTrack[]): void;
	};
}

export type ApplyCompositeLayoutPlanResult =
	| {
			success: true;
			summary: {
				networkMaterialElementCount: number;
				presenterElementCount: number;
				totalDuration: number;
				placement: CompositeLayoutPlan["placement"];
				rationale: string;
			};
	  }
	| { success: false; message: string; path?: string };

export function applyCompositeLayoutPlanToEditor({
	editor,
	plan,
	replaceExisting = false,
}: {
	editor: CompositeLayoutEditor;
	plan: unknown;
	replaceExisting?: boolean;
}): ApplyCompositeLayoutPlanResult {
	const validation = validateCompositeLayoutPlan({ plan });
	if (!validation.success) {
		return validation;
	}

	const normalizedPlan = validation.normalizedPlan;
	const previousTracks = editor.timeline.getTracks();
	if (
		!replaceExisting &&
		previousTracks.some((track) => track.elements.length > 0)
	) {
		return {
			success: false,
			message:
				"CompositeLayoutPlan cannot apply over an existing timeline unless replaceExisting is true.",
		};
	}

	try {
		const mediaAssets = editor.media.getAssets();
		const slots = resolveCompositeLayoutSlots({
			aspectRatio: normalizedPlan.target.aspectRatio,
			placement: normalizedPlan.placement,
		});
		const networkElements = normalizedPlan.networkMaterialBeats.map((beat) =>
			buildNetworkMaterialElement({
				beat,
				mediaAssets,
				layoutSlot: toLayoutSlot(slots.networkMaterial),
			}),
		);
		const presenterElement = buildPresenterElement({
			plan: normalizedPlan,
			mediaAssets,
			layoutSlot: toLayoutSlot(slots.presenter),
		});

		editor.timeline.updateTracks([
			buildVideoTrack({
				name: "Network Material",
				isMain: true,
				muted: true,
				elements: networkElements,
			}),
			buildVideoTrack({
				name: "Presenter",
				isMain: false,
				muted: false,
				elements: [presenterElement],
			}),
		]);

		return {
			success: true,
			summary: {
				networkMaterialElementCount: networkElements.length,
				presenterElementCount: 1,
				totalDuration: normalizedPlan.target.durationSec,
				placement: normalizedPlan.placement,
				rationale: normalizedPlan.rationale,
			},
		};
	} catch (error) {
		editor.timeline.updateTracks(previousTracks);
		return {
			success: false,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

type CompositeLayoutBeat = CompositeLayoutPlan["networkMaterialBeats"][number];

function buildNetworkMaterialElement({
	beat,
	mediaAssets,
	layoutSlot,
}: {
	beat: CompositeLayoutBeat;
	mediaAssets: MediaAsset[];
	layoutSlot: LayoutSlot;
}): VideoElement | ImageElement {
	const asset = requireVisualMediaAsset({
		mediaAssets,
		mediaId: beat.mediaId,
	});
	const duration = beat.sourceEnd - beat.sourceStart;
	if (asset.type === "image") {
		return {
			...buildImageElement({
				mediaId: beat.mediaId,
				name: `${asset.name} ${beat.id}`,
				duration,
				startTime: beat.timelineStart,
			}),
			id: generateUUID(),
			trimStart: beat.sourceStart,
			trimEnd: beat.sourceEnd,
			layoutSlot,
		};
	}
	return {
		...buildVideoElement({
			mediaId: beat.mediaId,
			name: `${asset.name} ${beat.id}`,
			duration,
			startTime: beat.timelineStart,
		}),
		id: generateUUID(),
		trimStart: beat.sourceStart,
		trimEnd: beat.sourceEnd,
		muted: true,
		layoutSlot,
	};
}

function buildPresenterElement({
	plan,
	mediaAssets,
	layoutSlot,
}: {
	plan: CompositeLayoutPlan;
	mediaAssets: MediaAsset[];
	layoutSlot: LayoutSlot;
}): VideoElement {
	const asset = requireVisualMediaAsset({
		mediaAssets,
		mediaId: plan.presenter.mediaId,
	});
	if (asset.type !== "video") {
		throw new Error("CompositeLayoutPlan presenter media must be video.");
	}
	return {
		...buildVideoElement({
			mediaId: plan.presenter.mediaId,
			name: `${asset.name} Presenter`,
			duration: plan.presenter.sourceEnd - plan.presenter.sourceStart,
			startTime: 0,
		}),
		id: generateUUID(),
		trimStart: plan.presenter.sourceStart,
		trimEnd: plan.presenter.sourceEnd,
		muted: false,
		layoutSlot,
		...(plan.presenter.maskMediaId
			? {
					mask: {
						type: "person-mask" as const,
						derivedAssetId: plan.presenter.maskMediaId,
					},
				}
			: {}),
	};
}

function requireVisualMediaAsset({
	mediaAssets,
	mediaId,
}: {
	mediaAssets: MediaAsset[];
	mediaId: string;
}): MediaAsset {
	const asset = mediaAssets.find((candidate) => candidate.id === mediaId);
	if (!asset) {
		throw new Error(
			`CompositeLayoutPlan media asset ${mediaId} was not found.`,
		);
	}
	if (asset.type !== "video" && asset.type !== "image") {
		throw new Error(
			`CompositeLayoutPlan media asset ${mediaId} must be visual.`,
		);
	}
	if (
		typeof asset.width !== "number" ||
		asset.width <= 0 ||
		typeof asset.height !== "number" ||
		asset.height <= 0
	) {
		throw new Error(
			`CompositeLayoutPlan media asset ${mediaId} requires width and height.`,
		);
	}
	return asset;
}

function buildVideoTrack({
	name,
	isMain,
	muted,
	elements,
}: {
	name: string;
	isMain: boolean;
	muted: boolean;
	elements: Array<VideoElement | ImageElement>;
}): TimelineTrack {
	return {
		id: generateUUID(),
		type: "video",
		name,
		elements,
		isMain,
		muted,
		hidden: false,
	};
}

function toLayoutSlot(slot: {
	x: number;
	y: number;
	width: number;
	height: number;
}): LayoutSlot {
	return { ...slot, cropMode: "cover-slot" };
}
