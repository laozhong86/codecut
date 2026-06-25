import type {
	KeyframeInterpolation,
	PositionKeyframe,
	ScalarKeyframe,
	TimelineElement,
	TimelineElementKeyframes,
	Transform,
} from "@/types/timeline";

export type VisualTimelineElement = Extract<
	TimelineElement,
	{ transform: Transform; opacity: number }
>;

export type VisualKeyframeProperty = keyof TimelineElementKeyframes;

type VisualKeyframeValue = number | { x: number; y: number };

export const KEYFRAME_INTERPOLATIONS = [
	"linear",
	"hold",
	"ease-in",
	"ease-out",
	"ease-in-out",
] as const satisfies KeyframeInterpolation[];

export const VISUAL_KEYFRAME_PROPERTIES = [
	"opacity",
	"transform.position",
	"transform.scale",
	"transform.rotate",
] as const satisfies VisualKeyframeProperty[];

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${label} must be a finite number.`);
	}
}

export function roundKeyframeTime(time: number): number {
	assertFiniteNumber(time, "keyframe time");
	return Math.round(time * 1000) / 1000;
}

export function getVisualKeyframeLocalTime({
	element,
	currentTime,
}: {
	element: VisualTimelineElement;
	currentTime: number;
}): number | null {
	assertFiniteNumber(currentTime, "currentTime");
	const localTime = currentTime - element.startTime;
	if (localTime < 0 || localTime > element.duration) return null;
	return roundKeyframeTime(localTime);
}

export function assertVisualKeyframeLocalTime({
	element,
	currentTime,
}: {
	element: VisualTimelineElement;
	currentTime: number;
}): number {
	const localTime = getVisualKeyframeLocalTime({ element, currentTime });
	if (localTime === null) {
		throw new Error("Playhead must be within the selected element duration.");
	}
	return localTime;
}

function sortedScalarKeyframes(keyframes: ScalarKeyframe[]) {
	return keyframes.slice().sort((a, b) => a.time - b.time);
}

function sortedPositionKeyframes(keyframes: PositionKeyframe[]) {
	return keyframes.slice().sort((a, b) => a.time - b.time);
}

export function easeKeyframeRatio({
	ratio,
	interpolation,
}: {
	ratio: number;
	interpolation?: KeyframeInterpolation;
}): number {
	if (interpolation === "ease-in") return ratio * ratio * ratio;
	if (interpolation === "ease-out") {
		const inverse = 1 - ratio;
		return 1 - inverse * inverse * inverse;
	}
	if (interpolation === "ease-in-out") {
		return ratio < 0.5
			? 4 * ratio * ratio * ratio
			: 1 - (-2 * ratio + 2) ** 3 / 2;
	}
	return ratio;
}

export function scalarKeyframeValueAt({
	keyframes,
	localTime,
	fallback,
}: {
	keyframes?: ScalarKeyframe[];
	localTime: number;
	fallback: number;
}): number {
	if (!keyframes || keyframes.length === 0) return fallback;
	const sorted = sortedScalarKeyframes(keyframes);
	if (localTime <= sorted[0].time) return sorted[0].value;
	for (let index = 0; index < sorted.length - 1; index += 1) {
		const current = sorted[index];
		const next = sorted[index + 1];
		if (localTime <= next.time) {
			if (current.interpolation === "hold" || next.time === current.time) {
				return current.value;
			}
			const linearRatio =
				(localTime - current.time) / (next.time - current.time);
			const ratio = easeKeyframeRatio({
				ratio: linearRatio,
				interpolation: current.interpolation,
			});
			return current.value + (next.value - current.value) * ratio;
		}
	}
	return sorted[sorted.length - 1].value;
}

export function positionKeyframeValueAt({
	keyframes,
	localTime,
	fallback,
}: {
	keyframes?: PositionKeyframe[];
	localTime: number;
	fallback: { x: number; y: number };
}) {
	if (!keyframes || keyframes.length === 0) return fallback;
	const sorted = sortedPositionKeyframes(keyframes);
	if (localTime <= sorted[0].time) return sorted[0].value;
	for (let index = 0; index < sorted.length - 1; index += 1) {
		const current = sorted[index];
		const next = sorted[index + 1];
		if (localTime <= next.time) {
			if (current.interpolation === "hold" || next.time === current.time) {
				return current.value;
			}
			const linearRatio =
				(localTime - current.time) / (next.time - current.time);
			const ratio = easeKeyframeRatio({
				ratio: linearRatio,
				interpolation: current.interpolation,
			});
			return {
				x: current.value.x + (next.value.x - current.value.x) * ratio,
				y: current.value.y + (next.value.y - current.value.y) * ratio,
			};
		}
	}
	return sorted[sorted.length - 1].value;
}

export function resolveVisualKeyframes({
	transform,
	opacity,
	keyframes,
	localTime,
}: {
	transform: Transform;
	opacity: number;
	keyframes?: TimelineElementKeyframes;
	localTime: number;
}) {
	if (!keyframes) return { transform, opacity };
	return {
		opacity: scalarKeyframeValueAt({
			keyframes: keyframes.opacity,
			localTime,
			fallback: opacity,
		}),
		transform: {
			...transform,
			position: positionKeyframeValueAt({
				keyframes: keyframes["transform.position"],
				localTime,
				fallback: transform.position,
			}),
			scale: scalarKeyframeValueAt({
				keyframes: keyframes["transform.scale"],
				localTime,
				fallback: transform.scale,
			}),
			rotate: scalarKeyframeValueAt({
				keyframes: keyframes["transform.rotate"],
				localTime,
				fallback: transform.rotate,
			}),
		},
	};
}

export function resolveVisualKeyframePropertyValue({
	element,
	property,
	localTime,
}: {
	element: VisualTimelineElement;
	property: VisualKeyframeProperty;
	localTime: number;
}): VisualKeyframeValue {
	const resolved = resolveVisualKeyframes({
		transform: element.transform,
		opacity: element.opacity,
		keyframes: element.keyframes,
		localTime,
	});
	if (property === "opacity") return resolved.opacity;
	if (property === "transform.position") return resolved.transform.position;
	if (property === "transform.scale") return resolved.transform.scale;
	return resolved.transform.rotate;
}

export function hasVisualKeyframeTrack({
	element,
	property,
}: {
	element: VisualTimelineElement;
	property: VisualKeyframeProperty;
}): boolean {
	return (element.keyframes?.[property]?.length ?? 0) > 0;
}

export function hasVisualKeyframeAtTime({
	element,
	property,
	currentTime,
}: {
	element: VisualTimelineElement;
	property: VisualKeyframeProperty;
	currentTime: number;
}): boolean {
	const localTime = getVisualKeyframeLocalTime({ element, currentTime });
	if (localTime === null) return false;
	return (
		element.keyframes?.[property]?.some(
			(keyframe) => roundKeyframeTime(keyframe.time) === localTime,
		) ?? false
	);
}

function keyframeValueForProperty({
	property,
	value,
}: {
	property: VisualKeyframeProperty;
	value: VisualKeyframeValue;
}) {
	if (property === "transform.position") {
		if (
			typeof value !== "object" ||
			value === null ||
			!("x" in value) ||
			!("y" in value)
		) {
			throw new Error("transform.position keyframes require x and y values.");
		}
		assertFiniteNumber(value.x, "position.x");
		assertFiniteNumber(value.y, "position.y");
		return { x: value.x, y: value.y };
	}
	assertFiniteNumber(value, `${property} value`);
	return value;
}

function removeEmptyKeyframeTracks(
	keyframes: TimelineElementKeyframes,
): TimelineElementKeyframes | undefined {
	return Object.keys(keyframes).length > 0 ? keyframes : undefined;
}

export function setVisualKeyframeValue({
	element,
	property,
	currentTime,
	value,
	interpolation,
}: {
	element: VisualTimelineElement;
	property: VisualKeyframeProperty;
	currentTime: number;
	value: VisualKeyframeValue;
	interpolation?: KeyframeInterpolation;
}): TimelineElementKeyframes {
	const localTime = assertVisualKeyframeLocalTime({ element, currentTime });
	const existingTrack = element.keyframes?.[property] ?? [];
	const existingAtTime = existingTrack.find(
		(keyframe) => roundKeyframeTime(keyframe.time) === localTime,
	);
	const nextKeyframe = {
		time: localTime,
		value: keyframeValueForProperty({ property, value }),
		interpolation: interpolation ?? existingAtTime?.interpolation ?? "linear",
	};
	const nextTrack = [
		...existingTrack.filter(
			(keyframe) => roundKeyframeTime(keyframe.time) !== localTime,
		),
		nextKeyframe,
	].sort((left, right) => left.time - right.time);
	return {
		...(element.keyframes ?? {}),
		[property]: nextTrack,
	} as TimelineElementKeyframes;
}

export function setVisualPositionAxisKeyframeValue({
	element,
	currentTime,
	axis,
	value,
}: {
	element: VisualTimelineElement;
	currentTime: number;
	axis: "x" | "y";
	value: number;
}): TimelineElementKeyframes {
	assertFiniteNumber(value, `position.${axis}`);
	const localTime = assertVisualKeyframeLocalTime({ element, currentTime });
	const resolved = resolveVisualKeyframes({
		transform: element.transform,
		opacity: element.opacity,
		keyframes: element.keyframes,
		localTime,
	});
	return setVisualKeyframeValue({
		element,
		property: "transform.position",
		currentTime,
		value: {
			...resolved.transform.position,
			[axis]: value,
		},
	});
}

export function toggleVisualKeyframe({
	element,
	property,
	currentTime,
}: {
	element: VisualTimelineElement;
	property: VisualKeyframeProperty;
	currentTime: number;
}): TimelineElementKeyframes | undefined {
	const localTime = assertVisualKeyframeLocalTime({ element, currentTime });
	const existingTrack = element.keyframes?.[property] ?? [];
	if (
		existingTrack.some(
			(keyframe) => roundKeyframeTime(keyframe.time) === localTime,
		)
	) {
		const nextTrack = existingTrack.filter(
			(keyframe) => roundKeyframeTime(keyframe.time) !== localTime,
		);
		const nextKeyframes = { ...(element.keyframes ?? {}) };
		if (nextTrack.length === 0) {
			delete nextKeyframes[property];
		} else {
			(nextKeyframes as Record<string, unknown>)[property] = nextTrack;
		}
		return removeEmptyKeyframeTracks(nextKeyframes);
	}
	const value = resolveVisualKeyframePropertyValue({
		element,
		property,
		localTime,
	});
	return setVisualKeyframeValue({
		element,
		property,
		currentTime,
		value,
		interpolation: "linear",
	});
}

export function getVisualKeyframeTimes(
	element: Pick<VisualTimelineElement, "keyframes">,
): number[] {
	const keyframes = element.keyframes;
	if (!keyframes) return [];
	const times = new Set<number>();
	for (const property of VISUAL_KEYFRAME_PROPERTIES) {
		for (const keyframe of keyframes[property] ?? []) {
			times.add(roundKeyframeTime(keyframe.time));
		}
	}
	return [...times].sort((left, right) => left - right);
}
