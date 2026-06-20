import { describe, expect, test } from "bun:test";
import type { DerivedAsset } from "@/types/project";
import { getDerivedAssetCleanupForMediaRemoval } from "../cleanup";

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

describe("getDerivedAssetCleanupForMediaRemoval", () => {
	test("removes derived registry entries and alpha media when source media is removed", () => {
		const result = getDerivedAssetCleanupForMediaRemoval({
			removedMediaId: "video-1",
			derivedAssets: [
				personMask(),
				personMask({
					id: "mask-2",
					sourceMediaId: "video-2",
					alphaMediaId: "alpha-2",
				}),
			],
		});

		expect(result).toEqual({
			derivedAssetIds: ["mask-1"],
			mediaAssetIds: ["video-1", "alpha-1"],
		});
	});

	test("removes derived registry entries when alpha media is removed", () => {
		const result = getDerivedAssetCleanupForMediaRemoval({
			removedMediaId: "alpha-1",
			derivedAssets: [personMask()],
		});

		expect(result).toEqual({
			derivedAssetIds: ["mask-1"],
			mediaAssetIds: ["alpha-1"],
		});
	});
});
