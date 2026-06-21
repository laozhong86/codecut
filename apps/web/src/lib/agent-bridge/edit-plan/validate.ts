import type { MediaAsset } from "@/types/assets";
import { validateTextRichSpans } from "@/services/renderer/nodes/text-layout";
import { EditPlanSchema, type EditPlan } from "./schema";

const TIMED_TEXT_TOLERANCE_SECONDS = 0.001;

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

function getClipDuration({
	clip,
}: {
	clip: EditPlan["clips"][number];
}): number {
	return clip.sourceEnd - clip.sourceStart;
}

function getClipTimelineEnd({
	clip,
}: {
	clip: EditPlan["clips"][number];
}): number {
	return clip.timelineStart + getClipDuration({ clip });
}

function timedTextExceeds({
	item,
	timelineDuration,
}: {
	item: { startTime: number; duration: number };
	timelineDuration: number;
}): boolean {
	return (
		item.startTime + item.duration >
		timelineDuration + TIMED_TEXT_TOLERANCE_SECONDS
	);
}

function validateAudioAsset({
	assetId,
	mediaAssets,
	path,
	missingMessage,
	typeMessage,
}: {
	assetId: string;
	mediaAssets: MediaAsset[];
	path: string;
	missingMessage: string;
	typeMessage: string;
}): EditPlanValidationResult | null {
	const asset = mediaAssets.find((candidate) => candidate.id === assetId);
	if (!asset) {
		return fail({ message: missingMessage, path });
	}
	if (asset.type !== "audio") {
		return fail({ message: typeMessage, path });
	}
	if (typeof asset.duration !== "number" || asset.duration <= 0) {
		return fail({
			message: "EditPlan audio asset duration is required.",
			path,
		});
	}
	return null;
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
	const hasCaptions = (normalizedPlan.captions?.length ?? 0) > 0;
	if (hasCaptions && !normalizedPlan.captionStyle) {
		return fail({
			message: "EditPlan captions require captionStyle.",
			path: "captionStyle",
		});
	}
	if (!hasCaptions && normalizedPlan.captionStyle) {
		return fail({
			message: "EditPlan captionStyle requires captions.",
			path: "captionStyle",
		});
	}

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
			message:
				"EditPlan sourceMediaId was not found in the project media library.",
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

	const hasCoverFit = normalizedPlan.clips.some((clip) => clip.fit === "cover");
	if (hasCoverFit && sourceMedia.type !== "video") {
		const index = normalizedPlan.clips.findIndex(
			(clip) => clip.fit === "cover",
		);
		return fail({
			message: "EditPlan cover fit requires video source media.",
			path: `clips[${index}].fit`,
		});
	}
	if (
		hasCoverFit &&
		(typeof sourceMedia.width !== "number" ||
			sourceMedia.width <= 0 ||
			typeof sourceMedia.height !== "number" ||
			sourceMedia.height <= 0)
	) {
		return fail({
			message: "EditPlan cover fit requires source media dimensions.",
			path: "sourceMediaId",
		});
	}

	let clipDurationTotal = 0;
	const clipIds = new Set<string>();
	for (let index = 0; index < normalizedPlan.clips.length; index += 1) {
		const clip = normalizedPlan.clips[index];
		if (clipIds.has(clip.id)) {
			return fail({
				message: "EditPlan clip ids must be unique.",
				path: `clips[${index}].id`,
			});
		}
		clipIds.add(clip.id);
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

	const timelineDuration = getGeneratedTimelineDuration({
		plan: normalizedPlan,
	});
	if (
		normalizedPlan.title &&
		timedTextExceeds({ item: normalizedPlan.title, timelineDuration })
	) {
		return fail({
			message: "EditPlan title exceeds the generated timeline duration.",
			path: "title",
		});
	}
	if (normalizedPlan.title?.richSpans) {
		try {
			validateTextRichSpans({
				content: normalizedPlan.title.text,
				richSpans: normalizedPlan.title.richSpans,
			});
		} catch {
			return fail({
				message: "EditPlan title richSpans must be sorted and non-overlapping.",
				path: "title.richSpans",
			});
		}
	}

	for (
		let index = 0;
		index < (normalizedPlan.captions ?? []).length;
		index += 1
	) {
		const caption = normalizedPlan.captions?.[index];
		if (!caption) continue;
		if (timedTextExceeds({ item: caption, timelineDuration })) {
			return fail({
				message: "EditPlan caption exceeds the generated timeline duration.",
				path: `captions[${index}]`,
			});
		}
		if (caption.richSpans) {
			try {
				validateTextRichSpans({
					content: caption.text,
					richSpans: caption.richSpans,
				});
			} catch {
				return fail({
					message:
						"EditPlan caption richSpans must be sorted and non-overlapping.",
					path: `captions[${index}].richSpans`,
				});
			}
		}
	}

	if (normalizedPlan.audio?.bgm) {
		const audioError = validateAudioAsset({
			assetId: normalizedPlan.audio.bgm.assetId,
			mediaAssets,
			path: "audio.bgm.assetId",
			missingMessage:
				"EditPlan bgm assetId was not found in the project media library.",
			typeMessage: "EditPlan bgm asset must be audio.",
		});
		if (audioError) return audioError;
	}

	for (
		let index = 0;
		index < (normalizedPlan.audio?.sfx ?? []).length;
		index += 1
	) {
		const sfx = normalizedPlan.audio?.sfx?.[index];
		if (!sfx) continue;
		const audioError = validateAudioAsset({
			assetId: sfx.assetId,
			mediaAssets,
			path: `audio.sfx[${index}].assetId`,
			missingMessage:
				"EditPlan sfx assetId was not found in the project media library.",
			typeMessage: "EditPlan sfx asset must be audio.",
		});
		if (audioError) return audioError;
		if (sfx.startTime >= timelineDuration) {
			return fail({
				message:
					"EditPlan sfx startTime exceeds the generated timeline duration.",
				path: `audio.sfx[${index}].startTime`,
			});
		}
	}

	if (
		(normalizedPlan.transitions?.length ?? 0) > 0 &&
		sourceMedia.type !== "video"
	) {
		return fail({
			message: "EditPlan transitions require video source media.",
			path: "transitions",
		});
	}

	const clipsById = new Map(
		normalizedPlan.clips.map((clip) => [clip.id, clip] as const),
	);
	const adjacencyTolerance = 0.001;
	for (
		let index = 0;
		index < (normalizedPlan.transitions ?? []).length;
		index += 1
	) {
		const transition = normalizedPlan.transitions?.[index];
		if (!transition) continue;
		const fromClip = clipsById.get(transition.fromClipId);
		if (!fromClip) {
			return fail({
				message: "EditPlan transition fromClipId does not reference a clip.",
				path: `transitions[${index}].fromClipId`,
			});
		}
		const toClip = clipsById.get(transition.toClipId);
		if (!toClip) {
			return fail({
				message: "EditPlan transition toClipId does not reference a clip.",
				path: `transitions[${index}].toClipId`,
			});
		}
		if (
			Math.abs(getClipTimelineEnd({ clip: fromClip }) - toClip.timelineStart) >
			adjacencyTolerance
		) {
			return fail({
				message: "EditPlan transition clips must be adjacent on the timeline.",
				path: `transitions[${index}]`,
			});
		}
		const neighboringDuration = Math.min(
			getClipDuration({ clip: fromClip }),
			getClipDuration({ clip: toClip }),
		);
		if (transition.duration > neighboringDuration) {
			return fail({
				message:
					"EditPlan transition duration exceeds neighboring clip duration.",
				path: `transitions[${index}].duration`,
			});
		}
	}

	return { success: true, normalizedPlan };
}
