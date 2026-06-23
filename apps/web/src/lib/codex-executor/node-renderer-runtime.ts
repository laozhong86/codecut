import {
	createCanvas,
	ImageData as NodeImageData,
	loadImage,
} from "@napi-rs/canvas";
import type {
	RendererCanvas,
	RendererImage,
	RendererRuntime,
	RendererVideoFrame,
} from "@/services/renderer/runtime";
import {
	CODECUT_CJK_FONT_FAMILY,
	registerCodecutCjkFont,
} from "./codecut-cjk-font";

async function fileToBuffer({ file }: { file: File }): Promise<Buffer> {
	const bytes = await file.arrayBuffer();
	return Buffer.from(bytes);
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

type NativeVideoFrame = {
	timestamp: number;
	duration: number | null;
	codedWidth: number;
	codedHeight: number;
	displayWidth: number;
	displayHeight: number;
	allocationSize(options?: { format?: "RGBA" }): number;
	copyTo(
		destination: Uint8Array,
		options?: { format?: "RGBA" },
	): Promise<unknown>;
	close(): void;
};

type CachedCanvasFrame = {
	canvas: RendererCanvas;
	timestampUs: number;
	durationUs: number;
};

const FRAME_MATCH_TOLERANCE_US = 50_000;
const FORWARD_SEEK_GAP_US = 2_000_000;
const MIN_FRAME_DURATION_US = 1_000;
const SEEK_PREROLL_US = 5_000_000;

class NodeVideoSource {
	private file: File;
	private loadPromise?: Promise<void>;
	private demuxer?: {
		loadBuffer(data: Uint8Array): Promise<void>;
		videoDecoderConfig: unknown;
		demuxAsync(count?: number): Promise<void>;
		seek(timestampUs: number): void;
		close(): void;
		state: string;
	};
	private decoder?: {
		configure(config: unknown): void;
		decode(chunk: unknown): void;
		flush(): Promise<void>;
		reset(): void;
		close(): void;
	};
	private videoDecoderConfig?: unknown;
	private frames: NativeVideoFrame[] = [];
	private currentFrame?: CachedCanvasFrame;
	private lastTargetUs = 0;
	private decoderError: Error | null = null;
	private demuxerError: Error | null = null;
	private ended = false;

	constructor({ file }: { file: File }) {
		this.file = file;
	}

	private async ensureLoaded() {
		if (!this.loadPromise) {
			this.loadPromise = this.load();
		}
		await this.loadPromise;
	}

	private async load() {
		const webcodecs = await import("@napi-rs/webcodecs");
		this.decoder = new webcodecs.VideoDecoder({
			output: (frame) => {
				this.frames.push(frame as unknown as NativeVideoFrame);
			},
			error: (error) => {
				this.decoderError = error;
			},
		});
		this.demuxer = this.createDemuxer({ webcodecs });
		const bytes = await fileToBuffer({ file: this.file });
		await this.demuxer.loadBuffer(bytes);
		const config = this.demuxer.videoDecoderConfig;
		if (!config) {
			throw new Error(
				`Node renderer media has no video track: ${this.file.name}`,
			);
		}
		this.videoDecoderConfig = config;
		this.decoder.configure(config);
	}

	private createDemuxer({
		webcodecs,
	}: {
		webcodecs: typeof import("@napi-rs/webcodecs");
	}) {
		const Demuxer =
			this.file.type === "video/webm"
				? webcodecs.WebMDemuxer
				: webcodecs.Mp4Demuxer;
		return new Demuxer({
			videoOutput: (chunk) => {
				if (!this.decoder) {
					throw new Error("Node renderer video decoder is not initialized.");
				}
				this.decoder.decode(chunk);
			},
			error: (error) => {
				this.demuxerError = error;
			},
		});
	}

	private throwIfNativeError() {
		if (this.decoderError) {
			throw this.decoderError;
		}
		if (this.demuxerError) {
			throw this.demuxerError;
		}
	}

	private closeBufferedFrames() {
		for (const frame of this.frames) {
			frame.close();
		}
		this.frames = [];
	}

	private async seek({ targetUs }: { targetUs: number }) {
		if (!this.demuxer || !this.decoder || !this.videoDecoderConfig) {
			throw new Error("Node renderer video source is not initialized.");
		}
		this.closeBufferedFrames();
		this.currentFrame = undefined;
		this.decoder.reset();
		this.decoder.configure(this.videoDecoderConfig);
		this.demuxer.seek(Math.max(0, targetUs - SEEK_PREROLL_US));
		this.ended = false;
	}

	private frameDurationUs({
		frame,
		nextFrame,
	}: {
		frame: NativeVideoFrame;
		nextFrame?: NativeVideoFrame;
	}): number {
		if (
			typeof frame.duration === "number" &&
			frame.duration >= MIN_FRAME_DURATION_US
		) {
			return frame.duration;
		}
		if (nextFrame && nextFrame.timestamp > frame.timestamp) {
			return nextFrame.timestamp - frame.timestamp;
		}
		return 33_333;
	}

	private takeFrameFor({
		targetUs,
	}: {
		targetUs: number;
	}): NativeVideoFrame | null {
		this.frames.sort((a, b) => a.timestamp - b.timestamp);
		let selectedIndex = -1;
		for (let index = 0; index < this.frames.length; index += 1) {
			if (this.frames[index].timestamp <= targetUs) {
				selectedIndex = index;
				continue;
			}
			break;
		}
		if (selectedIndex < 0) {
			const firstFrame = this.frames[0];
			if (
				firstFrame &&
				firstFrame.timestamp - targetUs <= FRAME_MATCH_TOLERANCE_US
			) {
				selectedIndex = 0;
			} else {
				return null;
			}
		}

		let selected = this.frames[selectedIndex];
		let nextFrame = this.frames[selectedIndex + 1];
		let selectedDurationUs = this.frameDurationUs({
			frame: selected,
			nextFrame,
		});
		let selectedCoversTarget =
			targetUs < selected.timestamp + selectedDurationUs ||
			Boolean(nextFrame && nextFrame.timestamp > targetUs) ||
			this.ended;
		if (
			!selectedCoversTarget &&
			nextFrame &&
			nextFrame.timestamp - targetUs <= FRAME_MATCH_TOLERANCE_US
		) {
			selectedIndex += 1;
			selected = this.frames[selectedIndex];
			nextFrame = this.frames[selectedIndex + 1];
			selectedDurationUs = this.frameDurationUs({ frame: selected, nextFrame });
			selectedCoversTarget = true;
		}
		if (!selectedCoversTarget) {
			return null;
		}

		const consumed = this.frames.splice(0, selectedIndex + 1);
		for (let index = 0; index < consumed.length - 1; index += 1) {
			consumed[index].close();
		}
		return consumed[consumed.length - 1];
	}

	private async decodeMore() {
		if (!this.demuxer || !this.decoder) {
			throw new Error("Node renderer video source is not initialized.");
		}
		await this.demuxer.demuxAsync(12);
		await this.decoder.flush();
		this.ended = this.demuxer.state === "ended";
		this.throwIfNativeError();
	}

	private async frameToCanvas({
		frame,
		durationUs,
	}: {
		frame: NativeVideoFrame;
		durationUs: number;
	}): Promise<CachedCanvasFrame> {
		const width = frame.displayWidth || frame.codedWidth;
		const height = frame.displayHeight || frame.codedHeight;
		const rgba = new Uint8Array(frame.allocationSize({ format: "RGBA" }));
		await frame.copyTo(rgba, { format: "RGBA" });
		const canvas = createCanvas(width, height);
		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("Failed to create decoded video frame canvas context.");
		}
		const imageData = new NodeImageData(
			new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
			width,
			height,
		);
		context.putImageData(imageData, 0, 0);
		return {
			canvas: canvas as unknown as RendererCanvas,
			timestampUs: frame.timestamp,
			durationUs,
		};
	}

	async getFrameAt({ time }: { time: number }): Promise<RendererVideoFrame> {
		await this.ensureLoaded();
		if (!this.demuxer || !this.decoder) {
			throw new Error("Node renderer video source is not initialized.");
		}

		const targetUs = Math.max(0, Math.round(time * 1_000_000));
		if (
			this.currentFrame &&
			targetUs >= this.currentFrame.timestampUs &&
			targetUs < this.currentFrame.timestampUs + this.currentFrame.durationUs
		) {
			return {
				canvas: this.currentFrame.canvas,
				timestamp: this.currentFrame.timestampUs / 1_000_000,
				duration: this.currentFrame.durationUs / 1_000_000,
			};
		}
		if (
			targetUs + FRAME_MATCH_TOLERANCE_US < this.lastTargetUs ||
			targetUs > this.lastTargetUs + FORWARD_SEEK_GAP_US
		) {
			await this.seek({ targetUs });
		}
		this.lastTargetUs = targetUs;

		for (let attempt = 0; attempt < 100; attempt += 1) {
			const frame = this.takeFrameFor({ targetUs });
			if (frame) {
				const durationUs = this.frameDurationUs({
					frame,
					nextFrame: this.frames[0],
				});
				this.currentFrame = await this.frameToCanvas({ frame, durationUs });
				frame.close();
				return {
					canvas: this.currentFrame.canvas,
					timestamp: this.currentFrame.timestampUs / 1_000_000,
					duration: this.currentFrame.durationUs / 1_000_000,
				};
			}
			if (this.ended) {
				break;
			}
			await this.decodeMore();
		}

		throw new Error(
			`Node renderer could not decode frame at ${time.toFixed(3)}s from ${this.file.name}.`,
		);
	}

	close() {
		this.closeBufferedFrames();
		this.decoder?.close();
		this.demuxer?.close();
	}
}

class NodeVideoFrameCache {
	private sources = new Map<string, NodeVideoSource>();

	async getFrameAt({
		mediaId,
		file,
		time,
	}: {
		mediaId: string;
		file: File;
		time: number;
	}) {
		let source = this.sources.get(mediaId);
		if (!source) {
			source = new NodeVideoSource({ file });
			this.sources.set(mediaId, source);
		}
		return source.getFrameAt({ time });
	}

	close() {
		for (const source of this.sources.values()) {
			source.close();
		}
		this.sources.clear();
	}
}

export function createNodeRendererRuntime(): RendererRuntime {
	const videoFrameCache = new NodeVideoFrameCache();
	return {
		createCanvas: ({ width, height }) =>
			createCanvas(width, height) as unknown as RendererCanvas,
		ensureFontFamily: ({ fontFamily }) => {
			if (fontFamily === CODECUT_CJK_FONT_FAMILY) {
				registerCodecutCjkFont();
			}
		},
		loadImage: async ({ file, url }) => {
			if (file) {
				return (await loadImage(
					await fileToBuffer({ file }),
				)) as unknown as RendererImage;
			}
			if (url) {
				return (await loadImage(url)) as unknown as RendererImage;
			}
			throw new Error("Node renderer image loading requires a file or URL.");
		},
		loadSticker: async ({ iconName, color }) =>
			(await loadImage(
				buildStickerUrl({ iconName, color }),
			)) as unknown as RendererImage,
		getFrameAt: (params) => videoFrameCache.getFrameAt(params),
	};
}
