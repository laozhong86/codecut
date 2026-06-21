import { describe, expect, test } from "bun:test";
import { projectTranscriptSegmentsToEditedCaptions } from "../caption-projection";
import type { EditPlanClip } from "../schema";

const clips: EditPlanClip[] = [
	{
		id: "clip-1",
		sourceStart: 10,
		sourceEnd: 15,
		timelineStart: 0,
		reason: "Opening claim.",
	},
	{
		id: "clip-2",
		sourceStart: 30,
		sourceEnd: 35,
		timelineStart: 5,
		reason: "Supporting proof.",
	},
];

describe("projectTranscriptSegmentsToEditedCaptions", () => {
	test("maps source transcript segment timestamps into edited timeline timestamps", () => {
		const captions = projectTranscriptSegmentsToEditedCaptions({
			clips,
			segments: [
				{ text: "Dropped setup", start: 2, end: 4 },
				{ text: "First kept sentence", start: 11, end: 12.5 },
				{ text: "Second kept sentence", start: 32, end: 34 },
			],
		});

		expect(captions).toEqual([
			{
				text: "First kept sentence",
				startTime: 1,
				duration: 1.5,
			},
			{
				text: "Second kept sentence",
				startTime: 7,
				duration: 2,
			},
		]);
	});

	test("fails fast when a transcript segment is only partially covered by a clip", () => {
		expect(() =>
			projectTranscriptSegmentsToEditedCaptions({
				clips,
				segments: [{ text: "Cut mid sentence", start: 14.5, end: 15.5 }],
			}),
		).toThrow(
			"Transcript segment overlaps an edited clip boundary; regenerate captions from edited audio or choose transcript-aligned cuts.",
		);
	});
});
