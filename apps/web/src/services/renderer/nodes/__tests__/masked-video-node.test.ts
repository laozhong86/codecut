import { afterEach, describe, expect, test } from "bun:test";
import type { CanvasRenderer } from "../../canvas-renderer";
import { videoCache } from "@/services/video-cache/service";
import {
	MaskedVideoNode,
	type MaskedVideoNodeParams,
} from "../masked-video-node";

const originalGetFrameAt = videoCache.getFrameAt.bind(videoCache);

function node() {
	const params: MaskedVideoNodeParams = {
		timeOffset: 0,
		duration: 3,
		trimStart: 0,
		trimEnd: 3,
		opacity: 1,
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		url: "blob:source",
		file: new File(["source"], "source.mp4", { type: "video/mp4" }),
		mediaId: "source-1",
		alphaFile: new File(["alpha"], "alpha.webm", { type: "video/webm" }),
		alphaMediaId: "alpha-1",
	};
	return new MaskedVideoNode(params);
}

describe("MaskedVideoNode", () => {
	afterEach(() => {
		videoCache.getFrameAt = originalGetFrameAt;
	});

	test("fails fast when the source frame is missing", async () => {
		videoCache.getFrameAt = (async ({ mediaId }: { mediaId: string }) => {
			if (mediaId === "source-1") return null;
			return {
				canvas: {} as HTMLCanvasElement,
				timestamp: 0,
				duration: 1,
			};
		}) as typeof videoCache.getFrameAt;

		await expect(
			node().render({ renderer: {} as CanvasRenderer, time: 0 }),
		).rejects.toThrow("Masked video source frame is missing.");
	});

	test("fails fast when the alpha frame is missing", async () => {
		videoCache.getFrameAt = (async ({ mediaId }: { mediaId: string }) => {
			if (mediaId === "alpha-1") return null;
			return {
				canvas: {} as HTMLCanvasElement,
				timestamp: 0,
				duration: 1,
			};
		}) as typeof videoCache.getFrameAt;

		await expect(
			node().render({ renderer: {} as CanvasRenderer, time: 0 }),
		).rejects.toThrow("Masked video alpha frame is missing.");
	});
});
