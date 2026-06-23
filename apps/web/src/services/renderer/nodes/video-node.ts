import type { CanvasRenderer } from "../canvas-renderer";
import { VisualNode, type VisualNodeParams } from "./visual-node";

export interface VideoNodeParams extends VisualNodeParams {
	url?: string;
	file: File;
	mediaId: string;
	sourcePath?: string;
	sourceWidth?: number;
	sourceHeight?: number;
	sourceFrameRate?: number;
}

export class VideoNode extends VisualNode<VideoNodeParams> {
	async render({ renderer, time }: { renderer: CanvasRenderer; time: number }) {
		await super.render({ renderer, time });

		if (!this.isInRange(time)) {
			return;
		}

		const videoTime = this.getLocalTime(time);
		const frame = await renderer.runtime.getFrameAt({
			mediaId: this.params.mediaId,
			file: this.params.file,
			sourcePath: this.params.sourcePath,
			sourceWidth: this.params.sourceWidth,
			sourceHeight: this.params.sourceHeight,
			sourceFrameRate: this.params.sourceFrameRate,
			time: videoTime,
		});

		if (frame) {
			this.renderVisual({
				renderer,
				source: frame.canvas,
				sourceWidth: frame.canvas.width,
				sourceHeight: frame.canvas.height,
				time,
			});
		}
	}
}
