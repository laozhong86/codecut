import type { CanvasRenderer } from "../canvas-renderer";
import type { RendererImage } from "../runtime";
import { VisualNode, type VisualNodeParams } from "./visual-node";

export interface ImageNodeParams extends VisualNodeParams {
	url?: string;
	file?: File;
}

export class ImageNode extends VisualNode<ImageNodeParams> {
	private readyPromise?: Promise<RendererImage>;

	private load({ renderer }: { renderer: CanvasRenderer }) {
		if (!this.readyPromise) {
			this.readyPromise = renderer.runtime
				.loadImage({ url: this.params.url, file: this.params.file })
				.then((image) => image);
		}
		return this.readyPromise;
	}

	async render({ renderer, time }: { renderer: CanvasRenderer; time: number }) {
		await super.render({ renderer, time });

		if (!this.isInRange(time)) {
			return;
		}

		const image = await this.load({ renderer });

		const mediaW = image.naturalWidth || image.width || renderer.width;
		const mediaH = image.naturalHeight || image.height || renderer.height;

		this.renderVisual({
			renderer,
			source: image,
			sourceWidth: mediaW,
			sourceHeight: mediaH,
			time,
		});
	}
}
