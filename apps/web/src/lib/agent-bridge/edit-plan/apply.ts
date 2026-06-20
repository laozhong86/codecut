import type { MediaAsset } from "@/types/assets";
import type {
	CreateTimelineElement,
	TimelineTrack,
	TrackType,
	TrackTransition,
} from "@/types/timeline";
import {
	buildTextElement,
	buildVideoElement,
	buildUploadAudioElement,
} from "@/lib/timeline/element-utils";
import type { EditPlan, EditPlanTextRichSpan } from "./schema";
import {
	resolveCaptionStylePreset,
	resolveTitleStylePreset,
} from "./text-presets";
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
		addTransition({
			trackId,
			fromElementId,
			toElementId,
			type,
			duration,
		}: {
			trackId: string;
			fromElementId: string;
			toElementId: string;
			type: NonNullable<EditPlan["transitions"]>[number]["type"];
			duration: number;
		}): TrackTransition | null;
	};
}

export type ApplyEditPlanResult =
	| {
			success: true;
			summary: {
				clipCount: number;
				totalDuration: number;
				appliedElementIds: string[];
				textElementCount: number;
				audioElementCount: number;
				transitionCount: number;
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
	richSpans,
	raw,
}: {
	text: string;
	startTime: number;
	duration: number;
	name: string;
	richSpans?: EditPlanTextRichSpan[];
	raw?: Parameters<typeof buildTextElement>[0]["raw"];
}): CreateTimelineElement {
	return buildTextElement({
		raw: {
			...raw,
			name,
			content: text,
			richSpans,
			duration,
		},
		startTime,
	});
}

function createUploadAudioSegment({
	asset,
	startTime,
	duration,
	volume,
	name,
}: {
	asset: MediaAsset;
	startTime: number;
	duration: number;
	volume: number;
	name: string;
}): CreateTimelineElement {
	return {
		...buildUploadAudioElement({
			mediaId: asset.id,
			name,
			duration,
			startTime,
		}),
		volume,
		trimStart: 0,
		trimEnd: duration,
	};
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
	const planClipElementIds = new Map<string, string>();
	let textElementCount = 0;
	let audioElementCount = 0;
	let transitionCount = 0;

	for (const clip of normalizedPlan.clips) {
		const insertedIds = insertElementAndCollectIds({
			editor,
			trackId: mainTrackId,
			element: createClipElement({
				plan: normalizedPlan,
				sourceMedia,
				clip,
			}),
		});
		appliedElementIds.push(...insertedIds);
		if (insertedIds[0]) {
			planClipElementIds.set(clip.id, insertedIds[0]);
		}
		if (sourceMedia.type === "audio") {
			audioElementCount += insertedIds.length;
		}
	}

	for (
		let index = 0;
		index < (normalizedPlan.transitions ?? []).length;
		index += 1
	) {
		const transition = normalizedPlan.transitions?.[index];
		if (!transition) continue;
		const fromElementId = planClipElementIds.get(transition.fromClipId);
		const toElementId = planClipElementIds.get(transition.toClipId);
		if (!fromElementId || !toElementId) {
			return {
				success: false,
				message: "EditPlan transition references a clip that was not inserted.",
				path: `transitions[${index}]`,
			};
		}
		const createdTransition = editor.timeline.addTransition({
			trackId: mainTrackId,
			fromElementId,
			toElementId,
			type: transition.type,
			duration: transition.duration,
		});
		if (!createdTransition) {
			return {
				success: false,
				message: "EditPlan transition could not be applied.",
				path: `transitions[${index}]`,
			};
		}
		transitionCount += 1;
	}

	const textItems: Array<{
		text: string;
		startTime: number;
		duration: number;
		name: string;
		richSpans?: EditPlanTextRichSpan[];
		raw?: Parameters<typeof buildTextElement>[0]["raw"];
	}> = [];
	if (normalizedPlan.title) {
		textItems.push({
			...normalizedPlan.title,
			name: "EditPlan Title",
			raw: normalizedPlan.title.stylePreset
				? resolveTitleStylePreset({
						preset: normalizedPlan.title.stylePreset,
						aspectRatio: normalizedPlan.target.aspectRatio,
					})
				: undefined,
		});
	}
	const captionRaw = normalizedPlan.captionStyle
		? resolveCaptionStylePreset({
				captionStyle: normalizedPlan.captionStyle,
				aspectRatio: normalizedPlan.target.aspectRatio,
			})
		: undefined;
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
			raw: captionRaw,
		});
	}

	if (textItems.length > 0) {
		const textTrackId = editor.timeline.addTrack({ type: "text", index: 0 });
		for (const item of textItems) {
			const insertedIds = insertElementAndCollectIds({
				editor,
				trackId: textTrackId,
				element: createTextElement(item),
			});
			appliedElementIds.push(...insertedIds);
			textElementCount += insertedIds.length;
		}
	}

	if (normalizedPlan.audio) {
		const audioTrackId = editor.timeline.addTrack({ type: "audio" });
		const timelineDuration = getTimelineDuration({ plan: normalizedPlan });

		if (normalizedPlan.audio.bgm) {
			const bgmAsset = mediaAssets.find(
				(asset) => asset.id === normalizedPlan.audio?.bgm?.assetId,
			);
			if (!bgmAsset || typeof bgmAsset.duration !== "number") {
				return {
					success: false,
					message:
						"EditPlan bgm assetId was not found in the project media library.",
					path: "audio.bgm.assetId",
				};
			}

			let segmentIndex = 0;
			let startTime = 0;
			while (startTime < timelineDuration) {
				const remainingDuration = timelineDuration - startTime;
				const segmentDuration = Math.min(bgmAsset.duration, remainingDuration);
				const insertedIds = insertElementAndCollectIds({
					editor,
					trackId: audioTrackId,
					element: createUploadAudioSegment({
						asset: bgmAsset,
						startTime,
						duration: segmentDuration,
						volume: normalizedPlan.audio.bgm.volume,
						name: `${bgmAsset.name} BGM ${segmentIndex + 1}`,
					}),
				});
				if (insertedIds.length === 0) {
					return {
						success: false,
						message: "EditPlan bgm audio insert did not create an element.",
						path: "audio.bgm",
					};
				}
				appliedElementIds.push(...insertedIds);
				audioElementCount += insertedIds.length;
				startTime += segmentDuration;
				segmentIndex += 1;
			}
		}

		for (let index = 0; index < (normalizedPlan.audio.sfx ?? []).length; index += 1) {
			const sfx = normalizedPlan.audio.sfx?.[index];
			if (!sfx) continue;
			const sfxAsset = mediaAssets.find((asset) => asset.id === sfx.assetId);
			if (!sfxAsset || typeof sfxAsset.duration !== "number") {
				return {
					success: false,
					message:
						"EditPlan sfx assetId was not found in the project media library.",
					path: `audio.sfx[${index}].assetId`,
				};
			}
			const duration = Math.min(
				sfxAsset.duration,
				timelineDuration - sfx.startTime,
			);
			if (duration <= 0) {
				return {
					success: false,
					message: "EditPlan sfx duration must overlap the generated timeline.",
					path: `audio.sfx[${index}]`,
				};
			}
			const insertedIds = insertElementAndCollectIds({
				editor,
				trackId: audioTrackId,
				element: createUploadAudioSegment({
					asset: sfxAsset,
					startTime: sfx.startTime,
					duration,
					volume: sfx.volume,
					name: `${sfxAsset.name} SFX ${index + 1}`,
				}),
			});
			if (insertedIds.length === 0) {
				return {
					success: false,
					message: "EditPlan sfx audio insert did not create an element.",
					path: `audio.sfx[${index}]`,
				};
			}
			appliedElementIds.push(...insertedIds);
			audioElementCount += insertedIds.length;
		}
	}

	return {
		success: true,
		summary: {
			clipCount: normalizedPlan.clips.length,
			totalDuration: getTimelineDuration({ plan: normalizedPlan }),
			appliedElementIds,
			textElementCount,
			audioElementCount,
			transitionCount,
			rationale: normalizedPlan.rationale,
		},
	};
}
