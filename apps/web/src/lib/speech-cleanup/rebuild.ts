import type {
	EditPlan,
	EditPlanClip,
} from "@/lib/agent-bridge/edit-plan/schema";
import {
	SpeechCleanupPlanSchema,
	type RebuiltSpeechCaption,
	type SpeechCleanupDecision,
	type SpeechCleanupDropReason,
	type SpeechCleanupPlan,
	type SpeechCleanupStats,
	type SpeechCleanupVerification,
} from "./schema";

const TIME_TOLERANCE_SECONDS = 0.001;

export interface SpeechCleanupResult {
	plan: SpeechCleanupPlan;
	clips: EditPlanClip[];
	rebuiltCaptions: RebuiltSpeechCaption[];
	stats: SpeechCleanupStats;
	verification: SpeechCleanupVerification;
	editPlan: EditPlan;
}

function roundTime(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function assertSourceBounds({
	decision,
	sourceDuration,
}: {
	decision: SpeechCleanupDecision;
	sourceDuration: number;
}) {
	if (decision.sourceEnd > sourceDuration) {
		throw new Error("SpeechCleanupDecision sourceEnd exceeds source duration.");
	}
}

function assertDecisionOrder({
	decisions,
}: {
	decisions: SpeechCleanupDecision[];
}) {
	let previousEnd = 0;
	for (let index = 0; index < decisions.length; index += 1) {
		const decision = decisions[index];
		if (index > 0 && decision.sourceStart < decisions[index - 1].sourceStart) {
			throw new Error("SpeechCleanup decisions must be sorted by sourceStart.");
		}
		if (index > 0 && decision.sourceStart < previousEnd) {
			throw new Error("SpeechCleanup decisions must not overlap.");
		}
		previousEnd = decision.sourceEnd;
	}
}

function buildStats({
	decisions,
}: {
	decisions: SpeechCleanupDecision[];
}): SpeechCleanupStats {
	const dropReasons: Partial<Record<SpeechCleanupDropReason, number>> = {};
	let keep = 0;
	let drop = 0;

	for (const decision of decisions) {
		if (decision.action === "keep") {
			keep += 1;
			continue;
		}

		drop += 1;
		dropReasons[decision.dropReason] =
			(dropReasons[decision.dropReason] ?? 0) + 1;
	}

	return {
		total: decisions.length,
		keep,
		drop,
		dropReasons,
	};
}

function verifyResult({
	clips,
	rebuiltCaptions,
}: {
	clips: EditPlanClip[];
	rebuiltCaptions: RebuiltSpeechCaption[];
}): SpeechCleanupVerification {
	let expectedTimelineStart = 0;
	let timelineContiguous = true;
	let timelineEnd = 0;

	for (const clip of clips) {
		if (
			Math.abs(clip.timelineStart - expectedTimelineStart) >
			TIME_TOLERANCE_SECONDS
		) {
			timelineContiguous = false;
		}
		const clipDuration = clip.sourceEnd - clip.sourceStart;
		expectedTimelineStart = roundTime(expectedTimelineStart + clipDuration);
		timelineEnd = Math.max(timelineEnd, clip.timelineStart + clipDuration);
	}

	const captionsWithinTimeline = rebuiltCaptions.every(
		(caption) =>
			caption.startTime + caption.duration <=
			timelineEnd + TIME_TOLERANCE_SECONDS,
	);
	const sourceTraceAvailable = rebuiltCaptions.every(
		(caption) => caption.sourceEnd > caption.sourceStart,
	);

	return {
		timelineContiguous,
		captionsWithinTimeline,
		sourceTraceAvailable,
		warnings: [],
	};
}

export function rebuildTimelineFromSpeechCleanup({
	plan,
	sourceDuration,
}: {
	plan: unknown;
	sourceDuration: number;
}): SpeechCleanupResult {
	const parsed = SpeechCleanupPlanSchema.parse(plan);
	if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) {
		throw new Error("sourceDuration must be positive.");
	}

	for (const decision of parsed.decisions) {
		assertSourceBounds({ decision, sourceDuration });
	}
	assertDecisionOrder({ decisions: parsed.decisions });

	const keepDecisions = parsed.decisions.filter(
		(decision) => decision.action === "keep",
	);
	if (keepDecisions.length === 0) {
		throw new Error("SpeechCleanupPlan must keep at least one segment.");
	}

	const clips: EditPlanClip[] = [];
	const rebuiltCaptions: RebuiltSpeechCaption[] = [];
	let timelineStart = 0;

	for (let index = 0; index < keepDecisions.length; index += 1) {
		const decision = keepDecisions[index];
		const duration = roundTime(decision.sourceEnd - decision.sourceStart);
		const startTime = roundTime(timelineStart);

		clips.push({
			id: `clip-${index + 1}`,
			sourceStart: roundTime(decision.sourceStart),
			sourceEnd: roundTime(decision.sourceEnd),
			timelineStart: startTime,
			reason: decision.reason,
		});
		rebuiltCaptions.push({
			id: `caption-${index + 1}`,
			text: decision.text,
			startTime,
			duration,
			sourceStart: roundTime(decision.sourceStart),
			sourceEnd: roundTime(decision.sourceEnd),
		});

		timelineStart = roundTime(timelineStart + duration);
	}

	const stats = buildStats({ decisions: parsed.decisions });
	const verification = verifyResult({ clips, rebuiltCaptions });
	const editPlan: EditPlan = {
		version: 1,
		projectId: parsed.projectId,
		sourceMediaId: parsed.sourceMediaId,
		target: {
			durationSec: roundTime(timelineStart),
			aspectRatio: parsed.target.aspectRatio,
		},
		clips,
		captions: rebuiltCaptions.map((caption) => ({
			text: caption.text,
			startTime: caption.startTime,
			duration: caption.duration,
		})),
		captionStyle: {
			preset: "short-form-bold",
			position: "lower-safe",
		},
		rationale: parsed.rationale,
	};

	return {
		plan: parsed,
		clips,
		rebuiltCaptions,
		stats,
		verification,
		editPlan,
	};
}
