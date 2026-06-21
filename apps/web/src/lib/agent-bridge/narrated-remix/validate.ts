import type { MediaAsset } from "@/types/assets";
import {
	type NarratedRemixPlan,
	NarratedRemixPlanSchema,
} from "./schema";

export type NarratedRemixPlanValidationResult =
	| {
			success: true;
			normalizedPlan: NarratedRemixPlan;
	  }
	| { success: false; message: string; path?: string };

const TIME_EPSILON = 0.001;

function formatIssuePath(path: PropertyKey[]): string | undefined {
	if (path.length === 0) return undefined;

	let formatted = "";
	for (const part of path) {
		if (typeof part === "number") {
			formatted = `${formatted}[${part}]`;
			continue;
		}
		const key = String(part);
		formatted = formatted ? `${formatted}.${key}` : key;
	}
	return formatted;
}

function findAsset({
	mediaAssets,
	mediaId,
}: {
	mediaAssets: MediaAsset[];
	mediaId: string;
}): MediaAsset | undefined {
	return mediaAssets.find((asset) => asset.id === mediaId);
}

function exceeds({
	end,
	limit,
}: {
	end: number;
	limit: number;
}): boolean {
	return end - limit > TIME_EPSILON;
}

export function validateNarratedRemixPlan({
	plan,
	projectId,
	mediaAssets,
}: {
	plan: unknown;
	projectId: string;
	mediaAssets: MediaAsset[];
}): NarratedRemixPlanValidationResult {
	const parsed = NarratedRemixPlanSchema.safeParse(plan);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		return {
			success: false,
			message: "NarratedRemixPlan schema is invalid.",
			...(firstIssue
				? { path: formatIssuePath(firstIssue.path) }
				: {}),
		};
	}

	const normalizedPlan = parsed.data;
	if (normalizedPlan.projectId !== projectId) {
		return {
			success: false,
			message: "NarratedRemixPlan projectId does not match the active project.",
			path: "projectId",
		};
	}

	const narrationAsset = findAsset({
		mediaAssets,
		mediaId: normalizedPlan.narration.mediaId,
	});
	if (!narrationAsset) {
		return {
			success: false,
			message: "NarratedRemixPlan narration mediaId was not found.",
			path: "narration.mediaId",
		};
	}
	if (narrationAsset.type !== "audio") {
		return {
			success: false,
			message: "NarratedRemixPlan narration media must be audio.",
			path: "narration.mediaId",
		};
	}
	if (!narrationAsset.duration) {
		return {
			success: false,
			message: "NarratedRemixPlan narration duration is required.",
			path: "narration.mediaId",
		};
	}
	if (
		exceeds({
			end:
				normalizedPlan.narration.sourceStart +
				normalizedPlan.target.durationSec,
			limit: narrationAsset.duration,
		})
	) {
		return {
			success: false,
			message: "NarratedRemixPlan narration does not cover target duration.",
			path: "narration.mediaId",
		};
	}

	let expectedTimelineStart = 0;
	for (const [index, visualBeat] of normalizedPlan.visualBeats.entries()) {
		const visualAsset = findAsset({
			mediaAssets,
			mediaId: visualBeat.mediaId,
		});
		const beatPath = `visualBeats[${index}]`;

		if (!visualAsset) {
			return {
				success: false,
				message: "NarratedRemixPlan visualBeat mediaId was not found.",
				path: `${beatPath}.mediaId`,
			};
		}
		if (visualAsset.type !== "video") {
			return {
				success: false,
				message: "NarratedRemixPlan visualBeat media must be video.",
				path: `${beatPath}.mediaId`,
			};
		}
		if (!visualAsset.duration) {
			return {
				success: false,
				message: "NarratedRemixPlan visualBeat duration is required.",
				path: `${beatPath}.mediaId`,
			};
		}
		if (visualBeat.sourceEnd <= visualBeat.sourceStart) {
			return {
				success: false,
				message:
					"NarratedRemixPlan visualBeat sourceEnd must be greater than sourceStart.",
				path: beatPath,
			};
		}
		if (exceeds({ end: visualBeat.sourceEnd, limit: visualAsset.duration })) {
			return {
				success: false,
				message: "NarratedRemixPlan visualBeat exceeds media duration.",
				path: `${beatPath}.sourceEnd`,
			};
		}
		if (
			Math.abs(visualBeat.timelineStart - expectedTimelineStart) > TIME_EPSILON
		) {
			return {
				success: false,
				message: "NarratedRemixPlan visualBeats must be continuous.",
				path: `${beatPath}.timelineStart`,
			};
		}

		expectedTimelineStart += visualBeat.sourceEnd - visualBeat.sourceStart;
	}

	if (
		Math.abs(expectedTimelineStart - normalizedPlan.target.durationSec) >
		TIME_EPSILON
	) {
		return {
			success: false,
			message:
				"NarratedRemixPlan visualBeats total duration must equal target duration.",
			path: "target.durationSec",
		};
	}

	for (const [index, caption] of normalizedPlan.captions.entries()) {
		if (
			exceeds({
				end: caption.startTime + caption.duration,
				limit: normalizedPlan.target.durationSec,
			})
		) {
			return {
				success: false,
				message: "NarratedRemixPlan caption exceeds target duration.",
				path: `captions[${index}]`,
			};
		}
	}

	return { success: true, normalizedPlan };
}
