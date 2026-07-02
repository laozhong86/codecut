import type { CanvasRenderer } from "../canvas-renderer";
import { BaseNode } from "./base-node";
import type {
	LayoutSlot,
	SourceCrop,
	TimelineElementKeyframes,
	Transform,
} from "@/types/timeline";
import { applyVisualKeyframes } from "../keyframes";

const VISUAL_EPSILON = 1 / 1000;

export interface VisualNodeParams {
	duration: number;
	timeOffset: number;
	trimStart: number;
	trimEnd: number;
	transform: Transform;
	opacity: number;
	keyframes?: TimelineElementKeyframes;
	sourceCrop?: SourceCrop;
	layoutSlot?: LayoutSlot;
	playbackRate?: number;
	reversed?: boolean;
}

function resolveSourceCrop({
	crop,
	sourceWidth,
	sourceHeight,
}: {
	crop: SourceCrop | undefined;
	sourceWidth: number;
	sourceHeight: number;
}): { x: number; y: number; width: number; height: number } {
	if (!crop) return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
	if (
		!Number.isFinite(crop.x) ||
		!Number.isFinite(crop.y) ||
		!Number.isFinite(crop.width) ||
		!Number.isFinite(crop.height) ||
		crop.x < 0 ||
		crop.y < 0 ||
		crop.width <= 0 ||
		crop.height <= 0 ||
		crop.x + crop.width > sourceWidth ||
		crop.y + crop.height > sourceHeight
	) {
		throw new Error(
			"Timeline sourceCrop is outside the rendered source frame.",
		);
	}
	return crop;
}

export function resolveLayoutSlotRect({
	layoutSlot,
	canvasWidth,
	canvasHeight,
}: {
	layoutSlot: LayoutSlot;
	canvasWidth: number;
	canvasHeight: number;
}): { x: number; y: number; width: number; height: number } {
	if (
		layoutSlot.cropMode !== "cover-slot" ||
		!Number.isFinite(layoutSlot.x) ||
		!Number.isFinite(layoutSlot.y) ||
		!Number.isFinite(layoutSlot.width) ||
		!Number.isFinite(layoutSlot.height) ||
		layoutSlot.x < 0 ||
		layoutSlot.y < 0 ||
		layoutSlot.width <= 0 ||
		layoutSlot.height <= 0 ||
		layoutSlot.x + layoutSlot.width > 1 ||
		layoutSlot.y + layoutSlot.height > 1
	) {
		throw new Error(
			"Timeline layoutSlot must be a valid cover-slot rectangle.",
		);
	}
	return {
		x: layoutSlot.x * canvasWidth,
		y: layoutSlot.y * canvasHeight,
		width: layoutSlot.width * canvasWidth,
		height: layoutSlot.height * canvasHeight,
	};
}

export abstract class VisualNode<
	Params extends VisualNodeParams = VisualNodeParams,
> extends BaseNode<Params> {
	protected getLocalTime(time: number): number {
		const rate = this.params.playbackRate ?? 1;
		const elapsed = time - this.params.timeOffset;
		if (this.params.reversed) {
			return this.params.trimStart + rate * (this.params.duration - elapsed);
		}
		return this.params.trimStart + elapsed * rate;
	}

	protected isInRange(time: number): boolean {
		const localTime = this.getLocalTime(time);
		const rate = this.params.playbackRate ?? 1;
		return (
			localTime >= this.params.trimStart - VISUAL_EPSILON &&
			localTime < this.params.trimStart + this.params.duration * rate
		);
	}

	protected renderVisual({
		renderer,
		source,
		sourceWidth,
		sourceHeight,
		time,
	}: {
		renderer: CanvasRenderer;
		source: CanvasImageSource;
		sourceWidth: number;
		sourceHeight: number;
		time: number;
	}): void {
		renderer.context.save();

		const crop = resolveSourceCrop({
			crop: this.params.sourceCrop,
			sourceWidth,
			sourceHeight,
		});
		const { transform, opacity } = applyVisualKeyframes({
			transform: this.params.transform,
			opacity: this.params.opacity,
			keyframes: this.params.keyframes,
			localTime: time - this.params.timeOffset,
		});
		const slotRect = this.params.layoutSlot
			? resolveLayoutSlotRect({
					layoutSlot: this.params.layoutSlot,
					canvasWidth: renderer.width,
					canvasHeight: renderer.height,
				})
			: { x: 0, y: 0, width: renderer.width, height: renderer.height };
		if (this.params.layoutSlot) {
			renderer.context.beginPath();
			renderer.context.rect(
				slotRect.x,
				slotRect.y,
				slotRect.width,
				slotRect.height,
			);
			renderer.context.clip();
		}
		const baseScale = this.params.layoutSlot
			? Math.max(slotRect.width / crop.width, slotRect.height / crop.height)
			: Math.min(renderer.width / crop.width, renderer.height / crop.height);
		const scaledWidth = crop.width * baseScale * transform.scale;
		const scaledHeight = crop.height * baseScale * transform.scale;
		const x =
			slotRect.x + slotRect.width / 2 + transform.position.x - scaledWidth / 2;
		const y =
			slotRect.y +
			slotRect.height / 2 +
			transform.position.y -
			scaledHeight / 2;

		renderer.context.globalAlpha = opacity;

		const centerX = x + scaledWidth / 2;
		const centerY = y + scaledHeight / 2;

		const needsFlip = transform.flipX || transform.flipY;
		const needsRotate = transform.rotate !== 0;

		if (needsRotate || needsFlip) {
			renderer.context.translate(centerX, centerY);
			if (needsRotate) {
				renderer.context.rotate((transform.rotate * Math.PI) / 180);
			}
			if (needsFlip) {
				renderer.context.scale(
					transform.flipX ? -1 : 1,
					transform.flipY ? -1 : 1,
				);
			}
			renderer.context.translate(-centerX, -centerY);
		}

		renderer.context.drawImage(
			source,
			crop.x,
			crop.y,
			crop.width,
			crop.height,
			x,
			y,
			scaledWidth,
			scaledHeight,
		);
		renderer.context.restore();
	}
}
