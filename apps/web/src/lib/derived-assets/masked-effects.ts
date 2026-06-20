import { DEFAULT_TEXT_ELEMENT } from "@/constants/text-constants";
import type { MediaAsset } from "@/types/assets";
import type { DerivedAsset } from "@/types/project";
import type { TextElement, TimelineTrack, VideoElement } from "@/types/timeline";
import { generateUUID } from "@/utils/id";

type RequiredVideoMediaAsset = MediaAsset & {
	type: "video";
	duration: number;
};

export interface TextBackgroundEffectParams {
	sourceMediaId: string;
	derivedAssetId: string;
	content: string;
	startTime: number;
	duration: number;
	mediaAssets: MediaAsset[];
	derivedAssets: DerivedAsset[];
	generateId?: () => string;
}

export interface TimelineEffectResult {
	tracks: TimelineTrack[];
}

function requireVideoAsset({
	mediaId,
	mediaAssets,
	label,
}: {
	mediaId: string;
	mediaAssets: MediaAsset[];
	label: string;
}): RequiredVideoMediaAsset {
	const asset = mediaAssets.find((item) => item.id === mediaId);
	if (!asset) {
		throw new Error(`${label} media asset was not found.`);
	}
	if (asset.type !== "video") {
		throw new Error(`${label} media asset must be video.`);
	}
	if (typeof asset.duration !== "number" || asset.duration <= 0) {
		throw new Error(`${label} media duration is required.`);
	}
	return asset as RequiredVideoMediaAsset;
}

function requirePersonMask({
	derivedAssetId,
	derivedAssets,
}: {
	derivedAssetId: string;
	derivedAssets: DerivedAsset[];
}): DerivedAsset {
	const asset = derivedAssets.find((item) => item.id === derivedAssetId);
	if (!asset) {
		throw new Error("Person mask derived asset was not found.");
	}
	return asset;
}

function validateRange({
	startTime,
	duration,
	sourceDuration,
}: {
	startTime: number;
	duration: number;
	sourceDuration: number;
}): void {
	if (startTime < 0) {
		throw new Error("Effect start time must be non-negative.");
	}
	if (duration <= 0) {
		throw new Error("Effect duration must be positive.");
	}
	if (startTime + duration > sourceDuration) {
		throw new Error("Effect time range exceeds source media duration.");
	}
}

export function createTextBackgroundEffect({
	sourceMediaId,
	derivedAssetId,
	content,
	startTime,
	duration,
	mediaAssets,
	derivedAssets,
	generateId = generateUUID,
}: TextBackgroundEffectParams): TimelineEffectResult {
	const sourceMedia = requireVideoAsset({
		mediaId: sourceMediaId,
		mediaAssets,
		label: "Source",
	});
	const personMask = requirePersonMask({ derivedAssetId, derivedAssets });

	if (personMask.sourceMediaId !== sourceMediaId) {
		throw new Error("Person mask does not belong to the source media.");
	}
	requireVideoAsset({
		mediaId: personMask.alphaMediaId,
		mediaAssets,
		label: "Person mask alpha",
	});
	validateRange({
		startTime,
		duration,
		sourceDuration: sourceMedia.duration,
	});
	validateRange({
		startTime,
		duration,
		sourceDuration: personMask.duration,
	});

	const sourceElement: VideoElement = {
		id: generateId(),
		type: "video",
		name: `${sourceMedia.name} background`,
		mediaId: sourceMediaId,
		duration,
		startTime,
		trimStart: startTime,
		trimEnd: startTime + duration,
		muted: false,
		hidden: false,
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
	};
	const textElement: TextElement = {
		...DEFAULT_TEXT_ELEMENT,
		id: generateId(),
		type: "text",
		name: "Text behind person",
		content,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		fontSize: 18,
		fontWeight: "bold",
		backgroundColor: "transparent",
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
	};
	const foregroundElement: VideoElement = {
		...sourceElement,
		id: generateId(),
		name: `${sourceMedia.name} masked foreground`,
		mask: {
			type: "person-mask",
			derivedAssetId,
		},
	};

	return {
		tracks: [
			{
				id: generateId(),
				name: "Masked foreground",
				type: "video",
				elements: [foregroundElement],
				isMain: false,
				muted: false,
				hidden: false,
			},
			{
				id: generateId(),
				name: "Text behind person",
				type: "text",
				elements: [textElement],
				hidden: false,
			},
			{
				id: generateId(),
				name: "Source background",
				type: "video",
				elements: [sourceElement],
				isMain: true,
				muted: false,
				hidden: false,
			},
		],
	};
}
