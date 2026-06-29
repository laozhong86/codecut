import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { mixTimelineAudio } from "../node-audio-mixer";
import type { MediaAsset } from "@/types/assets";
import type { TimelineTrack } from "@/types/timeline";

function createInterleavedF32Pcm({
	duration,
	sampleRate,
	channelCount,
}: {
	duration: number;
	sampleRate: number;
	channelCount: number;
}): Buffer {
	const frameCount = Math.ceil(duration * sampleRate);
	const samples = new Float32Array(frameCount * channelCount);
	for (let frame = 0; frame < frameCount; frame += 1) {
		for (let channel = 0; channel < channelCount; channel += 1) {
			samples[frame * channelCount + channel] = channel === 0 ? 0.25 : -0.25;
		}
	}
	return Buffer.from(samples.buffer);
}

test("mixTimelineAudio uses FFmpeg PCM extraction when the node decoder rejects a source", async () => {
	const duration = 0.1;
	const sampleRate = 48_000;
	const file = new File([Buffer.from("not a demuxable mp4")], "source.mp4", {
		type: "video/mp4",
	});
	const mediaAssets = [
		{
			id: "video-1",
			name: "source.mp4",
			type: "video",
			duration,
			width: 64,
			height: 112,
			file,
		},
	] as unknown as MediaAsset[];
	const tracks = [
		{
			id: "video-track-1",
			type: "video",
			name: "Video",
			muted: false,
			hidden: false,
			elements: [
				{
					id: "clip-1",
					type: "video",
					mediaId: "video-1",
					startTime: 0,
					duration,
					trimStart: 0,
					trimEnd: duration,
					volume: 1,
					playbackRate: 1,
				},
			],
		},
	] as unknown as TimelineTrack[];
	let ffmpegCallCount = 0;

	const mix = await mixTimelineAudio({
		tracks,
		mediaAssets,
		duration,
		execFileImpl: async (command, args) => {
			ffmpegCallCount += 1;
			expect(command).toBe("ffmpeg");
			expect(args).toContain("-f");
			expect(args).toContain("f32le");
			const outputPath = String(args.at(-1));
			await writeFile(
				outputPath,
				createInterleavedF32Pcm({
					duration,
					sampleRate,
					channelCount: 2,
				}),
			);
			return { stdout: "", stderr: "" };
		},
	});

	expect(ffmpegCallCount).toBe(1);
	expect(mix).not.toBeNull();
	expect(mix?.sampleRate).toBe(sampleRate);
	expect(mix?.numberOfChannels).toBe(2);
	expect(mix?.channels[0][0]).toBeCloseTo(0.25, 5);
	expect(mix?.channels[1][0]).toBeCloseTo(-0.25, 5);
});
