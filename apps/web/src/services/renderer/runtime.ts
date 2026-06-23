import { videoCache } from "@/services/video-cache/service";

export type RendererContext2D =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D;

export type RendererCanvas = (HTMLCanvasElement | OffscreenCanvas) & {
	width: number;
	height: number;
	getContext(contextId: "2d"): RendererContext2D | null;
};

export type RendererImage = CanvasImageSource & {
	width?: number;
	height?: number;
	naturalWidth?: number;
	naturalHeight?: number;
};

export type RendererVideoFrame = {
	canvas: RendererCanvas;
	timestamp?: number;
	duration?: number;
};

export type RendererRuntime = {
	createCanvas(params: { width: number; height: number }): RendererCanvas;
	ensureFontFamily?(params: { fontFamily: string }): Promise<void> | void;
	loadImage(params: { url?: string; file?: File }): Promise<RendererImage>;
	loadSticker(params: {
		iconName: string;
		color?: string;
	}): Promise<RendererImage>;
	getFrameAt(params: {
		mediaId: string;
		file: File;
		time: number;
	}): Promise<RendererVideoFrame | null>;
};

function createBrowserCanvas({
	width,
	height,
}: {
	width: number;
	height: number;
}): RendererCanvas {
	if (typeof OffscreenCanvas !== "undefined") {
		return new OffscreenCanvas(width, height) as RendererCanvas;
	}
	if (typeof document === "undefined") {
		throw new Error(
			"Browser renderer runtime requires document.createElement.",
		);
	}
	const canvas = document.createElement("canvas") as RendererCanvas;
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function buildStickerUrl({
	iconName,
	color,
}: {
	iconName: string;
	color?: string;
}): string {
	const colorParam = color ? `&color=${encodeURIComponent(color)}` : "";
	return `https://api.iconify.design/${iconName}.svg?width=200&height=200${colorParam}`;
}

async function loadBrowserImage({
	url,
}: {
	url?: string;
}): Promise<RendererImage> {
	if (!url) {
		throw new Error("Browser renderer image loading requires a URL.");
	}
	const image = new Image();
	image.crossOrigin = "anonymous";

	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error("Image load failed"));
		image.src = url;
	});

	return image;
}

export const browserRendererRuntime: RendererRuntime = {
	createCanvas: createBrowserCanvas,
	loadImage: loadBrowserImage,
	loadSticker: ({ iconName, color }) =>
		loadBrowserImage({ url: buildStickerUrl({ iconName, color }) }),
	getFrameAt: async ({ mediaId, file, time }) => {
		const frame = await videoCache.getFrameAt({ mediaId, file, time });
		if (!frame) return null;
		return {
			canvas: frame.canvas as RendererCanvas,
			timestamp: frame.timestamp,
			duration: frame.duration,
		};
	},
};
