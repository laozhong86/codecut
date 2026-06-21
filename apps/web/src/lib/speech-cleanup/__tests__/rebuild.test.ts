import { validateEditPlan } from "@/lib/agent-bridge/edit-plan/validate";
import type { MediaAsset } from "@/types/assets";
import { describe, expect, test } from "bun:test";
import {
	assertSpeechCleanupVerification,
	rebuildTimelineFromSpeechCleanup,
} from "../rebuild";
import type { SpeechCleanupDecision, SpeechCleanupPlan } from "../schema";

function mediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return {
		id: "media-1",
		name: "talking-head.mp4",
		type: "video",
		duration: 20,
		width: 1920,
		height: 1080,
		file: new File(["video"], "talking-head.mp4", { type: "video/mp4" }),
		...overrides,
	};
}

function speechCleanupPlan(): SpeechCleanupPlan {
	return {
		version: 2,
		projectId: "project-1",
		sourceMediaId: "media-1",
		target: {
			durationSec: 6,
			aspectRatio: "16:9",
		},
		decisions: [
			{
				id: "seg-1",
				text: "嗯我重新说一下",
				sourceStart: 0,
				sourceEnd: 1.2,
				action: "drop",
				dropReason: "restart",
				reason: "Speaker restarts.",
			},
			{
				id: "seg-2",
				text: "平台红利不等于个人实力",
				sourceStart: 1.2,
				sourceEnd: 4.2,
				action: "keep",
				reason: "Core claim.",
			},
			{
				id: "seg-3",
				text: "啊这个地方很关键",
				sourceStart: 4.2,
				sourceEnd: 5.4,
				action: "drop",
				dropReason: "filler",
				reason: "Filler phrase.",
			},
			{
				id: "seg-4",
				text: "真正的议价能力来自客户资产",
				sourceStart: 5.4,
				sourceEnd: 8.4,
				action: "keep",
				reason: "Core conclusion.",
			},
		],
		rationale: "Remove restart and filler while preserving the argument.",
	};
}

describe("rebuildTimelineFromSpeechCleanup", () => {
	test("rebuilds contiguous clips and captions from keep decisions", () => {
		const result = rebuildTimelineFromSpeechCleanup({
			plan: speechCleanupPlan(),
			sourceDuration: 20,
		});

		expect(result.clips).toEqual([
			{
				id: "clip-1",
				sourceStart: 1.2,
				sourceEnd: 4.2,
				timelineStart: 0,
				reason: "Core claim.",
			},
			{
				id: "clip-2",
				sourceStart: 5.4,
				sourceEnd: 8.4,
				timelineStart: 3,
				reason: "Core conclusion.",
			},
		]);
		expect(result.rebuiltCaptions).toEqual([
			{
				id: "caption-1",
				text: "平台红利不等于个人实力",
				startTime: 0,
				duration: 3,
				sourceStart: 1.2,
				sourceEnd: 4.2,
			},
			{
				id: "caption-2",
				text: "真正的议价能力来自客户资产",
				startTime: 3,
				duration: 3,
				sourceStart: 5.4,
				sourceEnd: 8.4,
			},
		]);
	});

	test("returns stats and verification", () => {
		const result = rebuildTimelineFromSpeechCleanup({
			plan: speechCleanupPlan(),
			sourceDuration: 20,
		});

		expect(result.stats).toEqual({
			total: 4,
			keep: 2,
			drop: 2,
			dropReasons: {
				restart: 1,
				filler: 1,
			},
		});
		expect(result.verification).toEqual({
			timelineContiguous: true,
			captionsWithinTimeline: true,
			sourceTraceAvailable: true,
			warnings: [],
		});
	});

	test("counts filler removals only from dropped filler decisions", () => {
		const plan = speechCleanupPlan();
		plan.decisions[1] = {
			...plan.decisions[1],
			text: "嗯平台红利不等于个人实力",
		};
		plan.decisions[2] = {
			id: "seg-3",
			text: "啊这个地方很关键",
			sourceStart: 4.2,
			sourceEnd: 5.4,
			action: "drop",
			dropReason: "pause",
			reason: "Pause.",
		};

		const result = rebuildTimelineFromSpeechCleanup({
			plan,
			sourceDuration: 20,
		});

		expect(result.stats.dropReasons.filler).toBeUndefined();
		expect(result.stats.dropReasons.pause).toBe(1);
	});

	test("projects to a current EditPlan v1 shape accepted by validateEditPlan", () => {
		const result = rebuildTimelineFromSpeechCleanup({
			plan: speechCleanupPlan(),
			sourceDuration: 20,
		});

		const validation = validateEditPlan({
			plan: result.editPlan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result.editPlan.captionStyle).toEqual({
			preset: "short-form-bold",
			position: "lower-safe",
		});
		expect(validation.success).toBe(true);
	});

	test("projects decimal ASR segments to an EditPlan accepted by validateEditPlan", () => {
		const plan: SpeechCleanupPlan = {
			version: 2,
			projectId: "project-1",
			sourceMediaId: "media-1",
			target: {
				durationSec: 1.28,
				aspectRatio: "16:9",
			},
			decisions: [
				{
					id: "seg-1",
					text: "Um, this is a short proof.",
					sourceStart: 0,
					sourceEnd: 2.72,
					action: "drop",
					dropReason: "filler",
					reason: "Opening filler.",
				},
				{
					id: "seg-2",
					text: "We keep the useful.",
					sourceStart: 2.72,
					sourceEnd: 4,
					action: "keep",
					reason: "Useful statement.",
				},
			],
			rationale: "Runtime proof projection.",
		};

		const result = rebuildTimelineFromSpeechCleanup({
			plan,
			sourceDuration: 5.066667,
		});

		const validation = validateEditPlan({
			plan: result.editPlan,
			projectId: "project-1",
			mediaAssets: [mediaAsset({ duration: 5.066667 })],
		});

		expect(validation.success).toBe(true);
	});

	test("fails when all decisions are dropped", () => {
		const plan = speechCleanupPlan();
		plan.decisions = plan.decisions.map(
			(decision): SpeechCleanupDecision => ({
				id: decision.id,
				text: decision.text,
				sourceStart: decision.sourceStart,
				sourceEnd: decision.sourceEnd,
				action: "drop",
				dropReason: "other",
				reason: decision.reason,
			}),
		);

		expect(() =>
			rebuildTimelineFromSpeechCleanup({ plan, sourceDuration: 20 }),
		).toThrow("SpeechCleanupPlan must keep at least one segment.");
	});

	test("fails when a decision exceeds source duration", () => {
		const plan = speechCleanupPlan();
		plan.decisions[3] = {
			...plan.decisions[3],
			sourceEnd: 22,
		};

		expect(() =>
			rebuildTimelineFromSpeechCleanup({ plan, sourceDuration: 20 }),
		).toThrow("SpeechCleanupDecision sourceEnd exceeds source duration.");
	});

	test("fails when decisions are not sorted by sourceStart", () => {
		const plan = speechCleanupPlan();
		plan.decisions = [
			plan.decisions[1],
			plan.decisions[0],
			...plan.decisions.slice(2),
		];

		expect(() =>
			rebuildTimelineFromSpeechCleanup({ plan, sourceDuration: 20 }),
		).toThrow("SpeechCleanup decisions must be sorted by sourceStart.");
	});

	test("fails when decisions overlap", () => {
		const plan = speechCleanupPlan();
		plan.decisions[2] = {
			...plan.decisions[2],
			sourceStart: 4,
		};

		expect(() =>
			rebuildTimelineFromSpeechCleanup({ plan, sourceDuration: 20 }),
		).toThrow("SpeechCleanup decisions must not overlap.");
	});

	test("fails fast when verification is false", () => {
		expect(() =>
			assertSpeechCleanupVerification({
				timelineContiguous: false,
				captionsWithinTimeline: true,
				sourceTraceAvailable: true,
				warnings: [],
			}),
		).toThrow("SpeechCleanup verification failed: timelineContiguous.");
	});
});
