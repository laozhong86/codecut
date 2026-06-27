import type { CanvasRenderer } from "../canvas-renderer";
import type { RendererCanvas } from "../runtime";
import { BaseNode } from "./base-node";
import type { TransitionType } from "@/types/timeline";

export interface TransitionNodeParams {
	type: TransitionType;
	duration: number;
	transitionStart: number;
	outgoingNode: BaseNode;
	incomingNode: BaseNode;
	outgoingEndTime: number;
	incomingStartTime: number;
}

export class TransitionNode extends BaseNode<TransitionNodeParams> {
	private outgoing: BaseNode;
	private incoming: BaseNode;
	private offscreenA?: RendererCanvas;
	private offscreenB?: RendererCanvas;

	constructor(params: TransitionNodeParams) {
		super(params);
		this.outgoing = params.outgoingNode;
		this.incoming = params.incomingNode;
	}

	private getProgress({ time }: { time: number }): number | null {
		const { transitionStart, duration } = this.params;
		if (time < transitionStart || time >= transitionStart + duration) {
			return null;
		}
		return (time - transitionStart) / duration;
	}

	private ensureOffscreen({
		width,
		height,
		renderer,
	}: {
		width: number;
		height: number;
		renderer: CanvasRenderer;
	}): {
		canvasA: RendererCanvas;
		canvasB: RendererCanvas;
	} {
		const needsRecreate =
			!this.offscreenA ||
			!this.offscreenB ||
			this.offscreenA.width !== width ||
			this.offscreenA.height !== height ||
			this.offscreenB.width !== width ||
			this.offscreenB.height !== height;

		if (needsRecreate) {
			this.offscreenA = renderer.createCanvas({ width, height });
			this.offscreenB = renderer.createCanvas({ width, height });
		}

		const canvasA = this.offscreenA;
		const canvasB = this.offscreenB;
		if (!canvasA || !canvasB) {
			throw new Error("Failed to create offscreen canvases");
		}

		return { canvasA, canvasB };
	}

	async render({
		renderer,
		time,
	}: {
		renderer: CanvasRenderer;
		time: number;
	}): Promise<void> {
		const progress = this.getProgress({ time });

		if (progress === null) {
			await this.outgoing.render({ renderer, time });
			await this.incoming.render({ renderer, time });
			return;
		}

		const { width, height } = renderer;
		const { canvasA, canvasB } = this.ensureOffscreen({
			width,
			height,
			renderer,
		});

		const ctxA = canvasA.getContext("2d");
		const ctxB = canvasB.getContext("2d");
		if (!ctxA || !ctxB) {
			throw new Error("Failed to get offscreen canvas context");
		}

		ctxA.clearRect(0, 0, width, height);
		ctxB.clearRect(0, 0, width, height);

		const originalContext = renderer.context;

		// clamp so each element stays in its valid range during the transition
		const outgoingTime = Math.min(time, this.params.outgoingEndTime - 1 / 1000);
		const incomingTime = Math.max(time, this.params.incomingStartTime);

		renderer.context = ctxA as typeof originalContext;
		await this.outgoing.render({ renderer, time: outgoingTime });

		renderer.context = ctxB as typeof originalContext;
		await this.incoming.render({ renderer, time: incomingTime });

		renderer.context = originalContext;

		applyTransition({
			context: renderer.context,
			canvasA,
			canvasB,
			width,
			height,
			progress,
			type: this.params.type,
		});
	}
}

function applyTransition({
	context,
	canvasA,
	canvasB,
	width,
	height,
	progress,
	type,
}: {
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	canvasA: OffscreenCanvas | HTMLCanvasElement;
	canvasB: OffscreenCanvas | HTMLCanvasElement;
	width: number;
	height: number;
	progress: number;
	type: TransitionType;
}): void {
	const source = { canvasA, canvasB } as const;

	switch (type) {
		case "fade":
			applyFade({ context, ...source, width, height, progress });
			break;
		case "dissolve":
			applyDissolve({ context, ...source, width, height, progress });
			break;
		case "wipe-left":
			applyWipe({ context, ...source, width, height, progress, direction: "left" });
			break;
		case "wipe-right":
			applyWipe({ context, ...source, width, height, progress, direction: "right" });
			break;
		case "wipe-up":
			applyWipe({ context, ...source, width, height, progress, direction: "up" });
			break;
		case "wipe-down":
			applyWipe({ context, ...source, width, height, progress, direction: "down" });
			break;
		case "slide-left":
			applySlide({ context, ...source, width, height, progress, direction: "left" });
			break;
		case "slide-right":
			applySlide({ context, ...source, width, height, progress, direction: "right" });
			break;
		case "slide-up":
			applySlide({ context, ...source, width, height, progress, direction: "up" });
			break;
		case "slide-down":
			applySlide({ context, ...source, width, height, progress, direction: "down" });
			break;
		case "zoom-in":
			applyZoom({ context, ...source, width, height, progress, direction: "in" });
			break;
		case "zoom-out":
			applyZoom({ context, ...source, width, height, progress, direction: "out" });
			break;
		case "blur-crossfade":
			applyBlurCrossfade({ context, ...source, width, height, progress });
			break;
		case "flash-white":
			applyFlashWhite({ context, ...source, width, height, progress });
			break;
		case "push-soft":
			applyPushSoft({ context, ...source, width, height, progress });
			break;
		case "whip-pan-left":
			applyWhipPan({ context, ...source, width, height, progress, direction: "left" });
			break;
		case "whip-pan-right":
			applyWhipPan({ context, ...source, width, height, progress, direction: "right" });
			break;
		case "cinematic-zoom":
			applyCinematicZoom({ context, ...source, width, height, progress });
			break;
		case "chromatic-split":
			applyChromaticSplit({ context, ...source, width, height, progress });
			break;
		default:
			applyFade({ context, ...source, width, height, progress });
	}
}

type TransitionContext = {
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	canvasA: OffscreenCanvas | HTMLCanvasElement;
	canvasB: OffscreenCanvas | HTMLCanvasElement;
	width: number;
	height: number;
	progress: number;
};

type TransitionDrawContext = Pick<
	TransitionContext,
	"context" | "width" | "height"
>;

function applyFade({ context, canvasA, canvasB, width, height, progress }: TransitionContext): void {
	context.save();
	context.globalAlpha = 1 - progress;
	context.drawImage(canvasA as CanvasImageSource, 0, 0, width, height);
	context.globalAlpha = progress;
	context.drawImage(canvasB as CanvasImageSource, 0, 0, width, height);
	context.restore();
}

function applyDissolve({ context, canvasA, canvasB, width, height, progress }: TransitionContext): void {
	// smooth dissolve with eased alpha
	const eased = progress * progress * (3 - 2 * progress);
	context.save();
	context.globalAlpha = 1;
	context.drawImage(canvasA as CanvasImageSource, 0, 0, width, height);
	context.globalAlpha = eased;
	context.drawImage(canvasB as CanvasImageSource, 0, 0, width, height);
	context.restore();
}

function applyWipe({
	context,
	canvasA,
	canvasB,
	width,
	height,
	progress,
	direction,
}: TransitionContext & { direction: "left" | "right" | "up" | "down" }): void {
	context.save();
	context.drawImage(canvasA as CanvasImageSource, 0, 0, width, height);

	context.save();
	context.beginPath();

	switch (direction) {
		case "left":
			context.rect(width * (1 - progress), 0, width * progress, height);
			break;
		case "right":
			context.rect(0, 0, width * progress, height);
			break;
		case "up":
			context.rect(0, height * (1 - progress), width, height * progress);
			break;
		case "down":
			context.rect(0, 0, width, height * progress);
			break;
	}

	context.clip();
	context.drawImage(canvasB as CanvasImageSource, 0, 0, width, height);
	context.restore();
	context.restore();
}

function applySlide({
	context,
	canvasA,
	canvasB,
	width,
	height,
	progress,
	direction,
}: TransitionContext & { direction: "left" | "right" | "up" | "down" }): void {
	context.save();

	let offsetX = 0;
	let offsetY = 0;

	switch (direction) {
		case "left":
			offsetX = -width * progress;
			break;
		case "right":
			offsetX = width * progress;
			break;
		case "up":
			offsetY = -height * progress;
			break;
		case "down":
			offsetY = height * progress;
			break;
	}

	context.drawImage(canvasA as CanvasImageSource, offsetX, offsetY, width, height);

	switch (direction) {
		case "left":
			context.drawImage(canvasB as CanvasImageSource, width + offsetX, offsetY, width, height);
			break;
		case "right":
			context.drawImage(canvasB as CanvasImageSource, -width + offsetX, offsetY, width, height);
			break;
		case "up":
			context.drawImage(canvasB as CanvasImageSource, offsetX, height + offsetY, width, height);
			break;
		case "down":
			context.drawImage(canvasB as CanvasImageSource, offsetX, -height + offsetY, width, height);
			break;
	}

	context.restore();
}

function applyZoom({
	context,
	canvasA,
	canvasB,
	width,
	height,
	progress,
	direction,
}: TransitionContext & { direction: "in" | "out" }): void {
	context.save();

	if (direction === "in") {
		const scale = 1 + progress * 0.5;
		const scaledWidth = width * scale;
		const scaledHeight = height * scale;
		const offsetX = (width - scaledWidth) / 2;
		const offsetY = (height - scaledHeight) / 2;

		context.globalAlpha = 1 - progress;
		context.drawImage(canvasA as CanvasImageSource, offsetX, offsetY, scaledWidth, scaledHeight);
		context.globalAlpha = progress;
		context.drawImage(canvasB as CanvasImageSource, 0, 0, width, height);
	} else {
		const scale = 1 - progress * 0.5;
		const scaledWidth = width * scale;
		const scaledHeight = height * scale;
		const offsetX = (width - scaledWidth) / 2;
		const offsetY = (height - scaledHeight) / 2;

		context.globalAlpha = 1 - progress;
		context.drawImage(canvasA as CanvasImageSource, 0, 0, width, height);
		context.globalAlpha = progress;
		context.drawImage(canvasB as CanvasImageSource, offsetX, offsetY, scaledWidth, scaledHeight);
	}

	context.restore();
}

function applyBlurCrossfade({
	context,
	canvasA,
	canvasB,
	width,
	height,
	progress,
}: TransitionContext): void {
	const eased = smoothstep(0, 1, progress);
	const peak = Math.sin(progress * Math.PI);
	const blurPx = 18 * peak;
	const originalFilter = getContextFilter({ context });

	context.save();
	setContextFilter({ context, filter: `blur(${blurPx}px)` });
	context.globalAlpha = 1 - eased;
	context.drawImage(canvasA as CanvasImageSource, 0, 0, width, height);
	context.globalAlpha = eased;
	context.drawImage(canvasB as CanvasImageSource, 0, 0, width, height);
	setContextFilter({ context, filter: originalFilter });
	context.restore();
}

function applyFlashWhite({
	context,
	canvasA,
	canvasB,
	width,
	height,
	progress,
}: TransitionContext): void {
	const reveal = smoothstep(0.35, 0.85, progress);
	const flash = Math.sin(progress * Math.PI);

	context.save();
	context.globalAlpha = 1 - reveal;
	context.drawImage(canvasA as CanvasImageSource, 0, 0, width, height);
	context.globalAlpha = reveal;
	context.drawImage(canvasB as CanvasImageSource, 0, 0, width, height);
	context.globalAlpha = flash * 0.86;
	context.fillStyle = "#ffffff";
	context.fillRect(0, 0, width, height);
	context.restore();
}

function applyPushSoft({
	context,
	canvasA,
	canvasB,
	width,
	height,
	progress,
}: TransitionContext): void {
	const eased = easeInOutCubic(progress);
	const outgoingX = -width * eased;
	const incomingX = width * (1 - eased);
	const scale = 1 + Math.sin(progress * Math.PI) * 0.025;

	context.save();
	drawScaledImage({
		context,
		canvas: canvasA,
		width,
		height,
		scale,
		offsetX: outgoingX,
		alpha: 1,
	});
	drawScaledImage({
		context,
		canvas: canvasB,
		width,
		height,
		scale,
		offsetX: incomingX,
		alpha: 1,
	});
	context.restore();
}

function applyWhipPan({
	context,
	canvasA,
	canvasB,
	width,
	height,
	progress,
	direction,
}: TransitionContext & { direction: "left" | "right" }): void {
	const sign = direction === "left" ? -1 : 1;
	const eased = easeInOutCubic(progress);
	const blurStrength = Math.sin(progress * Math.PI);
	const outgoingX = sign * width * 1.2 * eased;
	const incomingX = -sign * width * 1.2 * (1 - eased);

	context.save();
	drawMotionBlurredImage({
		context,
		canvas: canvasA,
		width,
		height,
		offsetX: outgoingX,
		blurX: sign * blurStrength * 42,
		alpha: 1 - smoothstep(0.72, 1, progress),
	});
	drawMotionBlurredImage({
		context,
		canvas: canvasB,
		width,
		height,
		offsetX: incomingX,
		blurX: sign * blurStrength * 42,
		alpha: smoothstep(0, 0.35, progress),
	});
	context.restore();
}

function applyCinematicZoom({
	context,
	canvasA,
	canvasB,
	width,
	height,
	progress,
}: TransitionContext): void {
	const eased = smoothstep(0, 1, progress);
	const peak = Math.sin(progress * Math.PI);

	context.save();
	drawScaledImage({
		context,
		canvas: canvasA,
		width,
		height,
		scale: 1 + eased * 0.16,
		alpha: 1 - eased,
	});
	drawScaledImage({
		context,
		canvas: canvasB,
		width,
		height,
		scale: 1.08 - eased * 0.08,
		alpha: eased,
	});
	context.globalAlpha = peak * 0.18;
	context.fillStyle = "#ffffff";
	context.fillRect(0, 0, width, height);
	context.restore();
}

function applyChromaticSplit({
	context,
	canvasA,
	canvasB,
	width,
	height,
	progress,
}: TransitionContext): void {
	const eased = smoothstep(0, 1, progress);
	const split = Math.sin(progress * Math.PI) * 18;
	const originalFilter = getContextFilter({ context });

	context.save();
	context.globalAlpha = 1 - eased;
	context.drawImage(canvasA as CanvasImageSource, 0, 0, width, height);
	context.globalAlpha = eased;
	context.drawImage(canvasB as CanvasImageSource, 0, 0, width, height);

	context.globalCompositeOperation = "screen";
	context.globalAlpha = 0.32 * Math.sin(progress * Math.PI);
	setContextFilter({
		context,
		filter: "sepia(1) saturate(6) hue-rotate(-35deg)",
	});
	context.drawImage(canvasA as CanvasImageSource, -split, 0, width, height);
	context.drawImage(canvasB as CanvasImageSource, split * 0.5, 0, width, height);
	setContextFilter({
		context,
		filter: "sepia(1) saturate(6) hue-rotate(155deg)",
	});
	context.drawImage(canvasA as CanvasImageSource, split, 0, width, height);
	context.drawImage(canvasB as CanvasImageSource, -split * 0.5, 0, width, height);

	setContextFilter({ context, filter: originalFilter });
	context.restore();
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp01((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

function easeInOutCubic(value: number): number {
	const t = clamp01(value);
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function drawScaledImage({
	context,
	canvas,
	width,
	height,
	scale,
	offsetX = 0,
	offsetY = 0,
	alpha,
}: TransitionDrawContext & {
	canvas: OffscreenCanvas | HTMLCanvasElement;
	scale: number;
	offsetX?: number;
	offsetY?: number;
	alpha: number;
}): void {
	const scaledWidth = width * scale;
	const scaledHeight = height * scale;
	const x = (width - scaledWidth) / 2 + offsetX;
	const y = (height - scaledHeight) / 2 + offsetY;

	context.save();
	context.globalAlpha = alpha;
	context.drawImage(canvas as CanvasImageSource, x, y, scaledWidth, scaledHeight);
	context.restore();
}

function drawMotionBlurredImage({
	context,
	canvas,
	width,
	height,
	offsetX,
	blurX,
	alpha,
}: TransitionDrawContext & {
	canvas: OffscreenCanvas | HTMLCanvasElement;
	offsetX: number;
	blurX: number;
	alpha: number;
}): void {
	const samples = 7;
	context.save();
	for (let index = 0; index < samples; index += 1) {
		const sampleProgress = index / (samples - 1);
		const centered = sampleProgress - 0.5;
		context.globalAlpha = alpha / samples;
		context.drawImage(
			canvas as CanvasImageSource,
			offsetX + centered * blurX,
			0,
			width,
			height,
		);
	}
	context.restore();
}

function getContextFilter({
	context,
}: {
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): string {
	return "filter" in context ? String(context.filter || "none") : "none";
}

function setContextFilter({
	context,
	filter,
}: {
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	filter: string;
}): void {
	if ("filter" in context) {
		context.filter = filter;
	}
}
