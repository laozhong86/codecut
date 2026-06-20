import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import type { DerivedAsset } from "@/types/project";
import type { TextTrack, VideoTrack } from "@/types/timeline";
import {
	createHumanPipEffect,
	createTextBackgroundEffect,
} from "../masked-effects";

function videoAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return {
		id: "video-1",
		name: "Talking head.mp4",
		type: "video",
		duration: 10,
		width: 1920,
		height: 1080,
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

function idGenerator() {
	let index = 0;
	return () => {
		index += 1;
		return `id-${index}`;
	};
}

describe("createTextBackgroundEffect", () => {
	test("creates source video, text, and masked foreground layers", () => {
		const result = createTextBackgroundEffect({
			sourceMediaId: "video-1",
			derivedAssetId: "mask-1",
			content: "KEEP THE CORE",
			startTime: 2,
			duration: 4,
			mediaAssets: [videoAsset(), videoAsset({ id: "alpha-1" })],
			derivedAssets: [personMask()],
			generateId: idGenerator(),
		});

		expect(result.tracks).toHaveLength(3);

		const foregroundTrack = result.tracks[0] as VideoTrack;
		const textTrack = result.tracks[1] as TextTrack;
		const bottomTrack = result.tracks[2] as VideoTrack;

		expect(bottomTrack.isMain).toBe(true);
		expect(bottomTrack.elements[0]).toMatchObject({
			type: "video",
			mediaId: "video-1",
			startTime: 2,
			duration: 4,
			trimStart: 2,
			trimEnd: 6,
		});
		expect(textTrack.elements[0]).toMatchObject({
			type: "text",
			content: "KEEP THE CORE",
			startTime: 2,
			duration: 4,
		});
		expect(foregroundTrack.elements[0]).toMatchObject({
			type: "video",
			mediaId: "video-1",
			startTime: 2,
			duration: 4,
			trimStart: 2,
			trimEnd: 6,
			mask: {
				type: "person-mask",
				derivedAssetId: "mask-1",
			},
		});
	});

	test("rejects a person mask generated from another source", () => {
		expect(() =>
			createTextBackgroundEffect({
				sourceMediaId: "video-1",
				derivedAssetId: "mask-1",
				content: "KEEP THE CORE",
				startTime: 0,
				duration: 4,
				mediaAssets: [videoAsset(), videoAsset({ id: "alpha-1" })],
				derivedAssets: [personMask({ sourceMediaId: "other-video" })],
			}),
		).toThrow("Person mask does not belong to the source media.");
	});

	test("rejects time ranges outside the source video", () => {
		expect(() =>
			createTextBackgroundEffect({
				sourceMediaId: "video-1",
				derivedAssetId: "mask-1",
				content: "KEEP THE CORE",
				startTime: 8,
				duration: 4,
				mediaAssets: [videoAsset(), videoAsset({ id: "alpha-1" })],
				derivedAssets: [personMask()],
			}),
		).toThrow("Effect time range exceeds source media duration.");
	});
});

describe("createHumanPipEffect", () => {
	test("creates muted background and masked foreground picture-in-picture layers", () => {
		const result = createHumanPipEffect({
			foregroundMediaId: "video-1",
			backgroundMediaId: "background-1",
			derivedAssetId: "mask-1",
			placement: "right_down",
			scale: 0.35,
			startTime: 1,
			duration: 5,
			mediaAssets: [
				videoAsset(),
				videoAsset({ id: "alpha-1" }),
				videoAsset({
					id: "background-1",
					name: "Background.mp4",
					width: 1080,
					height: 1920,
				}),
			],
			derivedAssets: [personMask()],
			generateId: idGenerator(),
		});

		expect(result.tracks).toHaveLength(2);

		const foregroundTrack = result.tracks[0] as VideoTrack;
		const backgroundTrack = result.tracks[1] as VideoTrack;
		const foregroundElement = foregroundTrack.elements[0];

		expect(backgroundTrack.isMain).toBe(true);
		expect(backgroundTrack.elements[0]).toMatchObject({
			type: "video",
			mediaId: "background-1",
			startTime: 1,
			duration: 5,
			trimStart: 1,
			trimEnd: 6,
			muted: true,
		});
		expect(foregroundElement).toMatchObject({
			type: "video",
			mediaId: "video-1",
			startTime: 1,
			duration: 5,
			trimStart: 1,
			trimEnd: 6,
			muted: false,
			transform: {
				scale: 0.35,
				position: { x: 264.6, y: 537.6 },
				rotate: 0,
			},
			mask: {
				type: "person-mask",
				derivedAssetId: "mask-1",
			},
		});
	});

	test("rejects a missing background media asset", () => {
		expect(() =>
			createHumanPipEffect({
				foregroundMediaId: "video-1",
				backgroundMediaId: "missing-background",
				derivedAssetId: "mask-1",
				placement: "right_down",
				scale: 0.35,
				startTime: 0,
				duration: 5,
				mediaAssets: [videoAsset(), videoAsset({ id: "alpha-1" })],
				derivedAssets: [personMask()],
			}),
		).toThrow("Background media asset was not found.");
	});

	test("rejects unsupported scale values", () => {
		expect(() =>
			createHumanPipEffect({
				foregroundMediaId: "video-1",
				backgroundMediaId: "background-1",
				derivedAssetId: "mask-1",
				placement: "right_down",
				scale: 1.2,
				startTime: 0,
				duration: 5,
				mediaAssets: [
					videoAsset(),
					videoAsset({ id: "alpha-1" }),
					videoAsset({ id: "background-1" }),
				],
				derivedAssets: [personMask()],
			}),
		).toThrow("Human PIP scale must be between 0.1 and 1.");
	});

	test("rejects time ranges outside the background video", () => {
		expect(() =>
			createHumanPipEffect({
				foregroundMediaId: "video-1",
				backgroundMediaId: "background-1",
				derivedAssetId: "mask-1",
				placement: "right_down",
				scale: 0.35,
				startTime: 8,
				duration: 5,
				mediaAssets: [
					videoAsset(),
					videoAsset({ id: "alpha-1" }),
					videoAsset({ id: "background-1", duration: 10 }),
				],
				derivedAssets: [personMask()],
			}),
		).toThrow("Effect time range exceeds source media duration.");
	});
});
