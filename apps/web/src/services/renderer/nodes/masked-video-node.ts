import type { CanvasRenderer } from "../canvas-renderer";
import { VideoNode, type VideoNodeParams } from "./video-node";
import { videoCache } from "@/services/video-cache/service";

export interface MaskedVideoNodeParams extends VideoNodeParams {
	alphaMediaId: string;
	alphaFile: File;
}

function createCanvas({
	width,
	height,
}: {
	width: number;
	height: number;
}): OffscreenCanvas | HTMLCanvasElement {
	if (typeof OffscreenCanvas !== "undefined") {
		return new OffscreenCanvas(width, height);
	}

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

export class MaskedVideoNode extends VideoNode {
	declare params: MaskedVideoNodeParams;

	async render({ renderer, time }: { renderer: CanvasRenderer; time: number }) {
		if (!this.isInRange(time)) {
			return;
		}

		const videoTime = this.getLocalTime(time);
		const [sourceFrame, alphaFrame] = await Promise.all([
			videoCache.getFrameAt({
				mediaId: this.params.mediaId,
				file: this.params.file,
				time: videoTime,
			}),
			videoCache.getFrameAt({
				mediaId: this.params.alphaMediaId,
				file: this.params.alphaFile,
				time: videoTime,
			}),
		]);

		if (!sourceFrame || !alphaFrame) {
			return;
		}

		const maskCanvas = createCanvas({
			width: sourceFrame.canvas.width,
			height: sourceFrame.canvas.height,
		});
		const maskContext = maskCanvas.getContext("2d");
		if (!maskContext) {
			throw new Error("Failed to get mask canvas context");
		}

		maskContext.drawImage(
			sourceFrame.canvas,
			0,
			0,
			sourceFrame.canvas.width,
			sourceFrame.canvas.height,
		);
		const sourceData = maskContext.getImageData(
			0,
			0,
			sourceFrame.canvas.width,
			sourceFrame.canvas.height,
		);

		maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
		maskContext.drawImage(
			alphaFrame.canvas,
			0,
			0,
			sourceFrame.canvas.width,
			sourceFrame.canvas.height,
		);
		const alphaData = maskContext.getImageData(
			0,
			0,
			sourceFrame.canvas.width,
			sourceFrame.canvas.height,
		);

		for (let offset = 0; offset < sourceData.data.length; offset += 4) {
			const luminance = Math.round(
				(alphaData.data[offset] +
					alphaData.data[offset + 1] +
					alphaData.data[offset + 2]) /
					3,
			);
			sourceData.data[offset + 3] = Math.round(
				(sourceData.data[offset + 3] * luminance) / 255,
			);
		}

		maskContext.putImageData(sourceData, 0, 0);
		this.renderVisual({
			renderer,
			source: maskCanvas,
			sourceWidth: maskCanvas.width,
			sourceHeight: maskCanvas.height,
		});
	}
}
