import type { MediaAsset } from "@/types/assets";
import { EditPlanSchema, type EditPlan } from "./schema";

export type EditPlanValidationResult =
	| { success: true; normalizedPlan: EditPlan }
	| { success: false; message: string; path?: string };

function fail({
	message,
	path,
}: {
	message: string;
	path?: string;
}): EditPlanValidationResult {
	return { success: false, message, path };
}

function getGeneratedTimelineDuration({ plan }: { plan: EditPlan }): number {
	let duration = 0;
	for (const clip of plan.clips) {
		const clipEnd = clip.timelineStart + clip.sourceEnd - clip.sourceStart;
		duration = Math.max(duration, clipEnd);
	}
	return duration;
}

function timedTextExceeds({
	item,
	timelineDuration,
}: {
	item: { startTime: number; duration: number };
	timelineDuration: number;
}): boolean {
	return item.startTime + item.duration > timelineDuration;
}

export function validateEditPlan({
	plan,
	projectId,
	mediaAssets,
}: {
	plan: unknown;
	projectId: string;
	mediaAssets: MediaAsset[];
}): EditPlanValidationResult {
	const parsed = EditPlanSchema.safeParse(plan);
	if (!parsed.success) {
		return fail({ message: "EditPlan schema is invalid." });
	}

	const normalizedPlan = parsed.data;
	if (normalizedPlan.projectId !== projectId) {
		return fail({
			message: "EditPlan projectId does not match the active project.",
			path: "projectId",
		});
	}

	const sourceMedia = mediaAssets.find(
		(asset) => asset.id === normalizedPlan.sourceMediaId,
	);
	if (!sourceMedia) {
		return fail({
			message: "EditPlan sourceMediaId was not found in the project media library.",
			path: "sourceMediaId",
		});
	}

	if (sourceMedia.type !== "video" && sourceMedia.type !== "audio") {
		return fail({
			message: "EditPlan source media must be video or audio.",
			path: "sourceMediaId",
		});
	}

	if (typeof sourceMedia.duration !== "number" || sourceMedia.duration <= 0) {
		return fail({
			message: "EditPlan source media duration is required.",
			path: "sourceMediaId",
		});
	}

	let clipDurationTotal = 0;
	for (let index = 0; index < normalizedPlan.clips.length; index += 1) {
		const clip = normalizedPlan.clips[index];
		if (clip.sourceEnd <= clip.sourceStart) {
			return fail({
				message: "EditPlan clip sourceEnd must be greater than sourceStart.",
				path: `clips[${index}]`,
			});
		}
		if (clip.sourceEnd > sourceMedia.duration) {
			return fail({
				message: "EditPlan clip sourceEnd exceeds source media duration.",
				path: `clips[${index}].sourceEnd`,
			});
		}
		clipDurationTotal += clip.sourceEnd - clip.sourceStart;
	}

	const durationTolerance = Math.max(
		3,
		normalizedPlan.target.durationSec * 0.15,
	);
	if (
		Math.abs(clipDurationTotal - normalizedPlan.target.durationSec) >
		durationTolerance
	) {
		return fail({
			message: "EditPlan clip duration total is outside the target tolerance.",
			path: "target.durationSec",
		});
	}

	const timelineDuration = getGeneratedTimelineDuration({ plan: normalizedPlan });
	if (
		normalizedPlan.title &&
		timedTextExceeds({ item: normalizedPlan.title, timelineDuration })
	) {
		return fail({
			message: "EditPlan title exceeds the generated timeline duration.",
			path: "title",
		});
	}

	for (let index = 0; index < (normalizedPlan.captions ?? []).length; index += 1) {
		const caption = normalizedPlan.captions?.[index];
		if (!caption) continue;
		if (timedTextExceeds({ item: caption, timelineDuration })) {
			return fail({
				message: "EditPlan caption exceeds the generated timeline duration.",
				path: `captions[${index}]`,
			});
		}
	}

	return { success: true, normalizedPlan };
}
