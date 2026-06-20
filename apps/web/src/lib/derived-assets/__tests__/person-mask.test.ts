import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import { generatePersonMask } from "../person-mask";

function mediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return {
		id: "video-1",
		name: "Talking head.mp4",
		type: "video",
		duration: 10,
		width: 1920,
		height: 1080,
		file: new File(["video"], "talking-head.mp4", { type: "video/mp4" }),
		...overrides,
	};
}

describe("generatePersonMask", () => {
	test("rejects non-video source media", async () => {
		await expect(
			generatePersonMask({
				projectId: "project-1",
				sourceMediaId: "audio-1",
				mediaAssets: [mediaAsset({ id: "audio-1", type: "audio" })],
				createAlphaMask: async () => {
					throw new Error("should not run");
				},
			}),
		).rejects.toThrow("Person mask source media must be video.");
	});

	test("rejects low confidence masks", async () => {
		await expect(
			generatePersonMask({
				projectId: "project-1",
				sourceMediaId: "video-1",
				mediaAssets: [mediaAsset()],
				createAlphaMask: async () => ({
					alphaMediaId: "alpha-1",
					duration: 10,
					width: 1920,
					height: 1080,
					fps: 30,
					confidence: 0.59,
				}),
			}),
		).rejects.toThrow("Person mask confidence is below 0.6.");
	});

	test("rejects alpha duration mismatch", async () => {
		await expect(
			generatePersonMask({
				projectId: "project-1",
				sourceMediaId: "video-1",
				mediaAssets: [mediaAsset()],
				createAlphaMask: async () => ({
					alphaMediaId: "alpha-1",
					duration: 9.8,
					width: 1920,
					height: 1080,
					fps: 30,
					confidence: 0.8,
				}),
			}),
		).rejects.toThrow("Person mask duration does not match source media.");
	});

	test("returns a validated derived person-mask asset", async () => {
		const result = await generatePersonMask({
			projectId: "project-1",
			sourceMediaId: "video-1",
			mediaAssets: [mediaAsset()],
			now: () => new Date("2026-06-21T00:00:00.000Z"),
			createAlphaMask: async () => ({
				alphaMediaId: "alpha-1",
				duration: 10,
				width: 1920,
				height: 1080,
				fps: 30,
				confidence: 0.8,
			}),
		});

		expect(result).toMatchObject({
			type: "person-mask",
			sourceMediaId: "video-1",
			alphaMediaId: "alpha-1",
			duration: 10,
			width: 1920,
			height: 1080,
			fps: 30,
			confidence: 0.8,
			createdAt: "2026-06-21T00:00:00.000Z",
		});
		expect(result.id).toMatch(/^person-mask-/);
	});
});
