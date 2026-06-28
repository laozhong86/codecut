import { describe, expect, test } from "bun:test";
import { buildPostCutCaptionEntries } from "../caption-chunking";

describe("buildPostCutCaptionEntries", () => {
	test("prefers Chinese sentence punctuation before hard character splitting", () => {
		const captions = buildPostCutCaptionEntries({
			text: "先讲。然后展示关键证据",
			startTime: 0,
			endTime: 4,
			captionStyle: {
				preset: "talking-head-pop",
				position: "lower-safe",
				size: "medium",
			},
			aspectRatio: "9:16",
			canvasSize: { width: 1080, height: 1920 },
		});

		expect(captions.map((caption) => caption.text)).toEqual([
			"先讲",
			"然后展示关键证据",
		]);
	});

	test("prefers English clause breaks without splitting abbreviations or decimals", () => {
		const captions = buildPostCutCaptionEntries({
			text: "U.S. sales hit $2.34, then orders doubled.",
			startTime: 0,
			endTime: 8,
			captionStyle: {
				preset: "talking-head-pop",
				position: "lower-safe",
				size: "medium",
			},
			aspectRatio: "9:16",
			canvasSize: { width: 1080, height: 1920 },
		});

		expect(captions.map((caption) => caption.text)).toEqual([
			"U.S. sales hit $2.34",
			"then orders doubled",
		]);
	});

	test("does not split common English abbreviations as sentence endings", () => {
		const captions = buildPostCutCaptionEntries({
			text: "Dr. Lee used e.g. product evidence, then closed.",
			startTime: 0,
			endTime: 8,
			captionStyle: {
				preset: "talking-head-pop",
				position: "lower-safe",
				size: "medium",
			},
			aspectRatio: "9:16",
			canvasSize: { width: 1080, height: 1920 },
		});

		expect(captions.map((caption) => caption.text)).toEqual([
			"Dr. Lee used e.g. product evidence",
			"then closed",
		]);
	});

	test("cleans display punctuation while preserving real-estate numbers and tone marks", () => {
		const captions = buildPostCutCaptionEntries({
			text: "建面117.55平，套三双卫！约来看一哈？预算1,000万以内。",
			startTime: 0,
			endTime: 8,
			captionStyle: {
				preset: "talking-head-pop",
				position: "lower-safe",
				size: "medium",
			},
			aspectRatio: "9:16",
			canvasSize: { width: 1080, height: 1920 },
		});

		expect(captions.map((caption) => caption.text)).toEqual([
			"建面117.55平",
			"套三双卫！",
			"约来看一哈？",
			"预算1,000万以内",
		]);
	});

	test("splits Chinese post-cut captions before renderer wrapping creates orphan lines", () => {
		const captions = buildPostCutCaptionEntries({
			text: "和平台没有一丁点关系",
			startTime: 10,
			endTime: 12,
			captionStyle: {
				preset: "talking-head-pop",
				position: "lower-safe",
				size: "medium",
			},
			aspectRatio: "9:16",
			canvasSize: { width: 1080, height: 1920 },
		});

		expect(captions.map((caption) => caption.text)).toEqual([
			"和平台没有",
			"一丁点关系",
		]);
		const firstCaption = captions.at(0);
		const lastCaption = captions.at(-1);
		if (!firstCaption || !lastCaption) {
			throw new Error("Expected at least one generated caption.");
		}
		expect(firstCaption.startTime).toBe(10);
		expect(lastCaption.startTime).toBeGreaterThan(10);
		expect(lastCaption.startTime + lastCaption.duration).toBe(12);
		for (const caption of captions) {
			expect(Array.from(caption.text).length).toBeLessThanOrEqual(8);
		}
	});

	test("prefers Chinese word boundaries over balanced character splits", () => {
		const captions = buildPostCutCaptionEntries({
			text: "如果你和公司坐在一张桌子上",
			startTime: 0,
			endTime: 2,
		});

		expect(captions.map((caption) => caption.text)).toEqual([
			"如果你和公司",
			"坐在一张桌子上",
		]);
	});
});
