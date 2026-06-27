import type { MediaAsset } from "@/types/assets";
import {
	auditCaptions,
	canonicalCaptionCanvasSizeForAspectRatio,
} from "@/lib/agent-bridge/caption-quality";
import {
	type NarratedRemixPlan,
	NarratedRemixPlanSchema,
} from "./schema";

type NarratedRemixVisualBeat = NarratedRemixPlan["visualBeats"][number];
type NarratedRemixImageBeat = Extract<
	NarratedRemixVisualBeat,
	{ mediaType: "image" }
>;

export interface NarratedRemixDurationContract {
	totalDurationMode: "auto" | "preserve_source" | "custom_range";
	sourceCoverageMode: "selected_segments" | "full_source";
	sourceDurationSeconds?: number;
	toleranceSeconds?: number;
}

export interface NarratedRemixDurationGoal {
	mode: "auto" | "custom";
	rangeSeconds?: {
		minSeconds: number;
		maxSeconds: number;
	};
}

export interface NarratedRemixDurationContractSummary {
	totalDurationMode: NarratedRemixDurationContract["totalDurationMode"];
	sourceCoverageMode: NarratedRemixDurationContract["sourceCoverageMode"];
	targetDurationSec: number;
	sourceDurationSeconds?: number;
	toleranceSeconds: number;
	totalDurationMatches: boolean;
	sourceCoverageMatches: boolean;
}

export type NarratedRemixPlanValidationResult =
	| {
			success: true;
			normalizedPlan: NarratedRemixPlan;
			durationContract?: NarratedRemixDurationContractSummary;
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

function isImageBeat(
	visualBeat: NarratedRemixVisualBeat,
): visualBeat is NarratedRemixImageBeat {
	return visualBeat.mediaType === "image";
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

function withinTolerance({
	actual,
	expected,
	toleranceSeconds,
}: {
	actual: number;
	expected: number;
	toleranceSeconds: number;
}): boolean {
	return Math.abs(actual - expected) <= toleranceSeconds + TIME_EPSILON;
}

function videoBeats(
	visualBeats: NarratedRemixVisualBeat[],
): Array<Exclude<NarratedRemixVisualBeat, NarratedRemixImageBeat>> {
	return visualBeats.filter(
		(visualBeat): visualBeat is Exclude<NarratedRemixVisualBeat, NarratedRemixImageBeat> =>
			!isImageBeat(visualBeat),
	);
}

function validateFullSourceCoverage({
	visualBeats,
	sourceDurationSeconds,
	toleranceSeconds,
}: {
	visualBeats: NarratedRemixVisualBeat[];
	sourceDurationSeconds: number;
	toleranceSeconds: number;
}): boolean {
	if (visualBeats.some(isImageBeat)) return false;
	const sourceBeats = videoBeats(visualBeats);
	if (sourceBeats.length === 0) return false;
	if (new Set(sourceBeats.map((beat) => beat.mediaId)).size !== 1) return false;

	const ordered = [...sourceBeats].sort(
		(left, right) => left.sourceStart - right.sourceStart,
	);
	if (
		!withinTolerance({
			actual: ordered[0].sourceStart,
			expected: 0,
			toleranceSeconds,
		})
	) {
		return false;
	}

	for (let index = 1; index < ordered.length; index += 1) {
		if (
			!withinTolerance({
				actual: ordered[index].sourceStart,
				expected: ordered[index - 1].sourceEnd,
				toleranceSeconds,
			})
		) {
			return false;
		}
	}

	return withinTolerance({
		actual: ordered[ordered.length - 1].sourceEnd,
		expected: sourceDurationSeconds,
		toleranceSeconds,
	});
}

function validateDurationContract({
	normalizedPlan,
	durationContract,
	durationGoal,
}: {
	normalizedPlan: NarratedRemixPlan;
	durationContract?: NarratedRemixDurationContract;
	durationGoal?: NarratedRemixDurationGoal;
}):
	| { success: true; summary?: NarratedRemixDurationContractSummary }
	| { success: false; message: string; path: string } {
	if (!durationContract) return { success: true };

	const toleranceSeconds = durationContract.toleranceSeconds ?? 0.2;
	const sourceDurationSeconds = durationContract.sourceDurationSeconds;
	let totalDurationMatches = true;
	if (durationContract.totalDurationMode === "preserve_source") {
		if (sourceDurationSeconds === undefined) {
			return {
				success: false,
				message:
					"NarratedRemixPlan duration contract is missing sourceDurationSeconds.",
				path: "durationContract.sourceDurationSeconds",
			};
		}
		totalDurationMatches = withinTolerance({
			actual: normalizedPlan.target.durationSec,
			expected: sourceDurationSeconds,
			toleranceSeconds,
		});
		if (!totalDurationMatches) {
			return {
				success: false,
				message:
					"NarratedRemixPlan violates preserve_source duration contract.",
				path: "target.durationSec",
			};
		}
	}

	if (durationContract.totalDurationMode === "custom_range") {
		if (durationGoal?.mode !== "custom" || !durationGoal.rangeSeconds) {
			return {
				success: false,
				message:
					"NarratedRemixPlan duration contract requires a custom durationGoal range.",
				path: "durationGoal.rangeSeconds",
			};
		}
		const min = durationGoal.rangeSeconds.minSeconds - toleranceSeconds;
		const max = durationGoal.rangeSeconds.maxSeconds + toleranceSeconds;
		totalDurationMatches =
			normalizedPlan.target.durationSec >= min &&
			normalizedPlan.target.durationSec <= max;
		if (!totalDurationMatches) {
			return {
				success: false,
				message:
					"NarratedRemixPlan violates custom_range duration contract.",
				path: "target.durationSec",
			};
		}
	}

	let sourceCoverageMatches = true;
	if (durationContract.sourceCoverageMode === "full_source") {
		if (sourceDurationSeconds === undefined) {
			return {
				success: false,
				message:
					"NarratedRemixPlan duration contract is missing sourceDurationSeconds.",
				path: "durationContract.sourceDurationSeconds",
			};
		}
		sourceCoverageMatches = validateFullSourceCoverage({
			visualBeats: normalizedPlan.visualBeats,
			sourceDurationSeconds,
			toleranceSeconds,
		});
		if (!sourceCoverageMatches) {
			return {
				success: false,
				message: "NarratedRemixPlan violates full_source coverage contract.",
				path: "visualBeats",
			};
		}
	}

	return {
		success: true,
		summary: {
			totalDurationMode: durationContract.totalDurationMode,
			sourceCoverageMode: durationContract.sourceCoverageMode,
			targetDurationSec: normalizedPlan.target.durationSec,
			...(sourceDurationSeconds === undefined ? {} : { sourceDurationSeconds }),
			toleranceSeconds,
			totalDurationMatches,
			sourceCoverageMatches,
		},
	};
}

export function validateNarratedRemixPlan({
	plan,
	projectId,
	mediaAssets,
	durationContract,
	durationGoal,
}: {
	plan: unknown;
	projectId: string;
	mediaAssets: MediaAsset[];
	durationContract?: NarratedRemixDurationContract;
	durationGoal?: NarratedRemixDurationGoal;
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
	const hasCaptions = normalizedPlan.captions.length > 0;
	if (hasCaptions && !normalizedPlan.captionStyle) {
		return {
			success: false,
			message: "NarratedRemixPlan captions require captionStyle.",
			path: "captionStyle",
		};
	}
	if (!hasCaptions && normalizedPlan.captionStyle) {
		return {
			success: false,
			message: "NarratedRemixPlan captionStyle requires captions.",
			path: "captionStyle",
		};
	}
	if (normalizedPlan.projectId !== projectId) {
		return {
			success: false,
			message: "NarratedRemixPlan projectId does not match the active project.",
			path: "projectId",
		};
	}

	const contractValidation = validateDurationContract({
		normalizedPlan,
		durationContract,
		durationGoal,
	});
	if (!contractValidation.success) {
		return contractValidation;
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

		if (isImageBeat(visualBeat)) {
			if (!visualAsset) {
				return {
					success: false,
					message: "NarratedRemixPlan imageBeat mediaId was not found.",
					path: `${beatPath}.mediaId`,
				};
			}
			if (visualAsset.type !== "image") {
				return {
					success: false,
					message: "NarratedRemixPlan imageBeat media must be image.",
					path: `${beatPath}.mediaId`,
				};
			}
			if (!visualAsset.width || !visualAsset.height) {
				return {
					success: false,
					message: "NarratedRemixPlan imageBeat dimensions are required.",
					path: `${beatPath}.mediaId`,
				};
			}
			if (
				Math.abs(visualBeat.timelineStart - expectedTimelineStart) >
				TIME_EPSILON
			) {
				return {
					success: false,
					message: "NarratedRemixPlan visualBeats must be continuous.",
					path: `${beatPath}.timelineStart`,
				};
			}

			expectedTimelineStart += visualBeat.duration;
			continue;
		}

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

	for (const [index, textOverlay] of (
		normalizedPlan.textOverlays ?? []
	).entries()) {
		if (
			exceeds({
				end: textOverlay.startTime + textOverlay.duration,
				limit: normalizedPlan.target.durationSec,
			})
		) {
			return {
				success: false,
				message: "NarratedRemixPlan textOverlay exceeds target duration.",
				path: `textOverlays[${index}]`,
			};
		}
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
	if (hasCaptions && normalizedPlan.captionStyle) {
		const captionQuality = auditCaptions({
			captions: normalizedPlan.captions,
			captionStyle: normalizedPlan.captionStyle,
			aspectRatio: normalizedPlan.target.aspectRatio,
			canvasSize: canonicalCaptionCanvasSizeForAspectRatio({
				aspectRatio: normalizedPlan.target.aspectRatio,
			}),
			timelineDuration: normalizedPlan.target.durationSec,
		});
		const firstIssue = captionQuality.issues[0];
		if (firstIssue) {
			return {
				success: false,
				message: firstIssue.message.replace("EditPlan", "NarratedRemixPlan"),
				path: firstIssue.path,
			};
		}
	}

	return {
		success: true,
		normalizedPlan,
		...(contractValidation.summary
			? { durationContract: contractValidation.summary }
			: {}),
	};
}
