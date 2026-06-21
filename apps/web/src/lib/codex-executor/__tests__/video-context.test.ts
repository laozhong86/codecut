import { describe, expect, test } from "bun:test";
import {
	buildAnalysisChunks,
	buildVideoContextWithTranscriber,
	guessVideoContextAssetType,
	offsetTranscriptSegments,
	shouldSuggestTrimFillers,
} from "../video-context";
import { transcribeMediaRangeWithNodeRuntime } from "../transcription";

describe("video context", () => {
	test("exports a range-aware transcription runtime", () => {
		expect(typeof transcribeMediaRangeWithNodeRuntime).toBe("function");
	});

	test("buildAnalysisChunks splits long media into 300 second chunks", () => {
		expect(buildAnalysisChunks({ durationSeconds: 725 })).toEqual([
			{ index: 1, start: 0, end: 300 },
			{ index: 2, start: 300, end: 600 },
			{ index: 3, start: 600, end: 725 },
		]);
	});

	test("buildAnalysisChunks keeps short media as one chunk", () => {
		expect(buildAnalysisChunks({ durationSeconds: 120 })).toEqual([
			{ index: 1, start: 0, end: 120 },
		]);
	});

	test("offsetTranscriptSegments remaps chunk segments into source time", () => {
		expect(
			offsetTranscriptSegments({
				offsetSeconds: 300,
				segments: [{ start: 1.25, end: 4.5, text: "second chunk" }],
			}),
		).toEqual([{ start: 301.25, end: 304.5, text: "second chunk" }]);
	});

	test("offsetTranscriptSegments keeps 3 decimal places after offset rounding", () => {
		expect(
			offsetTranscriptSegments({
				offsetSeconds: 300,
				segments: [{ start: 1.2346, end: 4.5674, text: "rounded chunk" }],
			}),
		).toEqual([{ start: 301.235, end: 304.567, text: "rounded chunk" }]);
	});

	test("guessVideoContextAssetType flags long multi-segment text as oral", () => {
		expect(
			guessVideoContextAssetType({
				text: "This is a spoken explanation with enough words to clearly read as transcript content across multiple segments.",
				segmentCount: 3,
			}),
		).toBe("oral_candidate");
		expect(
			guessVideoContextAssetType({
				text: "Short text",
				segmentCount: 1,
			}),
		).toBe("mixed_or_unknown");
	});

	test("shouldSuggestTrimFillers requires at least two filler markers", () => {
		expect(shouldSuggestTrimFillers("嗯，我们然后看这里")).toBe(true);
		expect(shouldSuggestTrimFillers("然后进入下一步")).toBe(false);
		expect(shouldSuggestTrimFillers("然后然后")).toBe(false);
	});

	test("buildVideoContextWithTranscriber merges chunk transcripts into one context", async () => {
		const videoContext = await buildVideoContextWithTranscriber({
			mediaAsset: {
				id: "media-1",
				name: "source.mp4",
				type: "video",
				durationSeconds: 725,
				width: 1920,
				height: 1080,
			},
			probeAudio: async () => ({ hasAudio: true }),
			transcribeRange: async ({ startSeconds }) => {
				if (startSeconds === 0) {
					return {
						text: "First chunk spoken transcript with enough words for classification.",
						language: "zh",
						modelId: "whisper-large-v3-turbo",
						segments: [{ start: 1, end: 4, text: "first chunk" }],
					};
				}
				if (startSeconds === 300) {
					return {
						text: "Second chunk spoken transcript with enough words for classification.",
						language: "zh",
						modelId: "whisper-large-v3-turbo",
						segments: [{ start: 1, end: 4, text: "second chunk" }],
					};
				}
				return {
					text: "Third chunk spoken transcript with enough words for classification.",
					language: "zh",
					modelId: "whisper-large-v3-turbo",
					segments: [{ start: 1, end: 4, text: "third chunk" }],
				};
			},
		});

		expect(videoContext).toMatchObject({
			version: 1,
			mediaId: "media-1",
			name: "source.mp4",
			qualityLevel: "L2_transcript",
			metadata: {
				durationSeconds: 725,
				width: 1920,
				height: 1080,
				hasAudio: true,
			},
			segments: [
				{ start: 1, end: 4, text: "first chunk" },
				{ start: 301, end: 304, text: "second chunk" },
				{ start: 601, end: 604, text: "third chunk" },
			],
			analysisChunks: [
				{ index: 1, start: 0, end: 300, status: "succeeded", segmentCount: 1 },
				{ index: 2, start: 300, end: 600, status: "succeeded", segmentCount: 1 },
				{ index: 3, start: 600, end: 725, status: "succeeded", segmentCount: 1 },
			],
		});
		expect(videoContext.warnings).toContain("visual analysis not run");
		expect(videoContext.warnings).toContain("OCR skipped");
		expect(videoContext.warnings).toContain("scene detection not run");
	});

	test("buildVideoContextWithTranscriber fails fast on chunk transcription errors", async () => {
		await expect(
			buildVideoContextWithTranscriber({
				mediaAsset: {
					id: "media-1",
					name: "source.mp4",
					type: "video",
					durationSeconds: 725,
				},
				probeAudio: async () => ({ hasAudio: true }),
				transcribeRange: async ({ startSeconds }) => {
					if (startSeconds === 300) {
						throw new Error("ASR failed");
					}
					return {
						text: "ok",
						language: "zh",
						modelId: "whisper-large-v3-turbo",
						segments: [{ start: 1, end: 2, text: "ok" }],
					};
				},
			}),
		).rejects.toThrow(
			/^VideoContext chunk 2 failed for source range 300\.00s-600\.00s: ASR failed$/,
		);
	});
});
