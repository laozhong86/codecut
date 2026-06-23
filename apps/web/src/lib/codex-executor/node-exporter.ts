import { readFile } from "node:fs/promises";
import { buildScene } from "@/services/renderer/scene-builder";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import type { MediaAsset } from "@/types/assets";
import type { ExecutorExportProject, ExecutorProjectState } from "./executor";
import type { NodeAudioMix } from "./node-audio-mixer";
import { mixTimelineAudio } from "./node-audio-mixer";
import { createNodeRendererRuntime } from "./node-renderer-runtime";

const qualityBitrates = {
	low: 600_000,
	medium: 1_500_000,
	high: 3_000_000,
	very_high: 6_000_000,
} satisfies Record<string, number>;

const audioQualityBitrates = {
	low: 96_000,
	medium: 128_000,
	high: 192_000,
	very_high: 256_000,
} satisfies Record<string, number>;

const AUDIO_CHUNK_FRAMES = 1024;
const AUDIO_TIMESTAMP_EPSILON_SECONDS = 1 / 1_000_000;

function clampByte(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)));
}

export function rgbaToI420({
	rgba,
	width,
	height,
}: {
	rgba: Uint8ClampedArray;
	width: number;
	height: number;
}): Uint8Array {
	if (width % 2 !== 0 || height % 2 !== 0) {
		throw new Error("I420 conversion requires even width and height.");
	}
	if (rgba.byteLength !== width * height * 4) {
		throw new Error("RGBA buffer size does not match width and height.");
	}

	const yPlaneSize = width * height;
	const chromaWidth = width / 2;
	const chromaHeight = height / 2;
	const uPlaneOffset = yPlaneSize;
	const vPlaneOffset = yPlaneSize + chromaWidth * chromaHeight;
	const i420 = new Uint8Array(yPlaneSize + chromaWidth * chromaHeight * 2);

	for (let y = 0; y < height; y += 2) {
		for (let x = 0; x < width; x += 2) {
			let uSum = 0;
			let vSum = 0;

			for (let dy = 0; dy < 2; dy += 1) {
				for (let dx = 0; dx < 2; dx += 1) {
					const px = x + dx;
					const py = y + dy;
					const rgbaIndex = (py * width + px) * 4;
					const r = rgba[rgbaIndex];
					const g = rgba[rgbaIndex + 1];
					const b = rgba[rgbaIndex + 2];
					const yValue = 16 + 0.257 * r + 0.504 * g + 0.098 * b;
					const uValue = 128 - 0.148 * r - 0.291 * g + 0.439 * b;
					const vValue = 128 + 0.439 * r - 0.368 * g - 0.071 * b;

					i420[py * width + px] = clampByte(yValue);
					uSum += uValue;
					vSum += vValue;
				}
			}

			const chromaIndex = (y / 2) * chromaWidth + x / 2;
			i420[uPlaneOffset + chromaIndex] = clampByte(uSum / 4);
			i420[vPlaneOffset + chromaIndex] = clampByte(vSum / 4);
		}
	}

	return i420;
}

async function fileForExecutorMediaAsset({
	asset,
}: {
	asset: ExecutorProjectState["mediaAssets"][number];
}): Promise<File> {
	const bytes = await readFile(asset.path);
	if (bytes.byteLength === 0) {
		throw new Error(`Executor media asset ${asset.id} is empty.`);
	}
	if (bytes.byteLength !== asset.size) {
		throw new Error(`Executor media asset size mismatch for ${asset.id}.`);
	}
	const fileBytes = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
	return new File([fileBytes], asset.name, {
		type: asset.mimeType,
		lastModified: asset.lastModified,
	});
}

async function buildRendererMediaAssets({
	state,
}: {
	state: ExecutorProjectState;
}): Promise<MediaAsset[]> {
	return Promise.all(
		state.mediaAssets.map(async (asset) => ({
			id: asset.id,
			name: asset.name,
			type: asset.type,
			duration: asset.duration,
			width: asset.width,
			height: asset.height,
			file: await fileForExecutorMediaAsset({ asset }),
		})),
	);
}

function assertSupportedCanvasSize({
	width,
	height,
	format,
}: {
	width: number;
	height: number;
	format: "mp4" | "webm";
}) {
	if (!Number.isInteger(width) || !Number.isInteger(height)) {
		throw new Error("Node renderer canvas size must be integer pixels.");
	}
	if (width <= 0 || height <= 0) {
		throw new Error("Node renderer canvas size must be positive.");
	}
	if (format === "mp4" && (width % 2 !== 0 || height % 2 !== 0)) {
		throw new Error("MP4 export requires an even canvas width and height.");
	}
}

async function installNodeWebCodecsGlobals() {
	const webcodecs = await import("@napi-rs/webcodecs");
	const globals = globalThis as Record<string, unknown>;
	globals.AudioData ??= webcodecs.AudioData;
	globals.AudioDecoder ??= webcodecs.AudioDecoder;
	globals.AudioEncoder ??= webcodecs.AudioEncoder;
	globals.EncodedAudioChunk ??= webcodecs.EncodedAudioChunk;
	globals.EncodedVideoChunk ??= webcodecs.EncodedVideoChunk;
	globals.VideoEncoder ??= webcodecs.VideoEncoder;
	globals.VideoFrame ??= webcodecs.VideoFrame;
	return webcodecs;
}

async function addAudioMixToSource({
	audioMix,
	audioSource,
	AudioSample,
}: {
	audioMix: NodeAudioMix;
	audioSource: { add(sample: unknown): Promise<void>; close(): void };
	AudioSample: new (init: {
		data: ArrayBuffer;
		format: "f32";
		numberOfChannels: number;
		sampleRate: number;
		timestamp: number;
	}) => { close(): void };
}) {
	const totalFrames = audioMix.channels[0].length;
	for (let offset = 0; offset < totalFrames; offset += AUDIO_CHUNK_FRAMES) {
		const frameCount = Math.min(AUDIO_CHUNK_FRAMES, totalFrames - offset);
		const interleaved = new Float32Array(
			frameCount * audioMix.numberOfChannels,
		);
		for (let i = 0; i < frameCount; i += 1) {
			interleaved[i * audioMix.numberOfChannels] =
				audioMix.channels[0][offset + i];
			interleaved[i * audioMix.numberOfChannels + 1] =
				audioMix.channels[1][offset + i];
		}
		const sample = new AudioSample({
			format: "f32",
			sampleRate: audioMix.sampleRate,
			numberOfChannels: audioMix.numberOfChannels,
			timestamp: offset / audioMix.sampleRate,
			data: interleaved.buffer as ArrayBuffer,
		});
		await audioSource.add(sample);
		sample.close();
	}
	audioSource.close();
}

async function addAudioMixToEncodedAacSource({
	audioMix,
	audioSource,
	AudioData,
	AudioEncoder,
	EncodedPacket,
	bitrate,
}: {
	audioMix: NodeAudioMix;
	audioSource: {
		add(packet: unknown, metadata?: unknown): Promise<void>;
		close(): void;
	};
	AudioData: typeof import("@napi-rs/webcodecs").AudioData;
	AudioEncoder: typeof import("@napi-rs/webcodecs").AudioEncoder;
	EncodedPacket: typeof import("mediabunny").EncodedPacket;
	bitrate: number;
}) {
	const pendingAdds: Promise<void>[] = [];
	let encoderError: Error | null = null;
	let lastPacketTimestamp = -Infinity;
	const encoder = new AudioEncoder({
		output: (chunk, metadata) => {
			const packet = EncodedPacket.fromEncodedChunk(chunk);
			if (
				packet.timestamp <=
				lastPacketTimestamp + AUDIO_TIMESTAMP_EPSILON_SECONDS
			) {
				return;
			}
			lastPacketTimestamp = packet.timestamp;
			pendingAdds.push(audioSource.add(packet, metadata));
		},
		error: (error) => {
			encoderError = error;
		},
	});

	encoder.configure({
		codec: "mp4a.40.2",
		sampleRate: audioMix.sampleRate,
		numberOfChannels: audioMix.numberOfChannels,
		bitrate,
	});

	const totalFrames = audioMix.channels[0].length;
	for (let offset = 0; offset < totalFrames; offset += AUDIO_CHUNK_FRAMES) {
		const frameCount = Math.min(AUDIO_CHUNK_FRAMES, totalFrames - offset);
		const interleaved = new Float32Array(
			frameCount * audioMix.numberOfChannels,
		);
		for (let i = 0; i < frameCount; i += 1) {
			interleaved[i * audioMix.numberOfChannels] =
				audioMix.channels[0][offset + i];
			interleaved[i * audioMix.numberOfChannels + 1] =
				audioMix.channels[1][offset + i];
		}
		const audioData = new AudioData({
			format: "f32",
			sampleRate: audioMix.sampleRate,
			numberOfFrames: frameCount,
			numberOfChannels: audioMix.numberOfChannels,
			timestamp: Math.round((offset / audioMix.sampleRate) * 1_000_000),
			data: interleaved.buffer,
		});
		encoder.encode(audioData);
		audioData.close();

		if (encoder.encodeQueueSize >= 4) {
			await new Promise<void>((resolve) => {
				encoder.addEventListener("dequeue", () => resolve(), { once: true });
			});
		}
	}

	await encoder.flush();
	if (encoderError) throw encoderError;
	await Promise.all(pendingAdds);
	encoder.close();
	audioSource.close();
}

export const exportProjectWithNodeRenderer: ExecutorExportProject = async ({
	state,
	format,
	quality,
	includeAudio,
}) => {
	const webcodecs = await installNodeWebCodecsGlobals();
	const {
		AudioSample,
		AudioSampleSource,
		BufferTarget,
		EncodedAudioPacketSource,
		EncodedPacket,
		Mp4OutputFormat,
		Output,
		VideoSample,
		VideoSampleSource,
		WebMOutputFormat,
	} = await import("mediabunny");

	const { canvasSize, fps, background } = state.project.settings;
	const width = canvasSize.width;
	const height = canvasSize.height;
	assertSupportedCanvasSize({ width, height, format });

	const mediaAssets = await buildRendererMediaAssets({ state });
	const duration = state.tracks.reduce((max, track) => {
		const trackEnd = track.elements.reduce(
			(elementMax, element) =>
				Math.max(elementMax, element.startTime + element.duration),
			0,
		);
		return Math.max(max, trackEnd);
	}, 0);
	const audioMix = includeAudio
		? await mixTimelineAudio({
				tracks: state.tracks,
				mediaAssets,
				duration,
			})
		: null;
	const rootNode = buildScene({
		canvasSize,
		tracks: state.tracks,
		mediaAssets,
		derivedAssets: state.derivedAssets,
		duration,
		background,
	});
	const runtime = createNodeRendererRuntime();
	const renderer = new CanvasRenderer({
		width,
		height,
		fps,
		imageSmoothingQuality: "high",
		runtime,
	});

	const output = new Output({
		format: format === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat(),
		target: new BufferTarget(),
	});
	const videoSource = new VideoSampleSource({
		codec: format === "mp4" ? "avc" : "vp9",
		bitrate: qualityBitrates[quality],
		latencyMode: "realtime",
	});
	output.addVideoTrack(videoSource, { frameRate: fps });
	let audioSource:
		| InstanceType<typeof AudioSampleSource>
		| InstanceType<typeof EncodedAudioPacketSource>
		| null = null;
	if (audioMix) {
		audioSource =
			format === "mp4"
				? new EncodedAudioPacketSource("aac")
				: new AudioSampleSource({
						codec: "opus",
						bitrate: audioQualityBitrates[quality],
					});
		output.addAudioTrack(audioSource);
	}

	await output.start();
	if (audioMix && audioSource) {
		if (format === "mp4") {
			await addAudioMixToEncodedAacSource({
				audioMix,
				audioSource,
				AudioData: webcodecs.AudioData,
				AudioEncoder: webcodecs.AudioEncoder,
				EncodedPacket,
				bitrate: audioQualityBitrates[quality],
			});
		} else {
			await addAudioMixToSource({
				audioMix,
				audioSource,
				AudioSample,
			});
		}
	}

	const frameCount = Math.ceil(rootNode.duration * fps) + 1;
	for (let i = 0; i < frameCount; i++) {
		const frameTime = Math.min(i / fps, rootNode.duration);
		const renderTime = Math.min(
			frameTime,
			Math.max(0, rootNode.duration - 1 / fps),
		);
		await renderer.render({ node: rootNode, time: renderTime });
		const frameData = renderer.context.getImageData(0, 0, width, height).data;
		const sample = new VideoSample(
			rgbaToI420({ rgba: frameData, width, height }),
			{
				format: "I420",
				codedWidth: width,
				codedHeight: height,
				timestamp: frameTime,
				duration: 1 / fps,
			},
		);
		await videoSource.add(sample, { keyFrame: i === 0 || i % fps === 0 });
		sample.close();
	}

	videoSource.close();
	await output.finalize();
	if (!output.target.buffer) {
		throw new Error("Node renderer export did not produce output bytes.");
	}
	return output.target.buffer;
};
