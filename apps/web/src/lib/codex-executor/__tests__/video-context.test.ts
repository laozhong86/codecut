import { describe, expect, test } from "bun:test";
import {
	buildAnalysisChunks,
	buildVideoContextWithTranscriber,
	guessVideoContextAssetType,
	offsetTranscriptWords,
	offsetTranscriptSegments,
	shouldSuggestTrimFillers,
} from "../video-context";
import { transcribeMediaRangeWithNodeRuntime } from "../transcription";
import {
	cloneLocalSegmentAsrCapabilities,
	cloneLocalSegmentAsrQuality,
} from "@/lib/transcription/asr-provider-contract";

describe("video context", () => {
	test("exports a range-aware transcription runtime", () => {
		expect(typeof transcribeMediaRangeWithNodeRuntime).toBe("function");
	});

	test("transcribeMediaRangeWithNodeRuntime requires range at runtime", async () => {
		const missingRangeInput: unknown = {
			mediaAsset: {
				id: "media-1",
				name: "source.mp4",
				path: "/tmp/source.mp4",
			},
			language: "zh",
			modelId: "whisper-large-v3-turbo",
		};

		await expect(
			transcribeMediaRangeWithNodeRuntime(
				missingRangeInput as Parameters<
					typeof transcribeMediaRangeWithNodeRuntime
				>[0],
			),
		).rejects.toThrow("Transcription range is required.");
	});

	test("transcribeMediaRangeWithNodeRuntime rejects negative range starts", async () => {
		await expect(
			transcribeMediaRangeWithNodeRuntime({
				mediaAsset: {
					id: "media-1",
					name: "source.mp4",
					path: "/tmp/source.mp4",
				},
				language: "zh",
				modelId: "whisper-large-v3-turbo",
				range: { start: -1, end: 1 },
			}),
		).rejects.toThrow(
			"Transcription range start must be a finite non-negative number.",
		);
	});

	for (const invalidRange of [
		{
			name: "NaN start",
			range: { start: Number.NaN, end: 1 },
			expectedError:
				"Transcription range start must be a finite non-negative number.",
		},
		{
			name: "infinite end",
			range: { start: 0, end: Number.POSITIVE_INFINITY },
			expectedError: "Transcription range end must be a finite number.",
		},
	] as const) {
		test(`transcribeMediaRangeWithNodeRuntime rejects ${invalidRange.name}`, async () => {
			await expect(
				transcribeMediaRangeWithNodeRuntime({
					mediaAsset: {
						id: "media-1",
						name: "source.mp4",
						path: "/tmp/source.mp4",
					},
					language: "zh",
					modelId: "whisper-large-v3-turbo",
					range: invalidRange.range,
				}),
			).rejects.toThrow(invalidRange.expectedError);
		});
	}

	test("transcribeMediaRangeWithNodeRuntime rejects non-positive durations", async () => {
		await expect(
			transcribeMediaRangeWithNodeRuntime({
				mediaAsset: {
					id: "media-1",
					name: "source.mp4",
					path: "/tmp/source.mp4",
				},
				language: "zh",
				modelId: "whisper-large-v3-turbo",
				range: { start: 10, end: 10 },
			}),
		).rejects.toThrow("Transcription range duration must be positive.");
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

	test("buildAnalysisChunks keeps exactly 300 seconds as one chunk", () => {
		expect(buildAnalysisChunks({ durationSeconds: 300 })).toEqual([
			{ index: 1, start: 0, end: 300 },
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

	test("offsetTranscriptWords remaps optional word timestamps into source time", () => {
		expect(
			offsetTranscriptWords({
				offsetSeconds: 300,
				words: [{ start: 1.25, end: 1.5, text: "word", confidence: 0.9 }],
			}),
		).toEqual([{ start: 301.25, end: 301.5, text: "word", confidence: 0.9 }]);
	});

	test("guessVideoContextAssetType flags 20 character multi-segment text as oral", () => {
		expect(
			guessVideoContextAssetType({
				text: "12345678901234567890",
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
		expect(shouldSuggestTrimFillers("嗯，我们额看这里")).toBe(true);
		expect(shouldSuggestTrimFillers("然后进入下一步")).toBe(false);
		expect(shouldSuggestTrimFillers("然后然后")).toBe(false);
		expect(shouldSuggestTrimFillers("那个然后")).toBe(false);
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
						capabilities: cloneLocalSegmentAsrCapabilities(),
						quality: cloneLocalSegmentAsrQuality(),
					};
				}
				if (startSeconds === 300) {
					return {
						text: "Second chunk spoken transcript with enough words for classification.",
						language: "zh",
						modelId: "whisper-large-v3-turbo",
						segments: [{ start: 1, end: 4, text: "second chunk" }],
						capabilities: cloneLocalSegmentAsrCapabilities(),
						quality: cloneLocalSegmentAsrQuality(),
					};
				}
				return {
					text: "Third chunk spoken transcript with enough words for classification.",
					language: "zh",
					modelId: "whisper-large-v3-turbo",
					segments: [{ start: 1, end: 4, text: "third chunk" }],
					capabilities: cloneLocalSegmentAsrCapabilities(),
					quality: cloneLocalSegmentAsrQuality(),
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
			transcript: {
				fullText:
					"First chunk spoken transcript with enough words for classification.\nSecond chunk spoken transcript with enough words for classification.\nThird chunk spoken transcript with enough words for classification.",
				language: "zh",
				modelId: "whisper-large-v3-turbo",
				capabilities: {
					segments: true,
					words: false,
					timestamps: {
						segments: true,
						words: false,
					},
					confidence: false,
				},
				quality: {
					confidence: null,
					warnings: ["word timestamps unavailable"],
				},
				segments: [
					{ start: 1, end: 4, text: "first chunk" },
					{ start: 301, end: 304, text: "second chunk" },
					{ start: 601, end: 604, text: "third chunk" },
				],
			},
			analysisChunks: [
				{ index: 1, start: 0, end: 300, status: "succeeded", segmentCount: 1 },
				{
					index: 2,
					start: 300,
					end: 600,
					status: "succeeded",
					segmentCount: 1,
				},
				{
					index: 3,
					start: 600,
					end: 725,
					status: "succeeded",
					segmentCount: 1,
				},
			],
			assetTypeGuess: "oral_candidate",
			editingHints: {
				suggestTrimFillers: false,
				hasTalkingHeadSignal: true,
				canBeBroll: false,
			},
		});
		expect(videoContext.warnings).toContain("visual analysis not run");
		expect(videoContext.warnings).toContain("OCR skipped");
		expect(videoContext.warnings).toContain("scene detection not run");
	});

	test("buildVideoContextWithTranscriber rejects ASR output without segments", async () => {
		await expect(
			buildVideoContextWithTranscriber({
				mediaAsset: {
					id: "media-1",
					name: "source.mp4",
					type: "video",
					durationSeconds: 120,
				},
				probeAudio: async () => ({ hasAudio: true }),
				transcribeRange: async () =>
					({
						text: "transcript without segment rows",
						language: "zh",
						modelId: "whisper-large-v3-turbo",
						capabilities: {
							segments: true,
							words: false,
							timestamps: {
								segments: true,
								words: false,
							},
							confidence: false,
						},
						quality: {
							confidence: null,
							warnings: [],
						},
					}) as never,
			}),
		).rejects.toThrow(
			"ASR provider output for build_video_context chunk 1 must include a segments array.",
		);
	});

	test("buildVideoContextWithTranscriber fails fast when media has no audio", async () => {
		let transcribeCount = 0;

		await expect(
			buildVideoContextWithTranscriber({
				mediaAsset: {
					id: "media-1",
					name: "silent.mp4",
					type: "video",
					durationSeconds: 120,
				},
				probeAudio: async () => ({ hasAudio: false }),
				transcribeRange: async () => {
					transcribeCount += 1;
					return {
						text: "should not run",
						language: "zh",
						modelId: "whisper-large-v3-turbo",
						segments: [],
						capabilities: cloneLocalSegmentAsrCapabilities(),
						quality: cloneLocalSegmentAsrQuality(),
					};
				},
			}),
		).rejects.toThrow("VideoContext requires audio content.");
		expect(transcribeCount).toBe(0);
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
						capabilities: cloneLocalSegmentAsrCapabilities(),
						quality: cloneLocalSegmentAsrQuality(),
					};
				},
			}),
		).rejects.toThrow(
			/^VideoContext chunk 2 failed for source range 300\.00s-600\.00s: ASR failed$/,
		);
	});
});
