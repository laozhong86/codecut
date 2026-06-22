import { calculateTotalDuration } from "@/lib/timeline";
import { buildTextElement } from "@/lib/timeline/element-utils";
import { buildEmptyTrack } from "@/lib/timeline/track-utils";
import { canElementGoOnTrack } from "@/lib/timeline/track-utils";
import type {
	CreateTimelineElement,
	PositionKeyframe,
	ScalarKeyframe,
	TextShadow,
	TextStroke,
	TimelineElement,
	TimelineElementKeyframes,
	TimelineTrack,
	Transform,
} from "@/types/timeline";
import { generateUUID } from "@/utils/id";
import type { ExecutorProjectState } from "./executor";

type MutationSummary = {
	createdElementIds: string[];
	changedElementIds: string[];
	removedElementIds: string[];
	totalDuration: number;
};

type InsertClipInput = {
	mediaId: string;
	duration: number;
	trimStart?: number;
	trimEnd?: number;
	playbackRate?: number;
	name?: string;
};

type InsertMediaAsset = {
	id: string;
	name: string;
	type: "image" | "video" | "audio";
	duration?: number;
	width?: number;
	height?: number;
};

type InsertClipsArgs = {
	trackId: string;
	atTime: number;
	clips: InsertClipInput[];
};

type MoveClipsArgs = {
	moves: Array<{
		elementId: string;
		toTrackId?: string;
		startTime?: number;
	}>;
};

type SetClipPropertiesArgs = {
	elementIds: string[];
	properties: Partial<{
		duration: number;
		trimStart: number;
		trimEnd: number;
		opacity: number;
		volume: number;
		muted: boolean;
		hidden: boolean;
		playbackRate: number;
		transform: Transform;
		content: string;
		fontSize: number;
		fontFamily: string;
		color: string;
		backgroundColor: string;
		textAlign: "left" | "center" | "right";
		fontWeight: "normal" | "bold";
		fontStyle: "normal" | "italic";
		textDecoration: "none" | "underline" | "line-through";
	}>;
};

type AddTextEntry = {
	startTime: number;
	duration: number;
	content: string;
	name?: string;
	transform?: Transform;
	opacity?: number;
	fontSize?: number;
	fontFamily?: string;
	color?: string;
	backgroundColor?: string;
	textAlign?: "left" | "center" | "right";
	fontWeight?: "normal" | "bold";
	fontStyle?: "normal" | "italic";
	textDecoration?: "none" | "underline" | "line-through";
	boxWidth?: number;
	stroke?: TextStroke;
	shadow?: TextShadow;
	backgroundOpacity?: number;
	backgroundPaddingX?: number;
	backgroundPaddingY?: number;
	backgroundBorderRadius?: number;
};

type AddTextElementsArgs = {
	trackId?: string;
	entries: AddTextEntry[];
};

type KeyframeProperty = keyof TimelineElementKeyframes;

type SetKeyframesArgs = {
	elementId: string;
	property: KeyframeProperty;
	keyframes: Array<ScalarKeyframe | PositionKeyframe>;
};

type AddTextElementsSummary = MutationSummary & {
	createdTrackId?: string;
};

function cloneTracks(tracks: TimelineTrack[]): TimelineTrack[] {
	return structuredClone(tracks) as TimelineTrack[];
}

function sortTrackElements(track: TimelineTrack) {
	track.elements.sort((left, right) => {
		if (left.startTime !== right.startTime) {
			return left.startTime - right.startTime;
		}
		return left.id.localeCompare(right.id);
	});
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}

function findTrack({
	tracks,
	trackId,
}: {
	tracks: TimelineTrack[];
	trackId: string;
}) {
	const track = tracks.find((entry) => entry.id === trackId);
	if (!track) {
		throw new Error(`Track "${trackId}" was not found.`);
	}
	return track;
}

function insertTrackAtTop({
	tracks,
	type,
}: {
	tracks: TimelineTrack[];
	type: TimelineTrack["type"];
}) {
	const track = buildEmptyTrack({ id: generateUUID(), type });
	tracks.splice(0, 0, track);
	return track;
}

function findElementLocation({
	tracks,
	elementId,
}: {
	tracks: TimelineTrack[];
	elementId: string;
}) {
	for (const track of tracks) {
		const index = track.elements.findIndex(
			(element) => element.id === elementId,
		);
		if (index >= 0) {
			return {
				track,
				element: track.elements[index] as TimelineElement,
				index,
			};
		}
	}
	throw new Error(`Element "${elementId}" was not found.`);
}

function assertCompatible({
	track,
	element,
}: {
	track: TimelineTrack;
	element: TimelineElement;
}) {
	if (
		!canElementGoOnTrack({ elementType: element.type, trackType: track.type })
	) {
		throw new Error(
			`${element.type} elements cannot be placed on ${track.type} tracks.`,
		);
	}
}

function assetToElement({
	asset,
	clip,
	startTime,
}: {
	asset: InsertMediaAsset;
	clip: InsertClipInput;
	startTime: number;
}): TimelineElement {
	const playbackRate = clip.playbackRate ?? 1;
	const trimStart = clip.trimStart ?? 0;
	const trimEnd = clip.trimEnd ?? trimStart + clip.duration * playbackRate;
	if (asset.duration !== undefined && trimEnd > asset.duration) {
		throw new Error(`Clip trimEnd exceeds media duration for "${asset.id}".`);
	}
	if (trimEnd < trimStart) {
		throw new Error("clip trimEnd must be greater than or equal to trimStart.");
	}

	const base = {
		id: generateUUID(),
		name: clip.name ?? asset.name,
		duration: clip.duration,
		startTime,
		trimStart,
		trimEnd,
	};
	if (asset.type === "video") {
		return {
			...base,
			type: "video",
			mediaId: asset.id,
			muted: false,
			hidden: false,
			transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
			opacity: 1,
			playbackRate,
		};
	}
	if (asset.type === "image") {
		return {
			...base,
			type: "image",
			mediaId: asset.id,
			hidden: false,
			transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
			opacity: 1,
		};
	}
	return {
		...base,
		type: "audio",
		sourceType: "upload",
		mediaId: asset.id,
		volume: 1,
		muted: false,
		playbackRate,
	};
}

function totalDuration(tracks: TimelineTrack[]): number {
	return calculateTotalDuration({ tracks });
}

function commitTracks({
	state,
	tracks,
	createdElementIds,
	changedElementIds,
	removedElementIds,
}: {
	state: ExecutorProjectState;
	tracks: TimelineTrack[];
	createdElementIds?: string[];
	changedElementIds?: string[];
	removedElementIds?: string[];
}): MutationSummary {
	for (const track of tracks) {
		sortTrackElements(track);
	}
	state.tracks = tracks;
	return {
		createdElementIds: unique(createdElementIds ?? []),
		changedElementIds: unique(changedElementIds ?? []),
		removedElementIds: unique(removedElementIds ?? []),
		totalDuration: totalDuration(state.tracks),
	};
}

function withElementId(element: CreateTimelineElement): TimelineElement {
	return { ...element, id: generateUUID() } as TimelineElement;
}

export function addTextElements({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: AddTextElementsArgs;
}): AddTextElementsSummary {
	const tracks = cloneTracks(state.tracks);
	const targetTrack = args.trackId
		? findTrack({ tracks, trackId: args.trackId })
		: insertTrackAtTop({ tracks, type: "text" });
	const createdTrackId = args.trackId ? undefined : targetTrack.id;
	const elements: TimelineElement[] = [];
	for (const entry of args.entries) {
		const element = withElementId(
			buildTextElement({
				raw: {
					name: entry.name,
					content: entry.content,
					duration: entry.duration,
					transform: entry.transform,
					opacity: entry.opacity,
					fontSize: entry.fontSize,
					fontFamily: entry.fontFamily,
					color: entry.color,
					backgroundColor: entry.backgroundColor,
					textAlign: entry.textAlign,
					fontWeight: entry.fontWeight,
					fontStyle: entry.fontStyle,
					textDecoration: entry.textDecoration,
					boxWidth: entry.boxWidth,
					stroke: entry.stroke,
					shadow: entry.shadow,
					backgroundOpacity: entry.backgroundOpacity,
					backgroundPaddingX: entry.backgroundPaddingX,
					backgroundPaddingY: entry.backgroundPaddingY,
					backgroundBorderRadius: entry.backgroundBorderRadius,
				},
				startTime: entry.startTime,
			}),
		);
		assertCompatible({ track: targetTrack, element });
		elements.push(element);
	}
	targetTrack.elements.push(...(elements as never[]));
	return {
		...commitTracks({
			state,
			tracks,
			createdElementIds: elements.map((element) => element.id),
		}),
		...(createdTrackId ? { createdTrackId } : {}),
	};
}

export function insertClips({
	state,
	mediaAssets,
	args,
}: {
	state: ExecutorProjectState;
	mediaAssets: InsertMediaAsset[];
	args: InsertClipsArgs;
}): MutationSummary {
	const tracks = cloneTracks(state.tracks);
	const track = findTrack({ tracks, trackId: args.trackId });
	const assets = new Map(mediaAssets.map((asset) => [asset.id, asset]));
	const totalInsertedDuration = args.clips.reduce(
		(total, clip) => total + clip.duration,
		0,
	);
	const changedElementIds: string[] = [];
	for (const element of track.elements) {
		if (element.startTime >= args.atTime) {
			element.startTime += totalInsertedDuration;
			changedElementIds.push(element.id);
		}
	}

	let cursor = args.atTime;
	const inserted: TimelineElement[] = [];
	for (const clip of args.clips) {
		const asset = assets.get(clip.mediaId);
		if (!asset) {
			throw new Error(`Media asset "${clip.mediaId}" was not found.`);
		}
		const element = assetToElement({ asset, clip, startTime: cursor });
		assertCompatible({ track, element });
		inserted.push(element);
		cursor += clip.duration;
	}
	track.elements.push(...(inserted as never[]));
	return commitTracks({
		state,
		tracks,
		createdElementIds: inserted.map((element) => element.id),
		changedElementIds,
	});
}

export function moveClips({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: MoveClipsArgs;
}): MutationSummary {
	const tracks = cloneTracks(state.tracks);
	const changedElementIds: string[] = [];
	for (const move of args.moves) {
		const location = findElementLocation({ tracks, elementId: move.elementId });
		const targetTrack = move.toTrackId
			? findTrack({ tracks, trackId: move.toTrackId })
			: location.track;
		const element = {
			...location.element,
			...(move.startTime === undefined ? {} : { startTime: move.startTime }),
		} as TimelineElement;
		assertCompatible({ track: targetTrack, element });
		location.track.elements.splice(location.index, 1);
		targetTrack.elements.push(element as never);
		changedElementIds.push(element.id);
	}
	return commitTracks({ state, tracks, changedElementIds });
}

export function removeClips({
	state,
	elementIds,
}: {
	state: ExecutorProjectState;
	elementIds: string[];
}): MutationSummary {
	const tracks = cloneTracks(state.tracks);
	const removeIds = new Set(elementIds);
	const removedElementIds: string[] = [];
	for (const track of tracks) {
		const kept = [];
		for (const element of track.elements) {
			if (removeIds.has(element.id)) {
				removedElementIds.push(element.id);
			} else {
				kept.push(element);
			}
		}
		track.elements = kept as never[];
	}
	for (const elementId of elementIds) {
		if (!removedElementIds.includes(elementId)) {
			throw new Error(`Element "${elementId}" was not found.`);
		}
	}
	return commitTracks({ state, tracks, removedElementIds });
}

export function splitClip({
	state,
	elementId,
	atTime,
}: {
	state: ExecutorProjectState;
	elementId: string;
	atTime: number;
}): MutationSummary {
	const tracks = cloneTracks(state.tracks);
	const { track, element, index } = findElementLocation({ tracks, elementId });
	const elementEnd = element.startTime + element.duration;
	if (atTime <= element.startTime || atTime >= elementEnd) {
		throw new Error("split_clip atTime must be inside the element duration.");
	}
	const leftDuration = atTime - element.startTime;
	const rightDuration = elementEnd - atTime;
	const playbackRate =
		"playbackRate" in element ? (element.playbackRate ?? 1) : 1;
	const splitSourceTime = element.trimStart + leftDuration * playbackRate;
	const left = {
		...element,
		duration: leftDuration,
		trimEnd: splitSourceTime,
	} as TimelineElement;
	const right = {
		...element,
		id: generateUUID(),
		startTime: atTime,
		duration: rightDuration,
		trimStart: splitSourceTime,
	} as TimelineElement;
	track.elements.splice(index, 1, left as never, right as never);
	return commitTracks({
		state,
		tracks,
		createdElementIds: [right.id],
		changedElementIds: [left.id],
	});
}

function applyProperty({
	element,
	key,
	value,
}: {
	element: TimelineElement;
	key: string;
	value: unknown;
}) {
	if (key === "content") {
		if (element.type !== "text") {
			throw new Error("content can only be set on text elements.");
		}
		element.content = value as string;
		return;
	}
	if (
		[
			"fontSize",
			"fontFamily",
			"color",
			"backgroundColor",
			"textAlign",
			"fontWeight",
			"fontStyle",
			"textDecoration",
		].includes(key)
	) {
		if (element.type !== "text") {
			throw new Error(`${key} can only be set on text elements.`);
		}
		(element as unknown as Record<string, unknown>)[key] = value;
		return;
	}
	if (key === "volume") {
		if (element.type !== "audio") {
			throw new Error("volume can only be set on audio elements.");
		}
		element.volume = value as number;
		return;
	}
	if (key === "opacity" || key === "hidden" || key === "transform") {
		if (element.type === "audio") {
			throw new Error(`${key} cannot be set on audio elements.`);
		}
		(element as unknown as Record<string, unknown>)[key] = value;
		return;
	}
	if (key === "playbackRate") {
		if (element.type !== "video" && element.type !== "audio") {
			throw new Error(
				"playbackRate can only be set on video or audio elements.",
			);
		}
		element.playbackRate = value as number;
		return;
	}
	(element as unknown as Record<string, unknown>)[key] = value;
}

export function setClipProperties({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: SetClipPropertiesArgs;
}): MutationSummary {
	const tracks = cloneTracks(state.tracks);
	const changedElementIds: string[] = [];
	for (const elementId of args.elementIds) {
		const { element } = findElementLocation({ tracks, elementId });
		for (const [key, value] of Object.entries(args.properties)) {
			applyProperty({ element, key, value });
		}
		changedElementIds.push(element.id);
	}
	return commitTracks({
		state,
		tracks,
		changedElementIds,
	});
}

function keyframeValueKey(property: KeyframeProperty) {
	return property === "transform.position" ? "position" : "scalar";
}

function assertFiniteNumber(value: unknown, path: string): asserts value is number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${path} must be a finite number.`);
	}
}

function normalizeKeyframes({
	element,
	property,
	keyframes,
}: {
	element: TimelineElement;
	property: KeyframeProperty;
	keyframes: Array<ScalarKeyframe | PositionKeyframe>;
}) {
	const byTime = new Map<number, ScalarKeyframe | PositionKeyframe>();
	keyframes.forEach((keyframe, index) => {
		assertFiniteNumber(keyframe.time, `keyframes[${index}].time`);
		if (keyframe.time < 0 || keyframe.time > element.duration) {
			throw new Error(
				`keyframes[${index}].time must be within the element duration.`,
			);
		}
		const interpolation = keyframe.interpolation ?? "linear";
		if (interpolation !== "linear" && interpolation !== "hold") {
			throw new Error(
				`keyframes[${index}].interpolation must be linear or hold.`,
			);
		}
		if (keyframeValueKey(property) === "position") {
			if (
				typeof keyframe.value !== "object" ||
				keyframe.value === null ||
				!("x" in keyframe.value) ||
				!("y" in keyframe.value)
			) {
				throw new Error(`keyframes[${index}].value must be a position object.`);
			}
			assertFiniteNumber(keyframe.value.x, `keyframes[${index}].value.x`);
			assertFiniteNumber(keyframe.value.y, `keyframes[${index}].value.y`);
			byTime.set(keyframe.time, {
				time: keyframe.time,
				value: { x: keyframe.value.x, y: keyframe.value.y },
				interpolation,
			} satisfies PositionKeyframe);
			return;
		}
		assertFiniteNumber(keyframe.value, `keyframes[${index}].value`);
		if (property === "opacity" && (keyframe.value < 0 || keyframe.value > 1)) {
			throw new Error(`keyframes[${index}].value must be between 0 and 1.`);
		}
		byTime.set(keyframe.time, {
			time: keyframe.time,
			value: keyframe.value,
			interpolation,
		} satisfies ScalarKeyframe);
	});
	return [...byTime.values()].sort((left, right) => left.time - right.time);
}

function assertKeyframePropertyCompatible({
	element,
	property,
}: {
	element: TimelineElement;
	property: KeyframeProperty;
}) {
	if (element.type === "audio") {
		throw new Error(`${property} keyframes cannot be set on audio elements.`);
	}
}

export function setKeyframes({
	state,
	args,
}: {
	state: ExecutorProjectState;
	args: SetKeyframesArgs;
}): MutationSummary {
	const tracks = cloneTracks(state.tracks);
	const { element } = findElementLocation({
		tracks,
		elementId: args.elementId,
	});
	assertKeyframePropertyCompatible({
		element,
		property: args.property,
	});
	const keyframes = normalizeKeyframes({
		element,
		property: args.property,
		keyframes: args.keyframes,
	});
	const nextKeyframes = { ...(element.keyframes ?? {}) };
	if (keyframes.length === 0) {
		delete nextKeyframes[args.property];
	} else {
		(nextKeyframes as Record<string, unknown>)[args.property] = keyframes;
	}
	element.keyframes =
		Object.keys(nextKeyframes).length > 0 ? nextKeyframes : undefined;
	return commitTracks({
		state,
		tracks,
		changedElementIds: [element.id],
	});
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
	const sorted = ranges
		.map(([start, end]) => [start, end] as [number, number])
		.sort((left, right) => left[0] - right[0]);
	const merged: Array<[number, number]> = [];
	for (const [start, end] of sorted) {
		const last = merged[merged.length - 1];
		if (last && start <= last[1]) {
			last[1] = Math.max(last[1], end);
		} else {
			merged.push([start, end]);
		}
	}
	return merged;
}

function deletedDurationBefore({
	time,
	ranges,
}: {
	time: number;
	ranges: Array<[number, number]>;
}): number {
	return ranges.reduce((total, [start, end]) => {
		if (time <= start) return total;
		return total + Math.min(time, end) - start;
	}, 0);
}

function keptSegmentsForElement({
	element,
	ranges,
}: {
	element: TimelineElement;
	ranges: Array<[number, number]>;
}): Array<[number, number]> {
	const elementStart = element.startTime;
	const elementEnd = element.startTime + element.duration;
	let cursor = elementStart;
	const segments: Array<[number, number]> = [];
	for (const [rangeStart, rangeEnd] of ranges) {
		if (rangeEnd <= elementStart || rangeStart >= elementEnd) continue;
		const keptEnd = Math.min(Math.max(rangeStart, elementStart), elementEnd);
		if (keptEnd > cursor) {
			segments.push([cursor, keptEnd]);
		}
		cursor = Math.max(cursor, Math.min(rangeEnd, elementEnd));
	}
	if (cursor < elementEnd) {
		segments.push([cursor, elementEnd]);
	}
	return segments;
}

function segmentElement({
	element,
	segment,
	keepOriginalId,
	ranges,
}: {
	element: TimelineElement;
	segment: [number, number];
	keepOriginalId: boolean;
	ranges: Array<[number, number]>;
}): TimelineElement {
	const [segmentStart, segmentEnd] = segment;
	const playbackRate =
		"playbackRate" in element ? (element.playbackRate ?? 1) : 1;
	const trimStart =
		element.trimStart + (segmentStart - element.startTime) * playbackRate;
	const trimEnd =
		element.trimStart + (segmentEnd - element.startTime) * playbackRate;
	return {
		...element,
		id: keepOriginalId ? element.id : generateUUID(),
		startTime:
			segmentStart - deletedDurationBefore({ time: segmentStart, ranges }),
		duration: segmentEnd - segmentStart,
		trimStart,
		trimEnd,
	} as TimelineElement;
}

export function rippleDeleteRanges({
	state,
	ranges,
}: {
	state: ExecutorProjectState;
	ranges: Array<[number, number]>;
}): MutationSummary & { removedRanges: Array<[number, number]> } {
	const mergedRanges = mergeRanges(ranges);
	const tracks = cloneTracks(state.tracks);
	const createdElementIds: string[] = [];
	const changedElementIds: string[] = [];
	const removedElementIds: string[] = [];

	for (const track of tracks) {
		const nextElements: TimelineElement[] = [];
		for (const element of track.elements as TimelineElement[]) {
			const segments = keptSegmentsForElement({
				element,
				ranges: mergedRanges,
			});
			if (segments.length === 0) {
				removedElementIds.push(element.id);
				continue;
			}
			let changedOriginal = false;
			segments.forEach((segment, index) => {
				const nextElement = segmentElement({
					element,
					segment,
					keepOriginalId: index === 0,
					ranges: mergedRanges,
				});
				if (index > 0) {
					createdElementIds.push(nextElement.id);
				}
				if (
					nextElement.startTime !== element.startTime ||
					nextElement.duration !== element.duration ||
					nextElement.trimStart !== element.trimStart ||
					nextElement.trimEnd !== element.trimEnd
				) {
					changedOriginal = true;
				}
				nextElements.push(nextElement);
			});
			if (changedOriginal) {
				changedElementIds.push(element.id);
			}
		}
		track.elements = nextElements as never[];
	}
	return {
		...commitTracks({
			state,
			tracks,
			createdElementIds,
			changedElementIds,
			removedElementIds,
		}),
		removedRanges: mergedRanges,
	};
}
