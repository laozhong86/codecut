import type { TimelineElement, Transform } from "@/types/timeline";
import type { MediaAsset } from "@/types/assets";
import { isBottomAlignedSubtitleText } from "@/lib/timeline/text-utils";
import {
	measureTextElementBounds,
	type TextMeasureFunction,
} from "@/services/renderer/nodes/text-node";

export interface ElementHalfSize {
	halfWidth: number;
	halfHeight: number;
}

export function getElementHalfSize({
	element,
	transform,
	mediaMap,
	canvasWidth,
	canvasHeight,
	measureText,
}: {
	element: TimelineElement;
	transform: Transform;
	mediaMap: Map<string, MediaAsset>;
	canvasWidth: number;
	canvasHeight: number;
	measureText?: TextMeasureFunction;
}): ElementHalfSize | null {
	if (element.type === "video" || element.type === "image") {
		const media = mediaMap.get(element.mediaId);
		const mediaW = media?.width || canvasWidth;
		const mediaH = media?.height || canvasHeight;
		const containScale = Math.min(canvasWidth / mediaW, canvasHeight / mediaH);
		return {
			halfWidth: (mediaW * containScale * transform.scale) / 2,
			halfHeight: (mediaH * containScale * transform.scale) / 2,
		};
	}

	if (element.type === "text") {
		if (!measureText) {
			throw new Error("Text element bounds require a text measurement function.");
		}

		const bounds = measureTextElementBounds({
			element,
			canvasHeight,
			measureText,
			includeBackground: true,
			textBaseline: isBottomAlignedSubtitleText({ element }) ? "bottom" : "middle",
		});
		return {
			halfWidth: (bounds.width * transform.scale) / 2,
			halfHeight: (bounds.height * transform.scale) / 2,
		};
	}

	if (element.type === "sticker") {
		const stickerSource = 200;
		const containScale = Math.min(
			canvasWidth / stickerSource,
			canvasHeight / stickerSource,
		);
		const half = (stickerSource * containScale * transform.scale) / 2;
		return { halfWidth: half, halfHeight: half };
	}

	return null;
}

/**
 * Returns the element center in absolute canvas coordinates.
 * position is relative to canvas center; this converts to absolute (0,0 = top-left).
 */
export function getElementCenterInCanvas({
	element,
	transform,
	canvasWidth,
	canvasHeight,
	halfSize,
}: {
	element: TimelineElement;
	transform: Transform;
	canvasWidth: number;
	canvasHeight: number;
	halfSize: ElementHalfSize;
}): { x: number; y: number } {
	const isBottomAlignedText =
		element.type === "text" && isBottomAlignedSubtitleText({ element });

	const centerY = isBottomAlignedText
		? canvasHeight / 2 + transform.position.y - halfSize.halfHeight
		: canvasHeight / 2 + transform.position.y;

	return {
		x: canvasWidth / 2 + transform.position.x,
		y: centerY,
	};
}
