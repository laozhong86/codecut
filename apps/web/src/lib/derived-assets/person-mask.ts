import type { MediaAsset } from "@/types/assets";
import type { DerivedAsset } from "@/types/project";
import { generateUUID } from "@/utils/id";

export interface PersonMaskAlphaResult {
	alphaMediaId: string;
	duration: number;
	width: number;
	height: number;
	fps: number;
	confidence: number;
}

export interface GeneratePersonMaskParams {
	projectId: string;
	sourceMediaId: string;
	mediaAssets: MediaAsset[];
	createAlphaMask({
		projectId,
		sourceMedia,
	}: {
		projectId: string;
		sourceMedia: MediaAsset;
	}): Promise<PersonMaskAlphaResult>;
	now?: () => Date;
}

const MIN_CONFIDENCE = 0.6;
const DURATION_TOLERANCE_SECONDS = 0.05;

export async function generatePersonMask({
	projectId,
	sourceMediaId,
	mediaAssets,
	createAlphaMask,
	now = () => new Date(),
}: GeneratePersonMaskParams): Promise<DerivedAsset> {
	const sourceMedia = mediaAssets.find((asset) => asset.id === sourceMediaId);
	if (!sourceMedia) {
		throw new Error("Person mask source media was not found.");
	}
	if (sourceMedia.type !== "video") {
		throw new Error("Person mask source media must be video.");
	}
	if (typeof sourceMedia.duration !== "number" || sourceMedia.duration <= 0) {
		throw new Error("Person mask source media duration is required.");
	}
	if (typeof sourceMedia.width !== "number" || sourceMedia.width <= 0) {
		throw new Error("Person mask source media width is required.");
	}
	if (typeof sourceMedia.height !== "number" || sourceMedia.height <= 0) {
		throw new Error("Person mask source media height is required.");
	}

	const alpha = await createAlphaMask({ projectId, sourceMedia });
	if (!alpha.alphaMediaId) {
		throw new Error("Person mask alpha media asset is required.");
	}
	if (alpha.confidence < MIN_CONFIDENCE) {
		throw new Error("Person mask confidence is below 0.6.");
	}
	if (
		Math.abs(alpha.duration - sourceMedia.duration) >
		DURATION_TOLERANCE_SECONDS
	) {
		throw new Error("Person mask duration does not match source media.");
	}
	if (alpha.width !== sourceMedia.width || alpha.height !== sourceMedia.height) {
		throw new Error("Person mask dimensions do not match source media.");
	}
	if (alpha.fps <= 0) {
		throw new Error("Person mask fps is required.");
	}

	return {
		id: `person-mask-${generateUUID()}`,
		type: "person-mask",
		sourceMediaId,
		alphaMediaId: alpha.alphaMediaId,
		duration: alpha.duration,
		width: alpha.width,
		height: alpha.height,
		fps: alpha.fps,
		confidence: alpha.confidence,
		createdAt: now().toISOString(),
	};
}
