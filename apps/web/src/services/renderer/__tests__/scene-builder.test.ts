import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import type { DerivedAsset } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import { buildScene } from "../scene-builder";

function videoAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return {
		id: "video-1",
		name: "Talking head.mp4",
		type: "video",
		duration: 10,
		width: 1920,
		height: 1080,
		fps: 30,
		file: new File(["video"], "talking-head.mp4", { type: "video/mp4" }),
		url: "blob:video-1",
		...overrides,
	};
}

function personMask(overrides: Partial<DerivedAsset> = {}): DerivedAsset {
	return {
		id: "mask-1",
		type: "person-mask",
		sourceMediaId: "video-1",
		alphaMediaId: "alpha-1",
		duration: 10,
		width: 1920,
		height: 1080,
		fps: 30,
		confidence: 0.8,
		createdAt: "2026-06-21T00:00:00.000Z",
		...overrides,
	};
}

function videoTrack(): TimelineTrack {
	return {
		id: "track-1",
		name: "Video",
		type: "video",
		isMain: true,
		muted: false,
		hidden: false,
		elements: [
			{
				id: "element-1",
				type: "video",
				name: "Video",
				mediaId: "video-1",
				duration: 4,
				startTime: 0,
				trimStart: 0,
				trimEnd: 4,
				transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
				opacity: 1,
			},
		],
	};
}

function maskedVideoTrack(): TimelineTrack {
	return {
		id: "track-1",
		name: "Foreground",
		type: "video",
		isMain: false,
		muted: false,
		hidden: false,
		elements: [
			{
				id: "element-1",
				type: "video",
				name: "Masked foreground",
				mediaId: "video-1",
				duration: 4,
				startTime: 0,
				trimStart: 0,
				trimEnd: 4,
				transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
				opacity: 1,
				mask: {
					type: "person-mask",
					derivedAssetId: "mask-1",
				},
			},
		],
	};
}

describe("buildScene masked video", () => {
	test("builds visual nodes from executor media files without blob URLs", () => {
		const scene = buildScene({
			tracks: [maskedVideoTrack()],
			mediaAssets: [
				videoAsset({ url: undefined }),
				videoAsset({ id: "alpha-1", url: undefined }),
			],
			derivedAssets: [personMask()],
			duration: 4,
			canvasSize: { width: 1080, height: 1920 },
			background: { type: "color", color: "#000000" },
		});

		expect(scene.children.length).toBeGreaterThan(0);
	});

	test("rejects masked video when the derived asset is missing", () => {
		expect(() =>
			buildScene({
				tracks: [maskedVideoTrack()],
				mediaAssets: [videoAsset(), videoAsset({ id: "alpha-1" })],
				derivedAssets: [],
				duration: 4,
				canvasSize: { width: 1080, height: 1920 },
				background: { type: "color", color: "#000000" },
			}),
		).toThrow("Masked video derived asset was not found.");
	});

	test("rejects masked video when the alpha media is missing", () => {
		expect(() =>
			buildScene({
				tracks: [maskedVideoTrack()],
				mediaAssets: [videoAsset()],
				derivedAssets: [personMask()],
				duration: 4,
				canvasSize: { width: 1080, height: 1920 },
				background: { type: "color", color: "#000000" },
			}),
		).toThrow("Masked video alpha media asset was not found.");
	});

	test("rejects video when source dimensions are missing", () => {
		expect(() =>
			buildScene({
				tracks: [videoTrack()],
				mediaAssets: [videoAsset({ width: undefined })],
				derivedAssets: [],
				duration: 4,
				canvasSize: { width: 1080, height: 1920 },
				background: { type: "color", color: "#000000" },
			}),
		).toThrow("Timeline video source width is required for media asset video-1.");
	});

	test("rejects masked video when alpha frame rate is missing", () => {
		expect(() =>
			buildScene({
				tracks: [maskedVideoTrack()],
				mediaAssets: [
					videoAsset(),
					videoAsset({ id: "alpha-1", fps: undefined }),
				],
				derivedAssets: [personMask()],
				duration: 4,
				canvasSize: { width: 1080, height: 1920 },
				background: { type: "color", color: "#000000" },
			}),
		).toThrow(
			"Timeline masked video alpha source frame rate is required for media asset alpha-1.",
		);
	});
});
