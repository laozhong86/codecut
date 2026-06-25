import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
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
	isCodecutRendererFontFamily,
	registerCodecutFontFamily,
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

type CachedCanvasFrame = {
	canvas: RendererCanvas;
	timestampUs: number;
	durationUs: number;
};

type FfmpegFrameWindow = {
	startUs: number;
	endUs: number;
	frames: CachedCanvasFrame[];
};

const FFMPEG_MAX_WINDOW_FRAME_COUNT = 12;
const FFMPEG_DECODE_TIMEOUT_MS = 30_000;
const MAX_FFMPEG_STDERR_BYTES = 64 * 1024;
const MAX_FFMPEG_WINDOW_BYTES = 128 * 1024 * 1024;

function assertPositiveInteger(
	value: number | undefined,
	label: string,
): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
		throw new Error(`Node renderer video decoding requires ${label}.`);
	}
	return value;
}

function assertPositiveFinite(
	value: number | undefined,
	label: string,
): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(`Node renderer video decoding requires ${label}.`);
	}
	return value;
}

function assertLocalAbsoluteSourcePath({
	sourcePath,
	fileName,
}: {
	sourcePath?: string;
	fileName: string;
}): string {
	if (!sourcePath || !isAbsolute(sourcePath) || sourcePath.includes("://")) {
		throw new Error(
			`Node renderer video decoding requires an absolute local source path for ${fileName}.`,
		);
	}
	return sourcePath;
}

function formatFfmpegSeconds(value: number): string {
	return value.toFixed(6);
}

class NodeVideoSource {
	private file: File;
	private sourcePath: string;
	private width: number;
	private height: number;
	private frameRate: number;
	private frameBytes: number;
	private durationUs: number;
	private currentFrame?: CachedCanvasFrame;
	private frameWindow?: FfmpegFrameWindow;

	constructor({
		file,
		sourcePath,
		sourceWidth,
		sourceHeight,
		sourceFrameRate,
	}: {
		file: File;
		sourcePath?: string;
		sourceWidth?: number;
		sourceHeight?: number;
		sourceFrameRate?: number;
	}) {
		this.file = file;
		this.sourcePath = assertLocalAbsoluteSourcePath({
			sourcePath,
			fileName: file.name,
		});
		this.width = assertPositiveInteger(sourceWidth, "source width");
		this.height = assertPositiveInteger(sourceHeight, "source height");
		this.frameRate = assertPositiveFinite(sourceFrameRate, "source frame rate");
		this.frameBytes = this.width * this.height * 4;
		this.durationUs = Math.round((1 / this.frameRate) * 1_000_000);
	}

	private windowFrameCount(): number {
		const frameCount = Math.floor(MAX_FFMPEG_WINDOW_BYTES / this.frameBytes);
		if (frameCount < 1) {
			throw new Error("Node renderer ffmpeg decode frame is too large.");
		}
		return Math.min(FFMPEG_MAX_WINDOW_FRAME_COUNT, frameCount);
	}

	private frameToCanvas({
		rgba,
		timestampUs,
	}: {
		rgba: Buffer;
		timestampUs: number;
	}): CachedCanvasFrame {
		const canvas = createCanvas(this.width, this.height);
		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("Failed to create decoded video frame canvas context.");
		}
		const imageData = new NodeImageData(
			new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
			this.width,
			this.height,
		);
		context.putImageData(imageData, 0, 0);
		return {
			canvas: canvas as unknown as RendererCanvas,
			timestampUs,
			durationUs: this.durationUs,
		};
	}

	private async decodeWindow({
		startUs,
	}: {
		startUs: number;
	}): Promise<FfmpegFrameWindow> {
		const windowFrameCount = this.windowFrameCount();
		const expectedBytes = this.frameBytes * windowFrameCount;
		if (expectedBytes > MAX_FFMPEG_WINDOW_BYTES) {
			throw new Error("Node renderer ffmpeg decode window is too large.");
		}
		const buffer = await this.runFfmpegRawVideo({
			startSeconds: startUs / 1_000_000,
			expectedBytes,
			windowFrameCount,
		});
		if (buffer.byteLength % this.frameBytes !== 0) {
			throw new Error(
				`ffmpeg returned unaligned raw video bytes for ${this.file.name}.`,
			);
		}
		const frameCount = buffer.byteLength / this.frameBytes;
		if (frameCount === 0) {
			throw new Error(
				`ffmpeg did not decode a video frame from ${this.file.name}.`,
			);
		}
		const frames: CachedCanvasFrame[] = [];
		for (let index = 0; index < frameCount; index += 1) {
			const timestampUs = startUs + index * this.durationUs;
			const offset = index * this.frameBytes;
			frames.push(
				this.frameToCanvas({
					rgba: buffer.subarray(offset, offset + this.frameBytes),
					timestampUs,
				}),
			);
		}
		return {
			startUs,
			endUs: startUs + frameCount * this.durationUs,
			frames,
		};
	}

	private runFfmpegRawVideo({
		startSeconds,
		expectedBytes,
		windowFrameCount,
	}: {
		startSeconds: number;
		expectedBytes: number;
		windowFrameCount: number;
	}): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const ffmpeg = spawn("ffmpeg", [
				"-v",
				"error",
				"-ss",
				formatFfmpegSeconds(startSeconds),
				"-i",
				this.sourcePath,
				"-an",
				"-vf",
				`fps=${this.frameRate}`,
				"-frames:v",
				String(windowFrameCount),
				"-pix_fmt",
				"rgba",
				"-f",
				"rawvideo",
				"pipe:1",
			]);
			const chunks: Buffer[] = [];
			let totalBytes = 0;
			let stderrBytes = 0;
			let stderr = "";
			let settled = false;
			let timeout: ReturnType<typeof setTimeout> | null = null;

			const fail = (error: Error) => {
				if (settled) return;
				settled = true;
				if (timeout) clearTimeout(timeout);
				ffmpeg.kill();
				reject(error);
			};
			timeout = setTimeout(() => {
				fail(
					new Error(
						`ffmpeg timed out while decoding video frames for ${this.file.name}.`,
					),
				);
			}, FFMPEG_DECODE_TIMEOUT_MS);

			ffmpeg.stdout.on("data", (chunk: Buffer) => {
				totalBytes += chunk.byteLength;
				if (totalBytes > expectedBytes) {
					fail(
						new Error(
							`ffmpeg returned too many raw video bytes for ${this.file.name}.`,
						),
					);
					return;
				}
				chunks.push(chunk);
			});
			ffmpeg.stderr.on("data", (chunk: Buffer) => {
				stderrBytes += chunk.byteLength;
				if (stderrBytes > MAX_FFMPEG_STDERR_BYTES) {
					fail(
						new Error(
							`ffmpeg stderr exceeded the decode limit for ${this.file.name}.`,
						),
					);
					return;
				}
				stderr += chunk.toString("utf8");
			});
			ffmpeg.on("error", (error) => {
				fail(new Error(`Failed to start ffmpeg: ${error.message}`));
			});
			ffmpeg.on("close", (code) => {
				if (settled) return;
				settled = true;
				if (timeout) clearTimeout(timeout);
				if (code !== 0) {
					reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
					return;
				}
				resolve(Buffer.concat(chunks, totalBytes));
			});
		});
	}

	private getFrameFromWindow({ targetUs }: { targetUs: number }) {
		const frameWindow = this.frameWindow;
		if (!frameWindow) return null;
		if (targetUs < frameWindow.startUs || targetUs >= frameWindow.endUs) {
			return null;
		}
		const index = Math.min(
			frameWindow.frames.length - 1,
			Math.max(
				0,
				Math.floor((targetUs - frameWindow.startUs) / this.durationUs),
			),
		);
		return frameWindow.frames[index] ?? null;
	}

	async getFrameAt({ time }: { time: number }): Promise<RendererVideoFrame> {
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

		let frame = this.getFrameFromWindow({ targetUs });
		if (!frame) {
			this.frameWindow = await this.decodeWindow({ startUs: targetUs });
			frame = this.getFrameFromWindow({ targetUs });
		}
		if (!frame) {
			throw new Error(
				`Node renderer could not decode frame at ${time.toFixed(3)}s from ${this.file.name}.`,
			);
		}

		this.currentFrame = frame;
		return {
			canvas: frame.canvas,
			timestamp: frame.timestampUs / 1_000_000,
			duration: frame.durationUs / 1_000_000,
		};
	}

	close() {}
}

class NodeVideoFrameCache {
	private sources = new Map<string, NodeVideoSource>();

	async getFrameAt({
		mediaId,
		file,
		sourcePath,
		sourceWidth,
		sourceHeight,
		sourceFrameRate,
		time,
	}: {
		mediaId: string;
		file: File;
		sourcePath?: string;
		sourceWidth?: number;
		sourceHeight?: number;
		sourceFrameRate?: number;
		time: number;
	}) {
		const key = sourcePath ? `${mediaId}:${sourcePath}` : mediaId;
		let source = this.sources.get(key);
		if (!source) {
			source = new NodeVideoSource({
				file,
				sourcePath,
				sourceWidth,
				sourceHeight,
				sourceFrameRate,
			});
			this.sources.set(key, source);
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
			if (isCodecutRendererFontFamily(fontFamily)) {
				registerCodecutFontFamily({ fontFamily });
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
