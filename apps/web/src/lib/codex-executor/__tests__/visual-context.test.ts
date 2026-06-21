import { describe, expect, test } from "bun:test";
import {
	VISUAL_CONTEXT_FRAMES_PER_WINDOW,
	buildVisualContextWindows,
	buildVisualContextWithInspector,
	buildVisualPreflight,
	classifySourceOrientation,
} from "../visual-context";

const videoAsset = {
	id: "media-1",
	name: "source.mp4",
	type: "video",
	durationSeconds: 128.4,
	width: 1920,
	height: 1080,
	path: "/tmp/source.mp4",
};

describe("visual context", () => {
	test("splits media into fixed 60 second visual windows", () => {
		expect(buildVisualContextWindows({ durationSeconds: 128.4 })).toEqual([
			{ id: "window-1", index: 1, startSeconds: 0, endSeconds: 60 },
			{ id: "window-2", index: 2, startSeconds: 60, endSeconds: 120 },
			{ id: "window-3", index: 3, startSeconds: 120, endSeconds: 128.4 },
		]);
	});

	test("keeps short media as one visual window", () => {
		expect(buildVisualContextWindows({ durationSeconds: 12 })).toEqual([
			{ id: "window-1", index: 1, startSeconds: 0, endSeconds: 12 },
		]);
	});

	test("rejects invalid durations", () => {
		expect(() => buildVisualContextWindows({ durationSeconds: 0 })).toThrow(
			"VisualContext requires a positive duration.",
		);
	});

	test("classifies source orientation from dimensions", () => {
		expect(classifySourceOrientation({ width: 1920, height: 1080 })).toBe(
			"landscape",
		);
		expect(classifySourceOrientation({ width: 1080, height: 1920 })).toBe(
			"portrait",
		);
		expect(classifySourceOrientation({ width: 1000, height: 980 })).toBe(
			"square",
		);
	});

	test("builds conservative vertical reframe preflight for landscape to 9:16", () => {
		expect(
			buildVisualPreflight({
				width: 1920,
				height: 1080,
				targetAspectRatio: "9:16",
			}),
		).toEqual({
			requiresReframe: true,
			reframeRisk: "needs_review",
			recommendedReframeTemplate:
				"vertical_face_safe_crop_above_burned_captions",
			captionPolicy: "inspect_artifacts_before_lower_safe_captions",
			subjectSafeArea: "unverified",
			burnedCaptionRegion: "unverified",
		});
	});

	test("does not require reframe when source and target are close", () => {
		expect(
			buildVisualPreflight({
				width: 1080,
				height: 1920,
				targetAspectRatio: "9:16",
			}),
		).toEqual({
			requiresReframe: false,
			reframeRisk: "none",
			recommendedReframeTemplate: null,
			captionPolicy: "standard_caption_safe_area",
			subjectSafeArea: "unverified",
			burnedCaptionRegion: "unverified",
		});
	});

	test("builds VisualContext with inspection evidence for every window", async () => {
		const calls: Array<{
			startSeconds: number;
			endSeconds: number;
			frameCount: number;
		}> = [];

		const context = await buildVisualContextWithInspector({
			mediaAsset: videoAsset,
			targetAspectRatio: "9:16",
			outputDirectory: "/tmp/visual-context",
			inspectRange: async ({ startSeconds, endSeconds, frameCount }) => {
				calls.push({ startSeconds, endSeconds, frameCount });
				return {
					mediaId: "media-1",
					sourceRange: {
						startSeconds,
						endSeconds,
						durationSeconds: endSeconds - startSeconds,
					},
					artifact: {
						kind: "video_range_contact_sheet",
						path: `/tmp/visual-context/${startSeconds}-${endSeconds}.png`,
						mimeType: "image/png",
						width: 1936,
						height: 520,
					},
					frames: [{ timeSeconds: startSeconds }, { timeSeconds: endSeconds }],
					audio: {
						hasAudio: true,
						waveformSamples: [0.1, 0.5],
						silenceRanges: [],
					},
					warnings: [],
				};
			},
		});

		expect(calls).toEqual([
			{ startSeconds: 0, endSeconds: 60, frameCount: 6 },
			{ startSeconds: 60, endSeconds: 120, frameCount: 6 },
			{ startSeconds: 120, endSeconds: 128.4, frameCount: 6 },
		]);
		expect(context).toMatchObject({
			version: 1,
			mediaId: "media-1",
			name: "source.mp4",
			qualityLevel: "L3_visual_evidence",
			target: { aspectRatio: "9:16" },
			metadata: {
				durationSeconds: 128.4,
				width: 1920,
				height: 1080,
				sourceOrientation: "landscape",
			},
			analysisWindows: [
				{
					id: "window-1",
					index: 1,
					startSeconds: 0,
					endSeconds: 60,
					frameCount: VISUAL_CONTEXT_FRAMES_PER_WINDOW,
				},
				{
					id: "window-2",
					index: 2,
					startSeconds: 60,
					endSeconds: 120,
					frameCount: VISUAL_CONTEXT_FRAMES_PER_WINDOW,
				},
				{
					id: "window-3",
					index: 3,
					startSeconds: 120,
					endSeconds: 128.4,
					frameCount: VISUAL_CONTEXT_FRAMES_PER_WINDOW,
				},
			],
			warnings: [
				"OCR not run",
				"subject detection not run",
				"burned caption detection not run",
				"semantic scene detection not run",
			],
		});
	});

	test("fails with window index and source range when inspection fails", async () => {
		await expect(
			buildVisualContextWithInspector({
				mediaAsset: videoAsset,
				targetAspectRatio: "9:16",
				outputDirectory: "/tmp/visual-context",
				inspectRange: async ({ startSeconds }) => {
					if (startSeconds === 60) {
						throw new Error("ffmpeg failed");
					}
					return {
						mediaId: "media-1",
						sourceRange: {
							startSeconds,
							endSeconds: startSeconds + 60,
							durationSeconds: 60,
						},
						artifact: {
							kind: "video_range_contact_sheet",
							path: "/tmp/window.png",
							mimeType: "image/png",
							width: 1936,
							height: 520,
						},
						frames: [],
						audio: {
							hasAudio: true,
							waveformSamples: [],
							silenceRanges: [],
						},
						warnings: [],
					};
				},
			}),
		).rejects.toThrow(
			"VisualContext window 2 failed for source range 60.00s-120.00s: ffmpeg failed",
		);
	});
});
