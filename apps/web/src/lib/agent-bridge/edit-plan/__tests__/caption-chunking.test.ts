import { describe, expect, test } from "bun:test";
import { buildPostCutCaptionEntries } from "../caption-chunking";

describe("buildPostCutCaptionEntries", () => {
	test("splits Chinese post-cut captions before renderer wrapping creates orphan lines", () => {
		const captions = buildPostCutCaptionEntries({
			text: "和平台没有一丁点关系",
			startTime: 10,
			endTime: 12,
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
});
