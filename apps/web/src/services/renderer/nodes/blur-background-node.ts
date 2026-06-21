import type { CanvasRenderer } from "../canvas-renderer";
import type { RendererCanvas, RendererContext2D } from "../runtime";
import { BaseNode } from "./base-node";

export type BlurBackgroundNodeParams = {
	blurIntensity: number;
	contentNodes: BaseNode[];
};

export class BlurBackgroundNode extends BaseNode<BlurBackgroundNodeParams> {
	private blurIntensity: number;
	private contentNodes: BaseNode[];

	constructor(params: BlurBackgroundNodeParams) {
		super(params);
		this.blurIntensity = params.blurIntensity;
		this.contentNodes = params.contentNodes;
	}

	async render({
		renderer,
		time,
	}: {
		renderer: CanvasRenderer;
		time: number;
	}): Promise<void> {
		const offscreen: RendererCanvas = renderer.createCanvas({
			width: renderer.width,
			height: renderer.height,
		});
		const offscreenCtx = offscreen.getContext("2d");
		if (!offscreenCtx) {
			throw new Error("failed to get offscreen canvas context");
		}

		const originalContext: RendererContext2D = renderer.context;
		renderer.context = offscreenCtx;

		for (const node of this.contentNodes) {
			await node.render({ renderer, time });
		}

		renderer.context = originalContext;

		const zoomScale = 1.4;
		const scaledWidth = renderer.width * zoomScale;
		const scaledHeight = renderer.height * zoomScale;
		const offsetX = (renderer.width - scaledWidth) / 2;
		const offsetY = (renderer.height - scaledHeight) / 2;

		renderer.context.save();
		renderer.context.filter = `blur(${this.blurIntensity}px)`;
		renderer.context.drawImage(
			offscreen as CanvasImageSource,
			offsetX,
			offsetY,
			scaledWidth,
			scaledHeight,
		);
		renderer.context.restore();
	}
}
