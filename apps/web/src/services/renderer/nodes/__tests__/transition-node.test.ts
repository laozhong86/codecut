import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, test } from "bun:test";
import type { CanvasRendererParams } from "../../canvas-renderer";
import { CanvasRenderer } from "../../canvas-renderer";
import type { RendererCanvas, RendererRuntime } from "../../runtime";
import { BaseNode } from "../base-node";
import { TransitionNode } from "../transition-node";
import type { TransitionType } from "@/types/timeline";

class SolidColorNode extends BaseNode<{ color: string }> {
	async render({
		renderer,
	}: {
		renderer: CanvasRenderer;
		time: number;
	}): Promise<void> {
		renderer.context.fillStyle = this.params.color;
		renderer.context.fillRect(0, 0, renderer.width, renderer.height);
	}
}

const testRuntime: RendererRuntime = {
	createCanvas: ({ width, height }) =>
		createCanvas(width, height) as unknown as RendererCanvas,
	loadImage: async () => {
		throw new Error("Transition tests do not load images.");
	},
	loadSticker: async () => {
		throw new Error("Transition tests do not load stickers.");
	},
	getFrameAt: async () => null,
};

function createTestRenderer(
	params: Partial<CanvasRendererParams> = {},
): CanvasRenderer {
	return new CanvasRenderer({
		width: 96,
		height: 54,
		fps: 30,
		runtime: testRuntime,
		...params,
	});
}

function getAverageBrightness({ renderer }: { renderer: CanvasRenderer }): number {
	const image = renderer.context.getImageData(0, 0, renderer.width, renderer.height);
	let total = 0;
	for (let index = 0; index < image.data.length; index += 4) {
		total += image.data[index] + image.data[index + 1] + image.data[index + 2];
	}
	return total / (image.data.length / 4);
}

describe("TransitionNode", () => {
	test("renders migration transition frames without blank output", async () => {
		const transitionTypes: TransitionType[] = [
			"blur-crossfade",
			"flash-white",
			"push-soft",
			"whip-pan-left",
			"whip-pan-right",
			"cinematic-zoom",
			"chromatic-split",
		];

		for (const type of transitionTypes) {
			for (const time of [0.1, 0.5, 0.9]) {
				const renderer = createTestRenderer();
				const node = new TransitionNode({
					type,
					duration: 1,
					transitionStart: 0,
					outgoingNode: new SolidColorNode({ color: "#e11d48" }),
					incomingNode: new SolidColorNode({ color: "#2563eb" }),
					outgoingEndTime: 1,
					incomingStartTime: 0,
				});

				await renderer.render({ node, time });

				expect(
					getAverageBrightness({ renderer }),
					`${type} at ${time}s`,
				).toBeGreaterThan(1);
			}
		}
	});
});
