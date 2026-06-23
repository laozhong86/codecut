import type { CanvasRenderer } from "../canvas-renderer";
import { BaseNode } from "./base-node";
import type {
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
		throw new Error("Timeline sourceCrop is outside the rendered source frame.");
	}
	return crop;
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
		const containScale = Math.min(
			renderer.width / crop.width,
			renderer.height / crop.height,
		);
		const scaledWidth = crop.width * containScale * transform.scale;
		const scaledHeight = crop.height * containScale * transform.scale;
		const x = renderer.width / 2 + transform.position.x - scaledWidth / 2;
		const y = renderer.height / 2 + transform.position.y - scaledHeight / 2;

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
