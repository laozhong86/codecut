import type {
	TextMotionPreset,
	TimelineElementKeyframes,
	Transform,
} from "@/types/timeline";

export const TEXT_MOTION_MIN_DURATION_SECONDS = 0.5;

export type ResolvedTextMotionPreset = {
	motionPreset: TextMotionPreset;
	keyframes: TimelineElementKeyframes;
};

function requireMotionDuration(duration: number) {
	if (duration < TEXT_MOTION_MIN_DURATION_SECONDS) {
		throw new Error("EditPlan text motion requires at least 0.5s duration.");
	}
}

export function resolveTextMotionPreset({
	preset,
	duration,
	baseTransform,
}: {
	preset: TextMotionPreset;
	duration: number;
	baseTransform: Transform;
}): ResolvedTextMotionPreset {
	requireMotionDuration(duration);
	const { x, y } = baseTransform.position;

	if (preset === "slam-in") {
		return {
			motionPreset: preset,
			keyframes: {
				opacity: [
					{ time: 0, value: 0, interpolation: "ease-out" },
					{ time: 0.12, value: 1, interpolation: "linear" },
					{ time: duration, value: 1 },
				],
				"transform.scale": [
					{ time: 0, value: 0.86, interpolation: "ease-out" },
					{ time: 0.18, value: 1.08, interpolation: "ease-in-out" },
					{ time: 0.32, value: 1, interpolation: "linear" },
					{ time: duration, value: 1 },
				],
				"transform.position": [
					{
						time: 0,
						value: { x, y: y + 54 },
						interpolation: "ease-out",
					},
					{
						time: 0.32,
						value: { x, y },
						interpolation: "linear",
					},
					{ time: duration, value: { x, y } },
				],
			},
		};
	}

	if (preset === "soft-reveal") {
		return {
			motionPreset: preset,
			keyframes: {
				opacity: [
					{ time: 0, value: 0, interpolation: "ease-out" },
					{ time: 0.55, value: 1, interpolation: "linear" },
					{ time: duration, value: 1 },
				],
				"transform.position": [
					{
						time: 0,
						value: { x, y: y + 30 },
						interpolation: "ease-out",
					},
					{
						time: 0.55,
						value: { x, y },
						interpolation: "linear",
					},
					{ time: duration, value: { x, y } },
				],
			},
		};
	}

	if (preset === "pop-bounce") {
		return {
			motionPreset: preset,
			keyframes: {
				opacity: [
					{ time: 0, value: 0, interpolation: "ease-out" },
					{ time: 0.1, value: 1, interpolation: "linear" },
					{ time: duration, value: 1 },
				],
				"transform.scale": [
					{ time: 0, value: 0.92, interpolation: "ease-out" },
					{ time: 0.14, value: 1.12, interpolation: "ease-in-out" },
					{ time: 0.26, value: 0.98, interpolation: "ease-in-out" },
					{ time: 0.38, value: 1, interpolation: "linear" },
					{ time: duration, value: 1 },
				],
			},
		};
	}

	const exhaustivePreset: never = preset;
	throw new Error(`Unsupported text motion preset: ${exhaustivePreset}`);
}
