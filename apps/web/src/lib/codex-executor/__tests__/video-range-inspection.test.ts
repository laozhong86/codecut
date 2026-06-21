import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildWaveformSamples,
	computeFrameTimes,
	detectSilenceRanges,
	inspectVideoRange,
} from "../video-range-inspection";

describe("video range inspection", () => {
	test("computeFrameTimes returns evenly spaced timestamps inside the source range", () => {
		expect(
			computeFrameTimes({
				startSeconds: 10,
				endSeconds: 14,
				frameCount: 5,
			}),
		).toEqual([
			{ timeSeconds: 10 },
			{ timeSeconds: 11 },
			{ timeSeconds: 12 },
			{ timeSeconds: 13 },
			{ timeSeconds: 14 },
		]);
	});

	test("inspectVideoRange returns contact sheet metadata, waveform, and silence ranges", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-inspect-range-"));
		const mediaPath = join(directory, "source.mp4");
		const outputDirectory = join(directory, "inspect");
		await mkdir(outputDirectory, { recursive: true });
		await writeFile(mediaPath, "video");

		try {
			const result = await inspectVideoRange({
				mediaAsset: {
					id: "media-1",
					name: "source.mp4",
					type: "video",
					durationSeconds: 12,
					path: mediaPath,
				},
				startSeconds: 1,
				endSeconds: 5,
				frameCount: 4,
				outputDirectory,
				readAudioSamples: async () => ({
					hasAudio: true,
					samples: new Float32Array([
						1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
						0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
						1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
						1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
					]),
					sampleRate: 10,
				}),
				renderContactSheet: async ({ outputPath }) => {
					await writeFile(outputPath, "png");
					return { width: 1280, height: 360 };
				},
			});

			expect(result).toMatchObject({
				mediaId: "media-1",
				sourceRange: {
					startSeconds: 1,
					endSeconds: 5,
					durationSeconds: 4,
				},
				artifact: {
					kind: "video_range_contact_sheet",
					mimeType: "image/png",
					width: 1280,
					height: 360,
				},
				frames: [
					{ timeSeconds: 1 },
					{ timeSeconds: 2.333 },
					{ timeSeconds: 3.667 },
					{ timeSeconds: 5 },
				],
				audio: {
					hasAudio: true,
					silenceRanges: [
						{ startSeconds: 2, endSeconds: 3, durationSeconds: 1 },
					],
				},
				warnings: [],
			});
			expect(result.audio.waveformSamples).toHaveLength(100);
			expect(await stat(result.artifact.path)).toMatchObject({ size: 3 });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("inspectVideoRange fails fast for invalid inputs before rendering", async () => {
		const directory = await mkdtemp(join(tmpdir(), "codecut-inspect-range-"));
		const mediaPath = join(directory, "source.mp4");
		await writeFile(mediaPath, "video");
		let renderCount = 0;

		try {
			await expect(
				inspectVideoRange({
					mediaAsset: {
						id: "media-1",
						name: "source.mp4",
						type: "video",
						durationSeconds: 12,
						path: mediaPath,
					},
					startSeconds: 5,
					endSeconds: 5,
					outputDirectory: directory,
					renderContactSheet: async () => {
						renderCount += 1;
						return { width: 1, height: 1 };
					},
				}),
			).rejects.toThrow("inspect_video_range endSeconds must be greater than startSeconds.");
			expect(renderCount).toBe(0);

			await expect(
				inspectVideoRange({
					mediaAsset: {
						id: "media-1",
						name: "source.mp4",
						type: "audio",
						durationSeconds: 12,
						path: mediaPath,
					},
					startSeconds: 1,
					endSeconds: 2,
					outputDirectory: directory,
				}),
			).rejects.toThrow("inspect_video_range requires video media.");

			await expect(
				inspectVideoRange({
					mediaAsset: {
						id: "media-1",
						name: "source.mp4",
						type: "video",
						durationSeconds: 12,
						path: mediaPath,
					},
					startSeconds: -1,
					endSeconds: 2,
					outputDirectory: directory,
				}),
			).rejects.toThrow(
				"inspect_video_range startSeconds must be a finite non-negative number.",
			);

			await expect(
				inspectVideoRange({
					mediaAsset: {
						id: "media-1",
						name: "source.mp4",
						type: "video",
						durationSeconds: 12,
						path: mediaPath,
					},
					startSeconds: 1,
					endSeconds: 13,
					outputDirectory: directory,
				}),
			).rejects.toThrow(
				"inspect_video_range endSeconds exceeds media duration.",
			);

			await expect(
				inspectVideoRange({
					mediaAsset: {
						id: "media-1",
						name: "source.mp4",
						type: "video",
						durationSeconds: 12,
					},
					startSeconds: 1,
					endSeconds: 2,
					outputDirectory: directory,
				}),
			).rejects.toThrow("inspect_video_range media path is required.");

			await expect(
				inspectVideoRange({
					mediaAsset: {
						id: "media-1",
						name: "source.mp4",
						type: "video",
						durationSeconds: 12,
						path: mediaPath,
					},
					startSeconds: 1,
					endSeconds: 2,
					frameCount: 17,
					outputDirectory: directory,
				}),
			).rejects.toThrow("inspect_video_range frameCount must be an integer from 1 to 16.");

			await expect(
				inspectVideoRange({
					mediaAsset: {
						id: "media-1",
						name: "source.mp4",
						type: "video",
						durationSeconds: 12,
						path: join(directory, "missing.mp4"),
					},
					startSeconds: 1,
					endSeconds: 2,
					outputDirectory: directory,
				}),
			).rejects.toThrow("inspect_video_range media file was not found.");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("waveform and silence helpers normalize audio evidence", () => {
		const samples = new Float32Array([
			1, 1, 1, 1, 1,
			0, 0, 0, 0, 0,
			0, 0, 0, 0, 0,
			1, 1, 1, 1, 1,
		]);

		expect(
			buildWaveformSamples({
				samples,
				bucketCount: 4,
			}),
		).toEqual([1, 0, 0, 1]);
		expect(
			detectSilenceRanges({
				samples,
				sampleRate: 5,
				sourceStartSeconds: 10,
			}),
		).toEqual([{ startSeconds: 11, endSeconds: 13, durationSeconds: 2 }]);
	});
});
