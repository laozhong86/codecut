import { canTracktHaveAudio } from "@/lib/timeline";
import { canElementHaveAudio } from "@/lib/timeline/element-utils";
import { mediaSupportsAudio } from "@/lib/media/media-utils";
import type { MediaAsset } from "@/types/assets";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";

const OUTPUT_SAMPLE_RATE = 48_000;
const OUTPUT_CHANNELS = 2;

type NativeAudioData = {
	format: string | null;
	sampleRate: number;
	numberOfFrames: number;
	numberOfChannels: number;
	timestamp: number;
	allocationSize(options: {
		planeIndex: number;
		format?: "f32-planar";
	}): number;
	copyTo(
		destination: ArrayBufferView,
		options: { planeIndex: number; format?: "f32-planar" },
	): void;
	close(): void;
};

type MediabunnyAudioSample = NativeAudioData & {
	duration: number;
};

type AudioClip = {
	id: string;
	file: File;
	sourceKind: "audio" | "video";
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	volume: number;
	playbackRate: number;
};

type DecodedAudio = {
	sampleRate: number;
	numberOfChannels: number;
	channels: Float32Array[];
};

export type NodeAudioMix = {
	sampleRate: number;
	numberOfChannels: number;
	channels: [Float32Array, Float32Array];
};

function isMutedTimelineElement({ element }: { element: TimelineElement }) {
	return "muted" in element && element.muted === true;
}

function getElementVolume({ element }: { element: TimelineElement }) {
	return "volume" in element && typeof element.volume === "number"
		? element.volume
		: 1;
}

function getElementPlaybackRate({ element }: { element: TimelineElement }) {
	return "playbackRate" in element && typeof element.playbackRate === "number"
		? element.playbackRate
		: 1;
}

async function fileForLibraryAudioElement({
	element,
}: {
	element: Extract<TimelineElement, { type: "audio"; sourceType: "library" }>;
}): Promise<File> {
	const response = await fetch(element.sourceUrl);
	if (!response.ok) {
		throw new Error(
			`Node renderer library audio fetch failed for ${element.id}: ${response.status}`,
		);
	}
	const blob = await response.blob();
	return new File([blob], `${element.name}.mp4`, {
		type: blob.type || "audio/mp4",
	});
}

async function collectAudioClips({
	tracks,
	mediaAssets,
}: {
	tracks: TimelineTrack[];
	mediaAssets: MediaAsset[];
}): Promise<AudioClip[]> {
	const mediaMap = new Map(mediaAssets.map((asset) => [asset.id, asset]));
	const clips: AudioClip[] = [];

	for (const track of tracks) {
		if (canTracktHaveAudio(track) && track.muted) continue;

		for (const element of track.elements) {
			if (!canElementHaveAudio(element)) continue;
			if (element.duration <= 0) continue;
			if (isMutedTimelineElement({ element })) continue;

			if (element.type === "audio") {
				const file =
					element.sourceType === "upload"
						? mediaMap.get(element.mediaId)?.file
						: await fileForLibraryAudioElement({ element });
				if (!file) {
					throw new Error(
						`Timeline audio media asset was not found: ${element.mediaId}`,
					);
				}
				clips.push({
					id: element.id,
					file,
					sourceKind: "audio",
					startTime: element.startTime,
					duration: element.duration,
					trimStart: element.trimStart,
					trimEnd: element.trimEnd,
					volume: getElementVolume({ element }),
					playbackRate: getElementPlaybackRate({ element }),
				});
				continue;
			}

			if (element.type === "video") {
				const mediaAsset = mediaMap.get(element.mediaId);
				if (!mediaAsset) {
					throw new Error(
						`Timeline video media asset was not found: ${element.mediaId}`,
					);
				}
				if (!mediaSupportsAudio({ media: mediaAsset })) continue;

				clips.push({
					id: element.id,
					file: mediaAsset.file,
					sourceKind: "video",
					startTime: element.startTime,
					duration: element.duration,
					trimStart: element.trimStart,
					trimEnd: element.trimEnd,
					volume: getElementVolume({ element }),
					playbackRate: getElementPlaybackRate({ element }),
				});
			}
		}
	}

	return clips;
}

async function fileToUint8Array({ file }: { file: File }) {
	const bytes = await file.arrayBuffer();
	return new Uint8Array(bytes);
}

function createAudioDemuxer({
	file,
	webcodecs,
	error,
}: {
	file: File;
	webcodecs: typeof import("@napi-rs/webcodecs");
	error: (error: Error) => void;
}) {
	const name = file.name.toLowerCase();
	const type = file.type.toLowerCase();

	if (type.includes("webm") || name.endsWith(".webm")) {
		return new webcodecs.WebMDemuxer({ error });
	}
	if (
		type.includes("mp4") ||
		type.includes("m4a") ||
		name.endsWith(".mp4") ||
		name.endsWith(".m4a")
	) {
		return new webcodecs.Mp4Demuxer({ error });
	}
	if (type.includes("matroska") || name.endsWith(".mkv")) {
		return new webcodecs.MkvDemuxer({ error });
	}

	throw new Error(
		`Node renderer audio decode supports MP4/WebM/MKV/MP3/WAV media only: ${file.name} (${file.type || "unknown"})`,
	);
}

function isBareAudioContainer({ file }: { file: File }) {
	const name = file.name.toLowerCase();
	const type = file.type.toLowerCase();
	return (
		type.includes("mpeg") ||
		type.includes("mp3") ||
		type.includes("wav") ||
		type.includes("wave") ||
		name.endsWith(".mp3") ||
		name.endsWith(".wav") ||
		name.endsWith(".wave")
	);
}

function audioDataToChannels({ audioData }: { audioData: NativeAudioData }) {
	const channels: Float32Array[] = [];
	for (let channel = 0; channel < audioData.numberOfChannels; channel += 1) {
		const data = new Float32Array(audioData.numberOfFrames);
		audioData.copyTo(data, { planeIndex: channel, format: "f32-planar" });
		channels.push(data);
	}
	return channels;
}

type AudioDemuxerChunk = {
	chunkType: "audio" | "video";
	audioChunk?: unknown;
};

function combineDecodedFrames({
	frames,
	fallbackSampleRate,
	fallbackNumberOfChannels,
}: {
	frames: NativeAudioData[];
	fallbackSampleRate: number;
	fallbackNumberOfChannels: number;
}) {
	const sampleRate = frames[0]?.sampleRate ?? fallbackSampleRate;
	const numberOfChannels =
		frames[0]?.numberOfChannels ?? fallbackNumberOfChannels;
	const totalFrames = frames.reduce(
		(sum, frame) => sum + frame.numberOfFrames,
		0,
	);
	const channels = Array.from(
		{ length: numberOfChannels },
		() => new Float32Array(totalFrames),
	);

	let offset = 0;
	for (const frame of frames) {
		const frameChannels = audioDataToChannels({ audioData: frame });
		for (let channel = 0; channel < numberOfChannels; channel += 1) {
			const sourceChannel = Math.min(channel, frameChannels.length - 1);
			channels[channel].set(frameChannels[sourceChannel], offset);
		}
		offset += frame.numberOfFrames;
	}

	return {
		sampleRate,
		numberOfChannels,
		channels,
	} satisfies DecodedAudio;
}

async function decodeBareAudioFile({ file }: { file: File }) {
	const [
		webcodecs,
		{ AudioSampleSink, BlobSource, Input, MP3, WAVE },
	] = await Promise.all([
		import("@napi-rs/webcodecs"),
		import("mediabunny"),
	]);
	const globals = globalThis as typeof globalThis & {
		AudioData?: unknown;
		AudioDecoder?: unknown;
		EncodedAudioChunk?: unknown;
	};
	globals.AudioData ??= webcodecs.AudioData;
	globals.AudioDecoder ??= webcodecs.AudioDecoder;
	globals.EncodedAudioChunk ??= webcodecs.EncodedAudioChunk;

	const input = new Input({
		source: new BlobSource(file),
		formats: [MP3, WAVE],
	});
	const frames: MediabunnyAudioSample[] = [];

	try {
		const audioTrack = await input.getPrimaryAudioTrack();
		if (!audioTrack) return null;
		if (!(await audioTrack.canDecode())) {
			throw new Error(
				`Node renderer cannot decode audio source ${file.name}: ${audioTrack.codec || "unknown codec"}`,
			);
		}

		const sink = new AudioSampleSink(audioTrack);
		for await (const sample of sink.samples()) {
			frames.push(sample as unknown as MediabunnyAudioSample);
		}

		return combineDecodedFrames({
			frames,
			fallbackSampleRate: audioTrack.sampleRate,
			fallbackNumberOfChannels: audioTrack.numberOfChannels,
		});
	} finally {
		for (const frame of frames) {
			frame.close();
		}
		input.dispose();
	}
}

async function decodeAudioFile({ file }: { file: File }) {
	if (isBareAudioContainer({ file })) {
		return decodeBareAudioFile({ file });
	}

	const webcodecs = await import("@napi-rs/webcodecs");
	const frames: NativeAudioData[] = [];
	let decoderError: Error | null = null;
	let demuxerError: Error | null = null;
	const decoder = new webcodecs.AudioDecoder({
		output: (audioData) => {
			frames.push(audioData as unknown as NativeAudioData);
		},
		error: (error) => {
			decoderError = error;
		},
	});
	const demuxer = createAudioDemuxer({
		file,
		webcodecs,
		error: (error) => {
			demuxerError = error;
		},
	});

	try {
		await demuxer.loadBuffer(await fileToUint8Array({ file }));
		const config = demuxer.audioDecoderConfig;
		if (!config) return null;
		decoder.configure(config);
		for await (const chunk of demuxer as AsyncIterable<AudioDemuxerChunk>) {
			if (chunk.chunkType !== "audio") continue;
			if (!chunk.audioChunk) continue;
			if (decoderError) throw decoderError;
			if (demuxerError) throw demuxerError;
			decoder.decode(chunk.audioChunk as never);
		}
		await decoder.flush();
		if (decoderError) throw decoderError;
		if (demuxerError) throw demuxerError;

		return combineDecodedFrames({
			frames,
			fallbackSampleRate: config.sampleRate,
			fallbackNumberOfChannels: config.numberOfChannels,
		});
	} finally {
		for (const frame of frames) {
			frame.close();
		}
		demuxer.close();
		if (decoder.state !== "closed") {
			decoder.close();
		}
	}
}

function mixClip({
	clip,
	decoded,
	mix,
	totalSamples,
}: {
	clip: AudioClip;
	decoded: DecodedAudio;
	mix: [Float32Array, Float32Array];
	totalSamples: number;
}) {
	const outputStartSample = Math.floor(clip.startTime * OUTPUT_SAMPLE_RATE);
	const sourceStartSample = Math.floor(clip.trimStart * decoded.sampleRate);
	const sourceEndSeconds = Math.min(
		clip.trimEnd,
		clip.trimStart + clip.duration * clip.playbackRate,
	);
	const sourceLengthSamples = Math.max(
		0,
		Math.floor((sourceEndSeconds - clip.trimStart) * decoded.sampleRate),
	);
	const resampleRatio =
		OUTPUT_SAMPLE_RATE / decoded.sampleRate / clip.playbackRate;
	const outputLength = Math.floor(sourceLengthSamples * resampleRatio);

	for (let channel = 0; channel < OUTPUT_CHANNELS; channel += 1) {
		const output = mix[channel];
		const source =
			decoded.channels[Math.min(channel, decoded.numberOfChannels - 1)];
		for (let i = 0; i < outputLength; i += 1) {
			const outputIndex = outputStartSample + i;
			if (outputIndex < 0 || outputIndex >= totalSamples) continue;

			const sourcePos = sourceStartSample + i / resampleRatio;
			const sourceIndex = Math.floor(sourcePos);
			if (sourceIndex < 0 || sourceIndex >= source.length) break;

			const fraction = sourcePos - sourceIndex;
			const sample0 = source[sourceIndex];
			const sample1 =
				sourceIndex + 1 < source.length ? source[sourceIndex + 1] : sample0;
			output[outputIndex] +=
				(sample0 + fraction * (sample1 - sample0)) * clip.volume;
		}
	}
}

function clampMix({ mix }: { mix: [Float32Array, Float32Array] }) {
	for (const channel of mix) {
		for (let i = 0; i < channel.length; i += 1) {
			channel[i] = Math.max(-1, Math.min(1, channel[i]));
		}
	}
}

export async function mixTimelineAudio({
	tracks,
	mediaAssets,
	duration,
}: {
	tracks: TimelineTrack[];
	mediaAssets: MediaAsset[];
	duration: number;
}): Promise<NodeAudioMix | null> {
	const clips = await collectAudioClips({ tracks, mediaAssets });
	if (clips.length === 0) return null;

	const totalSamples = Math.ceil(duration * OUTPUT_SAMPLE_RATE);
	const mix: [Float32Array, Float32Array] = [
		new Float32Array(totalSamples),
		new Float32Array(totalSamples),
	];
	let decodedClipCount = 0;

	for (const clip of clips) {
		const decoded = await decodeAudioFile({ file: clip.file });
		if (!decoded) {
			if (clip.sourceKind === "audio") {
				throw new Error(`Timeline audio source has no audio track: ${clip.id}`);
			}
			continue;
		}
		decodedClipCount += 1;
		mixClip({ clip, decoded, mix, totalSamples });
	}

	if (decodedClipCount === 0) return null;
	clampMix({ mix });
	return {
		sampleRate: OUTPUT_SAMPLE_RATE,
		numberOfChannels: OUTPUT_CHANNELS,
		channels: mix,
	};
}
