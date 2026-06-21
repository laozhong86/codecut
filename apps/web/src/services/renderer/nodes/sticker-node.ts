import type { CanvasRenderer } from "../canvas-renderer";
import type { RendererImage } from "../runtime";
import { VisualNode, type VisualNodeParams } from "./visual-node";

export interface StickerNodeParams extends VisualNodeParams {
	iconName: string;
	color?: string;
}

export class StickerNode extends VisualNode<StickerNodeParams> {
	private readyPromise?: Promise<RendererImage>;

	private load({ renderer }: { renderer: CanvasRenderer }) {
		if (!this.readyPromise) {
			this.readyPromise = renderer.runtime.loadSticker({
				iconName: this.params.iconName,
				color: this.params.color,
			});
		}
		return this.readyPromise;
	}

	async render({ renderer, time }: { renderer: CanvasRenderer; time: number }) {
		await super.render({ renderer, time });

		if (!this.isInRange(time)) {
			return;
		}

		const image = await this.load({ renderer });

		this.renderVisual({
			renderer,
			source: image,
			sourceWidth: image.width || image.naturalWidth || 200,
			sourceHeight: image.height || image.naturalHeight || 200,
		});
	}
}
