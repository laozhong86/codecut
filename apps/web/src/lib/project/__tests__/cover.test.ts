import { describe, expect, test } from "bun:test";
import type { ProjectCover } from "@/types/project";
import { buildProjectCoverFromImageAsset } from "../cover";

const existingCover: ProjectCover = {
	mediaId: "cover-1",
	source: "generated",
	title: "Old title",
	prompt: "竖版 9:16 短视频封面，标题设计是画面核心",
	stylePreset: "viral_chinese_title_cover",
	width: 1080,
	height: 1920,
	updatedAt: "2026-06-21T00:00:00.000Z",
};

describe("buildProjectCoverFromImageAsset", () => {
	test("preserves generation metadata when updating the same cover asset", () => {
		const cover = buildProjectCoverFromImageAsset({
			asset: {
				id: "cover-1",
				type: "image",
				width: 1080,
				height: 1920,
			},
			existingCover,
			title: "New title",
			updatedAt: "2026-06-22T00:00:00.000Z",
		});

		expect(cover).toEqual({
			...existingCover,
			title: "New title",
			updatedAt: "2026-06-22T00:00:00.000Z",
		});
	});

	test("does not copy stale prompt metadata to a different image asset", () => {
		const cover = buildProjectCoverFromImageAsset({
			asset: {
				id: "cover-2",
				type: "image",
				width: 1080,
				height: 1920,
			},
			existingCover,
			title: "Different cover",
			updatedAt: "2026-06-22T00:00:00.000Z",
		});

		expect(cover).toEqual({
			mediaId: "cover-2",
			source: "media_asset",
			title: "Different cover",
			width: 1080,
			height: 1920,
			updatedAt: "2026-06-22T00:00:00.000Z",
		});
	});

	test("marks extracted video frames as timeline frame covers", () => {
		const cover = buildProjectCoverFromImageAsset({
			asset: {
				id: "frame-cover-1",
				type: "image",
				width: 720,
				height: 1280,
			},
			source: "timeline_frame",
			title: "Selected frame",
			updatedAt: "2026-06-22T00:00:00.000Z",
		});

		expect(cover).toEqual({
			mediaId: "frame-cover-1",
			source: "timeline_frame",
			title: "Selected frame",
			width: 720,
			height: 1280,
			updatedAt: "2026-06-22T00:00:00.000Z",
		});
	});

	test("rejects non-image assets before creating a project cover", () => {
		expect(() =>
			buildProjectCoverFromImageAsset({
				asset: {
					id: "video-1",
					type: "video",
					width: 1920,
					height: 1080,
				},
				updatedAt: "2026-06-22T00:00:00.000Z",
			}),
		).toThrow("Project cover requires an image asset with dimensions.");
	});
});
