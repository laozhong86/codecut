import { describe, expect, test } from "bun:test";
import { runPersonSegmentationJob } from "../person-segmentation-job";

describe("runPersonSegmentationJob", () => {
	test("segments frames in timestamp order and encodes alpha output", async () => {
		const calls: number[] = [];
		const result = await runPersonSegmentationJob({
			frames: [
				{ timestampSec: 0, image: "frame-0" },
				{ timestampSec: 0.5, image: "frame-1" },
			],
			width: 1,
			height: 1,
			fps: 2,
			segmentFrame: async ({ timestampMs }) => {
				calls.push(timestampMs);
				return {
					alpha: new Uint8ClampedArray([255]),
					confidence: 0.8,
				};
			},
			encodeAlphaVideo: async ({ frames, width, height, fps }) => ({
				file: new File([String(frames.length)], "mask.webm", {
					type: "video/webm",
				}),
				width,
				height,
				fps,
				duration: frames.length / fps,
			}),
		});

		expect(calls).toEqual([0, 500]);
		expect(result).toMatchObject({
			file: expect.any(File),
			width: 1,
			height: 1,
			fps: 2,
			duration: 1,
			confidence: 0.8,
		});
	});

	test("rejects empty frame input", async () => {
		await expect(
			runPersonSegmentationJob({
				frames: [],
				width: 1920,
				height: 1080,
				fps: 30,
				segmentFrame: async () => ({
					alpha: new Uint8ClampedArray([255]),
					confidence: 0.8,
				}),
				encodeAlphaVideo: async () => {
					throw new Error("should not encode");
				},
			}),
		).rejects.toThrow("Person segmentation frames are required.");
	});

	test("rejects non-increasing frame timestamps", async () => {
		await expect(
			runPersonSegmentationJob({
				frames: [
					{ timestampSec: 0.5, image: "frame-0" },
					{ timestampSec: 0.5, image: "frame-1" },
				],
				width: 1920,
				height: 1080,
				fps: 2,
				segmentFrame: async () => ({
					alpha: new Uint8ClampedArray([255]),
					confidence: 0.8,
				}),
				encodeAlphaVideo: async () => {
					throw new Error("should not encode");
				},
			}),
		).rejects.toThrow(
			"Person segmentation frame timestamps must be strictly increasing.",
		);
	});

	test("rejects alpha frames that do not match the target dimensions", async () => {
		await expect(
			runPersonSegmentationJob({
				frames: [{ timestampSec: 0, image: "frame-0" }],
				width: 2,
				height: 2,
				fps: 1,
				segmentFrame: async () => ({
					alpha: new Uint8ClampedArray([255]),
					confidence: 0.8,
				}),
				encodeAlphaVideo: async () => {
					throw new Error("should not encode");
				},
			}),
		).rejects.toThrow(
			"Person segmentation alpha frame length must match width * height.",
		);
	});
});
