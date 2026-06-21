import { spawn } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const DEFAULT_FRAME_COUNT = 10;
const MAX_FRAME_COUNT = 16;
const AUDIO_SAMPLE_RATE = 16000;
const WAVEFORM_BUCKET_COUNT = 100;
const MAX_AUDIO_BYTES = 512 * 1024 * 1024;

export interface ExecutorVideoRangeMediaAsset {
	id: string;
	name: string;
	type: string;
	durationSeconds?: number;
	path?: string;
}

export interface VideoRangeFrame {
	timeSeconds: number;
}

export interface VideoRangeInspection {
	mediaId: string;
	sourceRange: {
		startSeconds: number;
		endSeconds: number;
		durationSeconds: number;
	};
	artifact: {
		kind: "video_range_contact_sheet";
		path: string;
		mimeType: "image/png";
		width: number;
		height: number;
	};
	frames: VideoRangeFrame[];
	audio: {
		hasAudio: boolean;
		waveformSamples: number[];
		silenceRanges: Array<{
			startSeconds: number;
			endSeconds: number;
			durationSeconds: number;
		}>;
	};
	warnings: string[];
}

export type ReadAudioSamples = ({
	mediaPath,
	startSeconds,
	endSeconds,
}: {
	mediaPath: string;
	startSeconds: number;
	endSeconds: number;
}) => Promise<{
	hasAudio: boolean;
	samples: Float32Array;
	sampleRate: number;
}>;

export type RenderContactSheet = ({
	mediaPath,
	startSeconds,
	endSeconds,
	frames,
	audio,
	outputPath,
}: {
	mediaPath: string;
	startSeconds: number;
	endSeconds: number;
	frames: VideoRangeFrame[];
	audio: { hasAudio: boolean };
	outputPath: string;
}) => Promise<{ width: number; height: number }>;

function roundToMillis(value: number): number {
	return Number(value.toFixed(3));
}

function sanitizeFilePart(value: string): string {
	const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, "-");
	if (!sanitized) {
		throw new Error("inspect_video_range mediaId must produce a file name.");
	}
	return sanitized;
}

function assertFiniteNumber({
	value,
	message,
}: {
	value: number;
	message: string;
}) {
	if (!Number.isFinite(value)) {
		throw new Error(message);
	}
}

export function computeFrameTimes({
	startSeconds,
	endSeconds,
	frameCount,
}: {
	startSeconds: number;
	endSeconds: number;
	frameCount: number;
}): VideoRangeFrame[] {
	if (frameCount === 1) {
		return [
			{
				timeSeconds: roundToMillis((startSeconds + endSeconds) / 2),
			},
		];
	}

	const span = endSeconds - startSeconds;
	return Array.from({ length: frameCount }, (_, index) => ({
		timeSeconds: roundToMillis(
			startSeconds + (span * index) / (frameCount - 1),
		),
	}));
}

export function buildWaveformSamples({
	samples,
	bucketCount = WAVEFORM_BUCKET_COUNT,
}: {
	samples: Float32Array;
	bucketCount?: number;
}): number[] {
	if (!Number.isInteger(bucketCount) || bucketCount <= 0) {
		throw new Error("waveform bucketCount must be a positive integer.");
	}
	if (samples.length === 0) {
		return Array.from({ length: bucketCount }, () => 0);
	}

	let maxAmplitude = 0;
	for (const sample of samples) {
		maxAmplitude = Math.max(maxAmplitude, Math.abs(sample));
	}
	if (maxAmplitude === 0) {
		return Array.from({ length: bucketCount }, () => 0);
	}

	return Array.from({ length: bucketCount }, (_, index) => {
		const start = Math.floor((index * samples.length) / bucketCount);
		const end = Math.max(
			start + 1,
			Math.floor(((index + 1) * samples.length) / bucketCount),
		);
		let bucketPeak = 0;
		for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
			const clampedIndex = Math.min(sampleIndex, samples.length - 1);
			bucketPeak = Math.max(bucketPeak, Math.abs(samples[clampedIndex] ?? 0));
		}
		return roundToMillis(bucketPeak / maxAmplitude);
	});
}

export function detectSilenceRanges({
	samples,
	sampleRate,
	sourceStartSeconds,
	windowSeconds = 0.1,
	minSilenceSeconds = 0.4,
	silenceThreshold = 0.01,
}: {
	samples: Float32Array;
	sampleRate: number;
	sourceStartSeconds: number;
	windowSeconds?: number;
	minSilenceSeconds?: number;
	silenceThreshold?: number;
}): Array<{
	startSeconds: number;
	endSeconds: number;
	durationSeconds: number;
}> {
	if (samples.length === 0) return [];
	if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
		throw new Error("audio sampleRate must be a positive number.");
	}

	const windowSampleCount = Math.max(1, Math.round(sampleRate * windowSeconds));
	const ranges: Array<{
		startSeconds: number;
		endSeconds: number;
		durationSeconds: number;
	}> = [];
	let silenceStartIndex: number | null = null;

	for (
		let windowStartIndex = 0;
		windowStartIndex < samples.length;
		windowStartIndex += windowSampleCount
	) {
		const windowEndIndex = Math.min(
			windowStartIndex + windowSampleCount,
			samples.length,
		);
		let peak = 0;
		for (
			let sampleIndex = windowStartIndex;
			sampleIndex < windowEndIndex;
			sampleIndex += 1
		) {
			peak = Math.max(peak, Math.abs(samples[sampleIndex] ?? 0));
		}

		if (peak <= silenceThreshold) {
			if (silenceStartIndex === null) {
				silenceStartIndex = windowStartIndex;
			}
			continue;
		}

		if (silenceStartIndex !== null) {
			appendSilenceRange({
				ranges,
				silenceStartIndex,
				silenceEndIndex: windowStartIndex,
				sampleRate,
				sourceStartSeconds,
				minSilenceSeconds,
			});
			silenceStartIndex = null;
		}
	}

	if (silenceStartIndex !== null) {
		appendSilenceRange({
			ranges,
			silenceStartIndex,
			silenceEndIndex: samples.length,
			sampleRate,
			sourceStartSeconds,
			minSilenceSeconds,
		});
	}

	return ranges;
}

function appendSilenceRange({
	ranges,
	silenceStartIndex,
	silenceEndIndex,
	sampleRate,
	sourceStartSeconds,
	minSilenceSeconds,
}: {
	ranges: Array<{
		startSeconds: number;
		endSeconds: number;
		durationSeconds: number;
	}>;
	silenceStartIndex: number;
	silenceEndIndex: number;
	sampleRate: number;
	sourceStartSeconds: number;
	minSilenceSeconds: number;
}) {
	const durationSeconds =
		(silenceEndIndex - silenceStartIndex) / sampleRate;
	if (durationSeconds < minSilenceSeconds) return;

	const startSeconds = roundToMillis(
		sourceStartSeconds + silenceStartIndex / sampleRate,
	);
	const endSeconds = roundToMillis(
		sourceStartSeconds + silenceEndIndex / sampleRate,
	);
	ranges.push({
		startSeconds,
		endSeconds,
		durationSeconds: roundToMillis(endSeconds - startSeconds),
	});
}

async function runProcess({
	command,
	args,
}: {
	command: string;
	args: string[];
}): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args);
		let stdout = "";
		let stderr = "";
		let settled = false;

		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			child.kill();
			reject(error);
		};

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", (error) => {
			fail(new Error(`Failed to start ${command}: ${error.message}`));
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			if (code !== 0) {
				reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
				return;
			}
			resolve(stdout);
		});
	});
}

async function readAudioSamplesFromFfmpeg({
	mediaPath,
	startSeconds,
	endSeconds,
}: {
	mediaPath: string;
	startSeconds: number;
	endSeconds: number;
}): Promise<{
	hasAudio: boolean;
	samples: Float32Array;
	sampleRate: number;
}> {
	const probeOutput = await runProcess({
		command: "ffprobe",
		args: [
			"-v",
			"error",
			"-select_streams",
			"a:0",
			"-show_entries",
			"stream=index",
			"-of",
			"csv=p=0",
			mediaPath,
		],
	});
	if (!probeOutput.trim()) {
		return {
			hasAudio: false,
			samples: new Float32Array(),
			sampleRate: AUDIO_SAMPLE_RATE,
		};
	}

	return new Promise((resolve, reject) => {
		const ffmpeg = spawn("ffmpeg", [
			"-v",
			"error",
			"-ss",
			String(startSeconds),
			"-t",
			String(endSeconds - startSeconds),
			"-i",
			mediaPath,
			"-vn",
			"-ac",
			"1",
			"-ar",
			String(AUDIO_SAMPLE_RATE),
			"-f",
			"f32le",
			"pipe:1",
		]);
		const chunks: Buffer[] = [];
		let totalBytes = 0;
		let stderr = "";
		let settled = false;

		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			ffmpeg.kill();
			reject(error);
		};

		ffmpeg.stdout.on("data", (chunk: Buffer) => {
			totalBytes += chunk.byteLength;
			if (totalBytes > MAX_AUDIO_BYTES) {
				fail(
					new Error("inspect_video_range extracted audio is too large."),
				);
				return;
			}
			chunks.push(chunk);
		});
		ffmpeg.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		ffmpeg.on("error", (error) => {
			fail(new Error(`Failed to start ffmpeg: ${error.message}`));
		});
		ffmpeg.on("close", (code) => {
			if (settled) return;
			settled = true;
			if (code !== 0) {
				reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
				return;
			}

			const bytes = Buffer.concat(chunks, totalBytes);
			const alignedBytes = bytes.byteLength - (bytes.byteLength % 4);
			const view = new DataView(
				bytes.buffer,
				bytes.byteOffset,
				alignedBytes,
			);
			const samples = new Float32Array(alignedBytes / 4);
			for (let index = 0; index < samples.length; index += 1) {
				samples[index] = view.getFloat32(index * 4, true);
			}
			resolve({
				hasAudio: samples.length > 0,
				samples,
				sampleRate: AUDIO_SAMPLE_RATE,
			});
		});
	});
}

async function probeImageSize({
	path,
}: {
	path: string;
}): Promise<{ width: number; height: number }> {
	const stdout = await runProcess({
		command: "ffprobe",
		args: [
			"-v",
			"error",
			"-print_format",
			"json",
			"-show_entries",
			"stream=width,height",
			path,
		],
	});
	const payload = JSON.parse(stdout);
	const stream = Array.isArray(payload?.streams) ? payload.streams[0] : null;
	const width = Number(stream?.width);
	const height = Number(stream?.height);
	if (!Number.isFinite(width) || !Number.isFinite(height)) {
		throw new Error(`ffprobe could not read image size for ${path}`);
	}
	return { width, height };
}

async function renderContactSheetWithFfmpeg({
	mediaPath,
	startSeconds,
	endSeconds,
	frames,
	audio,
	outputPath,
}: {
	mediaPath: string;
	startSeconds: number;
	endSeconds: number;
	frames: VideoRangeFrame[];
	audio: { hasAudio: boolean };
	outputPath: string;
}): Promise<{ width: number; height: number }> {
	await mkdir(dirname(outputPath), { recursive: true });
	const temporaryBase = outputPath.replace(/\.png$/i, "");
	const framesPath = `${temporaryBase}.frames.png`;
	const waveformPath = `${temporaryBase}.waveform.png`;
	const durationSeconds = endSeconds - startSeconds;
	const frameCount = Math.max(1, frames.length);

	try {
		await runProcess({
			command: "ffmpeg",
			args: [
				"-y",
				"-v",
				"error",
				"-ss",
				String(startSeconds),
				"-t",
				String(durationSeconds),
				"-i",
				mediaPath,
				"-vf",
				`fps=${frameCount}/${durationSeconds},scale=320:-2,tile=${frameCount}x1:padding=4:margin=4:color=black`,
				"-frames:v",
				"1",
				framesPath,
			],
		});
		const frameImage = await probeImageSize({ path: framesPath });

		if (audio.hasAudio) {
			await runProcess({
				command: "ffmpeg",
				args: [
					"-y",
					"-v",
					"error",
					"-ss",
					String(startSeconds),
					"-t",
					String(durationSeconds),
					"-i",
					mediaPath,
					"-filter_complex",
					`aformat=channel_layouts=mono,showwavespic=s=${frameImage.width}x160:colors=DodgerBlue`,
					"-frames:v",
					"1",
					waveformPath,
				],
			});
		} else {
			await runProcess({
				command: "ffmpeg",
				args: [
					"-y",
					"-v",
					"error",
					"-f",
					"lavfi",
					"-i",
					`color=c=0x1f1f1f:s=${frameImage.width}x160`,
					"-frames:v",
					"1",
					waveformPath,
				],
			});
		}

		await runProcess({
			command: "ffmpeg",
			args: [
				"-y",
				"-v",
				"error",
				"-i",
				framesPath,
				"-i",
				waveformPath,
				"-filter_complex",
				"[0:v][1:v]vstack=inputs=2",
				outputPath,
			],
		});

		return probeImageSize({ path: outputPath });
	} finally {
		await rm(framesPath, { force: true });
		await rm(waveformPath, { force: true });
	}
}

export async function inspectVideoRange({
	mediaAsset,
	startSeconds,
	endSeconds,
	frameCount = DEFAULT_FRAME_COUNT,
	outputDirectory,
	readAudioSamples = readAudioSamplesFromFfmpeg,
	renderContactSheet = renderContactSheetWithFfmpeg,
}: {
	mediaAsset: ExecutorVideoRangeMediaAsset;
	startSeconds: number;
	endSeconds: number;
	frameCount?: number;
	outputDirectory: string;
	readAudioSamples?: ReadAudioSamples;
	renderContactSheet?: RenderContactSheet;
}): Promise<VideoRangeInspection> {
	if (mediaAsset.type !== "video") {
		throw new Error("inspect_video_range requires video media.");
	}
	if (!mediaAsset.path) {
		throw new Error("inspect_video_range media path is required.");
	}
	if (
		!Number.isFinite(mediaAsset.durationSeconds) ||
		!mediaAsset.durationSeconds
	) {
		throw new Error("inspect_video_range media duration is required.");
	}
	assertFiniteNumber({
		value: startSeconds,
		message:
			"inspect_video_range startSeconds must be a finite non-negative number.",
	});
	if (startSeconds < 0) {
		throw new Error(
			"inspect_video_range startSeconds must be a finite non-negative number.",
		);
	}
	assertFiniteNumber({
		value: endSeconds,
		message: "inspect_video_range endSeconds must be a finite number.",
	});
	if (endSeconds <= startSeconds) {
		throw new Error(
			"inspect_video_range endSeconds must be greater than startSeconds.",
		);
	}
	if (endSeconds > mediaAsset.durationSeconds) {
		throw new Error("inspect_video_range endSeconds exceeds media duration.");
	}
	if (
		!Number.isInteger(frameCount) ||
		frameCount < 1 ||
		frameCount > MAX_FRAME_COUNT
	) {
		throw new Error(
			"inspect_video_range frameCount must be an integer from 1 to 16.",
		);
	}

	try {
		const mediaStats = await stat(mediaAsset.path);
		if (!mediaStats.isFile()) {
			throw new Error("inspect_video_range media file was not found.");
		}
	} catch {
		throw new Error("inspect_video_range media file was not found.");
	}

	const absoluteOutputDirectory = resolve(outputDirectory);
	await mkdir(absoluteOutputDirectory, { recursive: true });
	const outputPath = join(
		absoluteOutputDirectory,
		`${sanitizeFilePart(mediaAsset.id)}-${startSeconds.toFixed(3)}-${endSeconds.toFixed(3)}.png`,
	);
	const frames = computeFrameTimes({
		startSeconds,
		endSeconds,
		frameCount,
	});
	const audioSamples = await readAudioSamples({
		mediaPath: mediaAsset.path,
		startSeconds,
		endSeconds,
	});
	const waveformSamples = buildWaveformSamples({
		samples: audioSamples.samples,
		bucketCount: WAVEFORM_BUCKET_COUNT,
	});
	const silenceRanges = audioSamples.hasAudio
		? detectSilenceRanges({
				samples: audioSamples.samples,
				sampleRate: audioSamples.sampleRate,
				sourceStartSeconds: startSeconds,
			})
		: [];
	const artifactSize = await renderContactSheet({
		mediaPath: mediaAsset.path,
		startSeconds,
		endSeconds,
		frames,
		audio: { hasAudio: audioSamples.hasAudio },
		outputPath,
	});
	await stat(outputPath);

	return {
		mediaId: mediaAsset.id,
		sourceRange: {
			startSeconds,
			endSeconds,
			durationSeconds: roundToMillis(endSeconds - startSeconds),
		},
		artifact: {
			kind: "video_range_contact_sheet",
			path: outputPath,
			mimeType: "image/png",
			width: artifactSize.width,
			height: artifactSize.height,
		},
		frames,
		audio: {
			hasAudio: audioSamples.hasAudio,
			waveformSamples,
			silenceRanges,
		},
		warnings: audioSamples.hasAudio ? [] : ["audio track not found"],
	};
}
