import type { MediaAsset } from "@/types/assets";
import type {
	CreateTimelineElement,
	TimelineTrack,
	TrackType,
} from "@/types/timeline";
import {
	buildTextElement,
	buildVideoElement,
	buildUploadAudioElement,
} from "@/lib/timeline/element-utils";
import type { EditPlan } from "./schema";
import { validateEditPlan } from "./validate";

type InsertElementPlacement =
	| { mode: "explicit"; trackId: string }
	| { mode: "auto" };

export interface EditPlanEditor {
	media: {
		getAssets(): MediaAsset[];
	};
	timeline: {
		getTracks(): TimelineTrack[];
		updateTracks(tracks: TimelineTrack[]): void;
		addTrack({ type, index }: { type: TrackType; index?: number }): string;
		insertElement({
			element,
			placement,
		}: {
			element: CreateTimelineElement;
			placement: InsertElementPlacement;
		}): void;
	};
}

export type ApplyEditPlanResult =
	| {
			success: true;
			summary: {
				clipCount: number;
				totalDuration: number;
				appliedElementIds: string[];
				rationale: string;
			};
	  }
	| { success: false; message: string; path?: string };

function hasTimelineElements({ tracks }: { tracks: TimelineTrack[] }): boolean {
	return tracks.some((track) => track.elements.length > 0);
}

function collectElementIds({
	tracks,
}: {
	tracks: TimelineTrack[];
}): Set<string> {
	return new Set(
		tracks.flatMap((track) => track.elements.map((element) => element.id)),
	);
}

function getNewElementIds({
	before,
	after,
}: {
	before: Set<string>;
	after: TimelineTrack[];
}): string[] {
	const ids: string[] = [];
	for (const track of after) {
		for (const element of track.elements) {
			if (!before.has(element.id)) {
				ids.push(element.id);
			}
		}
	}
	return ids;
}

function insertElementAndCollectIds({
	editor,
	element,
	trackId,
}: {
	editor: EditPlanEditor;
	element: CreateTimelineElement;
	trackId: string;
}): string[] {
	const before = collectElementIds({ tracks: editor.timeline.getTracks() });
	editor.timeline.insertElement({
		element,
		placement: { mode: "explicit", trackId },
	});
	return getNewElementIds({
		before,
		after: editor.timeline.getTracks(),
	});
}

function getTimelineDuration({ plan }: { plan: EditPlan }): number {
	let duration = 0;
	for (const clip of plan.clips) {
		duration = Math.max(
			duration,
			clip.timelineStart + clip.sourceEnd - clip.sourceStart,
		);
	}
	return duration;
}

function createClipElement({
	plan,
	sourceMedia,
	clip,
}: {
	plan: EditPlan;
	sourceMedia: MediaAsset;
	clip: EditPlan["clips"][number];
}): CreateTimelineElement {
	const duration = clip.sourceEnd - clip.sourceStart;
	if (sourceMedia.type === "audio") {
		return {
			...buildUploadAudioElement({
				mediaId: plan.sourceMediaId,
				name: `${sourceMedia.name} ${clip.id}`,
				duration,
				startTime: clip.timelineStart,
			}),
			trimStart: clip.sourceStart,
			trimEnd: clip.sourceEnd,
		};
	}

	return {
		...buildVideoElement({
			mediaId: plan.sourceMediaId,
			name: `${sourceMedia.name} ${clip.id}`,
			duration,
			startTime: clip.timelineStart,
		}),
		trimStart: clip.sourceStart,
		trimEnd: clip.sourceEnd,
	};
}

function createTextElement({
	text,
	startTime,
	duration,
	name,
}: {
	text: string;
	startTime: number;
	duration: number;
	name: string;
}): CreateTimelineElement {
	return buildTextElement({
		raw: {
			name,
			content: text,
			duration,
		},
		startTime,
	});
}

export function applyEditPlanToEditor({
	plan,
	projectId,
	replaceExisting,
	editor,
}: {
	plan: unknown;
	projectId: string;
	replaceExisting: boolean;
	editor: EditPlanEditor;
}): ApplyEditPlanResult {
	const mediaAssets = editor.media.getAssets();
	const validation = validateEditPlan({ plan, projectId, mediaAssets });
	if (!validation.success) {
		return validation;
	}

	const normalizedPlan = validation.normalizedPlan;
	const existingTracks = editor.timeline.getTracks();
	if (hasTimelineElements({ tracks: existingTracks }) && !replaceExisting) {
		return {
			success: false,
			message:
				"Timeline is not empty. Pass replaceExisting=true to apply an EditPlan.",
		};
	}

	if (replaceExisting) {
		editor.timeline.updateTracks([]);
	}

	const sourceMedia = mediaAssets.find(
		(asset) => asset.id === normalizedPlan.sourceMediaId,
	);
	if (!sourceMedia) {
		return {
			success: false,
			message:
				"EditPlan sourceMediaId was not found in the project media library.",
			path: "sourceMediaId",
		};
	}

	const mainTrackId = editor.timeline.addTrack({
		type: sourceMedia.type === "audio" ? "audio" : "video",
	});
	const appliedElementIds: string[] = [];

	for (const clip of normalizedPlan.clips) {
		appliedElementIds.push(
			...insertElementAndCollectIds({
				editor,
				trackId: mainTrackId,
				element: createClipElement({
					plan: normalizedPlan,
					sourceMedia,
					clip,
				}),
			}),
		);
	}

	const textItems: Array<{
		text: string;
		startTime: number;
		duration: number;
		name: string;
	}> = [];
	if (normalizedPlan.title) {
		textItems.push({
			...normalizedPlan.title,
			name: "EditPlan Title",
		});
	}
	for (
		let index = 0;
		index < (normalizedPlan.captions ?? []).length;
		index += 1
	) {
		const caption = normalizedPlan.captions?.[index];
		if (!caption) continue;
		textItems.push({
			...caption,
			name: `Caption ${index + 1}`,
		});
	}

	if (textItems.length > 0) {
		const textTrackId = editor.timeline.addTrack({ type: "text", index: 0 });
		for (const item of textItems) {
			appliedElementIds.push(
				...insertElementAndCollectIds({
					editor,
					trackId: textTrackId,
					element: createTextElement(item),
				}),
			);
		}
	}

	return {
		success: true,
		summary: {
			clipCount: normalizedPlan.clips.length,
			totalDuration: getTimelineDuration({ plan: normalizedPlan }),
			appliedElementIds,
			rationale: normalizedPlan.rationale,
		},
	};
}
