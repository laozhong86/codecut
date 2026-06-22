import type { BaseNode } from "./nodes/base-node";
import {
	browserRendererRuntime,
	type RendererCanvas,
	type RendererContext2D,
	type RendererRuntime,
} from "./runtime";

export type CanvasRendererParams = {
	width: number;
	height: number;
	fps: number;
	imageSmoothingQuality?: ImageSmoothingQuality;
	runtime?: RendererRuntime;
};

export class CanvasRenderer {
	canvas: RendererCanvas;
	context: RendererContext2D;
	runtime: RendererRuntime;
	width: number;
	height: number;
	fps: number;
	private smoothingQuality: ImageSmoothingQuality;

	constructor({
		width,
		height,
		fps,
		imageSmoothingQuality = "low",
		runtime = browserRendererRuntime,
	}: CanvasRendererParams) {
		this.width = width;
		this.height = height;
		this.fps = fps;
		this.smoothingQuality = imageSmoothingQuality;
		this.runtime = runtime;
		this.canvas = this.createCanvas({ width, height });

		const context = this.canvas.getContext("2d");
		if (!context) {
			throw new Error("Failed to get canvas context");
		}

		this.context = context;
		this.applySmoothing();
	}

	createCanvas({ width, height }: { width: number; height: number }) {
		return this.runtime.createCanvas({ width, height });
	}

	setSize({ width, height }: { width: number; height: number }) {
		this.width = width;
		this.height = height;
		this.canvas = this.createCanvas({ width, height });

		const context = this.canvas.getContext("2d");
		if (!context) {
			throw new Error("Failed to get canvas context");
		}
		this.context = context;
		this.applySmoothing();
	}

	private applySmoothing() {
		this.context.imageSmoothingEnabled = true;
		this.context.imageSmoothingQuality = this.smoothingQuality;
	}

	private clear() {
		this.context.fillStyle = "black";
		this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
	}

	async render({ node, time }: { node: BaseNode; time: number }) {
		this.clear();
		await node.render({ renderer: this, time });
	}

	async renderToCanvas({
		node,
		time,
		targetCanvas,
	}: {
		node: BaseNode;
		time: number;
		targetCanvas: HTMLCanvasElement;
	}) {
		await this.render({ node, time });

		const ctx = targetCanvas.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to get target canvas context");
		}

		ctx.drawImage(this.canvas, 0, 0, targetCanvas.width, targetCanvas.height);
	}
}
