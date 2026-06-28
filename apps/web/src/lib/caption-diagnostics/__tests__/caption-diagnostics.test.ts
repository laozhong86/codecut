import { describe, expect, test } from "bun:test";
import type { EditPlanCaptionStyle } from "@/lib/agent-bridge/edit-plan/schema";
import {
	cloneLocalSegmentAsrCapabilities,
	cloneLocalSegmentAsrQuality,
} from "@/lib/transcription/asr-provider-contract";
import type { TimelineTrack } from "@/types/timeline";
import { buildCaptionDiagnosticsReport } from "../caption-diagnostics";

const captionStyle = {
	preset: "creator-clean",
	position: "lower-safe",
	size: "medium",
} satisfies EditPlanCaptionStyle;

const canvasSize = { width: 1080, height: 1920 };

const mediaAssets = [
	{
		id: "media-1",
		name: "talking-head.mp4",
		type: "video",
		duration: 10,
		width: 1920,
		height: 1080,
		path: "/tmp/talking-head.mp4",
	},
] as const;

function videoTrack({
	muted = false,
	hidden = false,
}: {
	muted?: boolean;
	hidden?: boolean;
} = {}): TimelineTrack {
	return {
		id: "video-track-1",
		type: "video",
		name: "Main video",
		isMain: true,
		muted,
		hidden,
		elements: [
			{
				id: "clip-1",
				type: "video",
				name: "Hook",
				mediaId: "media-1",
				startTime: 0,
				duration: 2,
				trimStart: 3,
				trimEnd: 5,
				transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
				opacity: 1,
			},
		],
	};
}

function textCaptionTrack(): TimelineTrack {
	return {
		id: "text-track-1",
		type: "text",
		name: "Captions",
		hidden: false,
		elements: [
			{
				id: "caption-1",
				type: "text",
				name: "Caption 1",
				content: "Existing subtitle",
				richSpans: [],
				startTime: 0,
				duration: 1,
				trimStart: 0,
				trimEnd: 0,
				fontSize: 5,
				fontFamily: "Arial",
				color: "#ffffff",
				backgroundColor: "transparent",
				textAlign: "center",
				fontWeight: "normal",
				fontStyle: "normal",
				textDecoration: "none",
				opacity: 1,
				transform: { scale: 1, position: { x: 0, y: 300 }, rotate: 0 },
			},
		],
	};
}

function defaultArgs({
	tracks = [videoTrack()],
}: {
	tracks?: TimelineTrack[];
} = {}) {
	return {
		tracks,
		mediaAssets: [...mediaAssets],
		language: "auto" as const,
		modelId: "whisper-base" as const,
		captionStyle,
		aspectRatio: "9:16" as const,
		canvasSize,
		timelineDuration: 2,
	};
}

describe("buildCaptionDiagnosticsReport", () => {
	test("blocks generation when editable captions already exist", async () => {
		let transcribeCount = 0;

		const report = await buildCaptionDiagnosticsReport({
			...defaultArgs({ tracks: [videoTrack(), textCaptionTrack()] }),
			transcribeMediaRange: async () => {
				transcribeCount += 1;
				throw new Error("transcription should not run");
			},
		});

		expect(transcribeCount).toBe(0);
		expect(report).toMatchObject({
			status: "blocked",
			existingSubtitles: {
				editableCaptionCount: 1,
				blocksGeneration: true,
			},
			sourceCoverage: {
				eligibleClipCount: 1,
				skippedClipCount: 0,
			},
		});
		expect(report.recommendations).toContain(
			"Remove or replace existing editable captions before generating new captions.",
		);
	});

	test("reports unavailable confidence without inventing low confidence items", async () => {
		const report = await buildCaptionDiagnosticsReport({
			...defaultArgs(),
			transcribeMediaRange: async ({ language, modelId }) => ({
				text: "Clear words",
				language,
				modelId,
				segments: [{ text: "Clear words", start: 0.25, end: 1.25 }],
				capabilities: cloneLocalSegmentAsrCapabilities(),
				quality: cloneLocalSegmentAsrQuality(),
			}),
		});

		expect(report).toMatchObject({
			status: "ready",
			confidence: {
				confidenceAvailable: false,
				averageConfidence: null,
				lowConfidenceItems: [],
			},
			captionQuality: {
				ok: true,
			},
			summary: {
				candidateCaptionCount: 1,
			},
		});
		expect(report.candidateCaptions).toEqual([
			{ text: "Clear words", startTime: 0.25, duration: 1 },
		]);
	});

	test("reports low confidence only when ASR provides confidence values", async () => {
		const report = await buildCaptionDiagnosticsReport({
			...defaultArgs(),
			transcribeMediaRange: async ({ language, modelId }) => ({
				text: "Uncertain words",
				language,
				modelId,
				segments: [
					{ text: "Uncertain words", start: 0, end: 1, confidence: 0.42 },
				],
				capabilities: {
					segments: true,
					words: false,
					timestamps: { segments: true, words: false },
					confidence: true,
				},
				quality: { confidence: 0.42, warnings: [] },
			}),
		});

		expect(report).toMatchObject({
			status: "warning",
			confidence: {
				confidenceAvailable: true,
				averageConfidence: 0.42,
				lowConfidenceItems: [
					{
						kind: "segment",
						text: "Uncertain words",
						confidence: 0.42,
						clipId: "clip-1",
					},
				],
			},
		});
	});

	test("surfaces skipped clips and burned subtitle risk as explicit diagnostics", async () => {
		const report = await buildCaptionDiagnosticsReport({
			...defaultArgs({
				tracks: [
					videoTrack({ muted: true }),
					{
						...videoTrack(),
						id: "video-track-2",
						elements: [
							{
								...(videoTrack()
									.elements[0] as TimelineTrack["elements"][number]),
								id: "clip-2",
								startTime: 2,
							},
						],
					} as TimelineTrack,
				],
			}),
			timelineDuration: 4,
			transcribeMediaRange: async ({ language, modelId }) => ({
				text: "Readable caption",
				language,
				modelId,
				segments: [{ text: "Readable caption", start: 0, end: 1 }],
				capabilities: cloneLocalSegmentAsrCapabilities(),
				quality: cloneLocalSegmentAsrQuality(),
			}),
		});

		expect(report.sourceCoverage).toMatchObject({
			eligibleClipCount: 1,
			skippedClipCount: 1,
			skippedClips: [
				{
					clipId: "clip-1",
					reason: "track_muted",
				},
			],
		});
		expect(report.burnedSubtitleRisk).toMatchObject({
			status: "unverified",
			severity: "warning",
			recommendedPolicy: "inspect_artifacts_before_lower_safe_captions",
		});
	});

	test("returns a blocked report when transcription fails", async () => {
		const report = await buildCaptionDiagnosticsReport({
			...defaultArgs(),
			transcribeMediaRange: async () => {
				throw new Error("No audio samples were extracted from media.");
			},
		});

		expect(report).toMatchObject({
			status: "blocked",
			transcription: {
				errorCount: 1,
				errors: [
					{
						clipId: "clip-1",
						message: "No audio samples were extracted from media.",
					},
				],
			},
			summary: {
				candidateCaptionCount: 0,
			},
		});
	});
});
