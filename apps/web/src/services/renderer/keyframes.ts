import type {
	PositionKeyframe,
	ScalarKeyframe,
	TimelineElementKeyframes,
	Transform,
} from "@/types/timeline";

type VisualKeyframeInput = {
	transform: Transform;
	opacity: number;
	keyframes?: TimelineElementKeyframes;
	localTime: number;
};

function sortedScalarKeyframes(keyframes: ScalarKeyframe[]) {
	return keyframes.slice().sort((a, b) => a.time - b.time);
}

function sortedPositionKeyframes(keyframes: PositionKeyframe[]) {
	return keyframes.slice().sort((a, b) => a.time - b.time);
}

function easeRatio({
	ratio,
	interpolation,
}: {
	ratio: number;
	interpolation?: ScalarKeyframe["interpolation"];
}): number {
	if (interpolation === "ease-in") return ratio * ratio * ratio;
	if (interpolation === "ease-out") {
		const inverse = 1 - ratio;
		return 1 - inverse * inverse * inverse;
	}
	if (interpolation === "ease-in-out") {
		return ratio < 0.5
			? 4 * ratio * ratio * ratio
			: 1 - Math.pow(-2 * ratio + 2, 3) / 2;
	}
	return ratio;
}

function scalarAt({
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
			const ratio = easeRatio({
				ratio: linearRatio,
				interpolation: current.interpolation,
			});
			return current.value + (next.value - current.value) * ratio;
		}
	}
	return sorted[sorted.length - 1].value;
}

function positionAt({
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
			const ratio = easeRatio({
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

export function applyVisualKeyframes({
	transform,
	opacity,
	keyframes,
	localTime,
}: VisualKeyframeInput) {
	if (!keyframes) return { transform, opacity };
	return {
		opacity: scalarAt({
			keyframes: keyframes.opacity,
			localTime,
			fallback: opacity,
		}),
		transform: {
			...transform,
			position: positionAt({
				keyframes: keyframes["transform.position"],
				localTime,
				fallback: transform.position,
			}),
			scale: scalarAt({
				keyframes: keyframes["transform.scale"],
				localTime,
				fallback: transform.scale,
			}),
			rotate: scalarAt({
				keyframes: keyframes["transform.rotate"],
				localTime,
				fallback: transform.rotate,
			}),
		},
	};
}
