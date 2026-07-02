import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import type { TimelineTrack } from "@/types/timeline";
import { applyCompositeLayoutPlanToEditor } from "../apply";

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return {
		id: "presenter-video",
		name: "Presenter",
		type: "video",
		file: new File(["video"], "presenter.mp4", { type: "video/mp4" }),
		url: "blob:presenter",
		width: 1080,
		height: 1920,
		duration: 10,
		...overrides,
	};
}

function editor({ mediaAssets }: { mediaAssets: MediaAsset[] }) {
	let tracks: TimelineTrack[] = [];
	return {
		media: {
			getAssets: () => mediaAssets,
		},
		timeline: {
			getTracks: () => tracks,
			updateTracks: (nextTracks: TimelineTrack[]) => {
				tracks = nextTracks;
			},
		},
	};
}

function plan() {
	return {
		version: 1,
		projectId: "project-1",
		target: { aspectRatio: "9:16", durationSec: 10 },
		placement: "top",
		presenter: {
			mediaId: "presenter-video",
			sourceStart: 0,
			sourceEnd: 10,
		},
		networkMaterialBeats: [
			{
				id: "network-1",
				mediaId: "network-video",
				provider: "pexels",
				searchTerm: "startup office",
				sourceUrl: "https://www.pexels.com/video/123/",
				license: {
					label: "Pexels License",
					url: "https://www.pexels.com/license/",
				},
				sourceStart: 0,
				sourceEnd: 5,
				timelineStart: 0,
				cropMode: "cover-slot",
			},
		],
		rationale: "Place supporting B-roll above the presenter.",
	};
}

describe("applyCompositeLayoutPlanToEditor", () => {
	test("creates readable split-screen timeline tracks with layout slots", () => {
		const fakeEditor = editor({
			mediaAssets: [
				asset(),
				asset({
					id: "network-video",
					name: "Network B-roll",
					width: 1920,
					height: 1080,
				}),
			],
		});

		const result = applyCompositeLayoutPlanToEditor({
			editor: fakeEditor,
			plan: plan(),
		});

		expect(result).toEqual({
			success: true,
			summary: {
				networkMaterialElementCount: 1,
				presenterElementCount: 1,
				totalDuration: 10,
				placement: "top",
				rationale: "Place supporting B-roll above the presenter.",
			},
		});
		const tracks = fakeEditor.timeline.getTracks();
		expect(tracks).toHaveLength(2);
		expect(tracks[0]?.elements[0]).toMatchObject({
			mediaId: "network-video",
			layoutSlot: {
				x: 0,
				y: 0,
				width: 1,
				height: 0.45,
				cropMode: "cover-slot",
			},
			muted: true,
		});
		expect(tracks[1]?.elements[0]).toMatchObject({
			mediaId: "presenter-video",
			layoutSlot: {
				x: 0,
				y: 0.45,
				width: 1,
				height: 0.55,
				cropMode: "cover-slot",
			},
			muted: false,
		});
	});

	test("fails when a visual asset has no dimensions", () => {
		const fakeEditor = editor({
			mediaAssets: [
				asset({ width: undefined }),
				asset({
					id: "network-video",
					name: "Network B-roll",
					width: 1920,
					height: 1080,
				}),
			],
		});

		const result = applyCompositeLayoutPlanToEditor({
			editor: fakeEditor,
			plan: plan(),
		});

		expect(result).toEqual({
			success: false,
			message:
				"CompositeLayoutPlan media asset presenter-video requires width and height.",
		});
		expect(fakeEditor.timeline.getTracks()).toEqual([]);
	});
});
