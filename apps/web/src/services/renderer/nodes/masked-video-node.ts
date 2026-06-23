import type { CanvasRenderer } from "../canvas-renderer";
import { VideoNode, type VideoNodeParams } from "./video-node";

export interface MaskedVideoNodeParams extends VideoNodeParams {
	alphaMediaId: string;
	alphaFile: File;
	alphaSourcePath?: string;
	alphaSourceWidth?: number;
	alphaSourceHeight?: number;
	alphaSourceFrameRate?: number;
}

export class MaskedVideoNode extends VideoNode {
	declare params: MaskedVideoNodeParams;

	async render({ renderer, time }: { renderer: CanvasRenderer; time: number }) {
		if (!this.isInRange(time)) {
			return;
		}

		const videoTime = this.getLocalTime(time);
		const [sourceFrame, alphaFrame] = await Promise.all([
			renderer.runtime.getFrameAt({
				mediaId: this.params.mediaId,
				file: this.params.file,
				sourcePath: this.params.sourcePath,
				sourceWidth: this.params.sourceWidth,
				sourceHeight: this.params.sourceHeight,
				sourceFrameRate: this.params.sourceFrameRate,
				time: videoTime,
			}),
			renderer.runtime.getFrameAt({
				mediaId: this.params.alphaMediaId,
				file: this.params.alphaFile,
				sourcePath: this.params.alphaSourcePath,
				sourceWidth: this.params.alphaSourceWidth,
				sourceHeight: this.params.alphaSourceHeight,
				sourceFrameRate: this.params.alphaSourceFrameRate,
				time: videoTime,
			}),
		]);

		if (!sourceFrame) {
			throw new Error("Masked video source frame is missing.");
		}
		if (!alphaFrame) {
			throw new Error("Masked video alpha frame is missing.");
		}

		const maskCanvas = renderer.createCanvas({
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
			time,
		});
	}
}
